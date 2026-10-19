type UserResult = {
  data: { user: { id: string } | null };
  error: { status?: number } | null;
};

type UserAuth = {
  getUser: () => Promise<UserResult>;
};

type SignOutAuth = {
  signOut: (options: { scope: "local" }) => Promise<{ error: unknown }>;
};

export class SessionValidationError extends Error {
  constructor(
    readonly kind: "invalid" | "temporary",
    message: string,
  ) {
    super(message);
    this.name = "SessionValidationError";
  }
}

function isInvalidAuthError(error: { status?: number }): boolean {
  return error.status === 400 || error.status === 401 || error.status === 403;
}

export async function validateAuthenticatedSession(
  auth: UserAuth,
  expectedUserId: string,
): Promise<void> {
  let result: UserResult;
  try {
    result = await auth.getUser();
  } catch {
    throw new SessionValidationError("temporary", "Unable to validate your session.");
  }

  if (result.error) {
    throw new SessionValidationError(
      isInvalidAuthError(result.error) ? "invalid" : "temporary",
      "Unable to validate your session.",
    );
  }
  if (!result.data.user || result.data.user.id !== expectedUserId) {
    throw new SessionValidationError("invalid", "The restored session is invalid.");
  }
}

export async function clearAuthSession(
  auth: SignOutAuth,
  cleanup: () => Promise<void>,
): Promise<unknown | null> {
  let failure: unknown | null = null;
  try {
    const { error } = await auth.signOut({ scope: "local" });
    failure = error;
  } catch (error) {
    failure = error;
  }
  try {
    await cleanup();
  } catch (error) {
    failure ??= error;
  }
  return failure;
}
