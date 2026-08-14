# Realtime Practice Phases 1–5 and Phase 6A

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

## Phase 4B browser resilience

Phase 4B adds deterministic browser-level coverage around the existing live
Interview component and transport boundary. The test harness fakes
`getUserMedia`, `RTCPeerConnection`, the data channel, provider SDP responses,
transcript events, reconnect failures, and authentication expiry without
calling OpenAI or requiring a physical microphone.

The supported E2E browser matrix is Chromium, WebKit, and Firefox. The live
client observes microphone track termination, removes stale track listeners
during idempotent cleanup, and keeps attempt IDs authoritative across delayed
callbacks. Reconnect is bounded to three attempts with the existing backoff;
401/403/404/409 responses stop automatic retries and expose a recoverable
state without logging out or finalizing the Interview. Temporary transport
failures retry, while explicit End cancels timers and in-flight attempts before
running the existing finalization path.

No raw audio, transcript text, SDP, tokens, credentials, or provider payloads
are included in browser diagnostics. Browser autoplay policies may still
require the existing user gesture to enable interviewer audio. Real provider
connectivity and device-specific WebRTC behavior remain manual verification
responsibilities.

## Phase 5 Live Mentor

Live Mentor reuses the Phase 4B browser WebRTC lifecycle, authenticated raw-SDP
client, server-side OpenAI `/v1/realtime/calls` negotiation, remote audio,
captions, finalized transcript persistence, reconnect handling, and cleanup.
It is selected before Mentor conversation creation with
`mentor_transport=live_voice`; existing Mentor conversations without that
metadata remain text conversations and cannot be switched in place.

The backend authorizes only an owned active Mentor conversation, validates its
goal/focus ownership, and builds Mentor-specific instructions from the Profile,
approved bounded active Memory, and conversation context. No prompt, provider,
model override, credential, SDP, raw audio, or memory metadata is sent by the
browser. A successful first connection marks the Mentor conversation started;
refresh/reconnect therefore does not issue a duplicate greeting. The first
voice response is requested over the existing data channel without a fake user
message.

Live Mentor persists only finalized `user` and `assistant` transcript turns in
the existing `messages` table. Explicit End Session uses the existing Mentor
summary and Memory extraction pipeline; it does not create Interview ratings or
voice analytics. Transport failure remains resumable and never completes the
session. Authentication expiry stops automatic retry, device loss remains
recoverable, and explicit End Session cancels pending reconnects.

Live Mentor has no user-facing voice analytics in v1. Interview-specific filler,
pace, talk-share, and assessment metrics are intentionally not applied to
Mentor. Video, camera permissions, raw-audio storage, and Team Practice
realtime remain out of scope.

## Phase 6A canonical goal context

Live Mentor and Live Interview use the same server-side goal-context resolver as
text Mentor, Interview, and Team Practice. The resolver verifies conversation
ownership, follows the owned focus-area relationship to an owned goal, and
returns context only while both goal and focus area are active. Archived,
completed, stale, missing, and cross-user relationships are treated as absent;
they do not block the conversation or leak historical context into a prompt.

Goal and focus titles/descriptions are bounded and inserted as explicitly
delimited, untrusted user-authored context. Prompts retain server-controlled
mode behavior and state that the user's current request takes priority. No goal
context is injected into General conversations, and no IDs, ownership data,
timestamps, or other persistence metadata are sent to the provider.
