type SessionResult = {
  data: { session: { access_token: string; expires_at?: number } | null };
  error: unknown;
};

type SessionAuth = {
  getSession: () => Promise<SessionResult>;
  refreshSession: () => Promise<SessionResult>;
};

export async function getUsableAccessToken(
  auth: SessionAuth,
  nowSeconds = Math.floor(Date.now() / 1_000),
): Promise<string | null> {
  let current: SessionResult;
  try {
    current = await auth.getSession();
  } catch {
    return null;
  }
  if (current.error || !current.data.session) {
    return null;
  }

  const { access_token: accessToken, expires_at: expiresAt } = current.data.session;
  if (!expiresAt || expiresAt > nowSeconds + 30) {
    return accessToken;
  }

  let refreshed: SessionResult;
  try {
    refreshed = await auth.refreshSession();
  } catch {
    return null;
  }
  if (refreshed.error || !refreshed.data.session) {
    return null;
  }
  return refreshed.data.session.access_token;
}
