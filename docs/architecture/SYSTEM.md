# System Architecture

## Style

DevStride is a modular monolith: one Next.js frontend, one FastAPI API, one
PostgreSQL database, and a backend-only OpenAI provider integration. Domain
modules remain explicit without introducing independently deployed services.

The current product state is tracked in
[`../product/PROJECT_STATUS.md`](../product/PROJECT_STATUS.md).

## Production topology

```text
Browser
  |
  | HTTPS, Supabase SSR cookies
  v
Vercel / Next.js 16
  |
  | HTTPS, verified Supabase bearer token, JSON or SSE
  v
Render / FastAPI modular monolith (one instance)
  |                              |
  | SQLAlchemy async + asyncpg   | backend-only Responses API
  v                              v
Supabase PostgreSQL + Auth       OpenAI
```

Render applies Alembic migrations before serving a release. Repository head is
`0008`. The deployment remains single-instance while AI rate limiting is stored
in process memory.

## Application modules

```text
Next.js
  ├── Supabase SSR authentication and route protection
  ├── onboarding, Profile, Account, and Dashboard
  ├── shared authenticated AppShell/header/footer
  ├── conversations and streamed message UI
  ├── Progress/session history and evidence-grounded practice reports
  └── Memory management

FastAPI
  ├── auth (bearer JWT and JWKS verification)
  ├── profiles (onboarding and coaching profile)
  ├── conversations (ownership, messages, generation, SSE, retry, kickoff)
  ├── mentor / interviews / team (versioned mode prompts)
  ├── session_summaries
  ├── progress
  ├── memory
  ├── realtime (short-lived voice-session authorization)
  ├── ai (provider interface, OpenAI adapter, rate-limit dependency)
  └── database (async engine, sessions, declarative models, Alembic)
```

Goals and goal-linked practice launch are implemented modules and API
contracts. Richer skill analytics and broader recommendation workflows remain
planned product work.

Goal-linked prompt context is resolved server-side from the authenticated
conversation, its owned focus area, and its owned active goal. Mentor,
Interview, Team, Live Mentor, and Live Interview receive only bounded active
goal/focus text when the conversation is explicitly linked. Missing, archived,
completed, stale, or cross-user context is omitted; unlinked conversations
receive no goal context. The text is delimited as untrusted user-authored
context and cannot override system behavior or the user's current request.

## Core request boundaries

- Next.js uses Supabase SSR cookies to establish the browser/server session.
- Next.js obtains the current access token through the Supabase client and sends
  it to FastAPI as `Authorization: Bearer <token>`.
- FastAPI verifies the JWT cryptographically and derives the user UUID from
  `sub`; clients never choose ownership identifiers.
- FastAPI owns validation, business rules, provider calls, and persistence.
- PostgreSQL is the source of truth for profiles, conversations, messages,
  summaries, and memory records.
- OpenAI credentials, model selection, system prompts, and provider metadata
  remain backend-only.

## Conversation and AI boundaries

- Supported modes are `general`, `mentor`, `interview`, and `team`.
- Mode controls the backend-selected prompt; profile values and saved memory are
  treated as context, not executable instructions.
- General mode receives no saved-memory context.
- Mentor, Interview, and Team receive at most six active relevant memories;
  current explicit user input has higher priority.
- The provider adapter supports complete responses, SSE streaming, and
  structured outputs for summaries/memory extraction.
- Practice feedback and structured summaries require substantive user-authored
  evidence. Empty, placeholder, control-only, or unusable turns produce neutral
  no-evidence outcomes rather than positive ratings or strengths.
- Practice reports are reconstructed from owned persisted summaries, optional
  Live Interview analytics, Goal/Focus attribution, and the canonical
  deterministic Progress recommendation; they never trigger a second AI
  evaluation or persist duplicate report data.
- Practice request timing may be emitted at debug level as content-free stages
  with a correlation ID and elapsed milliseconds; prompts, transcripts,
  credentials, and provider payloads are never logged.
- Messages and provider metadata are persisted only by FastAPI.
- AI operations use authenticated per-user, process-local limits and return 429
  with `Retry-After` when exceeded.

See [AI Provider](AI_PROVIDER.md) and
[Conversation Streaming](CONVERSATION_STREAMING.md) and
[Realtime Practice](REALTIME.md).

## Data and ownership boundaries

- Profile ownership is unique by verified user UUID.
- Conversations are queried by conversation ID and verified user UUID.
- Messages inherit ownership through their conversation.
- Session summaries are one per supported conversation and carry the owner UUID.
- Memory records are owner-scoped; delete behavior archives records so they are
  excluded from active retrieval.
- Deleting a conversation cascades to its messages and summary. Memory records
  have no foreign key to summaries so retained coaching context remains under
  explicit user control.

See [Data Model](DATA_MODEL.md).

## Frontend boundaries

Authenticated pages use dynamic server rendering, `supabase.auth.getUser()` for
server-visible identity, and a shared AppShell containing the skip link,
navigation, main landmark, and footer. Interactive forms and streaming UI are
client components. The frontend never writes directly to Supabase product
tables or stores access tokens manually.

## Deferred infrastructure

Do not add Redis, queues, microservices, Kubernetes, WebSockets, pgvector,
embeddings, vector search, document retrieval, or agent frameworks without a
demonstrated and approved requirement. Realtime Practice uses the documented
WebRTC foundation and existing Interview persistence/assessment boundaries;
richer voice analysis remains deferred.

## Related documentation

- [Authentication](AUTHENTICATION.md)
- [Data model](DATA_MODEL.md)
- [API reference](../api/README.md)
- [Environment configuration](../operations/ENVIRONMENT.md)
- [Deployment runbook](../../infrastructure/DEPLOYMENT.md)
- [ADR-001: Modular Monolith](../decisions/ADR-001-modular-monolith.md)
