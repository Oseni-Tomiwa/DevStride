export const PASSWORD_MIN_LENGTH = 6;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateEmail(value: string): string | null {
  return EMAIL_PATTERN.test(value) ? null : "Enter a valid email address.";
}

export function validatePassword(value: string): string | null {
  return value.length >= PASSWORD_MIN_LENGTH
    ? null
    : `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
}

export function validatePasswordConfirmation(password: string, confirmation: string): string | null {
  return password === confirmation ? null : "Passwords do not match.";
}
