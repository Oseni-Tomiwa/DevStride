# DevStride deployment runbook

This runbook prepares the first staging/production deployment. It does not
create platform resources or contain credentials.

## Architecture

```text
Vercel Next.js frontend
        |
        | HTTPS, Authorization bearer tokens, and SSE
        v
Render FastAPI Web Service (one instance initially)
        |
        | asyncpg / SQLAlchemy
        v
Existing Supabase PostgreSQL + Auth project
        |
        v
OpenAI API (backend-only)
```

The initial Render service must use one running instance because the current
AI rate limiter is process-local. Replace it with distributed storage such as
Redis before enabling multiple API instances.

## Vercel setup

Create a Vercel project for this repository using the pnpm monorepo settings:

- Root Directory: repository root (`.`)
- Framework preset: Next.js (automatic detection)
- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm web:build`
- Output directory: leave the Next.js default
- Node.js version: 22.x LTS

Set only these frontend production variables in Vercel:

```text
NEXT_PUBLIC_API_BASE_URL=https://<render-api-domain>
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

Do not add `OPENAI_API_KEY`, `DATABASE_URL`, service-role keys, signing keys,
or backend rate-limit variables to Vercel.

Configure the production domain, then use that exact origin for the Render
`CORS_ORIGINS` value and Supabase Auth redirect configuration.

## Render setup

Create a Render Web Service using the repository Dockerfile:

- Runtime: Docker
- Dockerfile path: `apps/api/Dockerfile`
- Docker build context: repository root
- Health check path: `/health`
- Instance count: one
- Start command: provided by the Dockerfile; Render supplies `PORT`
- Pre-deploy command: `cd /app && alembic upgrade head`

The image runs:

```text
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

It does not use `--reload`, does not run migrations during application
startup, and runs as a non-root user.

Set these Render variables/secrets:

```text
APP_ENV=production
DATABASE_URL=postgresql+asyncpg://<user>:<password>@<host>:<port>/<database>?ssl=require
CORS_ORIGINS=https://<vercel-production-domain>
SUPABASE_JWT_ISSUER=https://<project-ref>.supabase.co/auth/v1
SUPABASE_JWT_ALGORITHMS=ES256
OPENAI_API_KEY=<Render secret>
OPENAI_MODEL=<approved-production-model>
AI_GENERATION_ENABLED=true
AI_RATE_LIMIT_ENABLED=true
AI_RATE_LIMIT_REQUESTS=20
AI_RATE_LIMIT_WINDOW_SECONDS=60
AI_RATE_LIMIT_KICKOFF_REQUESTS=5
AI_RATE_LIMIT_SUMMARY_REQUESTS=5
```

Render's `PORT` is authoritative. `API_PORT` is not required in production.
Do not configure `POSTGRES_USER`, `POSTGRES_PASSWORD`, or `POSTGRES_DB` as
separate production variables when the Supabase connection URL is the source
of truth.

To disable paid model calls without taking the API offline, set
`AI_GENERATION_ENABLED=false` and redeploy/restart the service.

## Supabase setup

### Auth

In Supabase Auth URL Configuration, set:

- Site URL: `https://<vercel-production-domain>`
- Redirect URL: `https://<vercel-production-domain>/auth/callback`

Add only explicitly approved staging/preview callback URLs. Do not use an
unrestricted wildcard. The backend issuer remains:
`https://<project-ref>.supabase.co/auth/v1`.

### Database

Obtain production connection details from:

```text
Supabase Dashboard -> Connect -> Postgres connection details
```

Use the Supavisor Session Pooler or another session-compatible connection
provided by Supabase for Render. Do not use transaction-pool mode for the
long-lived SQLAlchemy application or Alembic DDL migrations. The connection
must use SSL; use the provider's documented SSL query parameter or connection
settings. The application requires the SQLAlchemy asyncpg form:

```text
postgresql+asyncpg://...
```

If Supabase provides `postgresql://...`, change only the scheme to
`postgresql+asyncpg://...` and preserve the provider's host, port, database,
credentials, and SSL parameters. Never commit the resulting value.

## Alembic migration strategy

Before deployment:

1. Review the release and current Alembic head.
2. Confirm a production backup exists and is restorable.
3. Verify the target database connection is the intended Supabase project.

Render runs exactly once before the new release receives traffic:

```text
cd /app && alembic upgrade head
```

After deployment, verify the Render logs show a successful migration and run
`alembic current` from an approved operational environment. Application
rollback does not imply a schema downgrade. Only perform a manual downgrade
after reviewing migration compatibility and an explicit backup/rollback plan.

The current repository head is `0005`.

## Backup and restore

Review backup settings in the Supabase Dashboard for the selected plan before
launch. Confirm the plan's retention and restore options there; this repository
does not assume a retention period. Test a restore procedure against a separate
database before public launch. Do not claim backups exist until the selected
Supabase plan and settings confirm them.

## OpenAI handling

`OPENAI_API_KEY` belongs only in Render's secret environment configuration. It
must never be placed in Vercel, `NEXT_PUBLIC_*` variables, the Dockerfile,
source files, logs, or browser bundles. The model remains backend-controlled.

## Deployment sequence

1. Create/verify Supabase production Auth, database, SSL, and backup settings.
2. Create the Render service and configure its secrets/variables.
3. Configure Render pre-deploy migrations and `/health`.
4. Configure Vercel production variables and deploy the frontend.
5. Add the exact Vercel origin to Render CORS and Supabase redirect settings.
6. Run the smoke checklist below.
7. Promote only after CI and manual checks pass.

## Rollback sequence

1. Stop promotion and inspect Render/Vercel release health.
2. Roll the application back through the platform release controls.
3. Do not automatically downgrade PostgreSQL.
4. Review the migration compatibility and restore plan before any manual
   Alembic downgrade.

## Staging guidance

The smallest isolated staging setup is a Vercel Preview/Staging frontend, a
separate Render staging API, and a separate Supabase staging project/database.
Never run staging migrations against production. Never use production OpenAI
credentials for automated tests.

If a separate Supabase project is deferred, staging is incomplete and must not
be represented as production-isolated.

## First-deploy smoke checklist

Infrastructure:

- Vercel deployment is healthy.
- Render `/health` returns 200 without authentication.
- Render pre-deploy migration succeeds.
- Supabase database is reachable.

Authentication:

- sign-up and email confirmation
- login and logout
- protected route access

Core product:

- onboarding and profile edit
- General conversation
- streamed assistant response
- Mentor Mode
- Interview kickoff
- Team Practice kickoff
- summaries
- progress
- memory create/edit/archive/delete

Security:

- production origin succeeds in CORS preflight
- an unapproved origin is rejected
- unauthenticated API access returns 401
- AI limit returns 429 with `Retry-After`
- no secrets appear in browser bundles or logs

## Known limitations

- One Render API instance is required until the limiter is distributed.
- Production backup retention and restore capability depend on the selected
  Supabase plan and must be confirmed manually.
- No automatic production deployment or automatic schema downgrade is enabled.
