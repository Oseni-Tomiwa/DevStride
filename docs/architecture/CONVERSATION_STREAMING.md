# Conversation Streaming Architecture

DevStride streams assistant output from FastAPI to the browser over authenticated
HTTP SSE while keeping PostgreSQL as the source of truth.

## Normal generation lifecycle

```text
client POST {content}
  -> FastAPI verifies JWT and conversation ownership
  -> persist user message and touch conversation
  -> emit user_message
  -> call backend-selected provider/prompt
  -> emit assistant_delta zero or more times
  -> persist one final assistant message and metadata
  -> emit assistant_complete
  -> emit done from generator cleanup
  -> clean EOF
```

The frontend renders streamed deltas in a temporary assistant item. On
`assistant_complete`, it replaces temporary content with the persisted message.
The completion event is terminal success; a later `done`, clean EOF, or
post-completion abort race is harmless. Terminal cleanup is idempotent and
always clears generating state and the active AbortController.

## Client states

The conversation UI treats a stream as active, completed, failed, or cancelled:

- **active:** composer disabled, Stop generating available, partial Markdown can
  render;
- **completed:** persisted assistant message retained, temporary state removed,
  composer enabled;
- **failed:** partial assistant removed, user message retained, generic error and
  retry path available;
- **cancelled:** partial assistant removed, user message retained, composer
  restored without a provider-error banner.

EOF before `assistant_complete` is an interruption. Clean EOF after a valid
completion is success even if `done` is absent. Duplicate completion/done events
must not add duplicate messages or repeat cleanup.

## Persistence and retry

Only the final assistant message is persisted. If generation fails or the user
aborts, the persisted user row remains. Retry verifies that the selected row is
a user message with no later assistant response, then streams a response without
inserting another user row.

The provider receives at most the 20 most recent conversation messages for
response generation. Session summaries use at most the 40 most recent messages.

## Kickoff flows

Interview and Team conversations automatically generate the first assistant
message through dedicated authenticated SSE routes. They do not create a fake
candidate/learner message.

The service locks the owned conversation, checks existing messages and kickoff
metadata, and either:

- streams/persists the first assistant message;
- returns the already persisted assistant message; or
- emits `interview_pending`/`team_pending` when another request currently owns
  kickoff generation.

Refresh therefore does not duplicate the first question or scenario.

## Server errors

Ownership is checked before opening normal streams. Handled provider,
configuration, or profile failures after stream start are serialized as safe
`error` events, and `done` is emitted from a `finally` block. The backend never
sends raw provider responses, credentials, or stack traces in SSE data.

## Transport constraints

SSE is text-only and request/response scoped. It is not a realtime voice
transport, bidirectional WebSocket protocol, background job system, or durable
event bus. Live Conversation architecture has not been designed.

The concrete event contract is documented in
[`../api/sse-protocol.md`](../api/sse-protocol.md).
