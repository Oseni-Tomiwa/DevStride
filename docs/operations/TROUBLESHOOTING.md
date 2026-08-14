# Troubleshooting

Start with `git status --short`, confirm `.env` is untracked, and never paste
secret values into issues, logs, screenshots, or reports.

## API settings fail before startup

- Confirm the repository-root `.env` exists and required variables are present.
- `DATABASE_URL` must parse as SQLAlchemy `postgresql+asyncpg://...`.
- Outside `APP_ENV=test`, `DATABASE_URL` and `SUPABASE_JWT_ISSUER` are required.
- The issuer must be HTTPS and end exactly in `/auth/v1`.
- Allowed JWT algorithms are only explicitly configured `ES256`/`RS256`.
- `CORS_ORIGINS` cannot contain `*`; production origins must be HTTPS.
- Enabling AI without `OPENAI_API_KEY` is rejected.

The API loads `.env` by an absolute repository-root path. Process environment
variables take precedence, so inspect whether a stale shell/platform variable is
overriding the file without printing its value.

## PostgreSQL or migrations fail

```bash
docker info
make db-up
docker compose ps
make api-migrate
cd apps/api && uv run alembic current
```

The local container should report healthy. Connection refusal usually means the
container is stopped, the port/host is wrong, or the URL points to a different
database. Production Supabase should use a session-compatible pooler and SSL;
do not use the transaction pooler for the long-lived SQLAlchemy app or Alembic
DDL.

Repository head is `0008`. Do not downgrade production automatically as part of
an application rollback. Note that downgrading `0005` requires the resulting
Mentor/Interview-only summary constraint to be valid; review existing Team
summary rows and the backup plan first.

## PostgreSQL integration tests skip

Set `TEST_DATABASE_URL` to a reachable, disposable PostgreSQL database. Do not
use SQLite or any non-test database. The fixture intentionally skips when the
URL is absent or unreachable.

## Login succeeds but protected pages redirect to `/login`

- Confirm browser/server Supabase clients use the same public project URL/key.
- Confirm Supabase allows the exact `/auth/callback` URL.
- Inspect cookie presence/names without printing cookie values.
- Ensure Next.js `proxy.ts` runs for the route and returns the response containing
  refreshed `Set-Cookie` headers.
- Server Components and proxy authorization should use `auth.getUser()`, not an
  unverified raw session user.
- Authenticated pages are `force-dynamic`; do not add static caching.

## FastAPI returns 401 for a valid browser session

Compare only safe JWT metadata (`alg`, `kid`, issuer, audience, UUID subject
shape, expiry presence) with backend configuration. Never print the token.
Check the exact issuer, configured algorithm allow-list, audience (normally
`authenticated`), derived JWKS URL, and whether the current `kid` exists in
JWKS. External failures remain the same generic 401.

## Browser CORS preflight fails

- `CORS_ORIGINS` must include the exact frontend origin, locally
  `http://localhost:3000`.
- Confirm the browser calls the FastAPI route (for onboarding,
  `/api/v1/onboarding`) and not a stale/incorrect base URL.
- FastAPI CORSMiddleware allows credentials, all methods, and required headers
  for explicitly listed origins. Do not combine credentials with wildcard
  origins.
- A healthy preflight should be handled by middleware rather than reaching a
  route as an unsupported `OPTIONS` method.

## AI generation is unavailable

- Confirm presence—not values—of `AI_GENERATION_ENABLED`, `OPENAI_API_KEY`, and
  `OPENAI_MODEL`.
- Generation disabled returns a safe unavailable response and does not consume
  rate-limit quota.
- 429 includes `Retry-After`; wait for the configured window.
- 502 or an SSE `generation_failed` event means the provider boundary failed;
  logs intentionally contain only safe operation/error-class metadata.

## Stream stops or UI stays generating

The successful protocol is `user_message`, zero or more `assistant_delta`,
`assistant_complete`, `done`, then EOF. Kickoff omits `user_message` and can emit
a pending event. `assistant_complete` is terminal success even if trailing
`done` is lost. EOF before completion is interruption. See the
[SSE protocol](../api/sse-protocol.md).

## Live Interview reconnects or loses the microphone

Phase 4B browser coverage runs with deterministic media/WebRTC/provider fakes
across Chromium, WebKit, and Firefox; it does not require OpenAI credentials or
a physical microphone. In the real browser, a microphone permission denial or
an ended input track leaves the Interview incomplete and exposes a retry state.
Temporary transport failures retry at most three times with 500ms, 1s, and 2s
backoff. A 401/403/404/409 stops automatic reconnect so the user can recover
without a logout or accidental finalization. Explicit End cancels pending
reconnect timers and closes old media/peer resources before finalization.

If the browser is connected but audio is silent, use the visible “Enable
interviewer audio” action; autoplay policy may require a user gesture. Never
collect or log SDP, tokens, raw audio, transcript text, or provider payloads
while diagnosing a transport issue.

## Live Mentor does not start or reconnect

Live Mentor requires an owned Mentor conversation created with
`mentor_transport=live_voice`, a completed Profile, `LIVE_MENTOR_ENABLED=true`,
and the server-only OpenAI configuration. Existing text Mentor conversations
remain text-only. A successful first connection marks the conversation started;
refresh and reconnect do not request a duplicate greeting. Authentication
expiry stops automatic retry, microphone/device loss leaves the session
recoverable, and explicit End Session cancels pending reconnects before the
existing Mentor summary and Memory pipeline runs.

Live Mentor does not use Interview assessment or voice analytics. Diagnose only
with safe state/status information; never collect SDP, tokens, raw audio,
transcript dumps, prompts, memory metadata, or provider payloads.

## Deployment container fails

Build from repository root:

```bash
docker build -f apps/api/Dockerfile -t devstride-api .
```

The runtime copies `/build/.venv` and adds `/build/.venv/bin` to `PATH`, so
`uvicorn` is available to the non-root app user. Render must use the repository
root as Docker context and rely on the Dockerfile command/its supplied `PORT`.

## Escalation checklist

Record the failing command, status code, safe error class/message, environment
name, release/commit, and whether the issue reproduces locally. Redact all
tokens, passwords, keys, database URLs, raw provider responses, and private user
content.
