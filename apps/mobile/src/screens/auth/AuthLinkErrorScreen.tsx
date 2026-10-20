import { ActionButton } from "../../components/ActionButton";
import type { AppColors } from "../../theme";
import { AuthMessage, AuthScreenLayout } from "./AuthPrimitives";

export function AuthLinkErrorScreen({ colors, message, onContinue, onRequestNew }: { colors: AppColors; message: string; onContinue: () => void; onRequestNew?: () => void }) {
  return (
    <AuthScreenLayout colors={colors} description="The authentication link could not be completed safely." title="Link unavailable">
      <AuthMessage colors={colors} kind="error">{message}</AuthMessage>
      {onRequestNew ? (
        <ActionButton colors={colors} label="Request another email" onPress={onRequestNew} />
      ) : null}
      <ActionButton colors={colors} label="Return to Sign In" onPress={onContinue} variant={onRequestNew ? "secondary" : "primary"} />
    </AuthScreenLayout>
  );
}
