# DevStride

DevStride is an AI software-engineering mentor and communication coach.
Codex is used to accelerate implementation; it is not the product name.

The current application includes authentication, onboarding, persistent
conversations, streamed OpenAI responses, Mentor Mode, Interview Mode, Team
Practice, session summaries, progress history, and bounded Long-Term Memory v1.

For the canonical product state and work order, read
[`docs/product/PROJECT_STATUS.md`](docs/product/PROJECT_STATUS.md). The root
`FIRST_CODEX_PROMPT.md`, `FOLDER_TREE.txt`, and `PROJECT_GUIDE.pdf` are retained
only as historical bootstrap references.

## Repository structure

```text
apps/web        Next.js frontend
apps/api        FastAPI backend
packages        Shared contracts and prompts
docs            Product, architecture, and ADRs
evals           Evaluation strategy and future stable datasets
infrastructure  Deployment and operational files
```

## Prerequisites

Install:
- Node.js 22.13+
- pnpm 10+
- Python 3.12+
- uv
- Docker with Docker Compose
- Git

The web app uses Next.js 16.3.0 and requires Node.js 20.9 or newer; Node.js
22.13+ is the recommended LTS runtime used by CI. Its authentication boundary
uses the Next 16 `proxy.ts` convention with the existing Supabase SSR cookie
flow.

## Initial setup

```bash
cp .env.example .env
pnpm install
make api-install
make db-up
```

Run the setup commands from the repository root. The API reads the root `.env`
file when started through the commands below; no `.env` file is committed.

## Run the frontend

```bash
pnpm web:dev
```

Open `http://localhost:3000`.

## Run the API

```bash
make api-dev
```

Open `http://localhost:8000/docs`.

Health check:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status":"ok","service":"devstride-api"}
```

Database readiness check:

```bash
curl http://localhost:8000/ready
```

`/health` is process liveness. `/ready` performs a bounded database check and
returns 503 when PostgreSQL is unavailable; OpenAI availability is not part of
readiness.

## Quality checks

```bash
make check
```

Or individually:

```bash
pnpm web:lint
pnpm web:typecheck
pnpm web:test
pnpm web:build

make api-lint
make api-format-check
make api-typecheck
make api-test
```

## Database

Start:

```bash
make db-up
```

Stop:

```bash
make db-down
```

View logs:

```bash
make db-logs
```

Run database migrations from the repository root:

```bash
make api-migrate
```

Create a new migration after changing SQLAlchemy models:

```bash
make api-migration
```

Revert the latest migration:

```bash
make api-migrate-down
```

`DATABASE_URL` must be a PostgreSQL SQLAlchemy URL using the `asyncpg` driver,
for example `postgresql+asyncpg://devstride:devstride@localhost:5432/devstride`.
The API rejects a missing database URL outside test environments.

For PostgreSQL-backed integration tests, use a separate database and pass its
URL explicitly. The test fixture upgrades it to the Alembic head and resets it
to the base revision afterward:

```bash
TEST_DATABASE_URL=postgresql+asyncpg://devstride:devstride@localhost:5432/devstride_test \
  AI_GENERATION_ENABLED=false make api-test
```

## Backend authentication

Non-test API environments require these backend-only variables:

- `SUPABASE_JWT_ISSUER`: the Supabase issuer URL, such as
  `https://<project-ref>.supabase.co/auth/v1`.
- `SUPABASE_JWT_ALGORITHMS`: comma-separated asymmetric algorithms configured
  for the project, normally `ES256`.

The temporary authentication verification route is `GET /api/v1/auth/me` and
requires a Supabase access token in the `Authorization: Bearer` header. JWT
verification happens only in the API; private signing keys are never stored
by DevStride or exposed to the frontend.

Frontend authentication uses these public browser-safe variables:

- `NEXT_PUBLIC_SUPABASE_URL`: the Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the Supabase publishable key.

The Next.js app manages sessions with Supabase SSR cookies. It provides
`/login`, `/sign-up`, `/auth/callback`, `/dashboard`, `/onboarding`, `/profile`,
`/account`, `/conversations`, `/progress`, and `/memories`; authenticated
application routes require a verified Supabase user. Profile contains coaching
preferences, while Account shows authentication-level information. Authenticated
pages share the responsive AppShell, navigation, skip link, and footer.



## Current scope

Conversation messages are limited to 20,000 characters. Assistant generation is
available only when the backend-only `AI_GENERATION_ENABLED` flag is `true` and
a server-side `OPENAI_API_KEY` is configured. The provider is backend-only and
uses the configured `OPENAI_MODEL` with a 30-second request timeout.

The supported conversation modes are `general`, `mentor`, `interview`, and
`team`. Mentor, Interview, and Team Practice use server-selected versioned
prompts and profile context; General conversations receive no saved-memory
context. Interview and Team Practice kick off automatically without creating a
fake user message.

The authenticated response boundaries are `POST
/api/v1/conversations/{conversation_id}/respond` for a complete response and
`POST /api/v1/conversations/{conversation_id}/stream` for SSE generation. Both
persist the user message, send at most the 20 most recent messages to the
configured provider, and persist one assistant response. Failed generations
preserve the user message without creating an assistant placeholder. A failed
or stopped user message can be regenerated with
`POST /api/v1/conversations/{conversation_id}/messages/{message_id}/retry`
without inserting another user-message row.

Session summaries are available for Mentor, Interview, and Team Practice
sessions. Long-Term Memory v1 is user-owned, bounded to approved categories,
editable, archivable, secret-filtered, and injected only into relevant
Mentor, Interview, and Team prompts. It does not use RAG, embeddings,
pgvector, vector search, or document retrieval.

## Production configuration

The approved deployment topology is Vercel for the web app, Render for one
FastAPI instance, and the existing Supabase PostgreSQL/Auth project. See
[`infrastructure/DEPLOYMENT.md`](infrastructure/DEPLOYMENT.md) for platform
settings, migration, backup, rollback, and staging procedures. Configure the
following without committing values:

- API: `APP_ENV=production`, `DATABASE_URL`, `CORS_ORIGINS`,
  `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_ALGORITHMS`.
- Optional AI: `AI_GENERATION_ENABLED`, `OPENAI_MODEL`, and backend-only
  `OPENAI_API_KEY`.
- AI generation, streaming, Interview/Team kickoffs, summaries, and automatic
  memory extraction are protected by authenticated per-user rate limits.
  `AI_RATE_LIMIT_REQUESTS` and `AI_RATE_LIMIT_WINDOW_SECONDS` control normal
  generation; kickoff and summary operations have separate limits via
  `AI_RATE_LIMIT_KICKOFF_REQUESTS` and `AI_RATE_LIMIT_SUMMARY_REQUESTS`.
  Exceeded limits return HTTP 429 with `Retry-After`. The current limiter is
  in-process and per API process; install a distributed limiter before running
  multiple API instances or scaling horizontally.
  `AI_CONCURRENCY_GLOBAL_LIMIT` and `AI_CONCURRENCY_USER_LIMIT` additionally
  bound expensive provider operations to 10 per API process and 2 per user by
  default. These are process-local protections, not distributed quotas.
- Web: `NEXT_PUBLIC_API_BASE_URL`,
  `NEXT_PUBLIC_SUPABASE_URL`, and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Use explicit HTTPS origins in production. Never expose service-role keys,
private signing keys, bearer tokens, or `OPENAI_API_KEY` through `NEXT_PUBLIC_*`
variables.

## Documentation map

- [Project status](docs/product/PROJECT_STATUS.md)
- [Product requirements](docs/product/PRD.md)
- [System architecture](docs/architecture/SYSTEM.md)
- [API reference](docs/api/README.md)
- [Data model](docs/architecture/DATA_MODEL.md)
- [Authentication](docs/architecture/AUTHENTICATION.md)
- [AI provider](docs/architecture/AI_PROVIDER.md)
- [Conversation streaming](docs/architecture/CONVERSATION_STREAMING.md)
- [Testing strategy](docs/testing/STRATEGY.md)
- [Environment reference](docs/operations/ENVIRONMENT.md)
- [Troubleshooting](docs/operations/TROUBLESHOOTING.md)
- [Deployment runbook](infrastructure/DEPLOYMENT.md)
