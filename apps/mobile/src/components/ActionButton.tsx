import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import type { AppColors } from "../theme";

type ActionButtonProps = {
  colors: AppColors;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary";
};

export function ActionButton({
  colors,
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = "primary",
}: ActionButtonProps) {
  const isPrimary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: isPrimary ? colors.primary : "transparent",
          borderColor: isPrimary ? colors.primary : colors.border,
          opacity: disabled ? 0.55 : 1,
        },
        pressed && !disabled
          ? { backgroundColor: isPrimary ? colors.primaryPressed : colors.tag }
          : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.onPrimary : colors.text} />
      ) : (
        <Text style={[styles.label, { color: isPrimary ? colors.onPrimary : colors.text }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "700",
  },
});
