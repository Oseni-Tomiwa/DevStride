import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { MobileApiError, type DevStrideApi } from "../api";
import type { Conversation } from "../conversations/contracts";
import type { AppColors } from "../theme";
import { ActionButton } from "../components/ActionButton";

type ConversationsApi = Pick<DevStrideApi, "listConversations" | "createGeneralConversation">;

type ConversationsScreenProps = {
  api: ConversationsApi;
  colors: AppColors;
  onOpenConversation: (conversationId: string) => void;
  onUnauthorized: () => void;
};

function modeLabel(mode: string): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function errorMessage(error: unknown): string {
  if (error instanceof MobileApiError) {
    if (error.kind === "rate_limited" && error.retryAfterSeconds !== null) {
      return `Too many requests. Try again in ${error.retryAfterSeconds} seconds.`;
    }
    return error.message;
  }
  return "Unable to load conversations. Check your connection and try again.";
}

export function ConversationsScreen({
  api,
  colors,
  onOpenConversation,
  onUnauthorized,
}: ConversationsScreenProps) {
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      setError(null);
      try {
        setConversations(await api.listConversations());
      } catch (nextError) {
        if (nextError instanceof MobileApiError && nextError.kind === "unauthorized") {
          onUnauthorized();
          return;
        }
        setError(errorMessage(nextError));
      } finally {
        if (isRefresh) setRefreshing(false);
      }
    },
    [api, onUnauthorized],
  );

  useEffect(() => {
    let active = true;
    void api
      .listConversations()
      .then((items) => {
        if (active) setConversations(items);
      })
      .catch((nextError: unknown) => {
        if (!active) return;
        if (nextError instanceof MobileApiError && nextError.kind === "unauthorized") {
          onUnauthorized();
        } else {
          setError(errorMessage(nextError));
        }
      });
    return () => {
      active = false;
    };
  }, [api, onUnauthorized]);

  const createConversation = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const conversation = await api.createGeneralConversation("New conversation");
      onOpenConversation(conversation.id);
    } catch (nextError) {
      if (nextError instanceof MobileApiError && nextError.kind === "unauthorized") {
        onUnauthorized();
      } else {
        setError(errorMessage(nextError));
      }
    } finally {
      setCreating(false);
    }
  };

  if (conversations === null && error === null) {
    return (
      <View accessibilityLabel="Loading conversations" style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[styles.statusText, { color: colors.mutedText }]}>Loading conversations…</Text>
      </View>
    );
  }

  if (conversations === null && error) {
    return (
      <View style={styles.centered}>
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.error }]}>
          {error}
        </Text>
        <ActionButton colors={colors} label="Try again" onPress={() => void load()} />
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={[
        styles.content,
        conversations?.length === 0 ? styles.emptyContent : null,
      ]}
      data={conversations ?? []}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.headerContent}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            Conversations
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedText }]}>
            Practice engineering communication with DevStride.
          </Text>
          {error ? (
            <Text
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              style={[styles.inlineError, { backgroundColor: colors.errorSurface, color: colors.error }]}
            >
              {error}
            </Text>
          ) : null}
          <ActionButton
            colors={colors}
            disabled={creating}
            label="New conversation"
            loading={creating}
            onPress={() => void createConversation()}
          />
        </View>
      }
      ListEmptyComponent={
        <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Start your first conversation</Text>
          <Text style={[styles.emptyBody, { color: colors.mutedText }]}>
            Create a General conversation to begin practicing with DevStride.
          </Text>
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.primary}
          onRefresh={() => void load(true)}
        />
      }
      renderItem={({ item }) => {
        const isGeneral = item.mode === "general";
        return (
          <Pressable
            accessibilityLabel={`Open ${item.title}, ${item.mode} conversation`}
            accessibilityRole="button"
            onPress={() => onOpenConversation(item.id)}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed ? { opacity: 0.72 } : null,
            ]}
          >
            <View style={styles.rowText}>
              <Text numberOfLines={2} style={[styles.rowTitle, { color: colors.text }]}>
                {item.title}
              </Text>
              <Text style={[styles.mode, { color: colors.mutedText }]}>{modeLabel(item.mode)}</Text>
            </View>
            {!isGeneral ? (
              <Text style={[styles.readOnly, { color: colors.primary }]}>Read-only on mobile</Text>
            ) : null}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  statusText: { fontSize: 16, marginTop: 14 },
  error: { fontSize: 16, lineHeight: 24, marginBottom: 20, textAlign: "center" },
  content: { alignSelf: "center", gap: 12, padding: 20, width: "100%", maxWidth: 720 },
  emptyContent: { flexGrow: 1 },
  headerContent: { gap: 12, marginBottom: 12 },
  title: { fontSize: 32, fontWeight: "800", letterSpacing: -0.7 },
  subtitle: { fontSize: 16, lineHeight: 24, marginBottom: 4 },
  inlineError: { borderRadius: 12, fontSize: 15, lineHeight: 22, padding: 12 },
  emptyCard: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 20,
    padding: 28,
  },
  emptyTitle: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  emptyBody: { fontSize: 16, lineHeight: 24, marginTop: 8, textAlign: "center" },
  row: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowText: { flex: 1, marginRight: 12 },
  rowTitle: { fontSize: 17, fontWeight: "700", lineHeight: 23 },
  mode: { fontSize: 14, marginTop: 4 },
  readOnly: { fontSize: 13, fontWeight: "700", maxWidth: 88, textAlign: "right" },
});
