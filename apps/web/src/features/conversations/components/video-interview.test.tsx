import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VideoInterview } from "./video-interview";

const { replaceMicrophoneTrack } = vi.hoisted(() => ({ replaceMicrophoneTrack: vi.fn(async () => undefined) }));
vi.mock("./live-interview-spike", () => ({
  LiveInterviewSpike: ({ onConnectionChange }: { onConnectionChange?: (connection: unknown) => void }) => {
    onConnectionChange?.({ replaceMicrophoneTrack });
    return <div data-testid="live-interview-engine">Live Interview audio engine</div>;
  },
}));

class FakeTrack extends EventTarget {
  kind: "audio" | "video";
  enabled = true;
  readyState = "live";
  stop = vi.fn(() => {
    this.readyState = "ended";
    this.dispatchEvent(new Event("ended"));
  });
  constructor(kind: "audio" | "video") {
    super();
    this.kind = kind;
  }
}

class FakeStream {
  tracks: FakeTrack[];
  constructor(includeVideo = true) {
    this.tracks = [new FakeTrack("audio")];
    if (includeVideo) this.tracks.push(new FakeTrack("video"));
  }
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter((track) => track.kind === "audio"); }
  getVideoTracks() { return this.tracks.filter((track) => track.kind === "video"); }
  addTrack(track: FakeTrack) { this.tracks.push(track); }
  removeTrack(track: FakeTrack) { this.tracks = this.tracks.filter((candidate) => candidate !== track); }
}

describe("VideoInterview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replaceMicrophoneTrack.mockResolvedValue(undefined);
  });

  it("requests camera and microphone only after explicit start, then attaches a muted inline preview", async () => {
    const getUserMedia = vi.fn(async () => new FakeStream() as unknown as MediaStream);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    render(<VideoInterview conversationId="conversation-id" />);
    expect(getUserMedia).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Start Video Interview" }));
    await waitFor(() => expect(screen.getByTestId("live-interview-engine")).toBeInTheDocument());
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
    const preview = screen.getByLabelText("Your local camera preview") as HTMLVideoElement;
    expect(preview.muted).toBe(true);
    expect(preview.playsInline).toBe(true);
  });

  it("offers audio-only fallback when the camera is unavailable", async () => {
    const getUserMedia = vi.fn()
      .mockRejectedValueOnce(new DOMException("camera unavailable", "NotFoundError"))
      .mockResolvedValueOnce(new FakeStream(false) as unknown as MediaStream);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    render(<VideoInterview conversationId="conversation-id" />);

    fireEvent.click(screen.getByRole("button", { name: "Start Video Interview" }));
    await waitFor(() => expect(screen.getByText(/Camera is off/)).toBeInTheDocument());
    expect(getUserMedia).toHaveBeenNthCalledWith(2, { audio: true });
    expect(screen.getByRole("button", { name: "Turn camera on" })).toBeInTheDocument();
  });

  it("disables and re-enables the local camera without affecting the audio engine", async () => {
    const stream = new FakeStream() as unknown as MediaStream;
    const getUserMedia = vi.fn(async () => stream);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    render(<VideoInterview conversationId="conversation-id" />);
    fireEvent.click(screen.getByRole("button", { name: "Start Video Interview" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Turn camera off" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Turn camera off" }));
    expect(screen.getByRole("status")).toHaveTextContent("Camera off");
    fireEvent.click(screen.getByRole("button", { name: "Turn camera on" }));
    expect(screen.getByRole("status")).toHaveTextContent("Camera on");
    expect(screen.getByTestId("live-interview-engine")).toBeInTheDocument();
  });

  it("enumerates devices after permission and replaces the selected camera without stopping audio", async () => {
    const initial = new FakeStream();
    const oldCamera = initial.getVideoTracks()[0];
    const replacement = new FakeStream(true);
    const getUserMedia = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(replacement);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia, enumerateDevices: vi.fn(async () => [
      { kind: "videoinput", deviceId: "camera-a", label: "Front camera" },
      { kind: "videoinput", deviceId: "camera-b", label: "Rear camera" },
      { kind: "audioinput", deviceId: "mic-a", label: "Built-in microphone" },
    ]) } });
    render(<VideoInterview conversationId="conversation-id" />);
    fireEvent.click(screen.getByRole("button", { name: "Start Video Interview" }));
    await waitFor(() => expect(screen.getByLabelText("Camera")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Camera"), { target: { value: "camera-b" } });
    await waitFor(() => expect(getUserMedia).toHaveBeenNthCalledWith(2, { video: { deviceId: { exact: "camera-b" } } }));
    expect(initial.getAudioTracks()[0].readyState).toBe("live");
    expect(oldCamera.readyState).toBe("ended");
    expect(screen.getByTestId("live-interview-engine")).toBeInTheDocument();
  });

  it("replaces the active microphone through the realtime sender and stops the old track after success", async () => {
    const initial = new FakeStream();
    const oldMicrophone = initial.getAudioTracks()[0];
    const replacement = new FakeStream(false);
    const getUserMedia = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(replacement);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia, enumerateDevices: vi.fn(async () => [{ kind: "audioinput", deviceId: "mic-a", label: "Built-in microphone" }, { kind: "audioinput", deviceId: "mic-b", label: "USB microphone" }]) } });
    render(<VideoInterview conversationId="conversation-id" />);
    fireEvent.click(screen.getByRole("button", { name: "Start Video Interview" }));
    await waitFor(() => expect(screen.getByLabelText("Microphone")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Microphone"), { target: { value: "mic-b" } });
    await waitFor(() => expect(replaceMicrophoneTrack).toHaveBeenCalledWith(replacement.getAudioTracks()[0]));
    expect(oldMicrophone.readyState).toBe("ended");
    expect(screen.getByTestId("live-interview-engine")).toBeInTheDocument();
  });

  it("keeps the current microphone when replacement fails", async () => {
    const initial = new FakeStream();
    const replacement = new FakeStream(false);
    replaceMicrophoneTrack.mockRejectedValueOnce(new Error("replace failed"));
    const getUserMedia = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(replacement);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia, enumerateDevices: vi.fn(async () => [{ kind: "audioinput", deviceId: "mic-a", label: "Built-in microphone" }, { kind: "audioinput", deviceId: "mic-b", label: "USB microphone" }]) } });
    render(<VideoInterview conversationId="conversation-id" />);
    fireEvent.click(screen.getByRole("button", { name: "Start Video Interview" }));
    await waitFor(() => expect(screen.getByLabelText("Microphone")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Microphone"), { target: { value: "mic-b" } });
    await waitFor(() => expect(replaceMicrophoneTrack).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Microphone switching failed"));
    expect(initial.getAudioTracks()[0].readyState).toBe("live");
  });

  it("cleans up camera and microphone tracks on unmount", async () => {
    const stream = new FakeStream();
    const getUserMedia = vi.fn(async () => stream);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    const view = render(<VideoInterview conversationId="conversation-id" />);
    fireEvent.click(screen.getByRole("button", { name: "Start Video Interview" }));
    await waitFor(() => expect(screen.getByTestId("live-interview-engine")).toBeInTheDocument());
    view.unmount();
    expect(stream.getTracks().every((track) => track.readyState === "ended")).toBe(true);
  });
});
