import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LiveInterviewSpike } from "./live-interview-spike";

const { startLiveInterviewSpike } = vi.hoisted(() => ({ startLiveInterviewSpike: vi.fn() }));
vi.mock("../api", () => ({ startLiveInterviewSpike }));
vi.mock("../../../lib/supabase/client", () => ({ createClient: () => ({}) }));

class FakeTrack {
  enabled = true;
  stopped = false;
  stop = vi.fn(() => { this.stopped = true; });
}

class FakePeerConnection {
  connectionState = "new";
  iceGatheringState = "complete";
  localDescription: RTCSessionDescriptionInit | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  addTrack = vi.fn();
  addEventListener = vi.fn();
  close = vi.fn(() => { this.connectionState = "closed"; });
  createDataChannel = vi.fn(() => ({ close: vi.fn(), onmessage: null }));
  createOffer = vi.fn(async () => ({ type: "offer" as const, sdp: "v=0\no=- offer" }));
  setLocalDescription = vi.fn(async (description: RTCSessionDescriptionInit) => { this.localDescription = description; });
  setRemoteDescription = vi.fn(async () => undefined);
}

describe("LiveInterviewSpike", () => {
  let tracks: FakeTrack[];

  beforeEach(() => {
    startLiveInterviewSpike.mockReset();
    tracks = [new FakeTrack()];
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getAudioTracks: () => tracks, getTracks: () => tracks })) } });
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
  });

  it("does not request microphone permission on render", () => {
    render(<LiveInterviewSpike conversationId="conversation-1" interviewType="technical" interviewFocus="apis" />);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Start live interview" })).toBeInTheDocument();
  });

  it("shows a safe permission-denied state", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    render(<LiveInterviewSpike conversationId="conversation-1" interviewType="technical" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Microphone access was denied");
    expect(screen.getByRole("status")).toHaveTextContent("failed");
  });

  it("connects after explicit permission and cleans up tracks on end", async () => {
    startLiveInterviewSpike.mockResolvedValueOnce({ session_id: "session-1", sdp_answer: "v=0\\no=- answer", status: "connected" });
    render(<LiveInterviewSpike conversationId="conversation-1" interviewType="behavioral" interviewFocus={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("connected"));
    expect(startLiveInterviewSpike).toHaveBeenCalledWith(expect.anything(), "conversation-1", "v=0\no=- offer");
    fireEvent.click(screen.getByRole("button", { name: "End connection" }));
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("ended");
  });

  it("cleans up tracks on unmount", async () => {
    startLiveInterviewSpike.mockResolvedValueOnce({ session_id: "session-1", sdp_answer: "v=0\\no=- answer", status: "connected" });
    const view = render(<LiveInterviewSpike conversationId="conversation-1" interviewType="technical" interviewFocus="apis" />);
    fireEvent.click(screen.getByRole("button", { name: "Start live interview" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("connected"));
    view.unmount();
    expect(tracks[0].stop).toHaveBeenCalled();
  });
});
