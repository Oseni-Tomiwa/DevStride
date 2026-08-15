"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError } from "../../../lib/api/client";
import { LiveInterviewSpike, type LiveInterviewTestApi } from "./live-interview-spike";
import { VideoInterview } from "./video-interview";

const conversationId = "e2e-live-interview";
const answerSdp = "v=0\r\no=- answer\r\na=ice-ufrag:abc123\r\na=ice-pwd:def456\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=application 9 DTLS/SCTP 5000\r\n";

type E2EMode = "healthy" | "fail-once" | "permanent" | "auth";

class FakeTrack extends EventTarget {
  static latest: FakeTrack | null = null;
  kind: "audio" | "video";
  enabled = true;
  readyState: MediaStreamTrackState = "live";
  constructor(kind: "audio" | "video" = "audio") {
    super();
    this.kind = kind;
    FakeTrack.latest = this;
  }
  stop() {
    this.readyState = "ended";
    this.dispatchEvent(new Event("ended"));
  }
}

class FakeDataChannel extends EventTarget {
  readyState: RTCDataChannelState = "connecting";
  onmessage: ((event: MessageEvent) => void) | null = null;
  send(message: string) {
    window.localStorage.setItem("devstride-e2e-last-message", message);
    try {
      const parsed = JSON.parse(message) as { type?: unknown };
      if (parsed.type === "response.create") {
        const count = Number(window.localStorage.getItem("devstride-e2e-kickoff-count") ?? "0");
        window.localStorage.setItem("devstride-e2e-kickoff-count", String(count + 1));
      }
    } catch { /* Test harness messages are deterministic JSON. */ }
  }
  open() {
    this.readyState = "open";
    this.dispatchEvent(new Event("open"));
    this.onopen?.();
  }
  close() {
    this.readyState = "closed";
    this.dispatchEvent(new Event("close"));
    this.onclose?.();
  }
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onclosing: (() => void) | null = null;
  onerror: (() => void) | null = null;
  emit(value: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent);
  }
}

class FakePeerConnection extends EventTarget {
  static latest: FakePeerConnection | null = null;
  connectionState: RTCPeerConnectionState = "new";
  iceConnectionState: RTCIceConnectionState = "new";
  iceGatheringState: RTCIceGatheringState = "complete";
  signalingState: RTCSignalingState = "stable";
  localDescription: RTCSessionDescriptionInit | null = { type: "offer", sdp: "v=0\r\no=- offer\r\n" };
  dataChannel = new FakeDataChannel();
  createOffer = async () => ({ type: "offer" as const, sdp: "v=0\r\no=- offer\r\n" });
  setLocalDescription = async () => undefined;
  setRemoteDescription = async () => {
    this.dataChannel.open();
    this.transition("connected");
  };
  createDataChannel = () => this.dataChannel;
  addTrack = () => undefined;
  getReceivers = () => [] as RTCRtpReceiver[];
  getTransceivers = () => [] as RTCRtpTransceiver[];
  close = () => {
    this.connectionState = "closed";
    this.dispatchEvent(new Event("connectionstatechange"));
  };
  constructor() {
    super();
    FakePeerConnection.latest = this;
  }
  transition(state: RTCPeerConnectionState) {
    this.connectionState = state;
    this.iceConnectionState = state === "connected" ? "connected" : state === "failed" ? "failed" : "checking";
    this.dispatchEvent(new Event("connectionstatechange"));
  }
}

export function LiveInterviewE2EHarness({ practiceMode = "interview", video = false }: { practiceMode?: "interview" | "mentor"; video?: boolean }) {
  const isMentor = practiceMode === "mentor";
  const [ready, setReady] = useState(false);
  const [, setMode] = useState<E2EMode>("healthy");
  const modeRef = useRef<E2EMode>("healthy");
  const tracksRef = useRef<FakeTrack[]>([]);
  const [messages, setMessages] = useState<Array<{ id: string; role: string; content: string; created_at: string }>>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem("devstride-e2e-messages") ?? "[]") as Array<{ id: string; role: string; content: string; created_at: string }>; } catch { return []; }
  });

  useEffect(() => {
    const tracks = [new FakeTrack("audio"), ...(video ? [new FakeTrack("video")] : [])];
    tracksRef.current = tracks;
    const denyMicrophone = (window as unknown as { __devstrideDenyMicrophone?: boolean }).__devstrideDenyMicrophone;
    const denyCamera = (window as unknown as { __devstrideDenyCamera?: boolean }).__devstrideDenyCamera;
    const makeStream = (includeVideo: boolean) => {
      const selected = tracks.filter((track) => track.kind === "audio" || includeVideo && track.kind === "video");
      return { getTracks: () => selected, getAudioTracks: () => selected.filter((track) => track.kind === "audio"), getVideoTracks: () => selected.filter((track) => track.kind === "video"), addTrack: (track: FakeTrack) => selected.push(track) };
    };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: denyMicrophone
      ? async () => { throw new DOMException("denied", "NotAllowedError"); }
      : async (constraints: MediaStreamConstraints) => { if (denyCamera && constraints.video) throw new DOMException("camera unavailable", "NotFoundError");
        return makeStream(Boolean(constraints.video)); }
      } });
    window.RTCPeerConnection = FakePeerConnection as unknown as typeof RTCPeerConnection;
    const readyTimer = window.setTimeout(() => setReady(true), 0);
    return () => {
      window.clearTimeout(readyTimer);
      tracks.forEach((track) => track.stop());
    };
  }, [video]);

  const api: LiveInterviewTestApi = {
    connect: async () => {
      const count = Number(window.localStorage.getItem("devstride-e2e-connect-count") ?? "0");
      window.localStorage.setItem("devstride-e2e-connect-count", String(count + 1));
      const currentMode = modeRef.current;
      if (currentMode === "auth") throw new ApiError("Authentication required.", 401);
      if (currentMode === "fail-once") {
        modeRef.current = "healthy";
        setMode("healthy");
        throw new Error("temporary network failure");
      }
      if (currentMode === "permanent") throw new Error("permanent network failure");
      return { sdp: answerSdp, status: 201, contentType: "application/sdp" };
    },
    listMessages: async () => messages,
    persistTranscriptTurn: async (_conversationId, input) => {
      setMessages((current) => {
        const next = [...current, { id: input.event_id, role: input.role, content: input.content, created_at: new Date().toISOString() }];
        window.localStorage.setItem("devstride-e2e-messages", JSON.stringify(next));
        return next;
      });
      return {};
    },
    recordAnalyticsEvent: async (_conversationId, input) => {
      const events = JSON.parse(window.localStorage.getItem("devstride-e2e-events") ?? "[]") as string[];
      if (!events.includes(input.event_id)) window.localStorage.setItem("devstride-e2e-events", JSON.stringify([...events, input.event_id]));
      return { status: "recorded" };
    },
    end: async () => {
      window.localStorage.setItem("devstride-e2e-ended", "true");
      return {};
    },
  };

  if (!ready) return <p role="status">Preparing deterministic realtime test harness…</p>;
  return <main>
    <div className="live-spike-controls">
      <button type="button" onClick={() => { modeRef.current = "fail-once"; setMode("fail-once"); }}>Prepare network retry</button>
      <button type="button" onClick={() => { modeRef.current = "permanent"; setMode("permanent"); }}>Prepare permanent failure</button>
      <button type="button" onClick={() => { modeRef.current = "auth"; setMode("auth"); }}>Prepare auth expiry</button>
      <button type="button" onClick={() => FakePeerConnection.latest?.transition("disconnected")}>Drop connection</button>
      <button type="button" onClick={() => (FakePeerConnection.latest?.dataChannel.emit({ id: "user-1", type: "input_audio_transcription.completed", transcript: "My answer" }), FakePeerConnection.latest?.dataChannel.emit({ id: "assistant-1", type: "response.audio_transcript.done", transcript: "Good answer" }))}>Emit transcript</button>
      <button type="button" onClick={() => (FakePeerConnection.latest?.dataChannel.emit({ type: "response.audio.delta", delta: "Speaking" }), FakePeerConnection.latest?.dataChannel.emit({ type: "input_audio_buffer.speech_started" }), FakePeerConnection.latest?.dataChannel.emit({ id: "noise-1", type: "input_audio_transcription.completed", transcript: "[silence]" }))}>Simulate background noise</button>
      <button type="button" onClick={() => (FakePeerConnection.latest?.dataChannel.emit({ type: "input_audio_buffer.speech_started" }), FakePeerConnection.latest?.dataChannel.emit({ id: "meaningful-1", type: "input_audio_transcription.completed", transcript: "I would choose a queue because it decouples the producer and consumer." }))}>Emit meaningful answer</button>
      <button type="button" onClick={() => FakeTrack.latest?.stop()}>Simulate microphone loss</button>
    </div>
    {video ? <VideoInterview conversationId={conversationId} interviewType="technical" interviewFocus="apis" initialMessages={messages} testApi={api} /> : <LiveInterviewSpike conversationId={conversationId} practiceMode={practiceMode} mentorStarted={isMentor && messages.length > 0} interviewType="technical" interviewFocus="apis" initialMessages={messages} testApi={api} />}
  </main>;
}
