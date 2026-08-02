# Frontend

The Next.js chat UI for SEC Filing Analyst — the landing page and the chat
interface itself. For architecture, the RAG pipeline, the backend, and AWS
infrastructure, see the [root README](../README.md); this file only covers
what's specific to this folder.

## Local development

```bash
npm install
npm run dev
```

Opens at `http://localhost:3000`.

For a production-accurate build (this project builds with `next build
--webpack`, not the Turbopack default):

```bash
npm run build && npm start
```

## Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the backend API. Defaults to `http://localhost:8000` if unset — see `src/lib/chat-api.ts`. |

## Deployment

Deploys via **AWS Amplify Hosting**, not Vercel — see the root README's
["Manual AWS steps required"](../README.md#-manual-aws-steps-required-after-merging-into-this-monorepo)
section for the monorepo build configuration (`amplify.yml` at the repo
root, `AMPLIFY_MONOREPO_APP_ROOT` set to `frontend`).
