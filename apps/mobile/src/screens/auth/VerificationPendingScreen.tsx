import { useEffect, useState } from "react";

import { resendVerification, type MobileAuthClient } from "../../auth/auth-service";
import { ActionButton } from "../../components/ActionButton";
import type { AppColors } from "../../theme";
import { AuthMessage, AuthScreenLayout, AuthTextAction } from "./AuthPrimitives";

export function VerificationPendingScreen({ auth, colors, cooldownSeconds = 60, email, onBack }: { auth: MobileAuthClient; colors: AppColors; cooldownSeconds?: number; email: string; onBack: () => void }) {
  const [remaining, setRemaining] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "status"; text: string } | null>(null);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [remaining]);

  const resend = async () => {
    if (isSubmitting || remaining > 0) return;
    setIsSubmitting(true);
    setMessage(null);
    const result = await resendVerification(auth, email);
    if (result.ok) {
      setRemaining(cooldownSeconds);
      setMessage({ kind: "status", text: "If verification is available, a new email has been sent." });
    } else setMessage({ kind: "error", text: result.error.message });
    setIsSubmitting(false);
  };

  const resendLabel = remaining > 0 ? `Resend in ${remaining}s` : "Resend verification email";
  return (
    <AuthScreenLayout colors={colors} description={`We sent verification instructions to ${email}. Open the newest email on this device.`} title="Check your email">
      {message ? <AuthMessage colors={colors} kind={message.kind}>{message.text}</AuthMessage> : null}
      <ActionButton colors={colors} disabled={isSubmitting || remaining > 0} label={resendLabel} loading={isSubmitting} onPress={() => void resend()} />
      <AuthTextAction colors={colors} disabled={isSubmitting} label="Back to Sign In" onPress={onBack} />
    </AuthScreenLayout>
  );
}
