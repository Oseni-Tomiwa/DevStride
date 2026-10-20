import type { ReactNode } from "react";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import type { AppColors } from "../../theme";

export function AuthScreenLayout({ children, colors, description, title }: { children: ReactNode; colors: AppColors; description: string; title: string }) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>DEVSTRIDE</Text>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.description, { color: colors.mutedText }]}>{description}</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AuthField({ colors, label, secure = false, ...inputProps }: TextInputProps & { colors: AppColors; label: string; secure?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <TextInput {...inputProps} accessibilityLabel={label} secureTextEntry={secure && !visible} style={[styles.input, { color: colors.text }]} />
        {secure ? (
          <Pressable
            accessibilityLabel={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
            accessibilityRole="button"
            disabled={inputProps.editable === false}
            onPress={() => setVisible((current) => !current)}
            style={({ pressed }) => [styles.visibility, pressed ? { opacity: 0.65 } : null]}
          >
            <Text style={[styles.visibilityText, { color: colors.primary }]}>{visible ? "Hide" : "Show"}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function AuthMessage({ colors, kind, children }: { colors: AppColors; kind: "error" | "status"; children: ReactNode }) {
  const isError = kind === "error";
  return (
    <Text
      accessibilityLiveRegion={isError ? "assertive" : "polite"}
      accessibilityRole={isError ? "alert" : "summary"}
      style={[styles.message, { backgroundColor: isError ? colors.errorSurface : colors.tag, color: isError ? colors.error : colors.text }]}
    >
      {children}
    </Text>
  );
}

export function AuthTextAction({ colors, disabled = false, label, onPress }: { colors: AppColors; disabled?: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.textAction, pressed && !disabled ? { opacity: 0.65 } : null]}>
      <Text style={[styles.textActionLabel, { color: colors.primary }, disabled && styles.disabled]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { alignSelf: "center", flexGrow: 1, justifyContent: "center", maxWidth: 560, paddingHorizontal: 20, paddingVertical: 40, width: "100%" },
  intro: { marginBottom: 28 },
  eyebrow: { fontSize: 13, fontWeight: "800", letterSpacing: 1.8, marginBottom: 10 },
  title: { fontSize: 34, fontWeight: "800", letterSpacing: -0.8 },
  description: { fontSize: 17, lineHeight: 25, marginTop: 10 },
  card: { borderRadius: 18, borderWidth: 1, padding: 20 },
  field: { marginBottom: 18 },
  label: { fontSize: 15, fontWeight: "700", marginBottom: 8 },
  inputWrap: { alignItems: "center", borderRadius: 12, borderWidth: 1, flexDirection: "row" },
  input: { flex: 1, fontSize: 17, minHeight: 52, paddingHorizontal: 14, paddingVertical: 10 },
  visibility: { alignItems: "center", justifyContent: "center", minHeight: 48, minWidth: 64 },
  visibilityText: { fontSize: 15, fontWeight: "700" },
  message: { borderRadius: 10, fontSize: 15, lineHeight: 22, marginBottom: 18, padding: 12 },
  textAction: { alignItems: "center", justifyContent: "center", minHeight: 48, paddingHorizontal: 12 },
  textActionLabel: { fontSize: 15, fontWeight: "700", textAlign: "center" },
  disabled: { opacity: 0.55 },
});
