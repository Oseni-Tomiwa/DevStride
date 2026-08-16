"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError } from "../../../lib/api/client";
import { createClient } from "../../../lib/supabase/client";
import { connectRealtimeSession, endLiveMentor, endRealtimeInterview, listMessages, persistRealtimeTranscriptTurn, recordRealtimeAnalyticsEvent } from "../api";
import { connectRealtime, parseLiveTranscriptEvent, RealtimeConnectionError, type LiveTranscriptEvent, type RealtimeConnection } from "../realtime-client";
import type { RealtimeSdpAnswer } from "../realtime-client";

type LiveState = "Ready" | "Connecting" | "Connected" | "Processing" | "Listening" | "Assistant speaking" | "Mentor speaking" | "Muted" | "Reconnecting" | "Ending" | "Ended" | "Error";

export type LiveInterviewTestApi = {
  connect: (conversationId: string, offerSdp: string) => Promise<RealtimeSdpAnswer>;
  listMessages: (conversationId: string) => Promise<Array<{ id: string; role: string; content: string; created_at: string }>>;
  persistTranscriptTurn: (conversationId: string, input: { event_id: string; role: "user" | "assistant"; content: string; final: true }) => Promise<unknown>;
  recordAnalyticsEvent: (conversationId: string, input: { event_id: string; event_type: string; occurred_at: string }) => Promise<unknown>;
  end: (conversationId: string) => Promise<unknown>;
};

function providerEvent(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function apiStatus(value: unknown): number | undefined {
  if (value instanceof ApiError) return value.status;
  if (typeof value !== "object" || value === null || !("status" in value)) return undefined;
  const status = (value as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

const UNUSABLE_TRANSCRIPT_VALUES = new Set([
  "...",
  "…",
  "[silence]",
  "[no response]",
  "[inaudible]",
  "[unintelligible]",
]);

function isMeaningfulCandidateTurn(content: string): boolean {
  const normalized = content.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  return normalized.length > 0
    && !UNUSABLE_TRANSCRIPT_VALUES.has(normalized)
    && /[\p{L}\p{N}]/u.test(normalized);
}

function stateDescription(state: LiveState, isMentor: boolean): string {
  if (state === "Listening" || state === "Muted") return "Your turn — speak when you are ready.";
  if (state === "Processing") return "Got it. Preparing the next response.";
  if (state === "Assistant speaking" || state === "Mentor speaking") return isMentor ? "Listen to your mentor." : "Listen to the interviewer.";
  if (state === "Reconnecting") return "Connection interrupted. Trying to reconnect…";
  if (state === "Ending") return "Ending this session and preparing your results.";
  if (state === "Ended") return "The session has ended.";
  return isMentor ? "Live Mentor is getting ready." : "Your interviewer is getting ready.";
}

export function LiveInterviewSpike({ conversationId, interviewType = "technical", interviewFocus = null, initialMessages = [], testApi, practiceMode = "interview", mentorStarted = false, mediaStream, startOnMount = false, onConnectionChange }: { conversationId: string; interviewType?: string; interviewFocus?: string | null; initialMessages?: Array<{ id: string; role: string; content: string; created_at: string }>; testApi?: LiveInterviewTestApi; practiceMode?: "interview" | "mentor"; mentorStarted?: boolean; mediaStream?: MediaStream; startOnMount?: boolean; onConnectionChange?: (connection: RealtimeConnection | null) => void }) {
  const isMentor = practiceMode === "mentor";
  const experienceLabel = isMentor ? "Live Mentor" : "Live Interview";
  const speakerLabel = isMentor ? "Mentor" : "Interviewer";
  const router = useRouter();
  const [state, setState] = useState<LiveState>("Ready");
  const stateRef = useRef<LiveState>("Ready");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [transcript, setTranscript] = useState<LiveTranscriptEvent[]>(() => initialMessages.filter((message) => message.role === "user" || message.role === "assistant").map((message) => ({ eventId: `persisted-${message.id}`, speaker: message.role as "user" | "assistant", text: message.content, final: true })));
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const persistedEventIdsRef = useRef(new Set(transcript.map((line) => line.eventId)));
  const pendingWritesRef = useRef(new Set<Promise<unknown>>());
  const pendingAnalyticsWritesRef = useRef(new Set<Promise<unknown>>());
  const mountedRef = useRef(true);
  const connectionRef = useRef<RealtimeConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const connectingRef = useRef(false);
  const attemptCounterRef = useRef(0);
  const activeAttemptRef = useRef<{ id: string; controller: AbortController } | null>(null);
  const connectionAttemptRef = useRef<string | null>(null);
  const hasStartedRef = useRef(false);
  const audioAttachedRef = useRef(false);
  const interviewerSpeakingRef = useRef(false);
  const interviewerFinalizedRef = useRef(false);
  const assistantResponseActiveRef = useRef(false);
  const interruptionPendingRef = useRef(false);
  const responseCancelRequestedRef = useRef(false);
  const responsePendingRef = useRef(false);
  const responseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lifecycleEventCounterRef = useRef(0);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectScheduledRef = useRef(false);
  const endingRef = useRef(false);
  const autoStartedRef = useRef(false);
  const startRef = useRef<((isReconnect?: boolean) => Promise<void>) | null>(null);
  const onConnectionChangeRef = useRef(onConnectionChange);
  onConnectionChangeRef.current = onConnectionChange;

  function scheduleReconnect() {
    if (!hasStartedRef.current || endingRef.current || reconnectScheduledRef.current) return;
    if (reconnectAttemptsRef.current >= 3) {
      setState("Error");
      setError(`${experienceLabel} could not reconnect. You can try again manually.`);
      return;
    }
    reconnectScheduledRef.current = true;
    reconnectAttemptsRef.current += 1;
    setState("Reconnecting");
    const delay = 500 * (2 ** (reconnectAttemptsRef.current - 1));
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      reconnectScheduledRef.current = false;
      void start(true);
    }, delay);
  }

  function recordAnalyticsEvent(eventType: string, providerEventId?: string) {
    if (isMentor) return;
    const eventId = providerEventId ?? `client-${eventType}-${++lifecycleEventCounterRef.current}`;
    const write = (testApi
      ? testApi.recordAnalyticsEvent(conversationId, {
        event_id: eventId,
        event_type: eventType,
        occurred_at: new Date().toISOString(),
      })
      : recordRealtimeAnalyticsEvent(createClient(), conversationId, {
        event_id: eventId,
        event_type: eventType,
        occurred_at: new Date().toISOString(),
      })).catch(() => undefined);
    pendingAnalyticsWritesRef.current.add(write);
    void write.finally(() => pendingAnalyticsWritesRef.current.delete(write));
  }

  function connectionErrorMessage(error: RealtimeConnectionError): string {
    const stage = error.stage;
    if (stage === "invalid_answer_sdp") return "Invalid SDP answer received.";
    if (stage === "set_remote_description_failed") return `setRemoteDescription failed${error.causeName ? ` (${error.causeName})` : ""}: ${error.message}`;
    if (stage === "before_remote_description") return "Failed before remote description.";
    if (stage === "remote_description_accepted_ice_failed") return "Remote description accepted; ICE/peer connection failed.";
    if (stage === "peer_disconnected") return "Peer connection disconnected while connecting.";
    if (stage === "data_channel_closed_before_open") return "Data channel closed before opening.";
    return "Connection timed out while connecting.";
  }

  function setConnectionError(error: RealtimeConnectionError): void {
    setError(process.env.NODE_ENV === "production" ? `${experienceLabel} could not connect. Please try again.` : connectionErrorMessage(error));
  }

  function clearResponseTimeout() {
    if (responseTimeoutRef.current !== null) clearTimeout(responseTimeoutRef.current);
    responseTimeoutRef.current = null;
  }

  function requestAssistantResponse() {
    const connection = connectionRef.current;
    if (!connection || responsePendingRef.current) return;
    responsePendingRef.current = true;
    clearResponseTimeout();
    setError(null);
    setState("Processing");
    connection.requestResponse();
    responseTimeoutRef.current = setTimeout(() => {
      responseTimeoutRef.current = null;
      if (!responsePendingRef.current || !mountedRef.current) return;
      responsePendingRef.current = false;
      setState("Listening");
      setError(`The ${isMentor ? "Mentor" : "interviewer"} did not respond. You can try again.`);
    }, 15_000);
  }

  function isAttemptAlive(attemptId: string) {
    return mountedRef.current && (
      activeAttemptRef.current?.id === attemptId || connectionAttemptRef.current === attemptId
    );
  }

  function handleEvent(value: unknown) {
    const event = providerEvent(value);
    if (!event || typeof event.type !== "string") return;
    if (event.type === "response.created") {
      responsePendingRef.current = true;
      clearResponseTimeout();
      responseTimeoutRef.current = setTimeout(() => {
        responseTimeoutRef.current = null;
        if (!responsePendingRef.current || !mountedRef.current) return;
        responsePendingRef.current = false;
        setState("Listening");
        setError(`The ${isMentor ? "Mentor" : "interviewer"} did not respond. You can try again.`);
      }, 15_000);
      if (stateRef.current !== "Assistant speaking" && stateRef.current !== "Mentor speaking") setState("Processing");
    }
    if (event.type === "response.error" || event.type === "error") {
      responsePendingRef.current = false;
      clearResponseTimeout();
      setState("Listening");
      setError(`The ${isMentor ? "Mentor" : "interviewer"} could not respond. You can try again.`);
      return;
    }
    if (event.type === "input_audio_buffer.speech_started") {
      recordAnalyticsEvent(
        "candidate_speech_started",
        typeof event.id === "string" ? `candidate-start-${event.id}` : undefined,
      );
    }
    if (event.type === "input_audio_buffer.speech_started" && (stateRef.current === "Assistant speaking" || stateRef.current === "Mentor speaking")) {
      // VAD only proves microphone activity. Wait for a meaningful finalized
      // transcript before cancelling an active response.
      interruptionPendingRef.current = true;
      setState("Listening");
    }
    const assistantAudioStarted = event.type === "response.audio.delta" || event.type === "response.output_audio.delta";
    if (assistantAudioStarted) {
      responsePendingRef.current = false;
      clearResponseTimeout();
      if (!interviewerSpeakingRef.current) {
        interviewerSpeakingRef.current = true;
        interviewerFinalizedRef.current = false;
        recordAnalyticsEvent(
          "interviewer_speech_started",
          typeof event.id === "string" ? `interviewer-start-${event.id}` : undefined,
        );
      }
      assistantResponseActiveRef.current = true;
      responseCancelRequestedRef.current = false;
      setState(isMentor ? "Mentor speaking" : "Assistant speaking");
    }
    if (event.type === "response.audio_transcript.delta" && !assistantAudioStarted) {
      if (!responsePendingRef.current) responsePendingRef.current = true;
      if (stateRef.current !== "Assistant speaking" && stateRef.current !== "Mentor speaking") setState("Processing");
    }
    if (event.type === "response.done" || event.type.includes("audio.done")) {
      responsePendingRef.current = false;
      clearResponseTimeout();
      assistantResponseActiveRef.current = false;
      if (interviewerSpeakingRef.current) {
        interviewerSpeakingRef.current = false;
        interviewerFinalizedRef.current = true;
        recordAnalyticsEvent("interviewer_speech_finalized", typeof event.id === "string" ? event.id : undefined);
      }
      setState("Listening");
    }
    const caption = parseLiveTranscriptEvent(value);
    if (!caption || persistedEventIdsRef.current.has(caption.eventId)) return;
    setTranscript((current) => {
      const existingIndex = current.findIndex((line) => line.eventId === caption.eventId);
      if (existingIndex >= 0) {
        const next = [...current];
        next[existingIndex] = caption;
        return next;
      }
      const previous = current.at(-1);
      if (previous && previous.speaker === caption.speaker && !previous.final) {
        return [...current.slice(0, -1), { ...caption, text: `${previous.text}${caption.text}` }];
      }
      return [...current, caption];
    });
    if (!caption.final) return;
    if (caption.speaker === "user" && !isMeaningfulCandidateTurn(caption.text)) {
      persistedEventIdsRef.current.add(caption.eventId);
      setTranscript((current) => current.filter((line) => line.eventId !== caption.eventId));
      interruptionPendingRef.current = false;
      return;
    }
    if (caption.speaker === "user") {
      if (assistantResponseActiveRef.current && !responseCancelRequestedRef.current) {
        connectionRef.current?.cancelResponse();
        responseCancelRequestedRef.current = true;
        recordAnalyticsEvent("interruption");
      }
      interruptionPendingRef.current = false;
    }
    if (caption.speaker === "user" || !interviewerFinalizedRef.current) {
      recordAnalyticsEvent(
        caption.speaker === "user" ? "candidate_speech_finalized" : "interviewer_speech_finalized",
        `${caption.speaker === "user" ? "candidate-final" : "interviewer-final"}-${caption.eventId}`,
      );
      if (caption.speaker === "assistant") interviewerFinalizedRef.current = true;
    }
    persistedEventIdsRef.current.add(caption.eventId);
    setSaveState("saving");
    const write = (testApi
      ? testApi.persistTranscriptTurn(conversationId, {
        event_id: caption.eventId,
        role: caption.speaker,
        content: caption.text,
        final: true,
      })
      : persistRealtimeTranscriptTurn(createClient(), conversationId, {
        event_id: caption.eventId,
        role: caption.speaker,
        content: caption.text,
        final: true,
      })).then(() => setSaveState("saved")).catch(() => {
      persistedEventIdsRef.current.delete(caption.eventId);
      setSaveState("error");
    });
    pendingWritesRef.current.add(write);
    void write.finally(() => pendingWritesRef.current.delete(write));
    if (caption.speaker === "user") requestAssistantResponse();
  }

  async function refreshPersistedTranscript() {
    try {
      const messages = await (testApi
        ? testApi.listMessages(conversationId)
        : listMessages(createClient(), conversationId));
      if (!mountedRef.current) return;
      const persisted = messages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({
          eventId: `persisted-${message.id}`,
          speaker: message.role as "user" | "assistant",
          text: message.content,
          final: true,
        }));
      persistedEventIdsRef.current = new Set(persisted.map((line) => line.eventId));
      setTranscript(persisted);
    } catch {
      // Keep the in-memory transcript available if the refresh request fails.
    }
  }

  function releaseAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
    audioAttachedRef.current = false;
  }

  function markTransportDisconnected() {
    const connection = connectionRef.current;
    connectionRef.current = null;
    connectionAttemptRef.current = null;
    onConnectionChangeRef.current?.(null);
    connection?.close();
    releaseAudio();
  }

  async function start(isReconnect = false) {
    if (connectingRef.current || connectionRef.current) return;
    endingRef.current = false;
    if (!isReconnect) reconnectAttemptsRef.current = 0;
    connectingRef.current = true;
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      reconnectScheduledRef.current = false;
    }
    const attemptId = `realtime-${++attemptCounterRef.current}`;
    const controller = new AbortController();
    activeAttemptRef.current = { id: attemptId, controller };
    setState("Connecting");
    setError(null);
    setAudioBlocked(false);
    if (hasStartedRef.current) await refreshPersistedTranscript();
    if (hasStartedRef.current) recordAnalyticsEvent("reconnect");
    try {
      const connection = await connectRealtime({
        attemptId,
        signal: controller.signal,
        isAttemptCurrent: () => activeAttemptRef.current?.id === attemptId || connectionAttemptRef.current === attemptId,
        kickoff: !hasStartedRef.current && !mentorStarted && initialMessages.length === 0,
        mediaStream,
        connectSdp: (offerSdp) => testApi
          ? testApi.connect(conversationId, offerSdp)
          : connectRealtimeSession(createClient(), conversationId, offerSdp),
        onDiagnostic: (diagnostic) => {
          if (process.env.NODE_ENV !== "production") console.info("[DevStride realtime]", diagnostic);
        },
        onRemoteStream: (stream) => {
          if (!isAttemptAlive(attemptId)) return;
          if (audioRef.current && !audioAttachedRef.current) {
            audioAttachedRef.current = true;
            audioRef.current.srcObject = stream;
            void audioRef.current.play().catch(() => setAudioBlocked(true));
          }
        },
        onEvent: (value) => {
          if (isAttemptAlive(attemptId)) handleEvent(value);
        },
        onConnectionState: (connectionState) => {
          if (!isAttemptAlive(attemptId)) return;
          if (connectionState === "connected") setState("Connected");
          if (connectionState === "failed") {
            setState(hasStartedRef.current ? "Reconnecting" : "Error");
            setConnectionError(new RealtimeConnectionError("remote_description_accepted_ice_failed", "Realtime peer connection failed after remote description"));
            if (hasStartedRef.current) markTransportDisconnected();
            if (hasStartedRef.current) scheduleReconnect();
          }
          if (connectionState === "disconnected") {
            setState(hasStartedRef.current ? "Reconnecting" : "Error");
            setError(process.env.NODE_ENV === "production" ? `${experienceLabel} could not connect. Please try again.` : `Peer connection disconnected. Reconnect to continue ${isMentor ? "Mentor" : "the interview"}.`);
            if (hasStartedRef.current) markTransportDisconnected();
            if (hasStartedRef.current) scheduleReconnect();
          }
          if (connectionState === "closed") {
            setState(hasStartedRef.current ? "Reconnecting" : "Error");
            setError(process.env.NODE_ENV === "production" ? `${experienceLabel} could not connect. Please try again.` : `Peer connection closed. Reconnect to continue ${isMentor ? "Mentor" : "the interview"}.`);
            if (hasStartedRef.current) markTransportDisconnected();
            if (hasStartedRef.current) scheduleReconnect();
          }
        },
        onMicrophoneEnded: () => {
          if (!isAttemptAlive(attemptId)) return;
          markTransportDisconnected();
          setState("Error");
          setError("Your microphone became unavailable. Check the device and try again.");
        },
      });
      if (!mountedRef.current) {
        connection.close();
        return;
      }
      connectionRef.current = connection;
      connectionAttemptRef.current = attemptId;
      onConnectionChangeRef.current?.(connection);
      hasStartedRef.current = true;
      reconnectAttemptsRef.current = 0;
      recordAnalyticsEvent("session_connected");
      setState("Connected");
    } catch (cause) {
      const status = apiStatus(cause);
      setState("Error");
      if (cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "PermissionDeniedError")) {
        setError(`Microphone access was denied. Allow microphone access or use Text ${isMentor ? "Mentor" : "Interview"} instead.`);
      } else if (status === 401) {
        setError(`Authentication is required to start ${experienceLabel}.`);
      } else if (status !== undefined && [403, 404, 409].includes(status)) {
        setError(`This ${isMentor ? "Mentor session" : "interview"} is not available for ${experienceLabel}.`);
      } else if (cause instanceof RealtimeConnectionError) {
        setConnectionError(cause);
      } else {
        setError(`${experienceLabel} could not connect. Please try again.`);
      }
      const isNonRetryableApiError = status !== undefined && [401, 403, 404, 409].includes(status);
      if (hasStartedRef.current && !isNonRetryableApiError) {
        scheduleReconnect();
      }
    } finally {
      if (activeAttemptRef.current?.id === attemptId) {
        activeAttemptRef.current = null;
        connectingRef.current = false;
      }
    }
  }

  function closeConnection() {
    if (reconnectTimerRef.current !== null) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    reconnectScheduledRef.current = false;
    activeAttemptRef.current?.controller.abort();
    activeAttemptRef.current = null;
    connectingRef.current = false;
    connectionRef.current?.close();
    onConnectionChangeRef.current?.(null);
    connectionRef.current = null;
    connectionAttemptRef.current = null;
    releaseAudio();
    interviewerSpeakingRef.current = false;
    interviewerFinalizedRef.current = false;
    assistantResponseActiveRef.current = false;
    interruptionPendingRef.current = false;
    responseCancelRequestedRef.current = false;
    responsePendingRef.current = false;
    clearResponseTimeout();
  }

  async function end() {
    if (endingRef.current) return;
    endingRef.current = true;
    setState("Ending");
    closeConnection();
    setMuted(false);
    try {
      await Promise.all([...pendingAnalyticsWritesRef.current]);
      await Promise.all([...pendingWritesRef.current]);
      await Promise.all([...pendingAnalyticsWritesRef.current]);
      await (testApi ? testApi.end(conversationId) : isMentor ? endLiveMentor(createClient(), conversationId) : endRealtimeInterview(createClient(), conversationId));
      setState("Ended");
      router.push(`/conversations/${conversationId}`);
    } catch {
      setState("Error");
      setError(`The ${isMentor ? "Mentor session" : "interview"} could not be finalized. Your saved turns are still safe; try again.`);
    }
  }

  function toggleMute() {
    const nextMuted = !muted;
    connectionRef.current?.mute(nextMuted);
    recordAnalyticsEvent(nextMuted ? "mute" : "unmute");
    setMuted(nextMuted);
    setState(nextMuted ? "Muted" : "Listening");
  }

  function enableAudio() {
    void audioRef.current?.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
  }

  startRef.current = start;

  useEffect(() => {
    if (startOnMount && mediaStream && !autoStartedRef.current) {
      autoStartedRef.current = true;
      void startRef.current?.();
    }
  }, [mediaStream, startOnMount]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    mountedRef.current = true;
    const audioElement = audioRef.current;
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current !== null) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      reconnectScheduledRef.current = false;
      activeAttemptRef.current?.controller.abort();
      activeAttemptRef.current = null;
      connectingRef.current = false;
      responsePendingRef.current = false;
      clearResponseTimeout();
      connectionRef.current?.close();
      connectionRef.current = null;
      connectionAttemptRef.current = null;
      onConnectionChangeRef.current?.(null);
      if (audioElement) {
        audioElement.pause();
        audioElement.srcObject = null;
      }
      audioAttachedRef.current = false;
    };
  }, []);

  const active = ["Connecting", "Connected", "Processing", "Listening", "Assistant speaking", "Mentor speaking", "Muted"].includes(state);
  const canEnd = active || state === "Reconnecting";
  const reconnecting = state === "Reconnecting";
  return <section className="live-spike" aria-labelledby="live-spike-title">
    <header className="live-spike-header"><div><p className="eyebrow">{experienceLabel}</p><h1 id="live-spike-title">{experienceLabel}</h1><p className="muted">{isMentor ? "Conversational coaching with your profile and approved memory context." : `${interviewType === "behavioral" ? "Behavioral" : "Technical"}${interviewFocus ? ` · ${interviewFocus.replaceAll("_", " ")}` : ""}`}</p></div><div className="live-interviewer-presence"><span className="live-interviewer-presence-name">DevStride {isMentor ? "Mentor" : "interviewer"}</span><span className="status-pill" role="status">{state}</span><p>{stateDescription(state, isMentor)}</p></div></header>
    <p className="field-hint">Finalized turns are saved to this {isMentor ? "Mentor session" : "Interview"}; live captions may include speech still in progress.</p>
    <audio ref={audioRef} autoPlay aria-label={`${experienceLabel} audio`} />
    <div className="live-spike-controls">{!active && !canEnd ? <button type="button" onClick={() => void start()}>{state === "Ready" ? (isMentor ? "Start Live Mentor" : "Start live interview") : "Try again"}</button> : <>{reconnecting && <button type="button" onClick={() => void start()}>Reconnect</button>}{active && <button type="button" className="button-secondary" onClick={toggleMute}>{muted ? "Unmute microphone" : "Mute microphone"}</button>}<button type="button" className="button-danger" onClick={() => void end()}>End {isMentor ? "session" : "interview"}</button></>}</div>
    {audioBlocked && <button type="button" className="button-secondary" onClick={enableAudio}>Enable {isMentor ? "Mentor" : "interviewer"} audio</button>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {saveState === "saving" && <p className="field-hint" role="status">Saving final transcript turn…</p>}
    <section className="live-spike-transcript" aria-labelledby="live-captions-title"><h2 id="live-captions-title">Live captions</h2>{transcript.length === 0 ? <p className="muted">Live speech will appear here when available.</p> : transcript.map((line, index) => <p key={`${index}-${line.text}`}><strong>{line.speaker === "user" ? "You" : speakerLabel}:</strong> {line.text}{!line.final && <em> (in progress)</em>}</p>)}</section>
  </section>;
}
