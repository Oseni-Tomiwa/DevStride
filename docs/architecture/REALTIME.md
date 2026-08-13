# Realtime Practice Phases 1–4A

Phase 1 provides a bounded voice-session foundation for an authenticated owned
Interview conversation. It does not persist transcripts or messages and does
not generate assessments, summaries, Progress evidence, Memory, or Goal
updates.

```text
Browser --verified Supabase bearer--> DevStride API
  DevStride API --permanent OPENAI_API_KEY--> OpenAI client-secret endpoint
  DevStride API --short-lived client_secret--> Browser
  Browser --raw SDP offer + verified bearer--> DevStride API
  DevStride API --multipart SDP + session + permanent key--> OpenAI Realtime
  DevStride API --SDP answer--> Browser
```

Interview creation now includes an explicit `interview_transport` choice:
`text` (the backward-compatible default) or `live_voice`. The live bootstrap
is available only for conversations created with `live_voice`; an existing
text interview cannot be switched in place. `POST /api/v1/realtime/sessions`
accepts only an owned live-voice `conversation_id`.
FastAPI requires the feature flag, Interview Mode, onboarding Profile, and the
existing verified JWT ownership boundary. It builds the Interview instructions
from server-controlled configuration and returns only the short-lived client
credential, expiry metadata when supplied, and selected model name. The
permanent key and hidden instructions are never returned, logged, or bundled.

The browser requests microphone permission only after the user starts the
session. Its isolated WebRTC client attaches the local audio track and sends
the raw SDP offer to DevStride. The API performs the documented multipart
`/v1/realtime/calls` negotiation with the server-only key, returns only the SDP
answer, and the browser applies it to the peer connection. The client plays
the remote audio stream and exposes mute/unmute,
and closes the peer connection, data channel, media tracks, and audio element
on end or unmount. Partial captions are temporary; finalized transcript turns
are persisted through the Phase 2 endpoint described below.

Phase 2 persists only finalized user/interviewer transcript turns through the
existing Message model. Each turn carries a bounded provider event identifier
with a database-enforced per-conversation uniqueness rule, so retries and
reconnects cannot duplicate rows. End Interview flushes pending writes and
uses the existing Interview assessment and summary pipeline without creating a
fake user turn. Dropped transports remain resumable and incomplete; a fresh
short-lived transport may reconnect to the same owned conversation.

Partial transcript fragments, raw audio, provider event payloads, and
credentials are never persisted.

## Phase 3 usable live interview

Opening a new live Interview creates the first interviewer turn through the
existing provider session, without inserting a fake candidate message. The
client sends one kickoff response request for a new empty conversation; a
reconnect or refresh resumes the owned conversation and does not issue a
duplicate kickoff. The server-controlled Interview instructions include the
interview type, optional focus, safe profile context, and one-question-at-a-
time behavior.

The live surface waits for actual peer/data-channel readiness before showing a
connected state. Remote audio is attached to an audio element and exposes a
user gesture fallback when browser autoplay policy blocks playback. The
microphone can be muted without ending the session. Provider VAD events drive
listening/speaking state, and a speech-start event during interviewer output
requests a safe response cancellation; no fake user turn is persisted.

Captions distinguish temporary partial fragments from finalized user and
interviewer turns. Only finalized events are persisted through the existing
idempotent transcript endpoint. A transport failure leaves the Interview
incomplete and offers reconnect; End Interview waits for pending transcript
writes before using the existing assessment and summary completion path.

## Phase 4A voice analytics and reliability

Live Interview clients send only normalized lifecycle observations to
`/api/v1/realtime/sessions/{conversation_id}/analytics-events`. Approved event
types cover connection, candidate/interviewer speech start and finalized turn,
interruption, reconnect, mute/unmute, and explicit session end. Events are
ownership-scoped and deduplicated by event ID per conversation. They contain no
raw provider event, audio, SDP, prompt, credential, or transcript data.

Explicit End Interview creates one structured analytics snapshot at
`realtime_session_analytics`; transport failure, refresh, unmount, and tab
close do not finalize or create analytics. Repeated End requests reuse the
existing completed assessment and analytics rather than recomputing them.

Speaking duration is paired start-to-finalized-turn time. Candidate talk share
is candidate speaking time divided by candidate plus interviewer speaking time.
Response latency is the time from the latest interviewer finalized event to the
next candidate speech start. WPM uses finalized candidate words over measured
candidate speaking minutes. Filler frequency uses whole-word matching for
`um`, `uh`, `erm`, `like`, `you know`, `basically`, and `actually`.

Missing or unmatched timing events produce unavailable values rather than
invented estimates. Exact pauses, overlap, audio levels, and prosody are not
measured. Metrics are coaching signals, not emotion, personality, confidence,
hiring, or readiness judgments. Reconnect retries are bounded to three
attempts with 500ms, 1s, and 2s backoff; authentication expiry stops retries
with a safe message. The live UI shows connection state only; analytics appear
in the completed Interview assessment view.
