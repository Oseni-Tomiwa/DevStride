import { describe, expect, it } from "vitest";

import { parseLiveTranscriptEvent } from "./realtime-client";

describe("parseLiveTranscriptEvent", () => {
  it("distinguishes final user and assistant transcript events", () => {
    expect(parseLiveTranscriptEvent({ id: "user-event", type: "conversation.item.input_audio_transcription.completed", transcript: "hello" })).toEqual({ eventId: "user-event", speaker: "user", text: "hello", final: true });
    expect(parseLiveTranscriptEvent({ id: "assistant-event", type: "response.audio_transcript.delta", delta: "Hi" })).toEqual({ eventId: "assistant-event", speaker: "assistant", text: "Hi", final: false });
  });

  it("ignores unrelated provider events", () => {
    expect(parseLiveTranscriptEvent({ type: "response.done" })).toBeNull();
  });
});
