"""FastAPI wrapper around the existing Gradio chatbot's logic in app.py.

This file adds NO chatbot intelligence of its own — it imports app.py as a
module and calls the exact same route_message() function the Gradio UI calls
(via bot_respond()), so RAG search, metrics/superlatives/definitions, tone
tracking, Cohere-powered reasoning, and conversation-memory carry-forward all
behave identically here. app.py itself is untouched and keeps working as a
separate Gradio app.

Run locally:
    uvicorn api:app --reload --port 8000

Then, e.g.:
    curl -X POST http://localhost:8000/chat \
      -H "Content-Type: application/json" \
      -d '{"message": "What is Apple'"'"'s revenue?", "conversation_history": []}'

Run in production (AWS App Runner, built from the Dockerfile in this repo):
must bind 0.0.0.0, not the loopback-only default. App Runner routes traffic
to a fixed port configured in its own service settings rather than injecting
one via an env var, so the port is hardcoded in the Dockerfile's CMD (see
that file's comment) instead of read from $PORT here:
    uvicorn api:app --host 0.0.0.0 --port 8000

Required environment variables in production — see the "Environment
variables" section of the deployment writeup for the full list, but in
short: COHERE_API_KEY, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (for
DynamoDB), and optionally COGNITO_USER_POOL_ID / COGNITO_APP_CLIENT_ID /
COGNITO_REGION if overriding the defaults below.
"""

import base64
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

import boto3
import jwt
from boto3.dynamodb.conditions import Key
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import app as chatbot  # the existing Gradio app's module — routing, retrieval,
# Cohere calls, chart generation, everything lives there. Importing it runs
# app.py's module-level setup (loading chunks_df/company_metrics, building
# the TF-IDF matrix, constructing the (unused-here) Gradio Blocks UI) but
# does NOT start a Gradio server — demo.launch() is guarded behind
# `if __name__ == "__main__"` in app.py, so it never fires on import.

app = FastAPI(title="SEC Filing Analyst API")

# localhost:3000 stays in the list so local dev keeps working against a
# deployed backend too.
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "https://main.d2xcvsauexn8dl.amplifyapp.com",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Cognito access-token verification.
#
# The frontend (ConfigureAmplify.tsx) signs users in against this exact user
# pool/app client. Verification is signature + issuer + token type + audience
# (app client), all checked against Cognito's published JWKS — no shared
# secret involved, since this is a public (no-secret) app client.
#
# Note: Cognito ACCESS tokens (unlike ID tokens) carry `client_id` and
# `token_use: "access"` instead of a standard `aud` claim, confirmed by
# decoding a real token from this pool — so `client_id` is checked manually
# below rather than via jwt.decode's `audience=` param.
# ---------------------------------------------------------------------------

# Not secrets — the pool/client id are already public in the frontend's own
# bundle (ConfigureAmplify.tsx calls Amplify.configure with these same
# values, visible to anyone who opens devtools). Read from env vars so the
# same image can point at a different pool per environment without a code
# change, but default to this project's one real pool so nothing breaks if
# they're left unset.
COGNITO_REGION = os.environ.get("COGNITO_REGION", "us-east-1")
COGNITO_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID", "us-east-1_UxXCCbziP")
COGNITO_APP_CLIENT_ID = os.environ.get("COGNITO_APP_CLIENT_ID", "64g72j9o1huchdbj2g12cr5u92")
COGNITO_ISSUER = (
    f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"
)
COGNITO_JWKS_URL = f"{COGNITO_ISSUER}/.well-known/jwks.json"

# Reused across requests so the JWKS response is cached (PyJWKClient's
# default lifespan is 300s) instead of re-fetched on every call.
_jwk_client = jwt.PyJWKClient(COGNITO_JWKS_URL)


def get_current_user_id(authorization: str = Header(None)) -> str:
    """FastAPI dependency: verifies the caller's Cognito access token and
    returns their `sub` (the stable Cognito user id) as user_id. Raises 401
    on any missing, malformed, expired, or otherwise invalid token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization[len("Bearer "):].strip()

    try:
        signing_key = _jwk_client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=COGNITO_ISSUER,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from exc

    if claims.get("token_use") != "access":
        raise HTTPException(status_code=401, detail="Not an access token")
    if claims.get("client_id") != COGNITO_APP_CLIENT_ID:
        raise HTTPException(status_code=401, detail="Token issued for a different app")

    return claims["sub"]


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str
    conversation_history: list[HistoryMessage] = []
    # Accepted but not yet used server-side: conversation memory in this API
    # is entirely carried by conversation_history, the same way app.py's own
    # `history` parameter already works for the Gradio UI. app.py separately
    # has its own sqlite-backed conversation storage (storage.py) for the
    # Gradio UI's saved-conversations sidebar; wiring conversation_id into
    # that would be a real feature addition, not just an interface wrapper,
    # so it's deliberately left out of scope here.
    conversation_id: Optional[str] = None


class SourceInfo(BaseModel):
    company: Optional[str] = None
    form: Optional[str] = None
    date: Optional[str] = None
    # Never populated: no citation format app.py produces includes the
    # filing section (Item 1A, Item 7, ...) in the visible citation text,
    # which is all this heuristic has to work with. See _extract_sources.
    section: Optional[str] = None
    # The exact citation text this entry was parsed from — kept so a
    # mis-parse is still visible/debuggable on the frontend, since none of
    # company/form/date are guaranteed correct (see _extract_sources).
    raw: str


class ChatResponse(BaseModel):
    response: str
    chart: Optional[str] = None
    sources: Optional[list[SourceInfo]] = None


# ---------------------------------------------------------------------------
# Best-effort structured source extraction.
#
# app.py never returns structured passage metadata — route_message() returns
# only text and chart Paths, matching exactly what the Gradio UI renders.
# Its one deterministic citation format is fixed ("— Source: {name} {form}
# filed {date}"), but Cohere-generated answers are only instructed (in
# llm.py's system prompt) to "close with a source line naming the company,
# form type, and filing date" — not a fixed schema — so their exact phrasing
# varies. This regexes the citation text every path already produces rather
# than duplicating or changing any retrieval logic. It can occasionally miss
# or partially match a Cohere-phrased citation; when a field can't be parsed
# confidently it's left null rather than guessed, and `raw` always preserves
# what was actually parsed. A guaranteed-structured version of this would
# mean changing what app.py's retrieval functions return, which was out of
# scope here (app.py is untouched).
# ---------------------------------------------------------------------------

_SOURCE_LINE_RE = re.compile(
    r"(?:^|\n)\s*(?:—\s*)?\**Source:?\**\s*(.+)", re.IGNORECASE
)
_FORM_RE = re.compile(r"\b10-?[KQ]\b", re.IGNORECASE)
_DATE_RE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")


def _extract_sources(text: str) -> Optional[list[SourceInfo]]:
    matches = _SOURCE_LINE_RE.findall(text)
    if not matches:
        return None

    sources = []
    for raw in matches:
        raw = raw.strip()
        form_match = _FORM_RE.search(raw)
        date_match = _DATE_RE.search(raw)
        form = None
        if form_match:
            form = form_match.group(0).upper().replace("10K", "10-K").replace("10Q", "10-Q")
        date = date_match.group(0) if date_match else None
        company = None
        if form_match:
            # Strip a leading "Form" label too ("Nvidia, Form 10Q" -> "Nvidia"),
            # since Cohere sometimes writes the citation that way.
            company = raw[: form_match.start()]
            company = re.sub(r"\bForm\s*$", "", company, flags=re.IGNORECASE)
            company = company.strip(" ,—-")
        sources.append(
            SourceInfo(company=company or None, form=form, date=date, raw=raw)
        )
    return sources


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    # bot_respond() in app.py always calls route_message(message, history)
    # with the CURRENT message already appended as history's last entry —
    # _prior_user_messages() relies on that (it slices off history[-1] as
    # "the current turn"). Matching that exactly here, not just passing
    # conversation_history as-is, is what makes carry-forward behavior
    # ("the earlier filing", last-mentioned company) work the same way it
    # does in the Gradio UI.
    history = [m.model_dump() for m in request.conversation_history]
    history.append({"role": "user", "content": request.message})

    parts = chatbot.route_message(request.message, history)

    text_parts = []
    chart_b64 = None
    for part in parts:
        if isinstance(part, Path):
            # app.py's chart functions already rendered and saved this PNG
            # to disk (matplotlib, Agg backend) — reusing that file rather
            # than re-implementing any chart generation, just reading and
            # base64-encoding the bytes it already wrote.
            chart_b64 = base64.b64encode(part.read_bytes()).decode("ascii")
        else:
            text_parts.append(str(part))

    response_text = "\n\n".join(text_parts)
    return ChatResponse(
        response=response_text,
        chart=chart_b64,
        sources=_extract_sources(response_text),
    )


# ---------------------------------------------------------------------------
# Conversation persistence (DynamoDB).
#
# Table "sec-chatbot-conversations": partition key user_id (Cognito sub),
# sort key conversation_id. Credentials/region come from the default boto3
# chain (same AWS CLI credentials already configured on this machine) — no
# keys are read or stored here.
# ---------------------------------------------------------------------------

CONVERSATIONS_TABLE_NAME = "sec-chatbot-conversations"
MAX_CONVERSATIONS_PER_USER = 5

_dynamodb = boto3.resource("dynamodb", region_name=COGNITO_REGION)
_conversations_table = _dynamodb.Table(CONVERSATIONS_TABLE_NAME)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _user_conversations(user_id: str) -> list[dict]:
    response = _conversations_table.query(KeyConditionExpression=Key("user_id").eq(user_id))
    return response["Items"]


def save_conversation(
    user_id: str, conversation_id: str, title: str, messages: list[dict]
) -> None:
    now = _now_iso()
    existing = _conversations_table.get_item(
        Key={"user_id": user_id, "conversation_id": conversation_id}
    ).get("Item")
    created_at = existing["created_at"] if existing else now

    _conversations_table.put_item(
        Item={
            "user_id": user_id,
            "conversation_id": conversation_id,
            "title": title,
            "messages": json.dumps(messages),
            "created_at": created_at,
            "updated_at": now,
        }
    )

    # Enforce the 5-conversation cap: evict the oldest-updated conversations
    # beyond the cap. Runs after every save, not just on new conversations,
    # since an update can also be what pushes a user over the limit if a
    # previous eviction was skipped (e.g. a prior failed write).
    items = _user_conversations(user_id)
    if len(items) > MAX_CONVERSATIONS_PER_USER:
        items.sort(key=lambda i: i["updated_at"])
        for item in items[: len(items) - MAX_CONVERSATIONS_PER_USER]:
            _conversations_table.delete_item(
                Key={"user_id": user_id, "conversation_id": item["conversation_id"]}
            )


def list_conversations(user_id: str) -> list[dict]:
    items = _user_conversations(user_id)
    items.sort(key=lambda i: i["updated_at"], reverse=True)
    return [
        {"id": i["conversation_id"], "title": i["title"], "updated_at": i["updated_at"]}
        for i in items
    ]


def get_conversation(user_id: str, conversation_id: str) -> Optional[dict]:
    item = _conversations_table.get_item(
        Key={"user_id": user_id, "conversation_id": conversation_id}
    ).get("Item")
    if item is None:
        return None
    return {
        "id": item["conversation_id"],
        "title": item["title"],
        "messages": json.loads(item["messages"]),
        "updated_at": item["updated_at"],
    }


def delete_conversation(user_id: str, conversation_id: str) -> None:
    _conversations_table.delete_item(
        Key={"user_id": user_id, "conversation_id": conversation_id}
    )


class ConversationMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class SaveConversationRequest(BaseModel):
    conversation_id: str
    title: str
    messages: list[ConversationMessage]


class ConversationSummary(BaseModel):
    id: str
    title: str
    updated_at: str


class ConversationDetail(BaseModel):
    id: str
    title: str
    messages: list[ConversationMessage]
    updated_at: str


@app.post("/conversations")
def create_or_update_conversation(
    request: SaveConversationRequest, user_id: str = Depends(get_current_user_id)
):
    save_conversation(
        user_id,
        request.conversation_id,
        request.title,
        [m.model_dump() for m in request.messages],
    )
    return {"status": "ok"}


@app.get("/conversations", response_model=list[ConversationSummary])
def get_conversations(user_id: str = Depends(get_current_user_id)):
    return list_conversations(user_id)


@app.get("/conversations/{conversation_id}", response_model=ConversationDetail)
def get_conversation_detail(
    conversation_id: str, user_id: str = Depends(get_current_user_id)
):
    conversation = get_conversation(user_id, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@app.delete("/conversations/{conversation_id}")
def remove_conversation(
    conversation_id: str, user_id: str = Depends(get_current_user_id)
):
    delete_conversation(user_id, conversation_id)
    return {"status": "ok"}
