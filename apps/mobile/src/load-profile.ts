import type { DevStrideApi } from "./api";

export async function loadAuthenticatedProfile(
  api: Pick<DevStrideApi, "getCurrentUser" | "getProfile">,
) {
  const user = await api.getCurrentUser();
  const profile = await api.getProfile();
  return { user, profile };
}
