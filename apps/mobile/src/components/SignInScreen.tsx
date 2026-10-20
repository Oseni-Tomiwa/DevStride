import { useState } from "react";

import { classifyAuthFailure } from "../auth/auth-errors";
import { signInWithEmail, type MobileAuthClient } from "../auth/auth-service";
import { normalizeEmail, validateEmail } from "../auth/auth-validation";
import { AuthField, AuthMessage, AuthScreenLayout, AuthTextAction } from "../screens/auth/AuthPrimitives";
import type { AppColors } from "../theme";
import { ActionButton } from "./ActionButton";

type SignInScreenProps = {
  auth: MobileAuthClient;
  colors: AppColors;
  notice: string | null;
  onForgotPassword: () => void;
  onSignUp: () => void;
};

export function SignInScreen({ auth, colors, notice, onForgotPassword, onSignUp }: SignInScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const signIn = async () => {
    const normalizedEmail = normalizeEmail(email);
    const emailError = validateEmail(normalizedEmail);
    if (emailError || !password) {
      setError(emailError ?? "Enter your password.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await signInWithEmail(auth, normalizedEmail, password);
      if (!result.ok) setError(result.error.message);
    } catch (unexpected) {
      setError(classifyAuthFailure(unexpected, "sign_in").message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthScreenLayout colors={colors} description="Sign in to continue your DevStride coaching practice." title="Welcome back">
      {notice ? <AuthMessage colors={colors} kind="status">{notice}</AuthMessage> : null}
      <AuthField autoCapitalize="none" autoComplete="email" autoCorrect={false} colors={colors} editable={!isSubmitting} keyboardType="email-address" label="Email" onChangeText={setEmail} returnKeyType="next" textContentType="emailAddress" value={email} />
      <AuthField autoCapitalize="none" autoComplete="current-password" colors={colors} editable={!isSubmitting} label="Password" onChangeText={setPassword} onSubmitEditing={() => void signIn()} returnKeyType="go" secure textContentType="password" value={password} />
      {error ? <AuthMessage colors={colors} kind="error">{error}</AuthMessage> : null}
      <ActionButton colors={colors} disabled={isSubmitting} label="Sign in" loading={isSubmitting} onPress={() => void signIn()} />
      <AuthTextAction colors={colors} disabled={isSubmitting} label="Forgot password?" onPress={onForgotPassword} />
      <AuthTextAction colors={colors} disabled={isSubmitting} label="Create an account" onPress={onSignUp} />
    </AuthScreenLayout>
  );
}
