import { useEffect, useReducer } from "react";
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { createDevStrideApi, MobileApiError } from "./src/api";
import { initialAppState, mobileAppReducer } from "./src/app-state";
import { registerAuthAutoRefresh } from "./src/auth-lifecycle";
import { ActionButton } from "./src/components/ActionButton";
import { ProfileScreen } from "./src/components/ProfileScreen";
import { SignInScreen } from "./src/components/SignInScreen";
import { loadAuthenticatedProfile } from "./src/load-profile";
import { mobileConfig } from "./src/runtime-config";
import { getAccessToken, supabase } from "./src/supabase";
import { useAppTheme, type AppColors } from "./src/theme";

const api = createDevStrideApi({
  apiBaseUrl: mobileConfig.apiBaseUrl,
  getAccessToken,
});

type MessageScreenProps = {
  colors: AppColors;
  title: string;
  message: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

function MessageScreen({
  colors,
  title,
  message,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: MessageScreenProps) {
  return (
    <ScrollView contentContainerStyle={styles.messageContent}>
      <Text
        accessibilityRole="header"
        style={[styles.messageTitle, { color: colors.text }]}
      >
        {title}
      </Text>
      <Text style={[styles.messageBody, { color: colors.mutedText }]}>{message}</Text>
      <View style={styles.actions}>
        {primaryLabel && onPrimary ? (
          <ActionButton colors={colors} label={primaryLabel} onPress={onPrimary} />
        ) : null}
        {secondaryLabel && onSecondary ? (
          <ActionButton
            colors={colors}
            label={secondaryLabel}
            onPress={onSecondary}
            variant="secondary"
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

function App() {
  const { colors, isDark } = useAppTheme();
  const [state, dispatch] = useReducer(mobileAppReducer, initialAppState);

  useEffect(() => {
    let active = true;
    const unregisterRefresh = registerAuthAutoRefresh(supabase.auth, AppState);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "SIGNED_IN") {
        dispatch({ type: "sessionResolved", session });
      } else if (event === "SIGNED_OUT") {
        dispatch({ type: "sessionResolved", session: null });
      }
    });

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active) {
          dispatch({ type: "sessionResolved", session: error ? null : data.session });
        }
      })
      .catch(() => {
        if (active) {
          dispatch({ type: "sessionResolved", session: null });
        }
      });

    return () => {
      active = false;
      subscription.unsubscribe();
      unregisterRefresh();
    };
  }, []);

  useEffect(() => {
    if (state.status !== "loading_profile") return;
    let active = true;
    const sessionUserId = state.session.user.id;

    void loadAuthenticatedProfile(api)
      .then(({ user, profile }) => {
        if (!active) return;
        if (user.id !== sessionUserId || profile.user_id !== user.id) {
          dispatch({ type: "loadFailed", message: "DevStride returned an invalid profile." });
          return;
        }
        dispatch({ type: "profileLoaded", user, profile });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof MobileApiError && error.kind === "unauthorized") {
          dispatch({ type: "unauthorized" });
          void supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        } else if (error instanceof MobileApiError && error.kind === "profile_missing") {
          dispatch({ type: "profileMissing" });
        } else {
          const message =
            error instanceof MobileApiError
              ? error.message
              : "Unable to load your DevStride profile. Try again.";
          dispatch({ type: "loadFailed", message });
        }
      });

    return () => {
      active = false;
    };
  }, [state]);

  const signOut = async (): Promise<string | null> => {
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      return error ? "Unable to sign out. Check your connection and try again." : null;
    } catch {
      return "Unable to sign out. Check your connection and try again.";
    }
  };

  let content;
  switch (state.status) {
    case "booting":
    case "loading_profile":
      content = (
        <View accessibilityLabel="Loading DevStride" style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: colors.mutedText }]}>Loading your profile…</Text>
        </View>
      );
      break;
    case "signed_out":
      content = <SignInScreen colors={colors} notice={state.notice} />;
      break;
    case "authenticated":
      content = (
        <ProfileScreen
          colors={colors}
          onSignOut={signOut}
          profile={state.profile}
          user={state.user}
        />
      );
      break;
    case "profile_missing":
      content = (
        <MessageScreen
          colors={colors}
          message="Complete onboarding in the DevStride web app, then return here and retry. Mobile onboarding is not included in this release."
          onPrimary={() => dispatch({ type: "retry" })}
          onSecondary={() => void signOut()}
          primaryLabel="Retry"
          secondaryLabel="Sign out"
          title="Profile required"
        />
      );
      break;
    case "load_error":
      content = (
        <MessageScreen
          colors={colors}
          message={state.message}
          onPrimary={() => dispatch({ type: "retry" })}
          onSecondary={() => void signOut()}
          primaryLabel="Try again"
          secondaryLabel="Sign out"
          title="Couldn’t load your profile"
        />
      );
      break;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? "light" : "dark"} />
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        {content}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default App;

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 40 },
  messageContent: {
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  loadingText: { fontSize: 16, marginTop: 16, textAlign: "center" },
  messageTitle: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5, textAlign: "center" },
  messageBody: { fontSize: 17, lineHeight: 25, marginTop: 12, maxWidth: 560, textAlign: "center" },
  actions: { gap: 12, marginTop: 28, maxWidth: 420, width: "100%" },
});
