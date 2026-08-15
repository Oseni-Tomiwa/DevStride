import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VideoInterview } from "./video-interview";

vi.mock("./live-interview-spike", () => ({
  LiveInterviewSpike: () => <div data-testid="live-interview-engine">Live Interview audio engine</div>,
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
}

describe("VideoInterview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
