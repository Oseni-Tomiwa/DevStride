import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { supabase } from "../supabase";
import type { AppColors } from "../theme";
import { ActionButton } from "./ActionButton";

type SignInScreenProps = {
  colors: AppColors;
  notice: string | null;
};

export function SignInScreen({ colors, notice }: SignInScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const signIn = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setError("Enter your email and password.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (authError) {
        setError("Email or password is incorrect.");
      }
    } catch {
      setError("Unable to reach DevStride. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.flex}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.intro}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>
            DEVSTRIDE
          </Text>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            Welcome back
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedText }]}>
            Sign in with your existing confirmed account to view your coaching profile.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {notice ? (
            <Text accessibilityLiveRegion="polite" style={[styles.notice, { color: colors.text }]}>
              {notice}
            </Text>
          ) : null}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Email</Text>
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              editable={!isSubmitting}
              keyboardType="email-address"
              onChangeText={setEmail}
              returnKeyType="next"
              style={[
                styles.input,
                { backgroundColor: colors.background, borderColor: colors.border, color: colors.text },
              ]}
              textContentType="emailAddress"
              value={email}
            />
          </View>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Password</Text>
            <TextInput
              accessibilityLabel="Password"
              autoCapitalize="none"
              autoComplete="current-password"
              editable={!isSubmitting}
              onChangeText={setPassword}
              onSubmitEditing={() => void signIn()}
              returnKeyType="go"
              secureTextEntry
              style={[
                styles.input,
                { backgroundColor: colors.background, borderColor: colors.border, color: colors.text },
              ]}
              textContentType="password"
              value={password}
            />
          </View>
          {error ? (
            <Text
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              style={[styles.error, { backgroundColor: colors.errorSurface, color: colors.error }]}
            >
              {error}
            </Text>
          ) : null}
          <ActionButton
            colors={colors}
            disabled={isSubmitting}
            label="Sign in"
            loading={isSubmitting}
            onPress={() => void signIn()}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    alignSelf: "center",
    flexGrow: 1,
    justifyContent: "center",
    maxWidth: 560,
    paddingHorizontal: 20,
    paddingVertical: 40,
    width: "100%",
  },
  intro: { marginBottom: 28 },
  eyebrow: { fontSize: 13, fontWeight: "800", letterSpacing: 1.8, marginBottom: 10 },
  title: { fontSize: 34, fontWeight: "800", letterSpacing: -0.8 },
  subtitle: { fontSize: 17, lineHeight: 25, marginTop: 10 },
  card: { borderRadius: 18, borderWidth: 1, padding: 20 },
  notice: { fontSize: 15, lineHeight: 22, marginBottom: 18 },
  field: { marginBottom: 18 },
  label: { fontSize: 15, fontWeight: "700", marginBottom: 8 },
  input: { borderRadius: 12, borderWidth: 1, fontSize: 17, minHeight: 52, paddingHorizontal: 14 },
  error: { borderRadius: 10, fontSize: 15, lineHeight: 22, marginBottom: 18, padding: 12 },
});
