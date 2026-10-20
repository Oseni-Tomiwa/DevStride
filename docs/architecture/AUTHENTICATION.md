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

## Prefetch-safe mobile email bridge

Native sign-up confirmation and password recovery remain PKCE flows owned by
the mobile installation that started them. The mobile client asks Supabase to
redirect to `devstride://auth/confirm` or `devstride://auth/recovery`; Supabase
Auth appends the non-secret `sb_flow_id`, while the verifier stays in the
device-only auth store. After the user explicitly continues from the HTTPS
bridge, Supabase verifies the email token and redirects directly to the custom
scheme. The mobile client, never the web bridge, exchanges the resulting
authorization code, so that code is not sent through Vercel request logs.

Authentication emails must not link directly to the consumable Supabase
`ConfirmationURL`. The public `GET /auth/mobile` page is an explicit-action
bridge: the email carries the `ConfirmationURL` in the HTTPS URL fragment, the
bridge validates the Supabase origin, verification path/type, and exact mobile
or same-origin web callback destination, and only a user button press opens the
verification URL. URL fragments are not included in the request to Vercel, and
the bridge neither displays nor logs the URL/token, calls `verifyOtp`, exchanges
the PKCE code, nor creates a web session. Existing web flows still finish at
the unchanged `/auth/callback` route.

Before changing templates, disable click tracking for the Resend SMTP domain.
Tracking rewrites authentication links and can expose or prefetch the
one-time URL. Then make these exact Supabase Dashboard changes under
Authentication → Email Templates (dashboard changes are manual and are not
applied by this repository):

- **Confirm signup:** replace the link target with
  `{{ .SiteURL }}/auth/mobile#{{ .ConfirmationURL }}`.
- **Reset password:** replace the link target with
  `{{ .SiteURL }}/auth/mobile#{{ .ConfirmationURL }}`.

For example, each template's action can use
`<a href="{{ .SiteURL }}/auth/mobile#{{ .ConfirmationURL }}">…</a>` while
retaining its existing visible wording and styling. The production Site URL
remains `https://dev-stride-web.vercel.app`. Because Auth JS appends the flow
identifier before Supabase checks the complete redirect URL, add these two
narrow query-aware entries to the existing Supabase redirect allowlist:

- `devstride://auth/confirm?sb_flow_id=*`
- `devstride://auth/recovery?sb_flow_id=*`

Keep the existing exact deep links as well. These patterns vary only the
validated flow-id value on fixed scheme/host/path destinations; do not use a
broad `devstride://**` entry. An expired/reused token is rejected by
Supabase; a callback opened on another installation cannot be exchanged because
that installation does not have the matching verifier.

React Native does not provide `crypto.subtle.digest` in this runtime. The
mobile entry point installs an `expo-crypto`-backed SHA-256 digest and secure
random source before creating the Supabase client, so email PKCE requests use
`code_challenge_method=s256` rather than the Auth JS `plain` fallback.

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
