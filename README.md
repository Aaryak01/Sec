# SEC Filing Analyst

<!--
  TODO(Aarya): replace this with your two-sentence project summary.
  Suggested spot — right under the title, above "What it does".
-->

An educational RAG chatbot for reading real SEC filings in plain English. Ask
about a company's risk factors, financial metrics, or stock price, and get
answers grounded in the actual filing text or real market data — not
guesses — with a Next.js chat UI, a FastAPI backend, and AWS-hosted auth,
persistence, and billing.

## What it does

- **Ask about real filings.** "What does Tesla say about supply chain risk?"
  retrieves the actual passage from its 10-K and answers from it, with a
  source citation (company, form type, filing date).
- **Compare companies and years.** Revenue, margins, R&D spend, and other
  filing-reported metrics, sorted and charted across up to 10 major tech
  companies and four fiscal years.
- **Track how disclosure language changes.** Risk-factor tone scored and
  charted year over year, so you can see when a company's own language about
  its risks got more cautious or more confident.
- **Real stock price data**, including cross-metric reasoning — "how does
  Tesla's stock price compare to its revenue growth" pulls both data sources
  and reasons about the relationship between them, not just one metric.
- **Accounts, saved conversations, and a usage tier.** Cognito-backed sign-in,
  conversations persisted per user in DynamoDB, a free daily message limit,
  and a Stripe **test-mode** Pro upgrade (no real payments — see
  [`backend/api.py`](backend/api.py) for the test-mode disclosure).

## Architecture

```
┌─────────────────┐      HTTPS       ┌──────────────────┐
│   Next.js 16     │ ───────────────▶ │   FastAPI (api.py)│
│  (App Router)    │ ◀─────────────── │                    │
│  frontend/        │      JSON        │  backend/          │
└────────┬─────────┘                  └─────────┬──────────┘
         │                                       │
         │ Cognito Hosted UI /                   │ imports as a module
         │ Amplify Auth SDK                      ▼
         │                             ┌──────────────────────┐
         ▼                             │   app.py (chatbot)    │
┌──────────────────┐                   │  routing, retrieval,  │
│  AWS Cognito      │                   │  chart generation     │
│  (user pool)      │                   └──────────┬────────────┘
└──────────────────┘                              │
                                                    │
                          ┌─────────────────────────┼─────────────────────────┐
                          ▼                         ▼                         ▼
                ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
                │  TF-IDF retrieval │     │   Cohere API      │     │   AWS DynamoDB     │
                │  (scikit-learn,   │────▶│  (command-a,       │     │  conversations +    │
                │  cosine similarity│     │  transformer LLM,  │     │  usage tables       │
                │  over filing text)│     │  grounded          │     └──────────────────┘
                └──────────────────┘     │  generation)       │
                                          └──────────────────┘
```

**The RAG pipeline**, end to end:

1. **Retrieval** — a query against a company's filings runs through a
   TF-IDF vectorizer (`scikit-learn`, unigrams + bigrams, ~30k features)
   fit over pre-chunked SEC filing sections. The top-matching chunks are
   selected by cosine similarity, scoped to the company/year/section the
   question implies.
2. **Grounded generation** — the retrieved chunks are passed to **Cohere's
   `command-a-03-2025`** (a transformer-based LLM) as structured `documents`
   via its native grounding API, not pasted into the prompt as raw text.
   The system prompt instructs the model to answer only from what's in the
   documents, cite the source filing, and say plainly when the documents
   don't cover the question — the model is never asked to answer from its
   own general knowledge of a company.
3. **Deterministic fallback** — if no API key is configured or the Cohere
   call fails, the same retrieved data still produces a template-built
   answer instead of the app going down. Numeric questions (metrics,
   comparisons, charts) are answered deterministically from
   `data/*.csv` either way — the LLM is used for open-ended reasoning and
   cross-source comparisons, not for arithmetic.

**Everything else:**

- **Backend** — FastAPI (`backend/api.py`) is a thin HTTP wrapper around the
  existing chatbot logic in `backend/app.py`; the same `route_message()`
  function drives both. Handles Cognito JWT verification, DynamoDB-backed
  conversation persistence and per-user daily usage limits, and Stripe
  Checkout (test mode) for the Pro tier.
- **Frontend** — Next.js 16 (App Router), React 19, Tailwind CSS v4. Auth via
  `aws-amplify`, markdown-rendered chat responses (`react-markdown` +
  `remark-gfm`), matplotlib-generated charts returned as data URIs from the
  backend.
- **AWS infrastructure** — Cognito (auth), DynamoDB (conversations + usage),
  ECS Express Mode + ECR (backend hosting, deployed via GitHub Actions OIDC —
  no long-lived AWS keys in CI), Amplify Hosting (frontend).
- **Real market data** — `backend/fetch_stock_prices.py` (yfinance) refreshes
  `data/stock_prices.csv` offline; the app reads real historical prices and
  computed metrics from CSVs at request time, not a live market API call.

## Repo layout

```
.
├── backend/     FastAPI + chatbot logic, deployed to AWS ECS
├── frontend/    Next.js chat UI, deployed to AWS Amplify Hosting
└── .github/workflows/deploy.yml   Backend CI/CD (builds backend/, deploys to ECS)
```

This is a monorepo merged from two previously separate repos (`sec-backend`
and `sec-chatbot-web`) using `git subtree`, so history from both is preserved
— see `git log` for the full combined timeline.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Frontend auth | AWS Amplify SDK (`aws-amplify`) against Cognito |
| Markdown rendering | `react-markdown`, `remark-gfm` |
| Backend framework | FastAPI, Uvicorn |
| Retrieval | scikit-learn (`TfidfVectorizer`, cosine similarity) |
| Generation | Cohere `command-a-03-2025` (transformer LLM), native grounded generation |
| Data / charts | pandas, matplotlib, numpy |
| Market data | yfinance (offline fetch script) |
| Auth | AWS Cognito (hosted user pool + app client) |
| Persistence | AWS DynamoDB (conversations, per-user usage) |
| Payments | Stripe Checkout, **test mode only** |
| Backend hosting | AWS ECS (Express Mode) + ECR |
| Frontend hosting | AWS Amplify Hosting |
| CI/CD | GitHub Actions (OIDC → AWS, no stored AWS keys) |

## Local development

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env   # fill in COHERE_API_KEY at minimum; see below
uvicorn api:app --reload --port 8000
```

Environment variables the backend reads (all optional except where noted —
the app degrades gracefully without Cohere/AWS credentials, falling back to
template answers and skipping persistence):

| Variable | Purpose |
|---|---|
| `COHERE_API_KEY` | Enables LLM-grounded answers; without it, template fallbacks are used |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | DynamoDB access (conversations, usage tracking) |
| `COGNITO_USER_POOL_ID` / `COGNITO_APP_CLIENT_ID` / `COGNITO_REGION` | Override the default Cognito pool (defaults are baked in for this project's pool) |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` | Stripe **test mode** keys for the Pro-upgrade flow |
| `FRONTEND_URL` | Base URL for Stripe Checkout success/cancel redirects |

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Point it at a local backend by setting `NEXT_PUBLIC_API_URL` (defaults to
`http://localhost:8000` if unset — see `frontend/src/lib/chat-api.ts`). For
a production-accurate build (this project ships with
`next build --webpack`, not the Turbopack default — see comments in
`frontend/package.json`):

```bash
npm run build && npm start
```

## Deployment

The backend deploys automatically on push to `main` (scoped to changes under
`backend/`) via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):
build the Docker image from `backend/Dockerfile`, push to ECR, then deploy to
ECS Express Mode. Requires the GitHub repo secrets/variables listed in that
workflow file (`COHERE_API_KEY`, `DYNAMODB_AWS_ACCESS_KEY_ID`/`SECRET`,
`STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `AWS_ACCOUNT_ID`, `AWS_REGION`,
`ECS_SERVICE`, `ECS_CLUSTER`, `ECR_REPOSITORY`) and a one-time AWS OIDC role
(`GitHubActionsECSDeployRole`) — not something this workflow file alone sets
up.

The frontend deploys via AWS Amplify Hosting, connected directly to this
repo (not GitHub Actions) — **see "Manual AWS steps required" below**, since
this changed with the monorepo merge and needs reconfiguring in the AWS
Console.

### ⚠️ Manual AWS steps required after merging into this monorepo

These are **not** done yet and must be done by hand in the AWS Console —
nothing in this repo can change them:

1. **Amplify Hosting (frontend)** — two-part fix; the config half is already
   committed, only the Console setting is on you:
   - **Already done in this repo:** the build spec moved to a root-level
     [`amplify.yml`](amplify.yml) using the monorepo `applications:` format
     with `appRoot: frontend`. (A single-app spec at any location, including
     inside `frontend/`, fails once Amplify is in monorepo mode with
     `Monorepo spec provided without "applications" key` — confirmed by
     hitting that exact error.)
   - **Still manual:** **App settings → Environment variables** → add
     `AMPLIFY_MONOREPO_APP_ROOT` = `frontend` (all branches), then redeploy.
     Without this, Amplify still builds from the repo root and fails with
     `Cannot read 'next' version in package.json` — also confirmed by
     hitting that error before this variable was set.

   No repo reconnection needed if Amplify is already pointed at whichever of
   the two repos ended up hosting the monorepo (confirm in App settings →
   General which repo/branch it's building from).

2. **ECS / GitHub Actions (backend)** — the GitHub Actions OIDC role
   (`GitHubActionsECSDeployRole`) trusts a specific GitHub repo (and
   optionally branch) in its trust policy. That trust policy currently
   references `Aaryak01/sec-backend`, which no longer matches this merged
   repo's name. Update the role's trust policy condition (in IAM →
   `GitHubActionsECSDeployRole` → Trust relationships) to reference this new
   repo instead, e.g. `repo:Aaryak01/<new-repo-name>:ref:refs/heads/main`.

   Also double check the GitHub repo **Secrets and Variables** (Settings →
   Secrets and variables → Actions) are re-added on this new repo — secrets
   don't carry over automatically when you push to a different repo.

3. Only after both of the above are confirmed working — do **not** archive
   or delete the old `sec-backend` / `sec-chatbot-web` repos, since deleting
   them first would break the still-live deployments if anything above needs
   a rollback.

## Cost management

This is a portfolio demo, not a production service — there's no reason to
pay for backend compute while nobody's using it. Two scripts in
[`backend/scripts/`](backend/scripts/) scale the ECS Express Mode service's
task count between 0 and 1 on demand:

```bash
./backend/scripts/stop-backend.sh    # scale to 0 — stops Fargate compute billing
./backend/scripts/start-backend.sh   # scale back to 1, waits until /health responds
```

Both require the AWS CLI configured with credentials that can call
`ecs:UpdateService` / `ecs:DescribeServices` on this cluster (the same CLI
setup already used elsewhere in this project). Override the target via env
vars if needed: `ECS_CLUSTER`, `ECS_SERVICE`, `AWS_REGION`,
`BACKEND_HEALTH_URL`.

**What this actually saves, honestly:** `desired-count 0` is a completely
standard ECS operation — no service deletion or recreation involved, and
it's what `stop-backend.sh` does. It stops 100% of Fargate compute billing
(the task here is 1 vCPU / 2GB, the dominant cost for this project if left
running 24/7). It does **not** stop the Express Mode gateway's Application
Load Balancer, which has its own small fixed hourly charge regardless of
whether any tasks are running behind it — so this isn't literally $0/hour
when "off," just close to it. The alternative (fully deleting and
recreating the service, e.g. by re-running the GitHub Actions deploy
workflow from scratch each time) would also tear down and reprovision that
ALB — which is slower, and risks the ALB's hostname changing, breaking the
frontend's configured `NEXT_PUBLIC_API_URL` until it's updated to match.
Scaling to zero avoids all of that for the cost of the ALB's fixed fee,
which was judged the better trade for a demo project that gets started and
stopped often.

**Timing:** `start-backend.sh` waits for the ECS task to reach steady state,
then polls `/health` until it responds — in testing, the full round trip
(task start → steady state → `/health` responding) took **about 75-80
seconds**, most of which is ECS/ALB health-check timing rather than the
app itself; once the task is actually running, the app finishes loading its
TF-IDF matrix over the filing chunks well within that window.

**While stopped:** the frontend (Amplify) is still live and will load, but
any chat request will fail — the Express Mode ALB returns a `503` with no
healthy targets to route to. That's expected, not a bug; it's exactly what
"the backend is intentionally off" looks like from the frontend's side, and
`start-backend.sh` is the fix.

## License

MIT — see [LICENSE](LICENSE).
