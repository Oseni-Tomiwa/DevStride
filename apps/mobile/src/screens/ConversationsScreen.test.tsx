import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { MobileApiError, type DevStrideApi } from "../api";
import { conversationFixture } from "../conversations/test-fixtures";
import { lightAppColors } from "../theme";
import { ConversationsScreen } from "./ConversationsScreen";

type ConversationsApi = Pick<DevStrideApi, "listConversations" | "createGeneralConversation">;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function createApi(overrides: Partial<ConversationsApi> = {}): ConversationsApi {
  return {
    listConversations: jest.fn().mockResolvedValue([]),
    createGeneralConversation: jest.fn().mockResolvedValue(conversationFixture),
    ...overrides,
  };
}

describe("ConversationsScreen", () => {
  it("shows a loading state while conversations are requested", async () => {
    const pending = deferred<never[]>();
    await render(
      <ConversationsScreen
        api={createApi({ listConversations: jest.fn(() => pending.promise) })}
        colors={lightAppColors}
        onOpenConversation={jest.fn()}
        onUnauthorized={jest.fn()}
      />,
    );
    expect(screen.getByLabelText("Loading conversations")).toBeOnTheScreen();
  });

  it("renders owned conversations and marks non-General modes as read-only", async () => {
    const mentorConversation = {
      ...conversationFixture,
      id: "55555555-5555-4555-8555-555555555555",
      title: "Mentor coaching",
      mode: "mentor",
    };
    await render(
      <ConversationsScreen
        api={createApi({
          listConversations: jest.fn().mockResolvedValue([conversationFixture, mentorConversation]),
        })}
        colors={lightAppColors}
        onOpenConversation={jest.fn()}
        onUnauthorized={jest.fn()}
      />,
    );

    expect(await screen.findByText("API design")).toBeOnTheScreen();
    expect(screen.getByText("Mentor coaching")).toBeOnTheScreen();
    expect(screen.getByText("Read-only on mobile")).toBeOnTheScreen();
  });

  it("shows a useful empty state", async () => {
    await render(
      <ConversationsScreen
        api={createApi()}
        colors={lightAppColors}
        onOpenConversation={jest.fn()}
        onUnauthorized={jest.fn()}
      />,
    );
    expect(await screen.findByText("Start your first conversation")).toBeOnTheScreen();
  });

  it("shows an API failure and retries explicitly", async () => {
    const listConversations = jest
      .fn()
      .mockRejectedValueOnce(new MobileApiError("unreachable", "Offline", null))
      .mockResolvedValueOnce([conversationFixture]);
    await render(
      <ConversationsScreen
        api={createApi({ listConversations })}
        colors={lightAppColors}
        onOpenConversation={jest.fn()}
        onUnauthorized={jest.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("API design")).toBeOnTheScreen();
    expect(listConversations).toHaveBeenCalledTimes(2);
  });

  it("creates only one General conversation while creation is in flight and navigates", async () => {
    const pending = deferred<typeof conversationFixture>();
    const createGeneralConversation = jest.fn(() => pending.promise);
    const onOpenConversation = jest.fn();
    await render(
      <ConversationsScreen
        api={createApi({ createGeneralConversation })}
        colors={lightAppColors}
        onOpenConversation={onOpenConversation}
        onUnauthorized={jest.fn()}
      />,
    );
    await screen.findByText("Start your first conversation");

    const button = screen.getByRole("button", { name: "New conversation" });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(createGeneralConversation).toHaveBeenCalledTimes(1);
    expect(createGeneralConversation).toHaveBeenCalledWith("New conversation");

    pending.resolve(conversationFixture);
    await waitFor(() => expect(onOpenConversation).toHaveBeenCalledWith(conversationFixture.id));
  });

  it("opens an existing conversation", async () => {
    const onOpenConversation = jest.fn();
    await render(
      <ConversationsScreen
        api={createApi({ listConversations: jest.fn().mockResolvedValue([conversationFixture]) })}
        colors={lightAppColors}
        onOpenConversation={onOpenConversation}
        onUnauthorized={jest.fn()}
      />,
    );
    await fireEvent.press(
      await screen.findByRole("button", { name: "Open API design, general conversation" }),
    );
    expect(onOpenConversation).toHaveBeenCalledWith(conversationFixture.id);
  });

  it("delegates 401 handling to the global unauthorized transition", async () => {
    const onUnauthorized = jest.fn();
    await render(
      <ConversationsScreen
        api={createApi({
          listConversations: jest.fn().mockRejectedValue(
            new MobileApiError("unauthorized", "Your session expired. Sign in again.", 401),
          ),
        })}
        colors={lightAppColors}
        onOpenConversation={jest.fn()}
        onUnauthorized={onUnauthorized}
      />,
    );
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
  });
});
