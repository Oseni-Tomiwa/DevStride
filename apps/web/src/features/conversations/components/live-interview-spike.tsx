"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError } from "../../../lib/api/client";
import { createClient } from "../../../lib/supabase/client";
import { startLiveInterviewSpike } from "../api";

type SpikeState = "idle" | "requesting microphone" | "connecting" | "connected" | "failed" | "ended";
type TranscriptLine = { speaker: "You" | "Interviewer"; text: string; final: boolean };

function waitForIceGathering(connection: RTCPeerConnection): Promise<void> {
  if (connection.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, 5_000);
    connection.addEventListener("icegatheringstatechange", () => {
      if (connection.iceGatheringState === "complete") {
        window.clearTimeout(timeout);
        resolve();
      }
    }, { once: true });
  });
}

function eventRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function LiveInterviewSpike({ conversationId, interviewType, interviewFocus }: {
  conversationId: string;
  interviewType: string;
  interviewFocus: string | null;
}) {
  const [state, setState] = useState<SpikeState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const connectionRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const transcriptRef = useRef<TranscriptLine[]>([]);

  function cleanup() {
    channelRef.current?.close();
    channelRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    connectionRef.current?.close();
    connectionRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
  }

  function addTranscript(speaker: TranscriptLine["speaker"], text: string, final: boolean) {
    if (!text) return;
    const next = [...transcriptRef.current];
    const last = next.at(-1);
    if (last && last.speaker === speaker && !last.final) {
      next[next.length - 1] = { ...last, text: `${last.text}${text}`, final };
    } else {
      next.push({ speaker, text, final });
    }
    transcriptRef.current = next;
    setTranscript(next);
  }

  function handleProviderEvent(value: unknown) {
    const event = eventRecord(value);
    if (!event || typeof event.type !== "string") return;
    const delta = typeof event.delta === "string" ? event.delta : "";
    const transcriptText = typeof event.transcript === "string" ? event.transcript : "";
    if (event.type.includes("input_audio_transcription") && (delta || transcriptText)) {
      addTranscript("You", delta || transcriptText, event.type.endsWith("completed"));
    }
    if ((event.type.includes("audio_transcript") || event.type.includes("output_text")) && (delta || transcriptText)) {
      addTranscript("Interviewer", delta || transcriptText, event.type.endsWith("done") || event.type.endsWith("completed"));
    }
  }

  async function start() {
    setState("requesting microphone");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setState("connecting");
      const connection = new RTCPeerConnection();
      connectionRef.current = connection;
      connection.ontrack = (event) => {
        if (!audioRef.current) return;
        audioRef.current.srcObject = event.streams[0] ?? null;
        void audioRef.current.play().catch(() => undefined);
      };
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "connected") setState("connected");
        if (["failed", "disconnected", "closed"].includes(connection.connectionState)) {
          setState("failed");
          setError("The live interview connection was interrupted.");
        }
      };
      const channel = connection.createDataChannel("oai-events");
      channel.onmessage = (event) => {
        try { handleProviderEvent(JSON.parse(event.data as string) as unknown); } catch { /* Ignore malformed provider events. */ }
      };
      channelRef.current = channel;
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await waitForIceGathering(connection);
      const localDescription = connection.localDescription;
      if (!localDescription?.sdp) throw new Error("WebRTC offer was not created");
      const response = await startLiveInterviewSpike(createClient(), conversationId, localDescription.sdp);
      await connection.setRemoteDescription({ type: "answer", sdp: response.sdp_answer });
      setState("connected");
    } catch (cause) {
      cleanup();
      setState("failed");
      if (cause instanceof DOMException && cause.name === "NotAllowedError") {
        setError("Microphone access was denied. Allow microphone access or use Text Interview instead.");
      } else if (cause instanceof ApiError && cause.status === 401) {
        setError("Authentication is required to start Live Interview.");
      } else {
        setError("Live Interview could not connect. Please try again.");
      }
    }
  }

  function end() {
    cleanup();
    setState("ended");
    setMuted(false);
  }

  function toggleMute() {
    const nextMuted = !muted;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    setMuted(nextMuted);
  }

  useEffect(() => () => cleanup(), []);

  return <section className="live-spike" aria-labelledby="live-spike-title">
    <header className="live-spike-header">
      <div><p className="eyebrow">Experimental Live Interview</p><h1 id="live-spike-title">Realtime voice connection</h1><p className="muted">{interviewType === "behavioral" ? "Behavioral" : "Technical"}{interviewFocus ? ` · ${interviewFocus.replaceAll("_", " ")}` : ""}</p></div>
      <span className="status-pill" role="status">{state}</span>
    </header>
    <p className="field-hint">This Phase 1 spike shows temporary captions only. It does not save transcripts, messages, assessments, Progress, Memory, or Goal updates.</p>
    <audio ref={audioRef} autoPlay aria-label="Live interviewer audio" />
    <div className="live-spike-controls">{state === "idle" || state === "failed" || state === "ended" ? <button type="button" onClick={() => void start()}>{state === "idle" ? "Start live interview" : "Try again"}</button> : <><button type="button" className="button-secondary" onClick={toggleMute} disabled={state !== "connected"}>{muted ? "Unmute microphone" : "Mute microphone"}</button><button type="button" className="button-danger" onClick={end}>End connection</button></>}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <section className="live-spike-transcript" aria-labelledby="live-transcript-title"><h2 id="live-transcript-title">Temporary captions</h2>{transcript.length === 0 ? <p className="muted">Captions will appear here when the provider emits transcript events.</p> : transcript.map((line, index) => <p key={`${line.speaker}-${index}`}><strong>{line.speaker}:</strong> {line.text}</p>)}</section>
  </section>;
}
