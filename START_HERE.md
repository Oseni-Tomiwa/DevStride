# Start Here

## What DevStride is

DevStride is an AI software-engineering mentor and communication coach. The
current application helps authenticated users create a coaching profile,
practice in General, Mentor, Interview, and Team conversation modes, review
session summaries and Progress, and control a bounded set of saved memories.

## Current source of truth

Read these documents in order:

1. [`AGENTS.md`](AGENTS.md) for repository working rules.
2. [`docs/product/PROJECT_STATUS.md`](docs/product/PROJECT_STATUS.md) for what is
   completed, needs cleanup, is next, planned, or later.
3. [`docs/product/PRD.md`](docs/product/PRD.md) for product intent.
4. [`docs/architecture/SYSTEM.md`](docs/architecture/SYSTEM.md) and the relevant
   focused architecture documents.
5. [`docs/decisions/`](docs/decisions/) for accepted architecture decisions.

`FIRST_CODEX_PROMPT.md`, `FOLDER_TREE.txt`, and `PROJECT_GUIDE.pdf` are retained
as historical bootstrap artifacts. They do not describe the current repository
or current work order.

## Current release

v0.1.0 is deployed with a Next.js 16 frontend on Vercel, a single FastAPI
backend instance on Render, Supabase Auth/PostgreSQL, and backend-only OpenAI
access. Repository migration head is `0005`.

The next product direction is richer Dashboard and Progress intelligence,
recommended practice, explicit Goals / Development Plans, and transparent skill
and recurring-weakness tracking. See the canonical project status before
starting work.

## Local development

Follow [`README.md`](README.md) for setup, database migrations, quality checks,
and local commands. Environment variables are documented in
[`docs/operations/ENVIRONMENT.md`](docs/operations/ENVIRONMENT.md).

## Deliberately later

- Live Conversation/realtime voice (architecture not yet designed)
- RAG, embeddings, vector search, and document learning
- GitHub ingestion
- distributed infrastructure until scaling requires it
- billing and gamification unless product direction requires them
