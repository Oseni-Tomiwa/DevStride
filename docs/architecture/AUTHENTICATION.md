# Authentication and Ownership

DevStride uses Supabase Auth for user accounts and sessions. The Next.js and
FastAPI boundaries have separate responsibilities: Next.js maintains the SSR
session; FastAPI independently verifies every protected API request.

## Browser and Next.js flow

1. The browser client is created with `@supabase/ssr` using the public Supabase
   project URL and publishable key.
2. Sign-up uses email/password and sets `emailRedirectTo` to
   `/auth/callback`, preserving only a relative requested destination.
3. The callback exchanges the authorization code for a session, allowing the
   Supabase SSR client to persist auth cookies, then redirects to the safe
   destination (default `/dashboard`).
4. Login uses `signInWithPassword`; a successful active session navigates to the
   requested relative route or `/dashboard`.
5. Next.js 16 `proxy.ts` calls the session-refresh helper before route decisions.
   The helper creates one server client, calls `auth.getUser()`, and preserves
   all refreshed `Set-Cookie` values in the returned response.
6. Protected Server Components call `auth.getUser()` and are dynamically
   rendered. Missing users redirect to `/login`.

Protected frontend routes include `/dashboard`, `/onboarding`, `/profile`,
`/account`, `/conversations`, `/progress`, and `/memories` (including nested
paths).

No access token is manually persisted in localStorage. Supabase's SSR cookie
flow owns session persistence and refresh.

## FastAPI bearer boundary

The authenticated API client retrieves the current Supabase session and sends:

```http
Authorization: Bearer <access-token>
```

FastAPI's reusable `get_current_user()` dependency:

1. requires a Bearer authorization scheme;
2. reads only safe JWT header metadata to obtain `alg` and `kid`;
3. rejects algorithms not explicitly listed in
   `SUPABASE_JWT_ALGORITHMS` (`ES256` and/or `RS256` are the only accepted
   configuration values);
4. derives the public JWKS URL from the exact configured issuer:
   `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`;
5. resolves the signing key by `kid`, caches JWKS keys for five minutes, and
   performs one additional refresh for an unknown key to support rotation;
6. verifies signature, expiration, issuer, audience, and required claims;
7. parses `sub` as the authenticated user UUID;
8. exposes only `id` and optional `email` as `CurrentUser`.

The token's algorithm is not trusted as an allow-list. Private signing keys,
legacy shared JWT secrets, and service-role credentials are not stored.

## Claim configuration

- Issuer: exact HTTPS Supabase `/auth/v1` URL from `SUPABASE_JWT_ISSUER`
- Audience: `SUPABASE_JWT_AUDIENCE`, default `authenticated`
- Algorithms: explicit comma-separated `SUPABASE_JWT_ALGORITHMS`
- Required claims: `sub`, `exp`, `aud`, and `iss`

All auth failures return the same HTTP 401 response with
`WWW-Authenticate: Bearer`; cryptographic details are not disclosed.

## Ownership enforcement

Backend routes pass `current_user.id` into service/repository lookups. Profile,
conversation, summary, progress, and memory queries are scoped to that UUID.
Message ownership is inherited through an owned conversation. Missing and
unowned resources generally share a 404 result so resource existence is not
leaked.

Clients never send `user_id` for product records and cannot select assistant
roles, system prompts, provider/model values, or persisted generation metadata.

## Configuration and platform assumptions

Browser and server Supabase clients must use the same
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Supabase
Auth must allow the exact application callback URL, locally
`http://localhost:3000/auth/callback` and the approved production domain in
production. See [Environment](../operations/ENVIRONMENT.md) and the
[deployment runbook](../../infrastructure/DEPLOYMENT.md).
