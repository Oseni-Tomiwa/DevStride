# DevStride

DevStride is a planned AI software-engineering mentor and communication coach.
Codex is used to accelerate implementation; it is not the product name.

This repository currently contains the Milestone 1 database foundation on top
of the Milestone 0 scaffold.

## Repository structure

```text
apps/web        Next.js frontend
apps/api        FastAPI backend
packages        Shared contracts and prompts
docs            Product, architecture, and ADRs
evals           Future AI evaluation datasets
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
`/login`, `/sign-up`, `/auth/callback`, `/dashboard`, and `/onboarding`; the
last two require an authenticated Supabase session.



## Current scope

The current implementation includes the Milestone 1 foundations and the
first disabled-by-default assistant-generation boundary. Interview Mode,
memory, and other advanced product features remain out of scope.

Conversation messages are currently limited to 20,000 characters while
persistence APIs are being established. Assistant generation is available only
when the backend-only `AI_GENERATION_ENABLED` flag is set to `true` and a
server-side `OPENAI_API_KEY` is configured. Mentor conversations use the
authenticated user's onboarding profile to tailor the versioned mentor prompt;
generic conversations remain profile-agnostic.

The authenticated response boundaries are `POST
/api/v1/conversations/{conversation_id}/respond` for a complete response and
`POST /api/v1/conversations/{conversation_id}/stream` for SSE generation. Both
persist the user message, send at most the 20 most recent messages to the
configured provider, and persist one assistant response. Failed generations
preserve the user message without creating an assistant placeholder. A failed
or stopped user message can be regenerated with
`POST /api/v1/conversations/{conversation_id}/messages/{message_id}/retry`
without inserting another user-message row.
