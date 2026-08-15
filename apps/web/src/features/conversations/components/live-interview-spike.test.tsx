import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LiveInterviewSpike } from "./live-interview-spike";
import { ApiError } from "../../../lib/api/client";

const { connectRealtimeSession, endLiveMentor, endRealtimeInterview, listMessages, persistRealtimeTranscriptTurn, recordRealtimeAnalyticsEvent } = vi.hoisted(() => ({ connectRealtimeSession: vi.fn(), endLiveMentor: vi.fn(), endRealtimeInterview: vi.fn(), listMessages: vi.fn(), persistRealtimeTranscriptTurn: vi.fn(), recordRealtimeAnalyticsEvent: vi.fn() }));
vi.mock("../api", () => ({ connectRealtimeSession, endLiveMentor, endRealtimeInterview, listMessages, persistRealtimeTranscriptTurn, recordRealtimeAnalyticsEvent }));
vi.mock("../../../lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

class FakeTrack {
  static latest: FakeTrack | null = null;
  enabled = true;
  readyState = "live";
  stop = vi.fn(() => {
    this.readyState = "ended";
    this.listeners.get("ended")?.forEach((listener) => listener(new Event("ended")));
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
  constructor() {
    FakeTrack.latest = this;
  }
  end() {
    this.readyState = "ended";
    this.listeners.get("ended")?.forEach((listener) => listener(new Event("ended")));
  }
}
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
    FakeTrack.latest = null;
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(async () => { const track = new FakeTrack(); return { getTracks: () => [track], getAudioTracks: () => [track] }; }) } });
    connectRealtimeSession.mockResolvedValue({
      sdp: ANSWER_SDP,
      status: 201,
      contentType: answerContentType,
    });
    endRealtimeInterview.mockResolvedValue({});
    endLiveMentor.mockResolvedValue({ status: "ended", summary_id: "summary-id" });
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

  it("supports Live Mentor without interview analytics or wording", async () => {
    render(<LiveInterviewSpike conversationId="conversation-id" practiceMode="mentor" />);
    fireEvent.click(screen.getByRole("button", { name: "Start Live Mentor" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connected"));
    expect(screen.getByRole("heading", { name: "Live Mentor" })).toBeInTheDocument();
    expect(screen.queryByText(/Interviewer/)).not.toBeInTheDocument();
    expect(recordRealtimeAnalyticsEvent).not.toHaveBeenCalled();
    expect(FakePeerConnection.latest?.dataChannel.send).toHaveBeenCalledWith(JSON.stringify({ type: "response.create" }));
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

  it("waits for meaningful finalized speech before cancelling an active response", async () => {
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connected"));
    const channel = FakePeerConnection.latest?.dataChannel;
    channel?.onmessage?.({ data: JSON.stringify({ id: "assistant-1", type: "response.audio.delta", delta: "Speaking" }) } as MessageEvent);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Assistant speaking"));
    channel?.onmessage?.({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) } as MessageEvent);
    expect(channel?.send).not.toHaveBeenCalledWith(JSON.stringify({ type: "response.cancel" }));
    channel?.onmessage?.({ data: JSON.stringify({ id: "user-1", type: "input_audio_transcription.completed", transcript: "I want to clarify the trade-off." }) } as MessageEvent);
    expect(channel?.send).toHaveBeenCalledWith(JSON.stringify({ type: "response.cancel" }));
    expect(channel?.send).toHaveBeenCalledWith(JSON.stringify({ type: "response.create" }));
  });

  it("does not persist or advance on a meaningless finalized turn", async () => {
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connected"));
    const channel = FakePeerConnection.latest?.dataChannel;
    channel?.onmessage?.({ data: JSON.stringify({ id: "assistant-1", type: "response.audio.delta", delta: "Speaking" }) } as MessageEvent);
    channel?.onmessage?.({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) } as MessageEvent);
    channel?.onmessage?.({ data: JSON.stringify({ id: "noise-1", type: "input_audio_transcription.completed", transcript: "[silence]" }) } as MessageEvent);
    expect(persistRealtimeTranscriptTurn).not.toHaveBeenCalled();
    expect(channel?.send).not.toHaveBeenCalledWith(JSON.stringify({ type: "response.cancel" }));
    expect(channel?.send).toHaveBeenCalledTimes(1);
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

  it("keeps processing separate from speaking and completes one explicit response", async () => {
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connected"));
    const channel = FakePeerConnection.latest?.dataChannel;
    channel?.onmessage?.({ data: JSON.stringify({ id: "kickoff-done", type: "response.done" }) } as MessageEvent);
    channel?.send.mockClear();

    channel?.onmessage?.({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) } as MessageEvent);
    channel?.onmessage?.({ data: JSON.stringify({ id: "candidate-1", type: "input_audio_transcription.completed", transcript: "Explain the trade-off." }) } as MessageEvent);
    expect(channel?.send).toHaveBeenCalledTimes(1);
    expect(channel?.send).toHaveBeenCalledWith(JSON.stringify({ type: "response.create" }));

    channel?.onmessage?.({ data: JSON.stringify({ id: "response-1", type: "response.created" }) } as MessageEvent);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Processing"));
    channel?.onmessage?.({ data: JSON.stringify({ id: "caption-1", type: "response.audio_transcript.delta", delta: "Here is the answer." }) } as MessageEvent);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Processing"));
    expect(screen.queryByText("Assistant speaking")).not.toBeInTheDocument();
    channel?.onmessage?.({ data: JSON.stringify({ id: "audio-1", type: "response.audio.delta", delta: "audio" }) } as MessageEvent);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Assistant speaking"));
    channel?.onmessage?.({ data: JSON.stringify({ id: "response-1", type: "response.done" }) } as MessageEvent);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Listening"));
  });

  it("clears pending state when the provider returns an error", async () => {
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connected"));
    const channel = FakePeerConnection.latest?.dataChannel;
    channel?.onmessage?.({ data: JSON.stringify({ id: "response-1", type: "response.created" }) } as MessageEvent);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Processing"));
    channel?.onmessage?.({ data: JSON.stringify({ type: "error", error: { type: "invalid_request_error" } }) } as MessageEvent);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Listening"));
    expect(screen.getByRole("alert")).toHaveTextContent("could not respond");
  });

  it("recovers when a response is created but produces no output", async () => {
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connected"));
    const channel = FakePeerConnection.latest?.dataChannel;
    vi.useFakeTimers();
    try {
      channel?.onmessage?.({ data: JSON.stringify({ id: "response-1", type: "response.created" }) } as MessageEvent);
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByRole("status")).toHaveTextContent("Processing");
      await act(async () => { vi.advanceTimersByTime(15_000); });
      expect(screen.getByRole("status")).toHaveTextContent("Listening");
      expect(screen.getByRole("alert")).toHaveTextContent("did not respond");
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows later interview turns and one Live Mentor follow-up at a time", async () => {
    const first = render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connected"));
    const channel = FakePeerConnection.latest?.dataChannel;
    channel?.send.mockClear();
    channel?.onmessage?.({ data: JSON.stringify({ id: "candidate-1", type: "input_audio_transcription.completed", transcript: "First answer" }) } as MessageEvent);
    expect(channel?.send).toHaveBeenCalledTimes(1);
    channel?.onmessage?.({ data: JSON.stringify({ id: "response-1", type: "response.done" }) } as MessageEvent);
    channel?.onmessage?.({ data: JSON.stringify({ id: "candidate-2", type: "input_audio_transcription.completed", transcript: "Second answer" }) } as MessageEvent);
    expect(channel?.send).toHaveBeenCalledTimes(2);

    first.unmount();
    render(<LiveInterviewSpike conversationId="mentor-conversation-id" practiceMode="mentor" />);
    fireEvent.click(screen.getByRole("button", { name: "Start Live Mentor" }));
    await waitFor(() => expect(screen.getAllByRole("status").some((status) => status.textContent === "Connected")).toBe(true));
    const mentorChannel = FakePeerConnection.latest?.dataChannel;
    mentorChannel?.send.mockClear();
    mentorChannel?.onmessage?.({ data: JSON.stringify({ id: "mentor-candidate-1", type: "input_audio_transcription.completed", transcript: "Help me practice this topic" }) } as MessageEvent);
    expect(mentorChannel?.send).toHaveBeenCalledTimes(1);
    expect(mentorChannel?.send).toHaveBeenCalledWith(JSON.stringify({ type: "response.create" }));
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

  it("reports microphone loss without finalizing and allows a retry", async () => {
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connected"));
    FakeTrack.latest?.end();
    expect(await screen.findByRole("alert")).toHaveTextContent("microphone became unavailable");
    expect(endRealtimeInterview).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("stops reconnecting after an authentication failure", async () => {
    render(<LiveInterviewSpike conversationId="conversation-id" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connected"));
    connectRealtimeSession.mockRejectedValueOnce(new ApiError("Authentication required.", 401));
    FakePeerConnection.latest?.transition("disconnected");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Reconnecting"));
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(await screen.findByRole("alert")).toHaveTextContent("Authentication is required");
    expect(connectRealtimeSession).toHaveBeenCalledTimes(2);
    expect(endRealtimeInterview).not.toHaveBeenCalled();
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
