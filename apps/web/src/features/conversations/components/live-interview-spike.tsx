"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError } from "../../../lib/api/client";
import { createClient } from "../../../lib/supabase/client";
import { connectRealtimeSession, endRealtimeInterview, listMessages, persistRealtimeTranscriptTurn } from "../api";
import { connectRealtime, parseLiveTranscriptEvent, RealtimeConnectionError, type LiveTranscriptEvent, type RealtimeConnection } from "../realtime-client";

type LiveState = "Ready" | "Connecting" | "Connected" | "Listening" | "Assistant speaking" | "Muted" | "Reconnecting" | "Ending" | "Ended" | "Error";

function providerEvent(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function LiveInterviewSpike({ conversationId, interviewType, interviewFocus, initialMessages = [] }: { conversationId: string; interviewType: string; interviewFocus: string | null; initialMessages?: Array<{ id: string; role: string; content: string; created_at: string }> }) {
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
  const mountedRef = useRef(true);
  const connectionRef = useRef<RealtimeConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const connectingRef = useRef(false);
  const attemptCounterRef = useRef(0);
  const activeAttemptRef = useRef<{ id: string; controller: AbortController } | null>(null);
  const connectionAttemptRef = useRef<string | null>(null);
  const hasStartedRef = useRef(false);
  const audioAttachedRef = useRef(false);

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
    setError(process.env.NODE_ENV === "production" ? "Realtime Practice could not connect. Please try again." : connectionErrorMessage(error));
  }

  function isAttemptAlive(attemptId: string) {
    return mountedRef.current && (
      activeAttemptRef.current?.id === attemptId || connectionAttemptRef.current === attemptId
    );
  }

  function handleEvent(value: unknown) {
    const event = providerEvent(value);
    if (!event || typeof event.type !== "string") return;
    if (event.type === "input_audio_buffer.speech_started" && stateRef.current === "Assistant speaking") {
      connectionRef.current?.cancelResponse();
      setState("Listening");
    }
    if (event.type.includes("audio") && event.type.includes("delta")) setState("Assistant speaking");
    if (event.type === "response.done" || event.type.includes("audio.done")) setState("Listening");
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
    persistedEventIdsRef.current.add(caption.eventId);
    setSaveState("saving");
    const write = persistRealtimeTranscriptTurn(createClient(), conversationId, {
      event_id: caption.eventId,
      role: caption.speaker,
      content: caption.text,
      final: true,
    }).then(() => setSaveState("saved")).catch(() => {
      persistedEventIdsRef.current.delete(caption.eventId);
      setSaveState("error");
    });
    pendingWritesRef.current.add(write);
    void write.finally(() => pendingWritesRef.current.delete(write));
  }

  async function refreshPersistedTranscript() {
    try {
      const messages = await listMessages(createClient(), conversationId);
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
    connection?.close();
    releaseAudio();
  }

  async function start() {
    if (connectingRef.current || connectionRef.current) return;
    connectingRef.current = true;
    const attemptId = `realtime-${++attemptCounterRef.current}`;
    const controller = new AbortController();
    activeAttemptRef.current = { id: attemptId, controller };
    setState("Connecting");
    setError(null);
    setAudioBlocked(false);
    if (hasStartedRef.current) await refreshPersistedTranscript();
    try {
      const connection = await connectRealtime({
        attemptId,
        signal: controller.signal,
        isAttemptCurrent: () => activeAttemptRef.current?.id === attemptId,
        kickoff: !hasStartedRef.current && initialMessages.length === 0,
        connectSdp: (offerSdp) => connectRealtimeSession(createClient(), conversationId, offerSdp),
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
          }
          if (connectionState === "disconnected") {
            setState(hasStartedRef.current ? "Reconnecting" : "Error");
            setError(process.env.NODE_ENV === "production" ? "Realtime Practice could not connect. Please try again." : "Peer connection disconnected. Reconnect to continue the interview.");
            if (hasStartedRef.current) markTransportDisconnected();
          }
          if (connectionState === "closed") {
            setState(hasStartedRef.current ? "Reconnecting" : "Error");
            setError(process.env.NODE_ENV === "production" ? "Realtime Practice could not connect. Please try again." : "Peer connection closed. Reconnect to continue the interview.");
            if (hasStartedRef.current) markTransportDisconnected();
          }
        },
      });
      if (!mountedRef.current) {
        connection.close();
        return;
      }
      connectionRef.current = connection;
      connectionAttemptRef.current = attemptId;
      hasStartedRef.current = true;
      setState("Connected");
    } catch (cause) {
      setState("Error");
      if (cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "PermissionDeniedError")) {
        setError("Microphone access was denied. Allow microphone access or use Text Interview instead.");
      } else if (cause instanceof ApiError && cause.status === 401) {
        setError("Authentication is required to start Realtime Practice.");
      } else if (cause instanceof ApiError && [403, 404, 409].includes(cause.status)) {
        setError("This interview is not available for Realtime Practice.");
      } else if (cause instanceof RealtimeConnectionError) {
        setConnectionError(cause);
      } else {
        setError("Realtime Practice could not connect. Please try again.");
      }
    } finally {
      if (activeAttemptRef.current?.id === attemptId) {
        activeAttemptRef.current = null;
        connectingRef.current = false;
      }
    }
  }

  function closeConnection() {
    activeAttemptRef.current?.controller.abort();
    activeAttemptRef.current = null;
    connectingRef.current = false;
    connectionRef.current?.close();
    connectionRef.current = null;
    connectionAttemptRef.current = null;
    releaseAudio();
  }

  async function end() {
    setState("Ending");
    closeConnection();
    setMuted(false);
    try {
      await Promise.all([...pendingWritesRef.current]);
      await endRealtimeInterview(createClient(), conversationId);
      setState("Ended");
      router.push(`/conversations/${conversationId}`);
    } catch {
      setState("Error");
      setError("The interview could not be finalized. Your saved turns are still safe; try again.");
    }
  }

  function toggleMute() {
    const nextMuted = !muted;
    connectionRef.current?.mute(nextMuted);
    setMuted(nextMuted);
    setState(nextMuted ? "Muted" : "Listening");
  }

  function enableAudio() {
    void audioRef.current?.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
  }

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    mountedRef.current = true;
    const audioElement = audioRef.current;
    return () => {
      mountedRef.current = false;
      activeAttemptRef.current?.controller.abort();
      activeAttemptRef.current = null;
      connectingRef.current = false;
      connectionRef.current?.close();
      connectionRef.current = null;
      connectionAttemptRef.current = null;
      if (audioElement) {
        audioElement.pause();
        audioElement.srcObject = null;
      }
      audioAttachedRef.current = false;
    };
  }, []);

  const active = ["Connecting", "Connected", "Listening", "Assistant speaking", "Muted"].includes(state);
  return <section className="live-spike" aria-labelledby="live-spike-title">
    <header className="live-spike-header"><div><p className="eyebrow">Live Interview</p><h1 id="live-spike-title">Realtime practice</h1><p className="muted">{interviewType === "behavioral" ? "Behavioral" : "Technical"}{interviewFocus ? ` · ${interviewFocus.replaceAll("_", " ")}` : ""}</p></div><span className="status-pill" role="status">{state}</span></header>
    <p className="field-hint">Final transcript turns are saved to this Interview. Partial speech remains temporary until finalized.</p>
    <audio ref={audioRef} autoPlay aria-label="Live interviewer audio" />
    <div className="live-spike-controls">{!active ? <button type="button" onClick={() => void start()}>{state === "Ready" ? "Start live interview" : state === "Reconnecting" ? "Reconnect" : "Try again"}</button> : <><button type="button" className="button-secondary" onClick={toggleMute}>{muted ? "Unmute microphone" : "Mute microphone"}</button><button type="button" className="button-danger" onClick={() => void end()}>End interview</button></>}</div>
    {audioBlocked && <button type="button" className="button-secondary" onClick={enableAudio}>Enable interviewer audio</button>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {saveState === "saving" && <p className="field-hint" role="status">Saving final transcript turn…</p>}
    <section className="live-spike-transcript" aria-labelledby="live-captions-title"><h2 id="live-captions-title">Temporary transcript</h2>{transcript.length === 0 ? <p className="muted">Transcript lines will appear here when available.</p> : transcript.map((line, index) => <p key={`${index}-${line.text}`}><strong>{line.speaker === "user" ? "You" : "Interviewer"}:</strong> {line.text}{!line.final && <em> (in progress)</em>}</p>)}</section>
  </section>;
}
