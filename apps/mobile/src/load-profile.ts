import type { DevStrideApi } from "./api";

export async function loadAuthenticatedProfile(api: DevStrideApi) {
  const user = await api.getCurrentUser();
  const profile = await api.getProfile();
  return { user, profile };
}
