import type { SessionSnapshot } from "../types";
import { classifyAuthFailure, type SafeAuthFailure } from "./auth-errors";
import {
  AUTH_CONFIRM_REDIRECT_URL,
  AUTH_RECOVERY_REDIRECT_URL,
  type ParsedAuthLink,
} from "./auth-links";

type AuthErrorResult = { error: unknown | null };

export type MobileAuthClient = {
  exchangeCodeForSession: (
    code: string,
    options?: { flowId?: string },
  ) => Promise<{ data: { session: SessionSnapshot | null }; error: unknown | null }>;
  getUser: () => Promise<{ data: { user: { id: string } | null }; error: unknown | null }>;
  resend: (credentials: {
    type: "signup";
    email: string;
    options: { emailRedirectTo: string };
  }) => Promise<{ data?: { session?: SessionSnapshot | null }; error: unknown | null }>;
  resetPasswordForEmail: (
    email: string,
    options: { redirectTo: string },
  ) => Promise<AuthErrorResult>;
  signInWithPassword: (credentials: {
    email: string;
    password: string;
  }) => Promise<AuthErrorResult>;
  signUp: (credentials: {
    email: string;
    password: string;
    options: { emailRedirectTo: string };
  }) => Promise<{
    data: { session: SessionSnapshot | null; user: { id: string } | null };
    error: unknown | null;
  }>;
  updateUser: (attributes: { password: string }) => Promise<AuthErrorResult>;
};

export type AuthActionResult = { ok: true } | { ok: false; error: SafeAuthFailure };

function statusOf(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function genericEmailResponse(error: unknown): boolean {
  const status = statusOf(error);
  return status === 400 || status === 404 || status === 422;
}

export async function signInWithEmail(
  auth: MobileAuthClient,
  email: string,
  password: string,
): Promise<AuthActionResult> {
  try {
    const { error } = await auth.signInWithPassword({ email, password });
    return error
      ? { ok: false, error: classifyAuthFailure(error, "sign_in") }
      : { ok: true };
  } catch (error) {
    return { ok: false, error: classifyAuthFailure(error, "sign_in") };
  }
}

export async function signUpWithEmail(
  auth: MobileAuthClient,
  email: string,
  password: string,
): Promise<
  | { ok: true; outcome: "authenticated"; session: SessionSnapshot }
  | { ok: true; outcome: "verification_pending" }
  | { ok: false; error: SafeAuthFailure }
> {
  try {
    const { data, error } = await auth.signUp({
      email,
      password,
      options: { emailRedirectTo: AUTH_CONFIRM_REDIRECT_URL },
    });
    if (error) {
      const failure = classifyAuthFailure(error, "sign_up");
      return failure.kind === "generic_signup"
        ? { ok: true, outcome: "verification_pending" }
        : { ok: false, error: failure };
    }
    return data.session
      ? { ok: true, outcome: "authenticated", session: data.session }
      : { ok: true, outcome: "verification_pending" };
  } catch (error) {
    return { ok: false, error: classifyAuthFailure(error, "sign_up") };
  }
}

export async function resendVerification(
  auth: MobileAuthClient,
  email: string,
): Promise<AuthActionResult> {
  try {
    const { error } = await auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: AUTH_CONFIRM_REDIRECT_URL },
    });
    if (!error || genericEmailResponse(error)) return { ok: true };
    return { ok: false, error: classifyAuthFailure(error, "resend") };
  } catch (error) {
    return { ok: false, error: classifyAuthFailure(error, "resend") };
  }
}

export async function requestPasswordReset(
  auth: MobileAuthClient,
  email: string,
): Promise<AuthActionResult> {
  try {
    const { error } = await auth.resetPasswordForEmail(email, {
      redirectTo: AUTH_RECOVERY_REDIRECT_URL,
    });
    if (!error || genericEmailResponse(error)) return { ok: true };
    return { ok: false, error: classifyAuthFailure(error, "recovery") };
  } catch (error) {
    return { ok: false, error: classifyAuthFailure(error, "recovery") };
  }
}

export async function exchangeParsedAuthLink(
  auth: MobileAuthClient,
  link: ParsedAuthLink,
): Promise<
  { ok: true; session: SessionSnapshot } | { ok: false; error: SafeAuthFailure }
> {
  try {
    const options = link.flowId ? { flowId: link.flowId } : undefined;
    const { data, error } = await auth.exchangeCodeForSession(link.code, options);
    if (error || !data.session) {
      return { ok: false, error: classifyAuthFailure(error, "exchange") };
    }
    const identity = await auth.getUser();
    if (
      identity.error ||
      !identity.data.user ||
      identity.data.user.id !== data.session.user.id
    ) {
      return {
        ok: false,
        error: classifyAuthFailure(identity.error ?? { code: "invalid_credentials" }, "exchange"),
      };
    }
    return { ok: true, session: data.session };
  } catch (error) {
    return { ok: false, error: classifyAuthFailure(error, "exchange") };
  }
}

export async function updateRecoveryPassword(
  auth: MobileAuthClient,
  password: string,
): Promise<AuthActionResult> {
  try {
    const { error } = await auth.updateUser({ password });
    return error
      ? { ok: false, error: classifyAuthFailure(error, "recovery") }
      : { ok: true };
  } catch (error) {
    return { ok: false, error: classifyAuthFailure(error, "recovery") };
  }
}
