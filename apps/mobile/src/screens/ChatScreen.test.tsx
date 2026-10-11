import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { MobileApiError, type DevStrideApi } from "../api";
import { conversationFixture, userMessageFixture } from "../conversations/test-fixtures";
import { lightAppColors } from "../theme";
import { ChatScreen } from "./ChatScreen";

type ChatApi = Pick<
  DevStrideApi,
  "getConversation" | "listMessages" | "streamConversation" | "retryMessage"
>;

const assistantMessage = {
  ...userMessageFixture,
  id: "33333333-3333-4333-8333-333333333333",
  role: "assistant",
  content: "Use a versioned URL.",
  provider: "openai",
  model: "gpt-test",
  input_tokens: 20,
  output_tokens: 6,
  latency_ms: 150,
  created_at: "2026-09-18T08:01:02Z",
};

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function controlledStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(nextController) {
      controller = nextController;
    },
  });
  return {
    response: new Response(body, { headers: { "Content-Type": "text/event-stream" } }),
    send(event: string, data: unknown) {
      controller.enqueue(new TextEncoder().encode(frame(event, data)));
    },
    close() {
      controller.close();
    },
  };
}

function completeStream(events: [string, unknown][]): Response {
  const encoded = new TextEncoder().encode(events.map(([event, data]) => frame(event, data)).join(""));
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

function createApi(overrides: Partial<ChatApi> = {}): ChatApi {
  return {
    getConversation: jest.fn().mockResolvedValue(conversationFixture),
    listMessages: jest.fn().mockResolvedValue([]),
    streamConversation: jest.fn(),
    retryMessage: jest.fn(),
    ...overrides,
  };
}

async function renderChat(api: ChatApi, props: { onUnauthorized?: () => void; onBack?: () => void } = {}) {
  return render(
    <ChatScreen
      api={api}
      colors={lightAppColors}
      conversationId={conversationFixture.id}
      onBack={props.onBack ?? jest.fn()}
      onUnauthorized={props.onUnauthorized ?? jest.fn()}
    />,
  );
}

async function enterMessage(content = "How should I version this API?") {
  await fireEvent.changeText(screen.getByLabelText("Message"), content);
}

describe("ChatScreen", () => {
  it("renders chronological history and an empty state", async () => {
    const { unmount } = await renderChat(
      createApi({ listMessages: jest.fn().mockResolvedValue([userMessageFixture, assistantMessage]) }),
    );
    expect(await screen.findByText(userMessageFixture.content)).toBeOnTheScreen();
    expect(screen.getByText(assistantMessage.content)).toBeOnTheScreen();
    expect(screen.getByText("You")).toBeOnTheScreen();
    expect(screen.getByText("DevStride")).toBeOnTheScreen();
    await unmount();

    await renderChat(createApi());
    expect(await screen.findByText("No messages yet")).toBeOnTheScreen();
  });

  it("disables blank and over-limit messages using Unicode code-point length", async () => {
    await renderChat(createApi());
    await screen.findByText("No messages yet");
    expect(screen.getByText("Message")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    await enterMessage("🚀".repeat(20_000));
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
    await enterMessage("🚀".repeat(20_001));
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/20,000/);
  });

  it("streams incremental text and treats assistant_complete as authoritative", async () => {
    const stream = controlledStream();
    const streamConversation = jest.fn().mockResolvedValue(stream.response);
    await renderChat(createApi({ streamConversation }));
    await screen.findByText("No messages yet");
    await enterMessage();
    await fireEvent.press(screen.getByRole("button", { name: "Send message" }));

    expect(streamConversation).toHaveBeenCalledWith(
      conversationFixture.id,
      userMessageFixture.content,
      expect.any(AbortSignal),
    );
    stream.send("user_message", userMessageFixture);
    stream.send("assistant_delta", { delta: "Use a " });
    await waitFor(() => expect(screen.getByText("Use a ")).toBeOnTheScreen());
    stream.send("assistant_delta", { delta: "versioned URL." });
    await waitFor(() => expect(screen.getByText("Use a versioned URL.")).toBeOnTheScreen());
    stream.send("assistant_complete", assistantMessage);
    stream.send("done", {});
    stream.close();
    await waitFor(() => expect(screen.getByText(assistantMessage.content)).toBeOnTheScreen());
    expect(screen.queryByRole("button", { name: "Retry response" })).not.toBeOnTheScreen();
  });

  it("stops with AbortController, removes the draft, and reconciles before exposing Retry", async () => {
    const stream = controlledStream();
    let signal: AbortSignal | undefined;
    const streamConversation = jest.fn(
      async (_conversationId: string, _content: string, nextSignal?: AbortSignal) => {
        signal = nextSignal;
        return stream.response;
      },
    );
    const listMessages = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([userMessageFixture]);
    await renderChat(createApi({ listMessages, streamConversation }));
    await screen.findByText("No messages yet");
    await enterMessage();
    await fireEvent.press(screen.getByRole("button", { name: "Send message" }));
    stream.send("user_message", userMessageFixture);
    stream.send("assistant_delta", { delta: "Partial" });
    await waitFor(() => expect(screen.getByText("Partial")).toBeOnTheScreen());
    await fireEvent.press(screen.getByRole("button", { name: "Stop response" }));

    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByText("Partial")).not.toBeOnTheScreen());
    expect(await screen.findByRole("button", { name: "Retry response" })).toBeOnTheScreen();
    expect(listMessages).toHaveBeenCalledTimes(2);
  });

  it("withholds Retry when cancellation reconciliation is offline and lets the user check again", async () => {
    const stream = controlledStream();
    const listMessages = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new MobileApiError("unreachable", "Offline", null))
      .mockResolvedValueOnce([userMessageFixture]);
    await renderChat(
      createApi({
        listMessages,
        streamConversation: jest.fn().mockResolvedValue(stream.response),
      }),
    );
    await screen.findByText("No messages yet");
    await enterMessage();
    await fireEvent.press(screen.getByRole("button", { name: "Send message" }));
    stream.send("user_message", userMessageFixture);
    await fireEvent.press(screen.getByRole("button", { name: "Stop response" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/confirm the saved conversation/);
    expect(screen.queryByRole("button", { name: "Retry response" })).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Check saved messages" }));
    expect(await screen.findByRole("button", { name: "Retry response" })).toBeOnTheScreen();
  });

  it("uses the dedicated retry endpoint without creating another user message", async () => {
    const failed = completeStream([
      ["user_message", userMessageFixture],
      ["error", { code: "generation_failed", message: "Try again" }],
      ["done", {}],
    ]);
    const retried = completeStream([
      ["assistant_delta", { delta: assistantMessage.content }],
      ["assistant_complete", assistantMessage],
      ["done", {}],
    ]);
    const streamConversation = jest.fn().mockResolvedValue(failed);
    const retryMessage = jest.fn().mockResolvedValue(retried);
    await renderChat(createApi({ retryMessage, streamConversation }));
    await screen.findByText("No messages yet");
    await enterMessage();
    await fireEvent.press(screen.getByRole("button", { name: "Send message" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Retry response" }));

    await waitFor(() => expect(screen.getByText(assistantMessage.content)).toBeOnTheScreen());
    expect(retryMessage).toHaveBeenCalledWith(
      conversationFixture.id,
      userMessageFixture.id,
      expect.any(AbortSignal),
    );
    expect(streamConversation).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["done", [["user_message", userMessageFixture], ["done", {}]] as [string, unknown][]],
    ["EOF", [["user_message", userMessageFixture]] as [string, unknown][]],
  ])("reconciles premature %s before offering Retry", async (_label, events) => {
    const listMessages = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([userMessageFixture]);
    await renderChat(
      createApi({
        listMessages,
        streamConversation: jest.fn().mockResolvedValue(
          completeStream(events),
        ),
      }),
    );
    await screen.findByText("No messages yet");
    await enterMessage();
    await fireEvent.press(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("button", { name: "Retry response" })).toBeOnTheScreen();
    expect(listMessages).toHaveBeenCalledTimes(2);
  });

  it("shows explicit server errors without retaining a temporary draft", async () => {
    await renderChat(
      createApi({
        streamConversation: jest.fn().mockResolvedValue(
          completeStream([
            ["user_message", userMessageFixture],
            ["assistant_delta", { delta: "Partial" }],
            ["error", { code: "generation_failed", message: "Assistant generation failed." }],
            ["done", {}],
          ]),
        ),
      }),
    );
    await screen.findByText("No messages yet");
    await enterMessage();
    await fireEvent.press(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Assistant generation failed.");
    expect(screen.queryByText("Partial")).not.toBeOnTheScreen();
  });

  it("shows non-General history read-only with a DevStride Web notice", async () => {
    await renderChat(
      createApi({
        getConversation: jest.fn().mockResolvedValue({ ...conversationFixture, mode: "mentor" }),
        listMessages: jest.fn().mockResolvedValue([assistantMessage]),
      }),
    );
    expect(await screen.findByText(assistantMessage.content)).toBeOnTheScreen();
    expect(screen.getByText(/not yet available on mobile/i)).toBeOnTheScreen();
    expect(screen.getByText(/DevStride Web/i)).toBeOnTheScreen();
    expect(screen.queryByLabelText("Message")).not.toBeOnTheScreen();
  });

  it("handles 401 globally and 404 with safe navigation back", async () => {
    const onUnauthorized = jest.fn();
    await renderChat(
      createApi({
        getConversation: jest.fn().mockRejectedValue(
          new MobileApiError("unauthorized", "Your session expired. Sign in again.", 401),
        ),
      }),
      { onUnauthorized },
    );
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));

    const onBack = jest.fn();
    await renderChat(
      createApi({
        getConversation: jest.fn().mockRejectedValue(
          new MobileApiError("not_found", "Conversation unavailable.", 404),
        ),
      }),
      { onBack },
    );
    expect(await screen.findByText("Conversation unavailable")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Back to conversations" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("reconciles 409 and surfaces Retry-After timing for 429", async () => {
    const listMessages = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([userMessageFixture]);
    await renderChat(
      createApi({
        listMessages,
        streamConversation: jest.fn().mockRejectedValue(
          new MobileApiError("conflict", "Conflict", 409),
        ),
      }),
    );
    await screen.findByText("No messages yet");
    await enterMessage();
    await fireEvent.press(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("button", { name: "Retry response" })).toBeOnTheScreen();

    await renderChat(
      createApi({
        streamConversation: jest.fn().mockRejectedValue(
          new MobileApiError("rate_limited", "Too many requests.", 429, 12),
        ),
      }),
    );
    await screen.findByText("No messages yet");
    await enterMessage();
    await fireEvent.press(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/12 seconds/);
  });

  it("aborts an active stream when the screen is removed", async () => {
    const stream = controlledStream();
    let signal: AbortSignal | undefined;
    const streamConversation = jest.fn(
      async (_conversationId: string, _content: string, nextSignal?: AbortSignal) => {
        signal = nextSignal;
        return stream.response;
      },
    );
    const view = await renderChat(createApi({ streamConversation }));
    await screen.findByText("No messages yet");
    await enterMessage();
    await fireEvent.press(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(signal).toBeDefined());
    await view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});
