# DevStride Codex Instructions

## Project purpose

DevStride is an AI software-engineering mentor and communication coach.
Codex is the coding agent used to accelerate development; it is not the product.

## Current product state

The authenticated v0.1.0 product is implemented through conversation modes,
session summaries, Progress, and bounded Long-Term Memory v1. Read
[`docs/product/PROJECT_STATUS.md`](docs/product/PROJECT_STATUS.md) for the
canonical list of completed, cleanup, next, planned, and later work. Do not use
historical milestone files as current task direction.

Long-Term Memory v1 must remain bounded, transparent, editable, archivable,
ownership-scoped, conservative, and limited to approved categories and trusted
profile/session-summary sources. Do not implement RAG, embeddings, pgvector,
vector search, document retrieval, GitHub ingestion, or "remember everything"
behavior without separate approval.

Live Conversation/realtime voice is approved through the bounded Realtime
Practice Phase 5 Live Mentor experience described in
`docs/architecture/REALTIME.md`. Keep video, emotion/personality inference,
raw-audio storage, Team Practice realtime, and broader realtime product
expansion out of scope unless separately approved.

## Required reading order

Before editing:

1. Read this file.
2. Read `START_HERE.md`.
3. Read `docs/product/PROJECT_STATUS.md`.
4. Read `docs/product/PRD.md`.
5. Read `docs/architecture/SYSTEM.md`.
6. Read relevant ADRs in `docs/decisions/`.
7. Inspect existing code and tests.

## Architecture rules

- Use a modular monolith.
- Web app: Next.js + TypeScript.
- API: FastAPI + Python.
- Database: PostgreSQL.
- Use one API application, not microservices.
- Do not add dependencies without explicit approval.
- Do not introduce Redis, LangChain, LangGraph, Kubernetes, or a second LLM
  provider without an approved requirement.
- Keep provider-specific AI code behind the existing internal interface.
- Store secrets only in environment variables.
- Never commit `.env` files or credentials.
- Memory must never store secrets, auth material, or sensitive personal data by
  default; user-facing memory must be inspectable and easy to archive/delete.

## Change rules

- Make the smallest coherent change that satisfies the task.
- Do not modify unrelated modules.
- Add or update tests for changed behavior.
- Use reversible Alembic migrations for database changes.
- Validate all external input.
- Enforce authentication and record ownership for protected features.
- Derive ownership from the verified JWT subject; never accept `user_id` from
  client input for owned data.
- Do not log secrets, tokens, or sensitive user content.
- Review generated migrations and security-sensitive code manually.
- Update `docs/product/PROJECT_STATUS.md` when product state or priorities change.
- User-facing changes must follow `docs/product/ACCESSIBILITY.md`: preserve semantic HTML, keyboard access, visible focus, accessible names, form labels, accessible errors, and non-color-only communication; add relevant accessibility tests where practical and report known limitations.

## Commands

Run from the repository root.

### Local services

- `make db-up`
- `make db-down`

### Web

- `pnpm install`
- `pnpm web:dev`
- `pnpm web:lint`
- `pnpm web:typecheck`
- `pnpm web:test`
- `pnpm web:build`

### API

- `make api-install`
- `make api-dev`
- `make api-lint`
- `make api-format-check`
- `make api-typecheck`
- `make api-test`

### All quality checks

- `make check`

## Definition of done

A task is complete only when:

- acceptance criteria are met;
- changed behavior has tests;
- linting and type checking pass;
- relevant tests pass;
- no unrelated files changed;
- documentation is updated when behavior or architecture changes;
- no secrets are committed.

## Required final response

Report:

1. Summary of changes.
2. Files changed.
3. Commands run.
4. Tests and checks passed.
5. Remaining risks or follow-up work.
