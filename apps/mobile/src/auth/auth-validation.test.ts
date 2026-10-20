import {
  normalizeEmail,
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
} from "./auth-validation";

describe("mobile auth validation", () => {
  it("trims and lowercases email addresses", () => {
    expect(normalizeEmail("  Ada.Example@Example.COM ")).toBe("ada.example@example.com");
  });

  it.each(["", "ada", "ada@", "@example.com", "ada example@example.com"])(
    "rejects invalid email %p before a request",
    (email) => {
      expect(validateEmail(email)).toBe("Enter a valid email address.");
    },
  );

  it("accepts a normalized valid email", () => {
    expect(validateEmail("ada@example.com")).toBeNull();
  });

  it("preserves the established six-character password policy", () => {
    expect(validatePassword("12345")).toBe("Password must be at least 6 characters.");
    expect(validatePassword("123456")).toBeNull();
  });

  it("rejects a mismatched confirmation", () => {
    expect(validatePasswordConfirmation("password", "different")).toBe(
      "Passwords do not match.",
    );
    expect(validatePasswordConfirmation("password", "password")).toBeNull();
  });
});
