# Testing Strategy

DevStride tests deterministic product behavior at frontend component/route,
backend service/API, provider-boundary, and PostgreSQL integration levels. Live
Supabase and OpenAI calls are not part of automated tests.

## Quality gates

Run from the repository root:

```bash
pnpm web:lint
pnpm web:typecheck
pnpm web:test
pnpm web:build

make api-lint
make api-format-check
make api-typecheck
make api-test

git diff --check
```

`make check` runs the frontend and backend gates except `git diff --check`.

## Frontend tests

Vitest, jsdom, and Testing Library cover:

- Supabase session-refresh middleware and protected route decisions;
- landing/auth forms and authenticated route redirects;
- onboarding and Profile validation/persistence calls;
- AppShell navigation, active states, and footer;
- Dashboard, Progress, and Memory rendering/interactions;
- conversation list/create/rename/delete;
- conversation detail, mode kickoff, SSE terminal states, cancellation, retry,
  persisted history, and provider/auth failures;
- safe assistant Markdown and plain user-message rendering.

Supabase clients and backend calls are mocked deterministically. There is no
browser-level Playwright suite yet, so cookie propagation across a real hosted
Supabase project and full production navigation remain manual smoke checks.

## Backend tests

Pytest, pytest-asyncio, and FastAPI's test client cover:

- settings/environment validation;
- JWT/JWKS signature and claim verification with local deterministic keys;
- CORS preflight behavior;
- profiles/onboarding ownership and validation;
- conversation repositories, services, API routes, titles, modes, retries,
  generation persistence, and SSE events;
- provider adapter behavior without real OpenAI requests;
- summaries, Progress query behavior, memory thresholds/deduplication/privacy,
  and prompt-injection boundaries;
- authenticated per-user rate limiting;
- health response.

Tests must never contact Supabase or OpenAI, print tokens, or require real
credentials.

## PostgreSQL integration tests

Integration coverage uses PostgreSQL, not SQLite. Supply a database dedicated to
tests:

```bash
TEST_DATABASE_URL=postgresql+asyncpg://devstride:devstride@localhost:5432/devstride_test \
  AI_GENERATION_ENABLED=false make api-test
```

The session fixture:

1. checks test-database connectivity;
2. upgrades the database to Alembic head;
3. cleans product tables between tests;
4. exercises real async SQLAlchemy repositories and API persistence;
5. downgrades the test database to base when the fixture finishes.

If `TEST_DATABASE_URL` is absent or PostgreSQL cannot be reached, PostgreSQL
integration tests skip. CI starts PostgreSQL and supplies both `DATABASE_URL`
and `TEST_DATABASE_URL`, so connection-refusal skips should not occur there.
Never point this fixture at a development, staging, or production database.

## CI

GitHub Actions runs web lint/typecheck/test/build and backend
lint/format/typecheck/tests on pushes to `main` and pull requests. The backend
job uses Python 3.12 and PostgreSQL 16. The current web install command uses
`pnpm install --no-frozen-lockfile`; reconciling that with the production frozen
lockfile policy is tracked cleanup work.

## Manual checks still required

- email confirmation and browser-visible Supabase SSR cookie/session behavior;
- production/staging CORS and callback allow-lists;
- a controlled real OpenAI response/stream verification;
- Vercel/Render deployment and migration logs;
- responsive behavior and keyboard/screen-reader review;
- backup restoration against an isolated database.

## Known gaps

- no browser E2E suite;
- no automated accessibility scanner;
- no coverage threshold/reporting policy;
- no load/concurrency stress suite;
- no deployment-container smoke test in CI;
- no backup/restore automation;
- existing Starlette/httpx deprecation and jsdom navigation warnings need
  cleanup.
