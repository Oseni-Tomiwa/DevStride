# API Endpoints

All `/api/v1` routes below require a verified Supabase bearer token. Ownership
is resolved from the token, never from request-supplied `user_id`.

## Health and authentication

| Method | Path | Success | Behavior |
| --- | --- | --- | --- |
| GET | `/health` | 200 | Public liveness response: `{"status":"ok","service":"devstride-api"}`. |
| GET | `/api/v1/auth/me` | 200 | Returns verified user `id` and optional `email`. |

## Profile and onboarding

| Method | Path | Success | Behavior |
| --- | --- | --- | --- |
| GET | `/api/v1/profile/me` | 200 | Returns the authenticated user's coaching profile; 404 when absent. |
| POST | `/api/v1/onboarding` | 201 | Creates the caller's profile and marks onboarding complete; duplicate onboarding returns 409. |
| PATCH | `/api/v1/profile/me` | 200 | Updates only explicitly supplied coaching fields; 404 when absent. |

Onboarding accepts `display_name`, `current_level`, `target_role`, a non-empty
`preferred_stack`, `communication_goal`, and `feedback_preference`. PATCH accepts
the same fields optionally. `id`, `user_id`, timestamps, and
`onboarding_completed` are not request fields.

## Conversations and messages

| Method | Path | Success | Behavior |
| --- | --- | --- | --- |
| POST | `/api/v1/conversations` | 201 | Creates a General, Mentor, Interview, or Team conversation. |
| GET | `/api/v1/conversations` | 200 | Lists owned conversations newest-updated first. |
| GET | `/api/v1/conversations/{conversation_id}` | 200 | Returns one owned conversation; 404 otherwise. |
| PATCH | `/api/v1/conversations/{conversation_id}` | 200 | Renames an owned conversation. |
| DELETE | `/api/v1/conversations/{conversation_id}` | 204 | Deletes an owned conversation and cascaded messages/summary. |
| GET | `/api/v1/conversations/{conversation_id}/messages` | 200 | Lists persisted messages chronologically. |
| POST | `/api/v1/conversations/{conversation_id}/messages` | 201 | Persists a user message only. |
| POST | `/api/v1/conversations/{conversation_id}/respond` | 200 | Persists one user message and one complete assistant response. |
| POST | `/api/v1/conversations/{conversation_id}/stream` | 200 SSE | Persists a user message, streams generation, then persists the final assistant message. |
| POST | `/api/v1/conversations/{conversation_id}/messages/{message_id}/retry` | 200 SSE | Retries an eligible user message without creating a duplicate user row. |
| POST | `/api/v1/conversations/{conversation_id}/interview-start` | 200 SSE | Idempotent automatic first Interview message for an owned Interview conversation. |
| POST | `/api/v1/conversations/{conversation_id}/team-start` | 200 SSE | Idempotent automatic first Team Practice message for an owned Team conversation. |
| POST | `/api/v1/realtime/sessions` | 200 | Authorizes an owned active Interview or Live Mentor conversation and retains the ephemeral-credential bootstrap contract. |
| POST | `/api/v1/realtime/sessions/{conversation_id}/connect` | 201 | Accepts an authenticated raw SDP offer for an owned live Interview or Mentor conversation and returns the OpenAI SDP answer after server-side negotiation. |
| POST | `/api/v1/realtime/sessions/{conversation_id}/transcript-turns` | 201 | Persists one finalized owned Live Interview or Live Mentor transcript turn idempotently. |
| POST | `/api/v1/realtime/sessions/{conversation_id}/analytics-events` | 201 | Records one bounded, deduplicated lifecycle event for an owned Live Interview. |
| GET | `/api/v1/realtime/sessions/{conversation_id}/analytics` | 200 | Returns completed owned Live Interview communication analytics; 404 before explicit End Interview. |
| POST | `/api/v1/realtime/sessions/{conversation_id}/end` | 200 | Flushes Live Interview assessment/analytics or completes Live Mentor through the existing summary and Memory pipeline. |

Conversation creation accepts `title`, `mode`, and optional `persona`.
Mentor conversations may select `mentor_transport=live_voice` before creation;
the default is text and transport cannot be switched after the session starts.
Interview conversations require `interview_type` (`technical` or `behavioral`);
technical interviews may use an approved `interview_focus`. Team conversations
require one of the approved `team_scenario` values and may select `guided`,
`realistic`, or `challenging` difficulty. Mode-specific settings are rejected on
other modes.

Message creation, complete response, and stream generation accept only:

```json
{"content":"User-authored text"}
```

Clients do not send role, ownership, system prompts, provider, model, token, or
latency metadata.

`POST /api/v1/realtime/sessions` accepts only `conversation_id`. It requires the
owned conversation to use Interview Mode and returns only a short-lived
`client_secret`, its optional expiry, and the backend-selected model. The
permanent `OPENAI_API_KEY` and server-owned interview instructions never leave
FastAPI. The browser sends its raw SDP offer to the authenticated DevStride
`/connect` endpoint; FastAPI performs provider negotiation and returns the
opaque SDP answer.

## Goals and development plans

The Goals experience and deterministic goal-aware recommendations are available.
Recommendations use only the authenticated user's owned practice evidence and
return an explainable next action; they do not expose model reasoning.

| Method | Path | Success | Behavior |
| --- | --- | --- | --- |
| POST | `/api/v1/goals/plan-preview` | 200 | Returns a non-persisted deterministic draft with separate template and optional saved-context suggestions. |
| GET | `/api/v1/goals` | 200 | Lists owned goals with active first; optional `status` filter. |
| POST | `/api/v1/goals` | 201 | Atomically creates one active goal and 1–6 validated focus areas; 409 if another active goal exists. |
| GET | `/api/v1/goals/{goal_id}` | 200 | Returns one owned goal and its ordered focus areas. |
| PATCH | `/api/v1/goals/{goal_id}` | 200 | Edits allowed fields or explicitly completes/reopens a goal. |
| DELETE | `/api/v1/goals/{goal_id}` | 204 | Archives an owned goal without deleting history. |
| POST | `/api/v1/goals/{goal_id}/focus-areas` | 201 | Appends a validated focus area, up to six non-archived areas. |
| PATCH | `/api/v1/goals/{goal_id}/focus-areas/{focus_area_id}` | 200 | Edits or explicitly completes/reopens an owned focus area. |
| DELETE | `/api/v1/goals/{goal_id}/focus-areas/{focus_area_id}` | 204 | Archives an owned focus area. |
| PUT | `/api/v1/goals/{goal_id}/focus-areas/order` | 200 | Transactionally reorders the complete non-archived focus-area list. |
| POST | `/api/v1/goals/{goal_id}/focus-areas/{focus_area_id}/practice` | 201 | Creates a new owned conversation from an active focus area's server-stored practice configuration and links it to that focus area. |
| GET | `/api/v1/goals/{goal_id}/progress` | 200 | Returns deterministic, ownership-scoped Goal progress from explicitly linked conversations and summaries. |

Clients never submit `user_id`, positions, prompts, provider/model choices, or
system roles. Mentor config is empty. Interview config uses the current
`interview_type` and optional compatible `interview_focus`; Team config requires
an approved `team_scenario` and `team_difficulty`. Unsupported keys are rejected.
Cross-user access uses ownership-safe 404 responses.

Plan preview accepts only `title`, optional `description`, and `goal_type`, and
echoes that normalized draft in `goal_draft`. It uses owned Profile fields and,
when available, active owned `goal`, `skill`, and `weakness` memories. Template
and memory suggestions are clearly separated, globally ordered, capped at six,
have deterministic user-facing reasons, contain no duplicate titles after
normalization, and are validated by the same Mentor, Interview, and Team
configuration contracts used for accepted focus areas. Saved context is
optional advisory copy: it does not become a goal or focus area, and no memory
IDs, confidence, source metadata, provider settings, or prompt data are
returned. Preview makes no AI call and writes no records.

Practice launch has an intentionally empty request contract: clients cannot
choose ownership, mode, practice configuration, prompts, providers, or models.
Both the Goal and focus area must be active and owned by the caller, and the
focus area must belong to the path Goal. Every explicit launch creates a new
conversation; previous linked sessions are never silently reused. Interview
and Team conversations retain their existing idempotent kickoff endpoints after
the frontend navigates to the returned conversation ID. Historical and normally
created conversations remain unlinked.

Goal progress reports focus-area counts, user-confirmed focus-area completion,
linked practiced sessions and user turns, recent linked activity, bounded
summary evidence, compatible Interview rating history, and a deterministic
next action. Only conversations linked through `focus_area_id` are included;
historical conversations are not matched retroactively. Archived focus areas
are excluded from the focus-area detail list and current focus, while the Goal
itself is never completed automatically. Global `/api/v1/progress` retains its
existing fields and additively returns `goal_progress` when the caller has an
active Goal; its Goal focus outranks saved Memory and Profile fallback focus.

## Session summaries

| Method | Path | Success | Behavior |
| --- | --- | --- | --- |
| GET | `/api/v1/conversations/{conversation_id}/summary` | 200 | Returns the owned Mentor, Interview, or Team summary; 404 when absent/inapplicable. |
| POST | `/api/v1/conversations/{conversation_id}/summary` | 201 | Generates or returns the one summary for a supported owned conversation. |

Summary generation is not available for General mode. It may also be generated
automatically by supported end-session flows. A summary contains concise
observations, lists of topics/strengths/weaknesses/next steps, optional mode
details, and optional 1–5 practice ratings.

## Progress

| Method | Path | Success | Behavior |
| --- | --- | --- | --- |
| GET | `/api/v1/progress` | 200 | Returns owned practice activity, recent sessions, bounded summary evidence, current focus, rating history, and one deterministic next-practice recommendation. |

The existing top-level conversation counts and `recent_sessions` remain for
compatibility. Additive Progress Intelligence fields distinguish a created
conversation from practiced activity: a session is practiced only after an
owned user message exists. Structured Mentor, Interview, and Team sessions are
completed only when they have a user turn plus their mode-specific completion
metadata or a persisted session summary. General conversations are never
classified as incomplete structured practice.

Strengths and weaknesses are derived only from the latest 20 owned summaries
that belong to practiced conversations. Repetition uses conservative normalized
exact matching; a phrase seen once is recent evidence and a phrase seen in two
or more summaries is recurring evidence. Interview ratings are historical
practice observations, not claims of mastery, readiness, or improvement.

`continue_practice` prefers a recently active incomplete structured session and
uses a recent General conversation only as a lower-priority fallback.
`current_focus` prefers an active saved goal, then an active saved weakness,
then the editable profile communication goal. The recommendation is
deterministic and includes a user-facing reason, bounded evidence, and a typed
action. It does not invoke an AI provider, expose prompts or private metadata,
or compare the user with other users.

## Memory

| Method | Path | Success | Behavior |
| --- | --- | --- | --- |
| GET | `/api/v1/memories` | 200 | Lists active owned memories; optional `category` filter. |
| POST | `/api/v1/memories` | 201 | Creates or reinforces an equivalent manual memory. |
| PATCH | `/api/v1/memories/{memory_id}` | 200 | Updates an owned memory's supplied category, content, or importance. |
| DELETE | `/api/v1/memories/{memory_id}` | 204 | Archives an owned memory so it is excluded from active retrieval. |

Approved categories are `goal`, `preference`, `project`, `skill`, `weakness`,
and `achievement`. Content is trimmed, limited to 1,000 characters, and rejected
when it matches supported secret-like patterns. Manual memories use maximum
confidence/importance defaults; equivalent active records are reinforced rather
than duplicated.

## Provider-dependent status codes

Complete-response generation returns 503 when generation is disabled and 502
for a generic provider failure. In SSE routes, generation/profile/kickoff errors
are delivered as `error` events after the HTTP stream has opened. AI rate limits
return 429 with `Retry-After` before the operation begins.

See [Errors](errors.md) for shared behavior.
Interview conversations may be created with `interview_transport: "text"` or
`"live_voice"`; text is the default and existing conversations remain text.
Live voice sessions use `POST /api/v1/realtime/sessions` only after an owned
live-voice interview has been created.
