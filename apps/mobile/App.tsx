import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";

import { createDevStrideApi, MobileApiError } from "./src/api";
import { initialAppState, mobileAppReducer } from "./src/app-state";
import { registerAuthAutoRefresh } from "./src/auth-lifecycle";
import {
  getAuthRouteKind,
  parseAuthLink,
  type ParsedAuthLink,
} from "./src/auth/auth-links";
import { exchangeParsedAuthLink } from "./src/auth/auth-service";
import {
  SessionValidationError,
  validateAuthenticatedSession,
} from "./src/auth/session-validation";
import { ActionButton } from "./src/components/ActionButton";
import { loadAuthenticatedProfile } from "./src/load-profile";
import { AuthenticatedNavigator } from "./src/navigation/AuthenticatedNavigator";
import { UnauthenticatedNavigator } from "./src/navigation/UnauthenticatedNavigator";
import { mobileConfig } from "./src/runtime-config";
import { AuthLinkErrorScreen } from "./src/screens/auth/AuthLinkErrorScreen";
import { ResetPasswordScreen } from "./src/screens/auth/ResetPasswordScreen";
import { clearMobileAuthSession, getAccessToken, prepareMobileAuthStorage, supabase } from "./src/supabase";
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
  const [storageError, setStorageError] = useState(false);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const cancelProfileLoad = useRef<{ userId: string; cancel: () => void } | null>(null);
  const [cleanupState, setCleanupState] = useState<"idle" | "pending" | "failed">("idle");
  const authMode = useRef<"initializing" | "link" | "normal" | "recovery" | "clearing" | "cleanup_failed">("initializing");
  const isExchangingAuthLink = useRef(false);
  const pendingRecoveryLink = useRef<ParsedAuthLink | null>(null);
  const seenAuthLinks = useRef(new Set<string>());

  const clearSession = useCallback(async (expired: boolean): Promise<string | null> => {
    if (authMode.current === "clearing") return null;
    cancelProfileLoad.current?.cancel();
    authMode.current = "clearing";
    setCleanupState("pending");
    const failure = await clearMobileAuthSession();
    if (failure) {
      authMode.current = "cleanup_failed";
      setCleanupState("failed");
      return "Unable to clear this device’s session. Unlock your device and try again.";
    }
    authMode.current = "normal";
    dispatch(expired ? { type: "unauthorized" } : { type: "sessionResolved", session: null });
    setCleanupState("idle");
    return null;
  }, []);

  const handleUnauthorized = useCallback(() => {
    void clearSession(true);
  }, [clearSession]);

  const handleAuthUrl = useCallback(async (url: string) => {
    if (authMode.current === "clearing" || authMode.current === "cleanup_failed") return;
    const parsed = parseAuthLink(url);
    const routeKind = parsed.ok ? parsed.link.kind : getAuthRouteKind(url);

    if (isExchangingAuthLink.current) {
      if (
        parsed.ok &&
        parsed.link.kind === "recovery" &&
        !seenAuthLinks.current.has(parsed.link.fingerprint)
      ) {
        seenAuthLinks.current.add(parsed.link.fingerprint);
        pendingRecoveryLink.current = parsed.link;
        authMode.current = "recovery";
        dispatch({ type: "authLinkStarted", kind: "recovery" });
      }
      return;
    }
    if (authMode.current === "recovery") return;

    if (!parsed.ok) {
      cancelProfileLoad.current?.cancel();
      authMode.current = "link";
      dispatch({ type: "authLinkStarted", kind: routeKind ?? "confirmation" });
      dispatch({
        type: "authLinkFailed",
        kind: routeKind,
        message:
          routeKind === "recovery"
            ? "This recovery link is invalid or expired. Request a new email on this device."
            : "This authentication link is invalid or unsupported. Request a new email and try again.",
      });
      return;
    }
    if (seenAuthLinks.current.has(parsed.link.fingerprint)) return;
    seenAuthLinks.current.add(parsed.link.fingerprint);
    cancelProfileLoad.current?.cancel();

    const processLink = async (link: typeof parsed.link): Promise<void> => {
      isExchangingAuthLink.current = true;
      authMode.current = link.kind === "recovery" ? "recovery" : "link";
      dispatch({ type: "authLinkStarted", kind: link.kind });
      const result = await exchangeParsedAuthLink(supabase.auth, link);

      if (link.kind === "confirmation" && pendingRecoveryLink.current) {
        const recoveryLink = pendingRecoveryLink.current;
        pendingRecoveryLink.current = null;
        await processLink(recoveryLink);
        return;
      }
      if (!result.ok) {
        await clearMobileAuthSession();
        if (pendingRecoveryLink.current) {
          const recoveryLink = pendingRecoveryLink.current;
          pendingRecoveryLink.current = null;
          await processLink(recoveryLink);
          return;
        }
        isExchangingAuthLink.current = false;
        authMode.current = "link";
        dispatch({ type: "authLinkFailed", kind: link.kind, message: result.error.message });
        return;
      }
      if (link.kind === "recovery") {
        isExchangingAuthLink.current = false;
        authMode.current = "recovery";
        dispatch({ type: "recoveryReady", session: result.session });
        return;
      }
      isExchangingAuthLink.current = false;
      authMode.current = "normal";
      dispatch({ type: "sessionResolved", session: result.session });
    };

    await processLink(parsed.link);
  }, []);

  useEffect(() => {
    let active = true;
    const unregisterRefresh = registerAuthAutoRefresh(supabase.auth, AppState);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (authMode.current !== "normal") return;
      if (event === "SIGNED_IN") {
        const profileRequest = cancelProfileLoad.current;
        if (profileRequest && profileRequest.userId !== session?.user.id) profileRequest.cancel();
        dispatch({ type: "sessionResolved", session });
      } else if (event === "SIGNED_OUT") {
        cancelProfileLoad.current?.cancel();
        dispatch({ type: "sessionResolved", session: null });
      }
    });

    const storageReady = prepareMobileAuthStorage().then(
      () => true,
      () => {
        if (active) setStorageError(true);
        return false;
      },
    );
    const linkingSubscription = Linking.addEventListener("url", ({ url }) => {
      void storageReady.then((ready) => {
        if (active && ready) void handleAuthUrl(url);
      });
    });

    void storageReady.then(async (ready) => {
      if (!active || !ready) return;
      return Linking.getInitialURL();
    })
      .then(async (url) => {
        if (!active || url === undefined || authMode.current !== "initializing") return;
        if (url) {
          await handleAuthUrl(url);
          return;
        }
        authMode.current = "normal";
        const result = await supabase.auth.getSession().catch(() => null);
        if (active && authMode.current === "normal") {
          dispatch({
            type: "sessionHydrated",
            session: result && !result.error ? result.data.session : null,
          });
        }
      })
      .catch(() => {
        if (active && authMode.current === "initializing") {
          authMode.current = "normal";
          dispatch({ type: "sessionHydrated", session: null });
        }
      });

    return () => {
      active = false;
      subscription.unsubscribe();
      linkingSubscription.remove();
      unregisterRefresh();
    };
  }, [handleAuthUrl, startupAttempt]);

  useEffect(() => {
    if (state.status !== "loading_profile") return;
    const request = state;
    let active = true;
    const sessionUserId = request.session.user.id;
    const profileRequest = {
      userId: sessionUserId,
      cancel: () => { active = false; },
    };
    cancelProfileLoad.current = profileRequest;

    void validateAuthenticatedSession(supabase.auth, sessionUserId)
      .then(async () => {
        if (!active) return;
        const { user, profile } = await loadAuthenticatedProfile(api);
        if (!active) return;
        if (user.id !== sessionUserId || profile.user_id !== user.id) {
          dispatch({ type: "loadFailed", request, message: "DevStride returned an invalid profile." });
          return;
        }
        dispatch({ type: "profileLoaded", request, user, profile });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (
          (error instanceof SessionValidationError && error.kind === "invalid") ||
          (error instanceof MobileApiError && error.kind === "unauthorized")
        ) {
          handleUnauthorized();
        } else if (error instanceof SessionValidationError) {
          dispatch({
            type: "loadFailed",
            request,
            message: "Unable to validate your session. Check your connection and try again.",
          });
        } else if (error instanceof MobileApiError && error.kind === "profile_missing") {
          dispatch({ type: "profileMissing", request });
        } else {
          const message =
            error instanceof MobileApiError
              ? error.message
              : "Unable to load your DevStride profile. Try again.";
          dispatch({ type: "loadFailed", request, message });
        }
      });

    return () => {
      profileRequest.cancel();
      if (cancelProfileLoad.current === profileRequest) cancelProfileLoad.current = null;
    };
  }, [handleUnauthorized, state]);

  const signOut = useCallback(() => clearSession(false), [clearSession]);

  const finishRecovery = useCallback(async () => {
    const failure = await clearMobileAuthSession();
    if (failure) {
      authMode.current = "recovery";
      dispatch({
        type: "authLinkFailed",
        kind: "recovery",
        message:
          "Your password was updated, but this device could not clear the recovery session. Try again before signing in.",
      });
      return;
    }
    authMode.current = "normal";
    dispatch({ type: "recoveryCompleted" });
  }, []);

  const returnToSignIn = useCallback(async () => {
    const failure = await clearMobileAuthSession();
    if (failure) return;
    authMode.current = "normal";
    dispatch({ type: "sessionResolved", session: null });
  }, []);

  const requestRecoveryEmail = useCallback(async () => {
    const failure = await clearMobileAuthSession();
    if (failure) {
      authMode.current = "recovery";
      dispatch({
        type: "authLinkFailed",
        kind: "recovery",
        message: "This device could not clear the recovery session. Try again.",
      });
      return;
    }
    authMode.current = "normal";
    dispatch({ type: "requestRecoveryEmail" });
  }, []);

  let content;
  switch (state.status) {
    case "booting":
      if (storageError) {
        content = (
          <MessageScreen
            colors={colors}
            title="Secure storage unavailable"
            message="Unlock your device and try again."
            primaryLabel="Try again"
            onPrimary={() => {
              setStorageError(false);
              setStartupAttempt((attempt) => attempt + 1);
            }}
          />
        );
        break;
      }
      // Fall through to the loading screen.
    case "auth_link_loading":
    case "loading_profile":
      content = (
        <View accessibilityLabel="Loading DevStride" style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: colors.mutedText }]}>Loading your profile…</Text>
        </View>
      );
      break;
    case "signed_out":
      content = (
        <UnauthenticatedNavigator
          auth={supabase.auth}
          colors={colors}
          initialRoute={state.initialRoute}
          notice={state.notice}
          onAuthenticated={(session) => dispatch({ type: "sessionResolved", session })}
        />
      );
      break;
    case "recovery":
      content = (
        <ResetPasswordScreen
          auth={supabase.auth}
          colors={colors}
          onComplete={finishRecovery}
          onRequestNew={requestRecoveryEmail}
        />
      );
      break;
    case "auth_link_error":
      content = (
        <AuthLinkErrorScreen
          colors={colors}
          message={state.message}
          onContinue={returnToSignIn}
          onRequestNew={state.kind === "recovery" ? requestRecoveryEmail : undefined}
        />
      );
      break;
    case "authenticated":
      content = (
        <AuthenticatedNavigator
          api={api}
          colors={colors}
          onSignOut={signOut}
          onUnauthorized={handleUnauthorized}
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

  if (cleanupState !== "idle") {
    content = (
      <MessageScreen
        colors={colors}
        title={cleanupState === "failed" ? "Couldn’t clear your session" : "Signing out"}
        message={cleanupState === "failed"
          ? "Unlock your device and try again."
          : "Clearing the session on this device…"}
        primaryLabel={cleanupState === "failed" ? "Try again" : undefined}
        onPrimary={() => void signOut()}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? "light" : "dark"} />
      {state.status === "authenticated" && cleanupState === "idle" ? (
        content
      ) : (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
          {content}
        </SafeAreaView>
      )}
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
