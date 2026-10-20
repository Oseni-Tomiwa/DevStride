import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { lightAppColors } from "../../theme";
import type { SessionSnapshot } from "../../types";
import { SignInScreen } from "../../components/SignInScreen";
import { ForgotPasswordScreen } from "./ForgotPasswordScreen";
import { ResetPasswordScreen } from "./ResetPasswordScreen";
import { SignUpScreen } from "./SignUpScreen";
import { VerificationPendingScreen } from "./VerificationPendingScreen";

const session: SessionSnapshot = { access_token: "token", user: { id: "user-id" } };

function createAuth() {
  return {
    exchangeCodeForSession: jest.fn(),
    getUser: jest.fn(),
    resend: jest.fn(),
    resetPasswordForEmail: jest.fn(),
    signInWithPassword: jest.fn(),
    signUp: jest.fn(),
    updateUser: jest.fn(),
  };
}

describe("SignInScreen", () => {
  const renderSignIn = (auth: ReturnType<typeof createAuth>) =>
    render(
      <SignInScreen
        auth={auth}
        colors={lightAppColors}
        notice={null}
        onForgotPassword={jest.fn()}
        onSignUp={jest.fn()}
      />,
    );

  it("validates input before requesting sign-in", async () => {
    const auth = createAuth();
    await renderSignIn(auth);
    await fireEvent.changeText(screen.getByLabelText("Email"), "bad-email");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/valid email/i);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "invalid_credentials", status: 400 }, /incorrect/i],
    [new TypeError("Network request failed"), /connection/i],
    [{ code: "request_timeout", status: 503 }, /temporarily unavailable/i],
  ])("maps sign-in failures to safe user-facing categories", async (failure, message) => {
    const auth = createAuth();
    if (failure instanceof TypeError) auth.signInWithPassword.mockRejectedValue(failure);
    else auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: failure });
    await renderSignIn(auth);
    await fireEvent.changeText(screen.getByLabelText("Email"), " ADA@EXAMPLE.COM ");
    await fireEvent.changeText(screen.getByLabelText("Password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("normalizes email and completes a successful sign-in request", async () => {
    const auth = createAuth();
    auth.signInWithPassword.mockResolvedValue({ data: { session }, error: null });
    await renderSignIn(auth);
    await fireEvent.changeText(screen.getByLabelText("Email"), " ADA@EXAMPLE.COM ");
    await fireEvent.changeText(screen.getByLabelText("Password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "password",
    });
    expect(screen.queryByRole("alert")).not.toBeOnTheScreen();
  });
});

describe("SignUpScreen", () => {
  it("validates email, password policy, and confirmation before signup", async () => {
    const auth = createAuth();
    await render(
      <SignUpScreen
        auth={auth}
        colors={lightAppColors}
        onAuthenticated={jest.fn()}
        onBack={jest.fn()}
        onPending={jest.fn()}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText("Email"), "bad-email");
    await fireEvent.changeText(screen.getByLabelText("Password"), "12345");
    await fireEvent.changeText(screen.getByLabelText("Confirm password"), "different");
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/valid email/i);
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("moves confirmation-required signup to the pending state", async () => {
    const auth = createAuth();
    auth.signUp.mockResolvedValue({ data: { user: { id: "user-id" }, session: null }, error: null });
    const onPending = jest.fn();
    await render(
      <SignUpScreen
        auth={auth}
        colors={lightAppColors}
        onAuthenticated={jest.fn()}
        onBack={jest.fn()}
        onPending={onPending}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText("Email"), "  ADA@EXAMPLE.COM ");
    await fireEvent.changeText(screen.getByLabelText("Password"), "password");
    await fireEvent.changeText(screen.getByLabelText("Confirm password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(onPending).toHaveBeenCalledWith("ada@example.com"));
  });

  it("rejects a password mismatch before signup", async () => {
    const auth = createAuth();
    await render(
      <SignUpScreen
        auth={auth}
        colors={lightAppColors}
        onAuthenticated={jest.fn()}
        onBack={jest.fn()}
        onPending={jest.fn()}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText("Email"), "ada@example.com");
    await fireEvent.changeText(screen.getByLabelText("Password"), "password");
    await fireEvent.changeText(screen.getByLabelText("Confirm password"), "different");
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/match/i);
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "over_email_send_rate_limit", status: 429 }, /too many/i],
    [new TypeError("Network request failed"), /connection/i],
  ])("shows a safe signup delivery failure", async (failure, message) => {
    const auth = createAuth();
    if (failure instanceof TypeError) auth.signUp.mockRejectedValue(failure);
    else auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: failure });
    await render(
      <SignUpScreen
        auth={auth}
        colors={lightAppColors}
        onAuthenticated={jest.fn()}
        onBack={jest.fn()}
        onPending={jest.fn()}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText("Email"), "ada@example.com");
    await fireEvent.changeText(screen.getByLabelText("Password"), "password");
    await fireEvent.changeText(screen.getByLabelText("Confirm password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("hands an immediate signup session to the existing authenticated flow", async () => {
    const auth = createAuth();
    auth.signUp.mockResolvedValue({ data: { user: { id: "user-id" }, session }, error: null });
    const onAuthenticated = jest.fn();
    await render(
      <SignUpScreen
        auth={auth}
        colors={lightAppColors}
        onAuthenticated={onAuthenticated}
        onBack={jest.fn()}
        onPending={jest.fn()}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText("Email"), "ada@example.com");
    await fireEvent.changeText(screen.getByLabelText("Password"), "password");
    await fireEvent.changeText(screen.getByLabelText("Confirm password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(session));
  });
});

describe("VerificationPendingScreen", () => {
  afterEach(() => jest.useRealTimers());

  it("shows email context and prevents repeated resend taps during cooldown", async () => {
    jest.useFakeTimers();
    const auth = createAuth();
    auth.resend.mockResolvedValue({ data: {}, error: null });
    await render(
      <VerificationPendingScreen
        auth={auth}
        colors={lightAppColors}
        cooldownSeconds={2}
        email="ada@example.com"
        onBack={jest.fn()}
      />,
    );
    expect(screen.getByText(/ada@example.com/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Resend verification email" }));
    await waitFor(() => expect(auth.resend).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /Resend in 2s/ })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: /Resend in 2s/ }));
    expect(auth.resend).toHaveBeenCalledTimes(1);
    await act(() => jest.advanceTimersByTime(2000));
    expect(screen.getByRole("button", { name: "Resend verification email" })).toBeEnabled();
  });

  it("shows a safe resend failure and leaves resend available", async () => {
    const auth = createAuth();
    auth.resend.mockRejectedValue(new TypeError("Network request failed"));
    await render(
      <VerificationPendingScreen
        auth={auth}
        colors={lightAppColors}
        email="ada@example.com"
        onBack={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Resend verification email" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/connection/i);
    expect(screen.getByRole("button", { name: "Resend verification email" })).toBeEnabled();
  });
});

describe("ForgotPasswordScreen", () => {
  it("shows generic success for a completed recovery request", async () => {
    const auth = createAuth();
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    await render(<ForgotPasswordScreen auth={auth} colors={lightAppColors} onBack={jest.fn()} />);
    await fireEvent.changeText(screen.getByLabelText("Email"), "ada@example.com");
    await fireEvent.press(screen.getByRole("button", { name: "Send reset email" }));
    expect(await screen.findByRole("summary")).toHaveTextContent(
      /If an account exists, a password reset email has been sent/i,
    );
  });

  it("distinguishes a network failure from generic success", async () => {
    const auth = createAuth();
    auth.resetPasswordForEmail.mockRejectedValue(new TypeError("Network request failed"));
    await render(<ForgotPasswordScreen auth={auth} colors={lightAppColors} onBack={jest.fn()} />);
    await fireEvent.changeText(screen.getByLabelText("Email"), "ada@example.com");
    await fireEvent.press(screen.getByRole("button", { name: "Send reset email" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/connection/i);
  });
});

describe("ResetPasswordScreen", () => {
  it.each([
    ["12345", "12345", /at least 6/i],
    ["new-password", "different", /match/i],
  ])("validates the new password before updating", async (password, confirmation, message) => {
    const auth = createAuth();
    await render(
      <ResetPasswordScreen
        auth={auth}
        colors={lightAppColors}
        onComplete={jest.fn(async () => undefined)}
        onRequestNew={jest.fn()}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText("New password"), password);
    await fireEvent.changeText(screen.getByLabelText("Confirm new password"), confirmation);
    await fireEvent.press(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("validates and updates the password before completing local cleanup", async () => {
    const auth = createAuth();
    auth.updateUser.mockResolvedValue({ data: { user: { id: "user-id" } }, error: null });
    const onComplete = jest.fn(async () => undefined);
    await render(
      <ResetPasswordScreen
        auth={auth}
        colors={lightAppColors}
        onComplete={onComplete}
        onRequestNew={jest.fn()}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText("New password"), "new-password");
    await fireEvent.changeText(screen.getByLabelText("Confirm new password"), "new-password");
    await fireEvent.press(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("keeps recovery active after an update failure", async () => {
    const auth = createAuth();
    auth.updateUser.mockResolvedValue({ data: { user: null }, error: { status: 500 } });
    const onComplete = jest.fn();
    await render(
      <ResetPasswordScreen
        auth={auth}
        colors={lightAppColors}
        onComplete={onComplete}
        onRequestNew={jest.fn()}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText("New password"), "new-password");
    await fireEvent.changeText(screen.getByLabelText("Confirm new password"), "new-password");
    await fireEvent.press(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/temporarily unavailable/i);
    expect(onComplete).not.toHaveBeenCalled();
  });
});
