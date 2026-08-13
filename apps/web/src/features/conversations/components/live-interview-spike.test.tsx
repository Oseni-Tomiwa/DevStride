import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LiveInterviewSpike } from "./live-interview-spike";

const { connectRealtimeSession, endRealtimeInterview, listMessages, persistRealtimeTranscriptTurn, recordRealtimeAnalyticsEvent } = vi.hoisted(() => ({ connectRealtimeSession: vi.fn(), endRealtimeInterview: vi.fn(), listMessages: vi.fn(), persistRealtimeTranscriptTurn: vi.fn(), recordRealtimeAnalyticsEvent: vi.fn() }));
vi.mock("../api", () => ({ connectRealtimeSession, endRealtimeInterview, listMessages, persistRealtimeTranscriptTurn, recordRealtimeAnalyticsEvent }));
vi.mock("../../../lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

class FakeTrack { enabled = true; stop = vi.fn(); }
let rejectRemoteDescription = false;
let closeDataChannelBeforeOpen = false;
let deferDataChannelOpen = false;
let connectPeerAfterRemote = false;
let failPeerAfterRemote = false;
let answerContentType = "application/sdp";
const ANSWER_SDP = "v=0\r\no=- answer\r\na=ice-ufrag:abc123\r\na=ice-pwd:def456\r\na=fingerprint:sha-256 AA:BB:CC\r\na=setup:active\r\n";
class FakeDataChannel {
  readyState: RTCDataChannelState = "connecting";
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = "closed";
    this.emit("close");
  });
  private listeners = new Map<string, Set<EventListener>>();
  addEventListener = vi.fn((type: string, listener: EventListener) => {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  });
  removeEventListener = vi.fn((type: string, listener: EventListener) => {
    this.listeners.get(type)?.delete(listener);
  });
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  onclosing: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  open() {
    this.readyState = "open";
    this.onopen?.();
    this.emit("open");
  }
  emit(type: string) {
    this.listeners.get(type)?.forEach((listener) => listener(new Event(type)));
    if (type === "close") this.onclose?.();
  }
}
class FakePeerConnection {
  static latest: FakePeerConnection | null = null;
  connectionState = "new";
  iceGatheringState = "complete";
  localDescription = { sdp: "v=0\r\no=- 46117327 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n" };
  addTrack = vi.fn();
  close = vi.fn();
  createOffer = vi.fn(async () => ({ type: "offer", sdp: "v=0\r\no=- 46117327 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n" }));
  setLocalDescription = vi.fn(async () => undefined);
  setRemoteDescription = vi.fn(async () => {
    if (rejectRemoteDescription) throw new Error("invalid answer");
    if (closeDataChannelBeforeOpen) this.dataChannel.close();
    else if (!deferDataChannelOpen) this.dataChannel.open();
    if (connectPeerAfterRemote) this.transition("connected");
    if (failPeerAfterRemote) this.transition("failed");
  });
  dataChannel = new FakeDataChannel();
  createDataChannel = vi.fn(() => this.dataChannel);
  private listeners = new Map<string, Set<EventListener>>();
  addEventListener = vi.fn((type: string, listener: EventListener) => {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  });
  removeEventListener = vi.fn((type: string, listener: EventListener) => {
    this.listeners.get(type)?.delete(listener);
  });
  getReceivers = vi.fn(() => [] as RTCRtpReceiver[]);
  getTransceivers = vi.fn(() => [] as RTCRtpTransceiver[]);
  set onconnectionstatechange(_: unknown) {}
  set ontrack(_: unknown) {}
  constructor() {
    FakePeerConnection.latest = this;
  }
  transition(state: string) {
    this.connectionState = state;
    this.listeners.get("connectionstatechange")?.forEach((listener) => listener(new Event("connectionstatechange")));
  }
}

describe("LiveInterviewSpike", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rejectRemoteDescription = false;
    closeDataChannelBeforeOpen = false;
    deferDataChannelOpen = false;
    connectPeerAfterRemote = false;
    failPeerAfterRemote = false;
    answerContentType = "application/sdp";
    FakePeerConnection.latest = null;
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(async () => { const track = new FakeTrack(); return { getTracks: () => [track], getAudioTracks: () => [track] }; }) } });
    connectRealtimeSession.mockResolvedValue({
      sdp: ANSWER_SDP,
      status: 201,
      contentType: answerContentType,
    });
    endRealtimeInterview.mockResolvedValue({});
    listMessages.mockResolvedValue([]);
    persistRealtimeTranscriptTurn.mockResolvedValue({});
    recordRealtimeAnalyticsEvent.mockResolvedValue({ status: "recorded" });
  });

  it("starts without requesting microphone permission", () => {
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus="apis" />);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Start live interview" })).toBeInTheDocument();
  });

  it("requests microphone, sends the SDP offer through DevStride, and supports mute", async () => {
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus="apis" />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connected"));
    expect(connectRealtimeSession).toHaveBeenCalledTimes(1);
    expect(recordRealtimeAnalyticsEvent).toHaveBeenCalledWith(
      {},
      "conversation-id",
      expect.objectContaining({ event_type: "session_connected" }),
    );
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(connectRealtimeSession).toHaveBeenCalledWith(
      {},
      "conversation-id",
      "v=0\r\no=- 46117327 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n",
    );
    expect(FakePeerConnection.latest?.setRemoteDescription).toHaveBeenCalledWith({ type: "answer", sdp: ANSWER_SDP });
    expect(FakePeerConnection.latest?.dataChannel.send).toHaveBeenCalledWith(JSON.stringify({ type: "response.create" }));
    fireEvent.click(screen.getByRole("button", { name: "Mute microphone" }));
    expect(screen.getByRole("button", { name: "Unmute microphone" })).toBeInTheDocument();
    expect(recordRealtimeAnalyticsEvent).toHaveBeenCalledWith(
      {},
      "conversation-id",
      expect.objectContaining({ event_type: "mute" }),
    );
  });

  it("allows only one negotiation while a connection attempt is in flight", async () => {
    let resolveConnection: ((value: { sdp: string; status: number; contentType: string }) => void) | undefined;
    connectRealtimeSession.mockReturnValueOnce(new Promise((resolve) => { resolveConnection = resolve; }));
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    const startButton = screen.getByRole("button", { name: "Start live interview" });
    fireEvent.click(startButton);
    fireEvent.click(startButton);
    await waitFor(() => expect(connectRealtimeSession).toHaveBeenCalledTimes(1));
    resolveConnection?.({ sdp: "v=0\no=- answer", status: 201, contentType: "application/sdp" });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connected"));
  });

  it("does not send a duplicate kickoff after reconnecting", async () => {
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connected"));
    const firstConnection = FakePeerConnection.latest;
    expect(firstConnection?.dataChannel.send).toHaveBeenCalledTimes(1);
    firstConnection?.transition("disconnected");
    await waitFor(() => expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connected"));
    expect(connectRealtimeSession).toHaveBeenCalledTimes(2);
    expect(FakePeerConnection.latest?.dataChannel.send).not.toHaveBeenCalled();
  });

  it("does not kick off again when persisted interview messages are present", async () => {
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} initialMessages={[{ id: "message-1", role: "assistant", content: "Welcome", created_at: "now" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connected"));
    expect(FakePeerConnection.latest?.dataChannel.send).not.toHaveBeenCalled();
  });

  it("persists only finalized transcript events and renders them once", async () => {
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connected"));
    const channel = FakePeerConnection.latest?.dataChannel;
    channel?.onmessage?.({ data: JSON.stringify({ id: "speech-1", type: "input_audio_transcription.delta", delta: "Hello" }) } as MessageEvent);
    expect(await screen.findByText(/Hello/)).toHaveTextContent("in progress");
    expect(persistRealtimeTranscriptTurn).not.toHaveBeenCalled();
    channel?.onmessage?.({ data: JSON.stringify({ id: "speech-1", type: "input_audio_transcription.completed", transcript: "Hello" }) } as MessageEvent);
    await waitFor(() => expect(persistRealtimeTranscriptTurn).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText(/Hello/)).toHaveLength(1);
    channel?.onmessage?.({ data: JSON.stringify({ id: "speech-1", type: "input_audio_transcription.completed", transcript: "Hello" }) } as MessageEvent);
    expect(persistRealtimeTranscriptTurn).toHaveBeenCalledTimes(1);
  });

  it("cancels active assistant audio on a safe speech-start interruption", async () => {
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connected"));
    const channel = FakePeerConnection.latest?.dataChannel;
    channel?.onmessage?.({ data: JSON.stringify({ id: "assistant-1", type: "response.audio.delta", delta: "Speaking" }) } as MessageEvent);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Assistant speaking"));
    channel?.onmessage?.({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) } as MessageEvent);
    expect(channel?.send).toHaveBeenCalledWith(JSON.stringify({ type: "response.cancel" }));
  });

  it("reports an SDP answer failure without finalizing the interview", async () => {
    rejectRemoteDescription = true;
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("setRemoteDescription failed");
    expect(endRealtimeInterview).not.toHaveBeenCalled();
  });

  it("rejects an empty SDP answer before calling setRemoteDescription", async () => {
    connectRealtimeSession.mockResolvedValueOnce({ sdp: "", status: 201, contentType: "application/sdp" });
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid SDP answer received");
    expect(FakePeerConnection.latest?.setRemoteDescription).not.toHaveBeenCalled();
  });

  it("accepts application/sdp with a charset parameter", async () => {
    answerContentType = "application/sdp; charset=utf-8";
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connected"));
    expect(FakePeerConnection.latest?.setRemoteDescription).toHaveBeenCalledWith({ type: "answer", sdp: ANSWER_SDP });
  });

  it("reports a data channel that closes before opening", async () => {
    closeDataChannelBeforeOpen = true;
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Data channel closed before opening");
    expect(endRealtimeInterview).not.toHaveBeenCalled();
  });

  it("allows connecting to settle into a connected peer before completing setup", async () => {
    deferDataChannelOpen = true;
    connectPeerAfterRemote = true;
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connected"));
    expect(FakePeerConnection.latest?.close).not.toHaveBeenCalled();
    expect(FakePeerConnection.latest?.dataChannel.send).not.toHaveBeenCalled();
    FakePeerConnection.latest?.dataChannel.open();
    await waitFor(() => expect(FakePeerConnection.latest?.dataChannel.send).toHaveBeenCalledWith(JSON.stringify({ type: "response.create" })));
  });

  it("reports peer failure after the remote description is accepted", async () => {
    failPeerAfterRemote = true;
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ICE/peer connection failed");
    expect(endRealtimeInterview).not.toHaveBeenCalled();
  });

  it("does not let an unmounted attempt affect a newer attempt", async () => {
    deferDataChannelOpen = true;
    const first = render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    await waitFor(() => expect(connectRealtimeSession).toHaveBeenCalledTimes(1));
    first.unmount();

    deferDataChannelOpen = false;
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connected"));
    expect(connectRealtimeSession).toHaveBeenCalledTimes(2);
  });

  it("shows a useful microphone permission error", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Microphone access was denied");
  });

  it("does not finalize when connection establishment fails", async () => {
    connectRealtimeSession.mockRejectedValueOnce(new Error("network connection lost"));
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not connect");
    expect(endRealtimeInterview).not.toHaveBeenCalled();
  });

  it("ends and cleans up the connection", async () => {
    const tracks = [new FakeTrack()];
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce({ getTracks: () => tracks, getAudioTracks: () => tracks } as unknown as MediaStream);
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "End interview" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "End interview" }));
    expect(tracks[0].stop).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Ended"));
  });
});
