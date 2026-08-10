# DevStride Codex Instructions

## Project purpose
DevStride is an AI software-engineering mentor and communication coach.
Codex is the coding agent used to accelerate development; it is not the product.

## Current milestone
Milestone 3: bounded Long-Term Memory v1 on top of the conversation and session-summary foundation.

Milestone 0, Milestone 1, and the Milestone 2 conversation/session-summary
foundations are implemented. Long-Term Memory v1 is explicitly in scope when
requested: it must remain bounded, transparent, editable, deletable,
ownership-scoped, conservative, and limited to approved categories and trusted
profile/session-summary sources. Do not implement RAG, embeddings, pgvector,
vector search, document retrieval, GitHub ingestion, or "remember everything"
behavior. Voice, billing, and unrelated product features remain deferred.

## Required reading order
Before editing:
1. Read this file.
2. Read `START_HERE.md`.
3. Read `docs/product/PRD.md`.
4. Read `docs/architecture/SYSTEM.md`.
5. Read relevant ADRs in `docs/decisions/`.
6. Inspect existing code and tests.

## Architecture rules
- Use a modular monolith.
- Web app: Next.js + TypeScript.
- API: FastAPI + Python.
- Database: PostgreSQL.
- Use one API application, not microservices.
- Do not add dependencies without explicit approval.
- Do not introduce Redis, LangChain, LangGraph, Kubernetes, or a second LLM provider.
- Keep provider-specific AI code behind an internal interface when AI work begins.
- Store secrets only in environment variables.
- Never commit `.env` files or credentials.
- Memory must never store secrets, auth material, or sensitive personal data by
  default; user-facing memory must be inspectable and easy to delete.

## Change rules
- Make the smallest coherent change that satisfies the task.
- Do not modify unrelated modules.
- Add or update tests for changed behavior.
- Use reversible Alembic migrations for database changes.
- Validate all external input.
- Enforce authentication and record ownership once protected features exist.
- Memory records must be owned by the verified JWT subject; never accept
  `user_id` from client input.
- Do not log secrets, tokens, or sensitive user content.
- Review generated migrations and security-sensitive code manually.

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
- `make api-typecheck`
- `make api-test`

### All quality checks
- `make check`

## Definition of done
A task is complete only when:
- Acceptance criteria are met.
- Changed behavior has tests.
- Linting and type checking pass.
- Relevant tests pass.
- No unrelated files changed.
- Documentation is updated when behavior or architecture changes.
- No secrets are committed.

## Required final response
Report:
1. Summary of changes.
2. Files changed.
3. Commands run.
4. Tests and checks passed.
5. Remaining risks or follow-up work.
