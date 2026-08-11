# Historical Bootstrap Task — Initial Foundation Verification

> **Historical document:** This prompt was used to establish the initial
> repository foundation. It is not an active task or a current source of truth.
> Read [`docs/product/PROJECT_STATUS.md`](docs/product/PROJECT_STATUS.md) for the
> current product state and work order.

Read `AGENTS.md`, `START_HERE.md`, `docs/product/PRD.md`,
`docs/architecture/SYSTEM.md`, and `docs/decisions/ADR-001-modular-monolith.md`
before editing.

## Task
Verify the existing DevStride repository scaffold and complete any missing
Milestone 0 foundation work.

## Scope
- Inspect the monorepo structure.
- Verify the Next.js application.
- Verify the FastAPI application.
- Verify PostgreSQL Docker Compose configuration.
- Verify environment-variable validation.
- Verify the API health endpoint.
- Verify linting, formatting, type checking, tests, and builds.
- Verify GitHub Actions CI.
- Improve the README only where setup instructions are incomplete or incorrect.

## Constraints
- Do not add authentication.
- Do not add AI integration.
- Do not add conversations, interviews, memory, RAG, voice, Redis, or billing.
- Do not add dependencies unless the current scaffold cannot work without them.
- Do not redesign the architecture.
- Keep changes limited to Milestone 0.

## Acceptance criteria
- `pnpm install` succeeds.
- `pnpm web:lint` succeeds.
- `pnpm web:typecheck` succeeds.
- `pnpm web:test` succeeds.
- `pnpm web:build` succeeds.
- `make api-install` succeeds.
- `make api-lint` succeeds.
- `make api-typecheck` succeeds.
- `make api-test` succeeds.
- PostgreSQL starts with `make db-up`.
- `GET /health` returns HTTP 200 while the API is running.
- CI runs the same critical checks.
- No secrets are committed.

## Final response
List:
1. Files changed.
2. Commands run.
3. Checks passed.
4. Any unresolved issue or manual step.
