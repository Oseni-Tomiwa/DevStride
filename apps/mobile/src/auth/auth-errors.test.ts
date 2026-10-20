import { classifyAuthFailure } from "./auth-errors";

describe("classifyAuthFailure", () => {
  it("distinguishes invalid credentials from service failures", () => {
    expect(
      classifyAuthFailure({ code: "invalid_credentials", status: 400 }, "sign_in"),
    ).toEqual({ kind: "invalid_credentials", message: "Email or password is incorrect." });
    expect(classifyAuthFailure({ code: "unexpected_failure", status: 503 }, "sign_in")).toEqual({
      kind: "service",
      message: "Authentication is temporarily unavailable. Try again shortly.",
    });
  });

  it("classifies thrown network errors without claiming credentials are invalid", () => {
    expect(classifyAuthFailure(new TypeError("Network request failed"), "sign_in")).toEqual({
      kind: "network",
      message: "Unable to reach DevStride. Check your connection and try again.",
    });
  });

  it("classifies request timeouts and rate limits safely", () => {
    expect(classifyAuthFailure({ code: "request_timeout", status: 504 }, "sign_up").kind).toBe(
      "service",
    );
    expect(
      classifyAuthFailure({ code: "over_email_send_rate_limit", status: 429 }, "resend"),
    ).toEqual({
      kind: "rate_limited",
      message: "Too many email requests. Wait a while before trying again.",
    });
  });

  it("maps existing-account signup responses to a generic pending result", () => {
    expect(classifyAuthFailure({ code: "user_already_exists", status: 422 }, "sign_up")).toEqual({
      kind: "generic_signup",
      message: "Check your email for the next step if an account can be created or verified.",
    });
  });

  it("maps missing PKCE state to a safe wrong-device link error", () => {
    expect(classifyAuthFailure({ name: "AuthPKCECodeVerifierMissingError" }, "exchange")).toEqual({
      kind: "invalid_link",
      message: "This link cannot be completed on this device. Request a new email on this device.",
    });
    expect(classifyAuthFailure({ code: "bad_code_verifier", status: 400 }, "exchange").kind).toBe(
      "invalid_link",
    );
  });
});
