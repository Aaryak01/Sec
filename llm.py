"""Optional Cohere-backed answer generation for the SEC Filing Analyst.

The app is fully functional without this module: if no API key is configured,
or the API call fails for any reason, `answer()` returns None and app.py falls
back to its template-built response. The key is read from a .env file sitting
next to this module and is never logged or echoed back to the UI.

Retrieved passages are passed via Cohere's `documents` parameter rather than
pasted into the message text. That's the model's native grounding path: it
keeps the filing text separate from the instructions, so the model treats it as
source material to quote rather than as something it could be argued out of.
The model is never asked to answer from its own knowledge of a company, which
keeps every response traceable to a real filing.
"""

import logging
import os
from pathlib import Path

import cohere
import httpx
from cohere.core.api_error import ApiError
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

logger = logging.getLogger("sec_filing_analyst.llm")

API_KEY = os.environ.get("COHERE_API_KEY", "").strip()

# Override with COHERE_MODEL in .env. command-a is Cohere's flagship; the
# smaller command-r models are cheaper if answer quality holds up for you.
MODEL = os.environ.get("COHERE_MODEL", "").strip() or "command-a-03-2025"
MAX_TOKENS = 1024
# Low but not zero: this is grounded summarisation of a passage we already
# retrieved, so there's nothing to be gained from sampling variety.
TEMPERATURE = 0.2
# How many prior turns to send along for follow-up resolution ("what about
# their margins?").
HISTORY_TURNS = 6

SYSTEM_PROMPT = """You are the SEC Filing Analyst — an educational tool that teaches people to read \
and evaluate SEC filings like an analyst.

You will be given a user question and one or more documents containing passages \
retrieved from real SEC filings. Answer using ONLY those documents.

- Ground every factual claim in the supplied documents. If they don't cover the \
question, say so plainly and suggest what the user could ask instead. Never fill \
a gap from your own knowledge of the company.
- If a company or topic the user named isn't in the documents, say exactly that \
and stop. Do not describe what such companies "typically" disclose, and do not \
answer in general terms — a plausible-sounding answer with no filing behind it \
is worse than no answer, because the user can't tell the difference.
- If the message is a vague follow-up ("anything else", "tell me more"), don't \
ask the user to clarify. Pick something in the documents you haven't covered yet \
and explain it. Only say there's nothing further if the documents really hold \
nothing new.
- Quote or closely paraphrase the filing's own language for anything specific; \
the wording companies choose is itself the signal.
- Close with a source line naming the company, form type, and filing date, drawn \
from each document's metadata.
- Point out what makes the disclosure worth noticing — hedging language, a shift \
from a prior year, an unusually specific number — so the user learns to spot it \
themselves next time.
- When the documents span multiple filing years or multiple companies, compare \
them directly rather than summarising each in turn: say which document each \
observation comes from, and where the wording shifted, quote both sides of the \
shift so the user can see it. If the documents don't actually differ in a way \
that answers the question, say that plainly instead of manufacturing a contrast.
- Only claim a difference in tone or urgency between two passages if the actual \
wording differs. Never present identical or near-identical text from two \
different years as evidence of a change — quoting the same sentence twice is \
not a comparison. If a passage's metadata includes a note saying its text is \
unchanged from another year, take that as settled: don't cite that sentence as \
a difference. If two passages you're comparing are substantially the same, say \
so explicitly rather than inventing a contrast to have something to report.
- Use the conversation history to resolve what a short follow-up refers to, and \
don't repeat what you already covered in an earlier turn — add what's new.
- The documents define what's in scope for this answer. If earlier turns were \
about a different company, don't carry it forward and don't apologise for not \
covering it — just answer about the companies in the documents.
- Never recommend buying, selling, or holding a security, and never predict \
future prices. If asked, explain what in the filings would inform that judgement \
and let the user reach their own conclusion.
- Keep answers focused: a few short paragraphs, no preamble about what you're \
about to do."""


def is_enabled() -> bool:
    """True when an API key is configured. app.py checks this before retrieving."""
    return bool(API_KEY)


_client = cohere.ClientV2(api_key=API_KEY) if API_KEY else None


def build_documents(passages: list) -> list:
    """Turns retrieved chunk rows into Cohere documents.

    Each field lands in the model's context as labelled metadata, so the source
    line it writes comes from the filing record rather than from guesswork.

    Entries are (name, row) or (name, row, note). `note`, when present, is a
    caller-computed fact about this specific passage — app.py uses it to flag
    a sentence that recurs near-verbatim in the paired filing being compared,
    so the model is told in the passage's own metadata that this text is
    unchanged rather than being left to notice (or not notice) on its own.
    """
    documents = []
    for i, entry in enumerate(passages, start=1):
        name, row, *rest = entry
        note = rest[0] if rest else None
        data = {
            "company": name,
            "form": str(row["form"]),
            "filed": str(row["date"]),
            "year": str(int(row["year"])),
            "section": str(row["section"]),
            "text": str(row["text"]),
        }
        if note:
            data["note"] = note
        documents.append(cohere.Document(id=str(i), data=data))
    return documents


def _prior_turns(history: list) -> list:
    """Trailing user/assistant text turns, excluding the question being answered."""
    if not history:
        return []
    turns = []
    for entry in history[:-1]:
        content = entry.get("content")
        if not isinstance(content, str) or not content.strip():
            continue  # chart images and other non-text parts carry no context
        turns.append({"role": entry["role"], "content": content})
    return turns[-HISTORY_TURNS:]


def answer(
    question: str, passages: list, history: list = None, instruction: str = None,
    max_tokens: int = None,
):
    """Returns the model's grounded answer, or None to fall back to templates.

    `passages` is a list of (display_name, chunk_row) pairs already scored as
    relevant by app.py's retrieval. `instruction` is an optional per-call
    directive appended to the question — app.py uses it to name the two
    filings being compared, which the question itself only refers to obliquely
    ("the earlier filing"). `max_tokens` overrides the module default for
    calls with a larger document set (a multi-passage tone comparison needs
    more room to quote both sides than a single-passage lookup does).
    """
    if _client is None:
        logger.warning("answer: no Cohere client configured (COHERE_API_KEY unset) — returning None")
        return None
    if not passages:
        logger.warning("answer: called with zero passages for question %r — returning None", question[:70])
        return None

    content = f"{question}\n\n{instruction}" if instruction else question
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(_prior_turns(history or []))
    messages.append({"role": "user", "content": content})

    try:
        response = _client.chat(
            model=MODEL,
            messages=messages,
            documents=build_documents(passages),
            max_tokens=max_tokens or MAX_TOKENS,
            temperature=TEMPERATURE,
        )
    except (ApiError, httpx.HTTPError) as e:
        # Auth, rate limit, network, overload — none of which should take the
        # chatbot down, since the template path answers from the same passages.
        # Bugs in this module deliberately aren't caught here; they should raise.
        logger.error("answer: Cohere call failed (%s): %s", type(e).__name__, e)
        return None

    if response.finish_reason not in ("COMPLETE", "MAX_TOKENS", "STOP_SEQUENCE"):
        logger.warning("answer: unusable finish_reason=%r — returning None", response.finish_reason)
        return None

    text = "\n\n".join(
        item.text for item in (response.message.content or [])
        if getattr(item, "type", "text") == "text" and getattr(item, "text", None)
    ).strip()
    if not text:
        logger.warning("answer: response had finish_reason=%r but no text content", response.finish_reason)
    return text or None


# ---------------------------------------------------------------------------
# Stock-price-vs-fundamentals comparison.
#
# A separate function (not a call to answer() above) because this compares
# two numeric data series — a stock price trend and a financial metric
# trend — not filing text passages. answer()'s SYSTEM_PROMPT and
# build_documents() are both written specifically around filing chunks
# (form/date/section citations, "ground every claim in the supplied
# documents" meaning filing documents); reusing them here would produce a
# nonsensical citation ("Source: Tesla, Form None, filed None") and a prompt
# that doesn't actually describe the task. Same grounding principle either
# way, though: the two summaries are pre-computed from real data
# (stock_prices.csv, company_metrics.csv) and handed to the model as
# `documents`, exactly so it reasons over our real numbers instead of
# reaching for its own (likely stale or wrong) knowledge of the company's
# actual stock price.
# ---------------------------------------------------------------------------

COMPARE_SYSTEM_PROMPT = """You are the SEC Filing Analyst, comparing a company's stock price to one of \
its real financial metrics (drawn from its SEC filings).

You will be given two documents: one describing the company's recent stock price and how it's changed \
over the past year, and one describing a specific financial metric's trend across recent fiscal years. \
Answer using ONLY the numbers in those two documents — never invent, estimate, or recall from your own \
knowledge a figure that isn't there.

- Directly compare the two: has the stock price moved in the same direction as the metric, the opposite \
direction, or has one moved much more than the other? Say so explicitly, citing the actual numbers from \
both documents.
- Explain what it can mean when a stock price moves independently of the underlying metric: the market \
may have already priced in a change, may be reacting to something else entirely (competition, margins, \
macro conditions, broader sentiment), or may be pricing in future performance that hasn't shown up in \
the metric yet.
- If the two data points are moving together, say that plainly too rather than manufacturing a tension \
that isn't there.
- Never recommend buying, selling, or holding the stock, and never predict where the price is headed — \
describe the relationship between the two data points you were given, not what happens next.
- Keep it to a few short paragraphs. No preamble about what you're about to do."""


def cross_metric_answer(
    question: str,
    company: str,
    stock_summary: str,
    metric_label: str,
    metric_summary: str,
    history: list = None,
) -> str:
    """Returns the model's comparison of `stock_summary` against
    `metric_summary` for `company`, or None to fall back to a template.

    Unlike answer(), the two "documents" here are one-line, pre-computed
    factual summaries app.py already built from stock_prices.csv and
    company_metrics.csv — not raw passages — since this reasons over two
    numeric trends, not filing text."""
    if _client is None:
        logger.warning("cross_metric_answer: no Cohere client configured (COHERE_API_KEY unset) — returning None")
        return None

    documents = [
        cohere.Document(
            id="1",
            data={"company": company, "data_type": "stock price", "summary": stock_summary},
        ),
        cohere.Document(
            id="2",
            data={"company": company, "data_type": metric_label, "summary": metric_summary},
        ),
    ]
    messages = [{"role": "system", "content": COMPARE_SYSTEM_PROMPT}]
    messages.extend(_prior_turns(history or []))
    messages.append({"role": "user", "content": question})

    try:
        response = _client.chat(
            model=MODEL,
            messages=messages,
            documents=documents,
            max_tokens=MAX_TOKENS,
            temperature=TEMPERATURE,
        )
    except (ApiError, httpx.HTTPError) as e:
        logger.error("cross_metric_answer: Cohere call failed (%s): %s", type(e).__name__, e)
        return None

    if response.finish_reason not in ("COMPLETE", "MAX_TOKENS", "STOP_SEQUENCE"):
        logger.warning("cross_metric_answer: unusable finish_reason=%r — returning None", response.finish_reason)
        return None

    text = "\n\n".join(
        item.text for item in (response.message.content or [])
        if getattr(item, "type", "text") == "text" and getattr(item, "text", None)
    ).strip()
    return text or None
