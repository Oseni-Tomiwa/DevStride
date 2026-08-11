# API Errors

## JSON errors

FastAPI errors use the normal JSON shape:

```json
{"detail":"User-safe message"}
```

The frontend API client also tolerates plain-text/non-JSON failures and falls
back to a safe status-based message instead of exposing a JSON parser error.

## Shared HTTP statuses

| Status | Meaning in DevStride |
| --- | --- |
| 400 | Content is unsafe/invalid for the operation, such as secret-like memory content. |
| 401 | Missing, malformed, expired, unverifiable, or otherwise invalid bearer authentication. |
| 404 | Owned resource is absent. Ownership lookups intentionally do not reveal another user's resource. |
| 409 | Current state or mode does not allow the operation, such as duplicate onboarding or invalid retry/kickoff/summary use. |
| 422 | Pydantic request validation failed. |
| 429 | Authenticated AI operation exceeded its configured per-user limit; includes `Retry-After`. |
| 502 | Backend provider generation/structured-output failure. |
| 503 | AI generation is disabled or unavailable for the requested complete-response operation. |

Unhandled failures return FastAPI's generic server error behavior. Production
clients must not display raw internal details.

## Authentication privacy

Authentication failures always return the generic detail `Invalid
authentication credentials` with `WWW-Authenticate: Bearer`. The response does
not disclose whether failure came from issuer, audience, expiry, subject,
algorithm, signing key, or signature verification.

## Streaming errors

After an SSE response has opened, handled failures use an `error` event followed
by `done`; the HTTP status may remain 200. Clients must therefore interpret the
SSE lifecycle rather than relying only on the initial HTTP status. See
[SSE Protocol](sse-protocol.md).

## Logging rules

Logs may include operation names, conversation mode, or exception class for
diagnosis. They must not include bearer tokens, passwords, Supabase/OpenAI keys,
raw provider responses, hidden prompts, or sensitive user content.
