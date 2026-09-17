type AuthRefreshController = {
  startAutoRefresh: () => void;
  stopAutoRefresh: () => void;
};

type AppStateController = {
  currentState: string;
  addEventListener: (
    event: "change",
    listener: (state: string) => void,
  ) => { remove: () => void };
};

export function registerAuthAutoRefresh(
  auth: AuthRefreshController,
  appState: AppStateController,
): () => void {
  const applyState = (state: string) => {
    if (state === "active") {
      auth.startAutoRefresh();
    } else {
      auth.stopAutoRefresh();
    }
  };

  applyState(appState.currentState);
  const subscription = appState.addEventListener("change", applyState);

  return () => {
    subscription.remove();
    auth.stopAutoRefresh();
  };
}
