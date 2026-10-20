import { useState } from "react";

import { type MobileAuthClient, updateRecoveryPassword } from "../../auth/auth-service";
import { validatePassword, validatePasswordConfirmation } from "../../auth/auth-validation";
import { ActionButton } from "../../components/ActionButton";
import type { AppColors } from "../../theme";
import { AuthField, AuthMessage, AuthScreenLayout, AuthTextAction } from "./AuthPrimitives";

export function ResetPasswordScreen({ auth, colors, onComplete, onRequestNew }: { auth: MobileAuthClient; colors: AppColors; onComplete: () => Promise<void>; onRequestNew: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    const validationError = validatePassword(password) ?? validatePasswordConfirmation(password, confirmation);
    if (validationError) { setError(validationError); return; }
    setIsSubmitting(true);
    setError(null);
    const result = await updateRecoveryPassword(auth, password);
    if (!result.ok) { setError(result.error.message); setIsSubmitting(false); return; }
    setPassword("");
    setConfirmation("");
    await onComplete();
  };

  return (
    <AuthScreenLayout colors={colors} description="Choose a new password with at least 6 characters. You will sign in normally afterward." title="Choose a new password">
      <AuthField autoCapitalize="none" autoComplete="new-password" colors={colors} editable={!isSubmitting} label="New password" onChangeText={setPassword} secure textContentType="newPassword" value={password} />
      <AuthField autoCapitalize="none" autoComplete="new-password" colors={colors} editable={!isSubmitting} label="Confirm new password" onChangeText={setConfirmation} onSubmitEditing={() => void submit()} returnKeyType="go" secure textContentType="newPassword" value={confirmation} />
      {error ? <AuthMessage colors={colors} kind="error">{error}</AuthMessage> : null}
      <ActionButton colors={colors} disabled={isSubmitting} label="Update password" loading={isSubmitting} onPress={() => void submit()} />
      <AuthTextAction colors={colors} disabled={isSubmitting} label="Request another reset email" onPress={onRequestNew} />
    </AuthScreenLayout>
  );
}
