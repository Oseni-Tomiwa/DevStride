import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { AppColors } from "../theme";
import type { AuthenticatedUser, Profile } from "../types";
import { ActionButton } from "./ActionButton";

type ProfileScreenProps = {
  colors: AppColors;
  user: AuthenticatedUser;
  profile: Profile;
  onSignOut: () => Promise<string | null>;
};

function humanize(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ProfileScreen({ colors, user, profile, onSignOut }: ProfileScreenProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    setIsSigningOut(true);
    setError(null);
    const message = await onSignOut();
    if (message) {
      setError(message);
      setIsSigningOut(false);
    }
  };

  const rows = [
    ["Email", user.email ?? "Not provided"],
    ["Current level", humanize(profile.current_level)],
    ["Target role", humanize(profile.target_role)],
    ["Communication goal", humanize(profile.communication_goal)],
    ["Feedback preference", humanize(profile.feedback_preference)],
  ];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>
        YOUR DEVSTRIDE PROFILE
      </Text>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        {profile.display_name}
      </Text>
      <Text style={[styles.subtitle, { color: colors.mutedText }]}>
        Your existing coaching preferences, loaded securely from DevStride.
      </Text>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {rows.map(([label, value], index) => (
          <View
            key={label}
            style={[
              styles.row,
              index < rows.length - 1 ? { borderBottomColor: colors.border, borderBottomWidth: 1 } : null,
            ]}
          >
            <Text style={[styles.rowLabel, { color: colors.mutedText }]}>{label}</Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>{value}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Preferred stack</Text>
      <View accessibilityRole="summary" style={styles.tags}>
        {profile.preferred_stack.map((item) => (
          <View key={item} style={[styles.tag, { backgroundColor: colors.tag }]}>
            <Text style={[styles.tagText, { color: colors.text }]}>{item}</Text>
          </View>
        ))}
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
        disabled={isSigningOut}
        label="Sign out"
        loading={isSigningOut}
        onPress={() => void signOut()}
        variant="secondary"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: "center",
    maxWidth: 680,
    paddingHorizontal: 20,
    paddingVertical: 36,
    width: "100%",
  },
  eyebrow: { fontSize: 13, fontWeight: "800", letterSpacing: 1.5, marginBottom: 10 },
  title: { fontSize: 34, fontWeight: "800", letterSpacing: -0.8 },
  subtitle: { fontSize: 17, lineHeight: 25, marginBottom: 28, marginTop: 10 },
  card: { borderRadius: 18, borderWidth: 1, overflow: "hidden", paddingHorizontal: 18 },
  row: { paddingVertical: 16 },
  rowLabel: { fontSize: 13, fontWeight: "700", marginBottom: 5 },
  rowValue: { fontSize: 17, lineHeight: 24 },
  sectionTitle: { fontSize: 18, fontWeight: "800", marginBottom: 12, marginTop: 26 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 30 },
  tag: { borderRadius: 100, paddingHorizontal: 13, paddingVertical: 9 },
  tagText: { fontSize: 15, fontWeight: "600" },
  error: { borderRadius: 10, fontSize: 15, lineHeight: 22, marginBottom: 18, padding: 12 },
});
