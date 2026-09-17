import { registerAuthAutoRefresh } from "./auth-lifecycle";

describe("registerAuthAutoRefresh", () => {
  it("starts refresh in the foreground, stops it in the background, and unsubscribes", () => {
    const auth = {
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
    };
    let listener: ((state: string) => void) | undefined;
    const remove = jest.fn();
    const appState = {
      currentState: "active",
      addEventListener: jest.fn((_event: "change", nextListener: (state: string) => void) => {
        listener = nextListener;
        return { remove };
      }),
    };

    const unregister = registerAuthAutoRefresh(auth, appState);
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);

    listener?.("background");
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);

    listener?.("active");
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(2);

    unregister();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(2);
  });
});
