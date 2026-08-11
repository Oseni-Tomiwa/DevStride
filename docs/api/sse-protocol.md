# Conversation SSE Protocol

DevStride streams assistant generation over HTTP Server-Sent Events. The
frontend sends an authenticated `POST` request and reads the response body; it
does not use `EventSource` because generation requests have JSON bodies and
bearer authentication.

## Routes

- `POST /api/v1/conversations/{conversation_id}/stream`
- `POST /api/v1/conversations/{conversation_id}/messages/{message_id}/retry`
- `POST /api/v1/conversations/{conversation_id}/interview-start`
- `POST /api/v1/conversations/{conversation_id}/team-start`

Responses use `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
`Connection: keep-alive`, and `X-Accel-Buffering: no`.

## Framing

Each event is UTF-8 text containing an event name and one compact JSON object:

```text
event: assistant_delta
data: {"delta":"Partial text"}
```

Events are separated by a blank line.

## Events

### `user_message`

Emitted by normal generation and retry after the persisted user message is
available. The payload is a complete message response. Retry may emit the
existing user message; it does not insert another user row.

### `assistant_delta`

Contains `{"delta":"..."}`. Deltas are display-only partial output. They are
not persisted as assistant rows.

### `assistant_complete`

Contains the final persisted assistant `MessageResponse`, including its ID,
content, timestamps, and available provider metadata. Receipt of a valid
`assistant_complete` is successful terminal completion for the message even if
the trailing `done` frame is lost and the stream then reaches clean EOF.

### `interview_pending`

Emitted by an Interview kickoff when another kickoff has already claimed the
empty conversation but the first persisted assistant message is not yet
available. The client may re-fetch according to its existing lifecycle.

### `team_pending`

The Team Practice equivalent of `interview_pending`.

### `error`

Contains a stable, generic `code` and user-safe `message`. Current codes include
generation disabled/failed, profile required, and mode-specific kickoff errors.
No raw provider response, prompt, token, or credential is included.

### `done`

An empty JSON object marking the end of the backend generator. The server emits
`done` from a `finally` path after success or handled stream error. It is
idempotent from the client's perspective and does not itself persist data.

## Successful sequences

Normal generation and retry:

```text
user_message
assistant_delta (zero or more)
assistant_complete
done
EOF
```

Interview/Team kickoff:

```text
assistant_delta (zero or more)
assistant_complete
done
EOF
```

A kickoff can instead emit its pending event followed by `done` when another
request owns the in-progress kickoff.

## Failure and cancellation semantics

- Ownership is checked before normal generation opens an SSE response, so an
  unknown/unowned conversation returns an HTTP 404 rather than an SSE error.
- A provider or profile failure after opening emits `error`, then `done`.
- If a user message was persisted before generation failed or was cancelled, it
  remains available for retry.
- Partial assistant deltas are temporary UI state; no assistant row is created
  unless generation completes.
- Client cancellation aborts the HTTP request, removes temporary assistant
  content, keeps the persisted user message, and restores the composer without a
  provider-error banner.
- Clean EOF after `assistant_complete` is success. EOF before completion is an
  interrupted stream.

See [Conversation Streaming](../architecture/CONVERSATION_STREAMING.md) for the
implementation lifecycle.
