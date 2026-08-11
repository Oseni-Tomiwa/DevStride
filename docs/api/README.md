# DevStride API

The FastAPI application exposes an unauthenticated health route and an
authenticated `/api/v1` JSON/SSE API. Interactive OpenAPI documentation is
available at `/docs` when the API is running.

## Base URLs

- Local: `http://localhost:8000`
- Production: the Render service URL configured as
  `NEXT_PUBLIC_API_BASE_URL` in Vercel

Do not embed production URLs or credentials in repository documentation.

## Authentication

Except for `GET /health`, documented `/api/v1` routes require:

```http
Authorization: Bearer <supabase-access-token>
```

FastAPI verifies the Supabase-issued token through the project's public JWKS
and derives ownership only from the verified UUID `sub` claim. See
[Authentication](../architecture/AUTHENTICATION.md).

## Request and response formats

- JSON routes use `application/json`.
- Streaming routes use `text/event-stream` and are documented in
  [SSE Protocol](sse-protocol.md).
- UUIDs and timestamps are JSON strings; timestamps are timezone-aware.
- Request schemas reject unexpected ownership/provider fields where defined.
- User message content is limited to 20,000 characters at the request boundary.

## Reference

- [Endpoint index](endpoints.md)
- [SSE protocol](sse-protocol.md)
- [Errors](errors.md)
- [Data model](../architecture/DATA_MODEL.md)
- [AI provider](../architecture/AI_PROVIDER.md)

The Pydantic schemas in `apps/api/app/*/schemas.py` are the executable backend
contract. This documentation summarizes those schemas and should be updated
with any contract change.
