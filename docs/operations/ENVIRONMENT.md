# Environment Configuration

Copy `.env.example` to an untracked repository-root `.env` for local
development. FastAPI resolves that file from `apps/api/app/core/config.py` using
an absolute path derived from `__file__`, so loading does not depend on the
current working directory. Process environment variables override `.env`.

Never commit `.env`, database credentials, bearer/refresh tokens, passwords,
private signing keys, service-role credentials, or OpenAI keys.

## Shared/API runtime

| Variable | Required | Meaning |
| --- | --- | --- |
| `APP_ENV` | Recommended; `production` in production | Defaults to `development`; `test` preserves test-only relaxed DB/auth presence behavior. |
| `DATABASE_URL` | Yes outside test | SQLAlchemy URL using exactly `postgresql+asyncpg://`. |
| `CORS_ORIGINS` | Yes operationally | Comma-separated explicit origins. `*` is rejected; production origins must use HTTPS. |
| `SUPABASE_JWT_ISSUER` | Yes outside test | Exact HTTPS `https://<project-ref>.supabase.co/auth/v1` issuer. |
| `SUPABASE_JWT_AUDIENCE` | Optional | Defaults to `authenticated`. |
| `SUPABASE_JWT_ALGORITHMS` | Optional but should be explicit | Comma-separated allow-list containing only `ES256` and/or `RS256`; default `ES256`. Match the project's active asymmetric key. |
| `AI_GENERATION_ENABLED` | Optional | Defaults false. Enables provider-backed generation only when a key is present. |
| `LIVE_INTERVIEW_ENABLED` | Optional | Defaults false. Enables Realtime Practice Phase 1 for owned Interview conversations. No transcripts or messages are persisted. |
| `LIVE_INTERVIEW_MODEL` | Optional | Backend-selected Realtime model, default `gpt-realtime`; never accepted from clients. |
| `VIDEO_INTERVIEW_ENABLED` | Optional | Defaults false. Enables Video Interview, which uses local camera preview plus the existing Live Interview audio transport. |
| `LIVE_MENTOR_ENABLED` | Optional | Defaults false. Enables Live Mentor for owned Mentor conversations configured with `live_voice`. |
| `LIVE_MENTOR_MODEL` | Optional | Backend-selected Live Mentor model, default `gpt-realtime`; never accepted from clients. |
| `OPENAI_API_KEY` | Required only when AI generation is enabled | Backend-only provider credential. |
| `OPENAI_MODEL` | Optional | Backend-selected model, default `gpt-4.1-mini`. |
| `AI_RATE_LIMIT_ENABLED` | Optional | Defaults true. |
| `AI_RATE_LIMIT_REQUESTS` | Optional | Normal respond/stream/retry requests per window; default 20. |
| `AI_RATE_LIMIT_WINDOW_SECONDS` | Optional | Shared rate-limit window; default 60. |
| `AI_RATE_LIMIT_KICKOFF_REQUESTS` | Optional | Interview/Team kickoff limit; default 5. |
| `AI_RATE_LIMIT_SUMMARY_REQUESTS` | Optional | Summary-generation limit; default 5. |
| `AI_CONCURRENCY_GLOBAL_LIMIT` | Optional | Maximum concurrent provider operations per API process; default 10. |
| `AI_CONCURRENCY_USER_LIMIT` | Optional | Maximum concurrent provider operations per user per API process; default 2. |

All rate-limit numeric values must be positive. The limiter is process-local;
keep one API instance until distributed storage is introduced.

Concurrency protection is also process-local. It limits expensive text,
summary, kickoff, and realtime operations to two concurrent operations per
user and ten across the API process by default. It is not a distributed quota;
replace it with shared infrastructure before horizontal scaling.

`GET /health` is liveness only. `GET /ready` performs a bounded `SELECT 1`
against PostgreSQL and returns 503 when the application cannot reach its
database. OpenAI availability is intentionally not part of readiness.

`API_HOST` and `API_PORT` are accepted settings with local defaults, but current
Makefile/Docker commands provide Uvicorn host/port directly. Render supplies
`PORT`; the production Docker command binds `0.0.0.0` to `${PORT:-10000}`.

## Web

| Variable | Required | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Yes | FastAPI base URL; local default is `http://localhost:8000`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Public Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Browser-safe Supabase publishable key. |
| `NEXT_PUBLIC_REALTIME_MAX_DURATION_SECONDS` | Optional | Browser-enforced maximum live Interview/Mentor/Video session duration; default 3600 seconds. |

Only browser-safe values may use `NEXT_PUBLIC_*`. Do not expose
`DATABASE_URL`, `OPENAI_API_KEY`, service-role keys, signing keys, or legacy JWT
secrets to Next.js.

## Local PostgreSQL container

| Variable | Required | Meaning |
| --- | --- | --- |
| `POSTGRES_USER` | Optional | Docker Compose user, default `devstride`. |
| `POSTGRES_PASSWORD` | Optional | Docker Compose password, default `devstride`; local only. |
| `POSTGRES_DB` | Optional | Docker Compose database, default `devstride`. |

These component values are not required in Render when `DATABASE_URL` is the
source of truth.

## Tests and migrations

`TEST_DATABASE_URL` is optional for the general backend test run and required to
execute PostgreSQL integration tests. It must point to a disposable test-only
database. Alembic prefers `TEST_DATABASE_URL` when present; otherwise it uses
`DATABASE_URL`.

`APP_ENV=test` allows missing `DATABASE_URL` and `SUPABASE_JWT_ISSUER` for
isolated tests. It does not weaken URL/algorithm validation when values are
provided.

Run migrations with:

```bash
make api-migrate
```

Production Supabase connections must use SQLAlchemy's asyncpg scheme. Use a
session-compatible Supavisor pooler connection and provider-supported SSL
parameters as described in the [deployment runbook](../../infrastructure/DEPLOYMENT.md).

## Platform mapping

- Vercel: the three `NEXT_PUBLIC_*` web variables only.
- Render: API/database/auth/AI variables and platform `PORT`.
- Supabase: Auth callback/site configuration and PostgreSQL connection source.
- OpenAI: key stored only as a Render backend secret.
