import { userMessageFixture } from "./test-fixtures";
import { decodeChatSseFrame, SseParser, SseProtocolError } from "./sse";

const encoder = new TextEncoder();

describe("SseParser", () => {
  it("parses frames split across byte chunks and preserves split UTF-8 characters", () => {
    const parser = new SseParser();
    const bytes = encoder.encode(
      'event: assistant_delta\r\ndata: {"delta":"ship 🚀"}\r\n\r\nevent: done\ndata: {}\n\n',
    );
    const rocketStart = bytes.findIndex((byte) => byte === 0xf0);

    expect(parser.push(bytes.slice(0, rocketStart + 2))).toEqual([]);
    expect(parser.push(bytes.slice(rocketStart + 2))).toEqual([
      { event: "assistant_delta", data: '{"delta":"ship 🚀"}' },
      { event: "done", data: "{}" },
    ]);
    expect(parser.finish()).toEqual([]);
  });

  it("joins multiple data lines and dispatches a final unterminated frame at EOF", () => {
    const parser = new SseParser();
    expect(parser.push(encoder.encode("event: note\ndata: first\ndata: second"))).toEqual([]);
    expect(parser.finish()).toEqual([{ event: "note", data: "first\nsecond" }]);
  });

  it("does not treat a CRLF split between chunks as a blank frame boundary", () => {
    const parser = new SseParser();
    expect(parser.push(encoder.encode("event: assistant_delta\r"))).toEqual([]);
    expect(parser.push(encoder.encode('\ndata: {"delta":"Hi"}\r\n\r'))).toEqual([]);
    expect(parser.push(encoder.encode("\n"))).toEqual([
      { event: "assistant_delta", data: '{"delta":"Hi"}' },
    ]);
  });

  it("ignores comments and unknown SSE fields", () => {
    const parser = new SseParser();
    expect(
      parser.push(encoder.encode(": keepalive\nid: 4\nevent: done\ndata: {}\n\n")),
    ).toEqual([{ event: "done", data: "{}" }]);
  });
});

describe("decodeChatSseFrame", () => {
  it("validates every supported chat event", () => {
    expect(
      decodeChatSseFrame({ event: "user_message", data: JSON.stringify(userMessageFixture) }),
    ).toEqual({ type: "user_message", message: userMessageFixture });
    expect(
      decodeChatSseFrame({ event: "assistant_delta", data: '{"delta":"Hi"}' }),
    ).toEqual({ type: "assistant_delta", delta: "Hi" });
    expect(
      decodeChatSseFrame({
        event: "assistant_complete",
        data: JSON.stringify({ ...userMessageFixture, id: "33333333-3333-4333-8333-333333333333", role: "assistant" }),
      }),
    ).toMatchObject({ type: "assistant_complete" });
    expect(
      decodeChatSseFrame({
        event: "error",
        data: '{"code":"generation_failed","message":"Try again"}',
      }),
    ).toEqual({ type: "error", code: "generation_failed", message: "Try again" });
    expect(decodeChatSseFrame({ event: "done", data: "{}" })).toEqual({ type: "done" });
  });

  it("preserves unknown events for forward-compatible ignoring", () => {
    expect(decodeChatSseFrame({ event: "future_event", data: '{"value":1}' })).toEqual({
      type: "unknown",
      event: "future_event",
    });
  });

  it.each([
    ["invalid JSON", { event: "assistant_delta", data: "{" }],
    ["invalid delta", { event: "assistant_delta", data: '{"delta":4}' }],
    ["invalid message", { event: "assistant_complete", data: '{"id":"bad"}' }],
    ["invalid error", { event: "error", data: '{"code":4,"message":"bad"}' }],
    ["invalid done", { event: "done", data: '{"unexpected":true}' }],
  ])("rejects %s frames", (_label, frame) => {
    expect(() => decodeChatSseFrame(frame)).toThrow(SseProtocolError);
  });
});
