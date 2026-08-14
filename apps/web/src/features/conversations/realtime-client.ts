export type RealtimeConnection = {
  mute: (muted: boolean) => void;
  cancelResponse: () => void;
  close: () => void;
};

export type RealtimeSdpAnswer = {
  sdp: string;
  status: number;
  contentType: string;
};

export type RealtimeDiagnostic = {
  stage: string;
  attemptId: string;
  status?: number;
  contentType?: string;
  answerChars?: number;
  answerBytes?: number;
  startsWithV0?: boolean;
  containsAudio?: boolean;
  containsApplication?: boolean;
  errorName?: string;
  errorMessage?: string;
  signalingState?: string;
  connectionState?: string;
  iceConnectionState?: string;
  iceGatheringState?: string;
  channelState?: string;
  sdpChars?: number;
  sdpBytes?: number;
  audioReceiver?: boolean;
  audioTransceiver?: boolean;
  localAudioTrackLive?: boolean;
};

export class RealtimeAttemptCancelledError extends Error {
  constructor() {
    super("Realtime attempt was cancelled");
    this.name = "RealtimeAttemptCancelledError";
  }
}

export type RealtimeFailureStage =
  | "invalid_answer_sdp"
  | "before_remote_description"
  | "set_remote_description_failed"
  | "remote_description_accepted_ice_failed"
  | "peer_disconnected"
  | "data_channel_closed_before_open"
  | "connection_timeout";

export class RealtimeConnectionError extends Error {
  constructor(public readonly stage: RealtimeFailureStage, message: string, public readonly causeName?: string) {
    super(message);
    this.name = "RealtimeConnectionError";
  }
}

function safeBrowserError(error: unknown): { name: string; message: string } {
  const name = error instanceof Error && error.name ? error.name.slice(0, 80) : "UnknownError";
  const message = error instanceof Error && error.message
    ? error.message.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 160)
    : "The browser rejected the remote description";
  return { name, message };
}

export type LiveTranscriptEvent = {
  eventId: string;
  speaker: "user" | "assistant";
  text: string;
  final: boolean;
};

export function parseLiveTranscriptEvent(value: unknown): LiveTranscriptEvent | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (typeof event.type !== "string") return null;
  if (typeof event.id !== "string") return null;
  const text = typeof event.transcript === "string" ? event.transcript : typeof event.delta === "string" ? event.delta : null;
  if (!text) return null;
  const user = event.type.includes("input_audio_transcription");
  const assistant = event.type.includes("audio_transcript") || event.type.includes("output_audio");
  if (!user && !assistant) return null;
  return { eventId: event.id, speaker: user ? "user" : "assistant", text, final: event.type.endsWith(".completed") || event.type.endsWith(".done") };
}

type ConnectOptions = {
  attemptId: string;
  signal?: AbortSignal;
  isAttemptCurrent?: () => boolean;
  connectSdp: (offerSdp: string) => Promise<RealtimeSdpAnswer>;
  onRemoteStream: (stream: MediaStream) => void;
  onMicrophoneEnded?: () => void;
  onEvent: (event: unknown) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
  kickoff?: boolean;
  onDiagnostic?: (diagnostic: RealtimeDiagnostic) => void;
};

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isCurrent(options: ConnectOptions): boolean {
  return !options.signal?.aborted && (options.isAttemptCurrent?.() ?? true);
}

function assertCurrent(options: ConnectOptions): void {
  if (!isCurrent(options)) throw new RealtimeAttemptCancelledError();
}

function waitForConnectionReady(
  channel: RTCDataChannel,
  connection: RTCPeerConnection,
  options: ConnectOptions,
  report: (stage: string, details?: Omit<RealtimeDiagnostic, "stage" | "attemptId">) => void,
): Promise<void> {
  if (connection.connectionState === "connected" || channel.readyState === "open") return Promise.resolve();
  if (channel.readyState === "closed" || channel.readyState === "closing") {
    return Promise.reject(new RealtimeConnectionError("data_channel_closed_before_open", "Realtime data channel closed before opening"));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => finish(new RealtimeConnectionError("connection_timeout", "Realtime connection timed out while connecting")), 15_000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      channel.removeEventListener("open", handleOpen);
      channel.removeEventListener("close", handleClose);
      channel.removeEventListener("error", handleError);
      connection.removeEventListener("connectionstatechange", handleConnectionState);
      options.signal?.removeEventListener("abort", handleAbort);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const handleOpen = () => {
      report("data_channel_ready", { channelState: channel.readyState });
      finish();
    };
    const handleClose = () => finish(new RealtimeConnectionError("data_channel_closed_before_open", "Realtime data channel closed before opening"));
    const handleError = () => finish(new RealtimeConnectionError("data_channel_closed_before_open", "Realtime data channel failed before opening"));
    const handleConnectionState = () => {
      if (connection.connectionState === "failed") {
        finish(new RealtimeConnectionError("remote_description_accepted_ice_failed", "Realtime peer connection failed after remote description"));
      } else if (connection.connectionState === "closed") {
        finish(new RealtimeConnectionError("peer_disconnected", "Realtime peer connection closed while connecting"));
      } else if (connection.connectionState === "connected") {
        report("connection_ready", { connectionState: connection.connectionState, channelState: channel.readyState });
        finish();
      }
    };
    const handleAbort = () => finish(new RealtimeAttemptCancelledError());
    channel.addEventListener("open", handleOpen, { once: true });
    channel.addEventListener("close", handleClose, { once: true });
    channel.addEventListener("error", handleError, { once: true });
    connection.addEventListener("connectionstatechange", handleConnectionState);
    options.signal?.addEventListener("abort", handleAbort, { once: true });
    handleConnectionState();
  });
}

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

export async function connectRealtime(options: ConnectOptions): Promise<RealtimeConnection> {
  assertCurrent(options);
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let connection: RTCPeerConnection | null = null;
  let channel: RTCDataChannel | null = null;
  let closed = false;
  const removeTrackListeners: Array<() => void> = [];
  try {
    assertCurrent(options);
    connection = new RTCPeerConnection();
    const peer = connection;
    const report = (stage: string, details: Omit<RealtimeDiagnostic, "stage" | "attemptId"> = {}) => {
      if (!isCurrent(options)) return;
      options.onDiagnostic?.({ stage, attemptId: options.attemptId, ...details });
    };
    const reportConnectionState = () => {
      if (closed) return;
      report("connection_state", {
        connectionState: peer.connectionState,
        signalingState: peer.signalingState,
        iceConnectionState: peer.iceConnectionState,
      });
      options.onConnectionState(peer.connectionState);
    };
    const reportIceConnectionState = () => report("ice_connection_state", {
      connectionState: peer.connectionState,
      signalingState: peer.signalingState,
      iceConnectionState: peer.iceConnectionState,
    });
    const reportSignalingState = () => report("signaling_state", {
      signalingState: peer.signalingState,
      connectionState: peer.connectionState,
      iceConnectionState: peer.iceConnectionState,
      iceGatheringState: peer.iceGatheringState,
    });
    const reportIceGatheringState = () => report("ice_gathering_state", {
      connectionState: peer.connectionState,
      iceConnectionState: peer.iceConnectionState,
      iceGatheringState: peer.iceGatheringState,
    });
    peer.addEventListener("signalingstatechange", reportSignalingState);
    peer.addEventListener("connectionstatechange", reportConnectionState);
    peer.addEventListener("iceconnectionstatechange", reportIceConnectionState);
    peer.addEventListener("icegatheringstatechange", reportIceGatheringState);
    report("initial_connection_state", {
      signalingState: peer.signalingState,
      connectionState: peer.connectionState,
      iceConnectionState: peer.iceConnectionState,
      iceGatheringState: peer.iceGatheringState,
    });
    const handleTrack = (event: Event) => {
      const trackEvent = event as RTCTrackEvent;
      const audioReceiver = peer.getReceivers().some((receiver) => receiver.track?.kind === "audio");
      const audioTransceiver = peer.getTransceivers().some((transceiver) => transceiver.receiver.track?.kind === "audio");
      report("remote_track", {
        connectionState: peer.connectionState,
        audioReceiver,
        audioTransceiver,
        localAudioTrackLive: stream.getAudioTracks().some((track) => track.readyState === "live"),
      });
      if (trackEvent.streams[0]) options.onRemoteStream(trackEvent.streams[0]);
    };
    peer.addEventListener("track", handleTrack);
    const handleMicrophoneEnded = () => {
      if (!closed && isCurrent(options)) {
        report("microphone_track_ended", {
          connectionState: peer.connectionState,
          localAudioTrackLive: false,
        });
        options.onMicrophoneEnded?.();
      }
    };
    stream.getAudioTracks().forEach((track) => {
      track.addEventListener("ended", handleMicrophoneEnded);
      removeTrackListeners.push(() => track.removeEventListener("ended", handleMicrophoneEnded));
    });
    channel = peer.createDataChannel("oai-events");
    report("data_channel_created", {
      channelState: channel.readyState,
      localAudioTrackLive: stream.getAudioTracks().some((track) => track.readyState === "live"),
    });
    channel.onopen = () => report("data_channel_open", { channelState: channel?.readyState });
    channel.onclosing = () => report("data_channel_closing", { channelState: channel?.readyState });
    channel.onclose = () => report("data_channel_close", { channelState: channel?.readyState });
    channel.onerror = () => report("data_channel_error", { channelState: channel?.readyState });
    channel.onmessage = (event) => {
      try { options.onEvent(JSON.parse(event.data as string) as unknown); } catch { /* Ignore malformed provider events. */ }
    };
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    const offer = await peer.createOffer();
    assertCurrent(options);
    await peer.setLocalDescription(offer);
    assertCurrent(options);
    await waitForIceGathering(connection);
    const localDescription = connection.localDescription;
    const offerSdp = localDescription?.sdp;
    if (!offerSdp || !offerSdp.startsWith("v=0")) {
      throw new Error("WebRTC offer was not created");
    }
    report("offer_ready", {
      sdpChars: offerSdp.length,
      sdpBytes: byteLength(offerSdp),
      startsWithV0: offerSdp.startsWith("v=0"),
      signalingState: peer.signalingState,
    });
    const answer = await options.connectSdp(offerSdp);
    assertCurrent(options);
    const sdpAnswer = typeof answer.sdp === "string" ? answer.sdp : "";
    report("answer_received", {
      status: answer.status,
      contentType: answer.contentType,
      answerChars: sdpAnswer.length,
      answerBytes: byteLength(sdpAnswer),
      startsWithV0: sdpAnswer.startsWith("v=0"),
      containsAudio: sdpAnswer.includes("m=audio"),
      containsApplication: sdpAnswer.includes("m=application"),
    });
    if (!sdpAnswer || !sdpAnswer.startsWith("v=0")) {
      throw new RealtimeConnectionError("invalid_answer_sdp", "The Realtime answer SDP was empty or malformed");
    }
    report("answer_validated", {
      answerChars: sdpAnswer.length,
      answerBytes: byteLength(sdpAnswer),
      startsWithV0: true,
      containsAudio: sdpAnswer.includes("m=audio"),
      containsApplication: sdpAnswer.includes("m=application"),
    });
    report("before_set_remote_description", {
      signalingState: connection.signalingState,
      connectionState: connection.connectionState,
      iceConnectionState: connection.iceConnectionState,
    });
    try {
      await peer.setRemoteDescription({ type: "answer", sdp: sdpAnswer });
    } catch (error) {
      const safeError = safeBrowserError(error);
      report("set_remote_description_error", {
        errorName: safeError.name,
        errorMessage: safeError.message,
      });
      throw new RealtimeConnectionError("set_remote_description_failed", safeError.message, safeError.name);
    }
    assertCurrent(options);
    report("remote_description_set", {
      signalingState: peer.signalingState,
      connectionState: peer.connectionState,
      iceConnectionState: peer.iceConnectionState,
    });
    await waitForConnectionReady(channel, connection, options, report);
    assertCurrent(options);
    const sendResponseCreate = () => {
      if (channel?.readyState === "open") channel.send(JSON.stringify({ type: "response.create" }));
    };
    if (options.kickoff !== false) {
      if (channel.readyState === "open") sendResponseCreate();
      else channel.addEventListener("open", sendResponseCreate, { once: true });
    }
    return {
      mute: (muted) => stream.getAudioTracks().forEach((track) => { track.enabled = !muted; }),
      cancelResponse: () => {
        if (channel?.readyState === "open") channel.send(JSON.stringify({ type: "response.cancel" }));
      },
      close: () => {
        if (closed) return;
        closed = true;
        removeTrackListeners.forEach((remove) => remove());
        channel?.close();
        stream.getTracks().forEach((track) => track.stop());
        peer.close();
      },
    };
  } catch (error) {
    closed = true;
    removeTrackListeners.forEach((remove) => remove());
    channel?.close();
    stream.getTracks().forEach((track) => track.stop());
    connection?.close();
    throw error;
  }
}
