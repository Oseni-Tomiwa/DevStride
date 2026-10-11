import {
  createGeneralConversationInput,
  createMessageInput,
  isConversation,
  isConversationList,
  isMessage,
  isMessageList,
} from "./contracts";
import { conversationFixture, userMessageFixture } from "./test-fixtures";

describe("conversation contracts", () => {
  it("accepts complete Pydantic conversation responses and lists", () => {
    expect(isConversation(conversationFixture)).toBe(true);
    expect(isConversationList([conversationFixture])).toBe(true);
    expect(isConversation({ ...conversationFixture, id: "00000000-0000-0000-0000-000000000000" })).toBe(true);
  });

  it.each([
    ["invalid UUID", { ...conversationFixture, id: "not-a-uuid" }],
    ["missing nullable field", (({ persona: _persona, ...rest }) => rest)(conversationFixture)],
    ["array metadata", { ...conversationFixture, metadata: [] }],
    ["invalid datetime", { ...conversationFixture, created_at: "yesterday" }],
  ])("rejects %s in conversation responses", (_label, value) => {
    expect(isConversation(value)).toBe(false);
  });

  it("accepts complete Pydantic message responses and lists", () => {
    expect(isMessage(userMessageFixture)).toBe(true);
    expect(isMessageList([userMessageFixture])).toBe(true);
  });

  it.each([
    ["missing provider", (({ provider: _provider, ...rest }) => rest)(userMessageFixture)],
    ["fractional token count", { ...userMessageFixture, input_tokens: 1.5 }],
    ["non-integer latency", { ...userMessageFixture, latency_ms: "slow" }],
    ["invalid metadata", { ...userMessageFixture, metadata: null }],
  ])("rejects %s in message responses", (_label, value) => {
    expect(isMessage(value)).toBe(false);
  });

  it("trims and builds only General conversation creation input", () => {
    expect(createGeneralConversationInput("  API design  ")).toEqual({
      title: "API design",
      mode: "general",
    });
  });

  it.each(["", "   ", "x".repeat(201)])("rejects invalid conversation titles", (title) => {
    expect(() => createGeneralConversationInput(title)).toThrow("title");
  });

  it("counts Unicode code points the same way as Pydantic max_length", () => {
    expect(createGeneralConversationInput("🚀".repeat(200)).title).toBe("🚀".repeat(200));
    expect(() => createGeneralConversationInput("🚀".repeat(201))).toThrow("title");
  });

  it("trims valid message content and enforces the Pydantic limit", () => {
    expect(createMessageInput("  hello  ")).toEqual({ content: "hello" });
    expect(() => createMessageInput(" ")).toThrow("content");
    expect(() => createMessageInput("x".repeat(20_001))).toThrow("content");
  });
});
