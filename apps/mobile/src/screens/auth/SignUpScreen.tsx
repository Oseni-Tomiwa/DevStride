import { useState } from "react";

import { signUpWithEmail, type MobileAuthClient } from "../../auth/auth-service";
import { normalizeEmail, validateEmail, validatePassword, validatePasswordConfirmation } from "../../auth/auth-validation";
import { ActionButton } from "../../components/ActionButton";
import type { AppColors } from "../../theme";
import type { SessionSnapshot } from "../../types";
import { AuthField, AuthMessage, AuthScreenLayout, AuthTextAction } from "./AuthPrimitives";

export function SignUpScreen({ auth, colors, onAuthenticated, onBack, onPending }: { auth: MobileAuthClient; colors: AppColors; onAuthenticated: (session: SessionSnapshot) => void; onBack: () => void; onPending: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    const normalizedEmail = normalizeEmail(email);
    const validationError = validateEmail(normalizedEmail) ?? validatePassword(password) ?? validatePasswordConfirmation(password, confirmation);
    if (validationError) { setError(validationError); return; }
    setIsSubmitting(true);
    setError(null);
    const result = await signUpWithEmail(auth, normalizedEmail, password);
    if (!result.ok) { setError(result.error.message); setIsSubmitting(false); return; }
    if (result.outcome === "authenticated") onAuthenticated(result.session);
    else onPending(normalizedEmail);
  };

  return (
    <AuthScreenLayout colors={colors} description="Use at least 6 characters for your password." title="Create your account">
      <AuthField autoCapitalize="none" autoComplete="email" autoCorrect={false} colors={colors} editable={!isSubmitting} keyboardType="email-address" label="Email" onChangeText={setEmail} textContentType="emailAddress" value={email} />
      <AuthField autoCapitalize="none" autoComplete="new-password" colors={colors} editable={!isSubmitting} label="Password" onChangeText={setPassword} secure textContentType="newPassword" value={password} />
      <AuthField autoCapitalize="none" autoComplete="new-password" colors={colors} editable={!isSubmitting} label="Confirm password" onChangeText={setConfirmation} onSubmitEditing={() => void submit()} returnKeyType="go" secure textContentType="newPassword" value={confirmation} />
      {error ? <AuthMessage colors={colors} kind="error">{error}</AuthMessage> : null}
      <ActionButton colors={colors} disabled={isSubmitting} label="Create account" loading={isSubmitting} onPress={() => void submit()} />
      <AuthTextAction colors={colors} disabled={isSubmitting} label="Back to Sign In" onPress={onBack} />
    </AuthScreenLayout>
  );
}
