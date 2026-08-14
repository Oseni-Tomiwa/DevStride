# DevStride Project Status

Last reviewed: 2026-08-11  
Current release: v0.1.0  
Repository migration head: `0008`

This is the canonical source of truth for the current product state and the
order of future work. The [PRD](PRD.md) describes product intent; architecture
documents describe implementation boundaries; historical planning documents
do not override this file.

## Production topology

- Vercel — Next.js 16 frontend
- Render — FastAPI backend (one instance while rate limiting is process-local)
- Supabase — PostgreSQL and Auth
- OpenAI — backend-only AI provider

See the [deployment runbook](../../infrastructure/DEPLOYMENT.md) for operational
configuration and deployment checks.

## Completed

- pnpm/uv monorepo, local PostgreSQL, Docker, Alembic, linting, type checking,
  tests, builds, and GitHub Actions CI foundation
- Supabase authentication with sign-up, email callback, login, logout, SSR
  cookie refresh, and protected-route handling
- backend bearer-token verification through Supabase JWKS, including issuer,
  audience, expiry, subject, signature, and ownership enforcement
- onboarding and the editable coaching Profile
- Account view for authenticated sign-in information
- personalized Dashboard with evidence-based next-practice recommendations,
  continue-practice context, truthful activity metrics, and current evidence
- authenticated AppShell with responsive navigation, skip link, and footer
- persistent conversations and messages, including list, detail, rename, and
  delete behavior
- General conversation mode
- backend-only OpenAI provider abstraction and complete-response generation
- SSE streaming with explicit lifecycle handling, persisted final messages,
  cancellation, and generic provider failures
- failed-message retry and automatic conversation-title derivation
- Mentor Mode with profile-aware coaching
- technical and behavioral Interview Mode configuration, automatic interview
  kickoff, follow-up conversation, and final assessment
- Team Practice with five scenarios, three difficulty levels, and automatic
  kickoff
- structured Mentor, Interview, and Team session summaries
- Progress Intelligence v1 with practiced/completed activity semantics, mode
  breakdown, session history, bounded strength/weakness evidence, compatible
  Interview rating history, and deterministic recommendations
- bounded Long-Term Memory v1 with approved categories, conservative extraction,
  reinforcement, manual create/edit/archive behavior, secret-like-content
  rejection, and bounded prompt injection
- safe assistant Markdown rendering, including developer-oriented code blocks
- Realtime Practice Phase 1 secure voice-session foundation for owned Interview
  conversations, using short-lived browser credentials and WebRTC without
  transcript or assessment persistence
- Realtime Practice Phase 2 finalized transcript persistence with durable
  provider-event idempotency and existing Interview assessment/summary
  completion semantics
- Realtime Practice Phase 3 usable live Interview experience with automatic
  interviewer kickoff, remote audio, microphone controls, turn detection,
  interruption handling, transcript captions, and reconnect behavior
- Realtime Practice Phase 4A bounded voice analytics from normalized lifecycle
  events and finalized transcript timing, with explicit-end persistence and
  bounded reconnect hardening
- Realtime Practice Phase 4B browser-level E2E coverage and resilience for
  authentication expiry, reconnect failure, microphone denial/loss, stale
  attempt cleanup, and explicit end behavior
- responsive/mobile UI and accessibility basics
- production deployment preparation and deployment to Vercel/Render/Supabase
- production database migrations through repository head `0008`
- production Progress query correlation fix
- authenticated, per-user AI rate limiting
- Next.js 16 migration
- v0.1.0 release

## Fix / cleanup

- complete this documentation reconciliation and keep status documents current
- change CI web installation from `--no-frozen-lockfile` to the same frozen
  lockfile policy used for production after confirming the lockfile is stable
- add global Next.js `error.tsx` and `not-found.tsx` experiences
- add browser end-to-end coverage for critical authenticated flows
- add automated accessibility testing
- add production request correlation and structured observability
- verify production backup and restore procedures against a separate database
- distinguish liveness from database/provider readiness where operations need it
- reduce drift risk between handwritten TypeScript and Pydantic contracts
- replace or document the local `pgvector/pgvector` Docker image because vector
  functionality is intentionally not part of the current product
- resolve the Starlette/httpx test-client deprecation warning
- resolve the jsdom navigation warning in frontend tests

## Next

1. Complete the Goals / Development Plan user experience on top of the backend
   persistence foundation now in progress.
2. Integrate explicit goals with practice launch, Progress, and Dashboard.
3. Skills and recurring weakness tracking with transparent evidence.

## Backend foundation in progress

- Goals & Development Plans v1 persistence/API: one active goal per user,
  explicit complete/reopen/archive transitions, 1–6 ordered validated focus
  areas, and an optional conversation association are implemented at migration
  head `0006`.
- Deterministic plan preview is backend-complete with Profile personalization,
  bounded optional saved-context suggestions, no persistence, and no AI calls.
- Goal-aware practice launch is backend-complete: active focus areas create new
  owned Mentor, Interview, or Team conversations from server-stored validated
  configuration and persist the optional focus-area association.
- Goal-aware Progress backend integration is complete: explicitly linked
  practice, focus-area completion, bounded linked evidence, and deterministic
  Goal next actions are available without changing the Dashboard UI.
- Preview acceptance/persistence, Dashboard integration, and the `/goals`
  frontend remain intentionally unimplemented.

## Planned

- guided project-building
- stronger interview reports and scoring with documented practice rubrics
- skill trends
- dedicated session and report views
- conversation and history search/filtering
- product feedback and support routes
- account privacy and data controls
- stable AI evaluation datasets

### Planned Live Conversation expansion

Live Conversation is a later, separately approved capability. The historical
product intent includes:

- speech input and output
- a readable transcript
- filler-word analysis
- pace analysis
- pause analysis
- technical feedback
- speaking and communication feedback

The expanded vision is a realtime Interview conversation with natural spoken
follow-up questions, technical and behavioral interview support, a transcript,
an assessment, strengths and weaknesses, communication feedback, and results
that can feed Progress and bounded Memory. If proven useful, the same realtime
foundation may later support Mentor and Team Practice.

Phase 1 voice-session transport and security boundaries, Phase 2 finalized
transcript persistence, the bounded Phase 3 live Interview experience, the
Phase 4A voice analytics/reliability slice, and Phase 4B browser resilience are
implemented in
`docs/architecture/REALTIME.md`. Broader realtime product integration remains
later work.

## Later

- video, raw-audio analysis, emotion/personality inference, and richer voice
  metrics beyond the bounded Phase 4B signals
- RAG or document learning only if separately approved
- GitHub repository ingestion
- distributed rate limiting when horizontal API scaling is needed
- billing or gamification only if product direction requires it

RAG, embeddings, pgvector/vector search, document retrieval, and
"remember everything" behavior are not part of Long-Term Memory v1.
