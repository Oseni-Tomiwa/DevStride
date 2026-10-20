import { useState } from "react";

import { requestPasswordReset, type MobileAuthClient } from "../../auth/auth-service";
import { normalizeEmail, validateEmail } from "../../auth/auth-validation";
import { ActionButton } from "../../components/ActionButton";
import type { AppColors } from "../../theme";
import { AuthField, AuthMessage, AuthScreenLayout, AuthTextAction } from "./AuthPrimitives";

export function ForgotPasswordScreen({ auth, colors, onBack }: { auth: MobileAuthClient; colors: AppColors; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "status"; text: string } | null>(null);

  const submit = async () => {
    const normalizedEmail = normalizeEmail(email);
    const emailError = validateEmail(normalizedEmail);
    if (emailError) { setMessage({ kind: "error", text: emailError }); return; }
    setIsSubmitting(true);
    setMessage(null);
    const result = await requestPasswordReset(auth, normalizedEmail);
    setMessage(result.ok ? { kind: "status", text: "If an account exists, a password reset email has been sent. Open it on this device." } : { kind: "error", text: result.error.message });
    setIsSubmitting(false);
  };

  return (
    <AuthScreenLayout colors={colors} description="Enter your account email. The response does not reveal whether an account exists." title="Reset your password">
      <AuthField autoCapitalize="none" autoComplete="email" autoCorrect={false} colors={colors} editable={!isSubmitting} keyboardType="email-address" label="Email" onChangeText={setEmail} onSubmitEditing={() => void submit()} returnKeyType="go" textContentType="emailAddress" value={email} />
      {message ? <AuthMessage colors={colors} kind={message.kind}>{message.text}</AuthMessage> : null}
      <ActionButton colors={colors} disabled={isSubmitting} label="Send reset email" loading={isSubmitting} onPress={() => void submit()} />
      <AuthTextAction colors={colors} disabled={isSubmitting} label="Back to Sign In" onPress={onBack} />
    </AuthScreenLayout>
  );
}
