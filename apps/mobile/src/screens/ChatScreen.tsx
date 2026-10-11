import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MobileApiError, type DevStrideApi } from "../api";
import { chatReducer, initialChatState } from "../conversations/chat-state";
import type { Conversation, Message } from "../conversations/contracts";
import { decodeChatSseFrame, SseParser, SseProtocolError } from "../conversations/sse";
import type { AppColors } from "../theme";
import { ActionButton } from "../components/ActionButton";

type ChatApi = Pick<
  DevStrideApi,
  "getConversation" | "listMessages" | "streamConversation" | "retryMessage"
>;

type ChatScreenProps = {
  api: ChatApi;
  colors: AppColors;
  conversationId: string;
  onBack: () => void;
  onUnauthorized: () => void;
};

type ActiveOperation = {
  controller: AbortController;
  stoppedByUser: boolean;
};

function chronological(messages: Message[]): Message[] {
  return [...messages].sort((left, right) => left.created_at.localeCompare(right.created_at));
}

function rateLimitMessage(error: MobileApiError): string {
  return error.retryAfterSeconds === null
    ? "Too many requests. Try again shortly."
    : `Too many requests. Try again in ${error.retryAfterSeconds} seconds.`;
}

function MessageBubble({ colors, message }: { colors: AppColors; message: Message }) {
  const isUser = message.role === "user";
  return (
    <View
      style={[
        styles.messageBubble,
        isUser ? styles.userBubble : styles.assistantBubble,
        {
          backgroundColor: isUser ? colors.tag : colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <Text style={[styles.speaker, { color: isUser ? colors.primary : colors.mutedText }]}>
        {isUser ? "You" : "DevStride"}
      </Text>
      <Text selectable style={[styles.messageText, { color: colors.text }]}>
        {message.content}
      </Text>
    </View>
  );
}

export function ChatScreen({ api, colors, conversationId, onBack, onUnauthorized }: ChatScreenProps) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error" | "not_found">(
    "loading",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const activeOperation = useRef<ActiveOperation | null>(null);
  const mounted = useRef(true);

  const handleUnauthorized = useCallback(() => {
    activeOperation.current?.controller.abort();
    dispatch({ type: "unauthorized" });
    onUnauthorized();
  }, [onUnauthorized]);

  const loadHistory = useCallback(async () => {
    try {
      const [nextConversation, messages] = await Promise.all([
        api.getConversation(conversationId),
        api.listMessages(conversationId),
      ]);
      if (!mounted.current) return;
      setConversation(nextConversation);
      dispatch({ type: "history_loaded", messages: chronological(messages) });
      setLoadStatus("ready");
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof MobileApiError && error.kind === "unauthorized") {
        handleUnauthorized();
      } else if (error instanceof MobileApiError && error.kind === "not_found") {
        setLoadStatus("not_found");
      } else {
        setLoadError(
          error instanceof MobileApiError
            ? error.message
            : "Unable to load this conversation. Check your connection and try again.",
        );
        setLoadStatus("error");
      }
    }
  }, [api, conversationId, handleUnauthorized]);

  useEffect(() => {
    mounted.current = true;
    void Promise.all([api.getConversation(conversationId), api.listMessages(conversationId)])
      .then(([nextConversation, messages]) => {
        if (!mounted.current) return;
        setConversation(nextConversation);
        dispatch({ type: "history_loaded", messages: chronological(messages) });
        setLoadStatus("ready");
      })
      .catch((error: unknown) => {
        if (!mounted.current) return;
        if (error instanceof MobileApiError && error.kind === "unauthorized") {
          handleUnauthorized();
        } else if (error instanceof MobileApiError && error.kind === "not_found") {
          setLoadStatus("not_found");
        } else {
          setLoadError(
            error instanceof MobileApiError
              ? error.message
              : "Unable to load this conversation. Check your connection and try again.",
          );
          setLoadStatus("error");
        }
      });
    return () => {
      mounted.current = false;
      activeOperation.current?.controller.abort();
      activeOperation.current = null;
    };
  }, [api, conversationId, handleUnauthorized]);

  const reconcile = useCallback(async () => {
    try {
      const messages = await api.listMessages(conversationId);
      if (mounted.current) {
        dispatch({ type: "reconciled", messages: chronological(messages) });
      }
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof MobileApiError && error.kind === "unauthorized") {
        handleUnauthorized();
      } else if (error instanceof MobileApiError && error.kind === "not_found") {
        setLoadStatus("not_found");
      } else {
        dispatch({
          type: "reconciliation_failed",
          message: "Couldn’t confirm the saved conversation. Check your connection and try again.",
        });
      }
    }
  }, [api, conversationId, handleUnauthorized]);

  const consumeStream = useCallback(
    async (operation: ActiveOperation, responsePromise: Promise<Response>) => {
      let completed = false;
      let explicitError = false;
      let pendingDelta = "";
      let deltaTimer: ReturnType<typeof setTimeout> | null = null;

      const flushDelta = () => {
        if (deltaTimer) clearTimeout(deltaTimer);
        deltaTimer = null;
        if (pendingDelta) {
          dispatch({ type: "assistant_delta", delta: pendingDelta });
          pendingDelta = "";
        }
      };

      const scheduleDelta = (delta: string) => {
        pendingDelta += delta;
        if (!deltaTimer) {
          deltaTimer = setTimeout(flushDelta, 32);
        }
      };

      try {
        const response = await responsePromise;
        const reader = response.body?.getReader();
        if (!reader) {
          throw new SseProtocolError("Streaming response body is unavailable.");
        }
        const parser = new SseParser();
        let ended = false;

        while (!ended) {
          const result = await reader.read();
          if (operation.stoppedByUser || operation.controller.signal.aborted || !mounted.current) {
            return;
          }
          const frames = result.done ? parser.finish() : parser.push(result.value);
          for (const nextFrame of frames) {
            const event = decodeChatSseFrame(nextFrame);
            switch (event.type) {
              case "user_message":
                dispatch({ type: "user_message", message: event.message });
                setComposer("");
                break;
              case "assistant_delta":
                scheduleDelta(event.delta);
                break;
              case "assistant_complete":
                flushDelta();
                completed = true;
                dispatch({ type: "assistant_complete", message: event.message });
                void AccessibilityInfo.announceForAccessibility("DevStride response complete.");
                break;
              case "error":
                flushDelta();
                explicitError = true;
                dispatch({ type: "server_error", code: event.code, message: event.message });
                break;
              case "done":
                ended = true;
                break;
              case "unknown":
                break;
            }
          }
          if (result.done) ended = true;
        }
        flushDelta();
        dispatch({ type: "stream_ended" });
        if (!completed && !explicitError) {
          await reconcile();
        }
      } catch (error) {
        flushDelta();
        if (!mounted.current || operation.stoppedByUser) return;
        if (error instanceof MobileApiError) {
          if (error.kind === "unauthorized") {
            handleUnauthorized();
            return;
          }
          if (error.kind === "not_found") {
            setLoadStatus("not_found");
            return;
          }
          if (error.kind === "rate_limited") {
            dispatch({ type: "server_error", code: "rate_limited", message: rateLimitMessage(error) });
            return;
          }
          if (error.kind === "conflict") {
            dispatch({ type: "stream_interrupted" });
            await reconcile();
            return;
          }
          if (error.kind === "cancelled") return;
        }
        dispatch({
          type: error instanceof SseProtocolError ? "protocol_error" : "stream_interrupted",
        });
        await reconcile();
      } finally {
        flushDelta();
        if (activeOperation.current === operation) {
          activeOperation.current = null;
        }
      }
    },
    [handleUnauthorized, reconcile],
  );

  const startSend = () => {
    if (!conversation || conversation.mode !== "general") return;
    const content = composer.trim();
    const length = Array.from(composer).length;
    if (!content || length > 20_000 || activeOperation.current) return;
    const operation = { controller: new AbortController(), stoppedByUser: false };
    activeOperation.current = operation;
    dispatch({ type: "send_started" });
    void consumeStream(
      operation,
      api.streamConversation(conversationId, content, operation.controller.signal),
    );
  };

  const startRetry = () => {
    if (!state.retryMessageId || activeOperation.current) return;
    const operation = { controller: new AbortController(), stoppedByUser: false };
    activeOperation.current = operation;
    dispatch({ type: "retry_started", messageId: state.retryMessageId });
    void consumeStream(
      operation,
      api.retryMessage(conversationId, state.retryMessageId, operation.controller.signal),
    );
  };

  const stop = () => {
    const operation = activeOperation.current;
    if (!operation) return;
    operation.stoppedByUser = true;
    operation.controller.abort();
    activeOperation.current = null;
    dispatch({ type: "cancelled" });
    void reconcile();
  };

  if (loadStatus === "loading") {
    return (
      <View accessibilityLabel="Loading conversation" style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[styles.statusText, { color: colors.mutedText }]}>Loading conversation…</Text>
      </View>
    );
  }

  if (loadStatus === "not_found") {
    return (
      <View style={styles.centered}>
        <Text accessibilityRole="header" style={[styles.stateTitle, { color: colors.text }]}>Conversation unavailable</Text>
        <Text style={[styles.stateBody, { color: colors.mutedText }]}>It may have been removed or is no longer available.</Text>
        <ActionButton colors={colors} label="Back to conversations" onPress={onBack} />
      </View>
    );
  }

  if (loadStatus === "error") {
    return (
      <View style={styles.centered}>
        <Text accessibilityRole="alert" style={[styles.stateBody, { color: colors.error }]}>{loadError}</Text>
        <ActionButton
          colors={colors}
          label="Try again"
          onPress={() => {
            setLoadError(null);
            setLoadStatus("loading");
            void loadHistory();
          }}
        />
      </View>
    );
  }

  if (!conversation) return null;

  const isGeneral = conversation.mode === "general";
  const length = Array.from(composer).length;
  const invalidComposer = !composer.trim() || length > 20_000;
  const busy = state.status === "sending" || state.status === "streaming" || state.status === "reconciling";
  const canStop = state.status === "sending" || state.status === "streaming";
  const operationError = state.error?.message ?? null;

  return (
    <SafeAreaView edges={["bottom"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 92 : 0}
        style={styles.safeArea}
      >
        {!isGeneral ? (
          <View style={[styles.notice, { backgroundColor: colors.tag, borderColor: colors.border }]}>
            <Text style={[styles.noticeTitle, { color: colors.text }]}>Read-only on mobile</Text>
            <Text style={[styles.noticeBody, { color: colors.mutedText }]}>
              This coaching mode is not yet available on mobile. Continue it on DevStride Web.
            </Text>
          </View>
        ) : null}
        {operationError ? (
          <Text
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            style={[styles.operationError, { backgroundColor: colors.errorSurface, color: colors.error }]}
          >
            {operationError}
          </Text>
        ) : null}
        <FlatList
          contentContainerStyle={styles.messages}
          data={state.messages}
          keyExtractor={(message) => message.id}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            state.assistantDraft ? null : (
              <View style={styles.emptyConversation}>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No messages yet</Text>
                <Text style={[styles.emptyBody, { color: colors.mutedText }]}>Ask a question to begin this conversation.</Text>
              </View>
            )
          }
          ListFooterComponent={
            state.assistantDraft ? (
              <View
                accessible={false}
                style={[
                  styles.messageBubble,
                  styles.assistantBubble,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.speaker, { color: colors.mutedText }]}>DevStride</Text>
                <Text selectable style={[styles.messageText, { color: colors.text }]}>{state.assistantDraft}</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => <MessageBubble colors={colors} message={item} />}
        />
        {isGeneral ? (
          <View style={[styles.composer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Message</Text>
            <TextInput
              accessibilityLabel="Message"
              editable={!busy}
              multiline
              onChangeText={setComposer}
              placeholder="Ask DevStride…"
              placeholderTextColor={colors.mutedText}
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              value={composer}
            />
            <View style={styles.composerMeta}>
              <Text
                accessibilityRole={length > 20_000 ? "alert" : undefined}
                style={[styles.counter, { color: length > 20_000 ? colors.error : colors.mutedText }]}
              >
                {length.toLocaleString()} / 20,000 characters
              </Text>
              {canStop ? (
                <Pressable
                  accessibilityLabel="Stop response"
                  accessibilityRole="button"
                  onPress={stop}
                  style={({ pressed }) => [styles.compactButton, { borderColor: colors.border }, pressed ? { opacity: 0.7 } : null]}
                >
                  <Text style={[styles.compactLabel, { color: colors.text }]}>Stop</Text>
                </Pressable>
              ) : state.status === "reconciling" && state.error?.code === "reconciliation_failed" ? (
                <Pressable
                  accessibilityLabel="Check saved messages"
                  accessibilityRole="button"
                  onPress={() => void reconcile()}
                  style={({ pressed }) => [
                    styles.compactButton,
                    { borderColor: colors.border },
                    pressed ? { opacity: 0.7 } : null,
                  ]}
                >
                  <Text style={[styles.compactLabel, { color: colors.text }]}>Check again</Text>
                </Pressable>
              ) : state.retryMessageId ? (
                <Pressable
                  accessibilityLabel="Retry response"
                  accessibilityRole="button"
                  onPress={startRetry}
                  style={({ pressed }) => [styles.compactButton, { backgroundColor: colors.primary, borderColor: colors.primary }, pressed ? { opacity: 0.8 } : null]}
                >
                  <Text style={[styles.compactLabel, { color: colors.onPrimary }]}>Retry</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityLabel="Send message"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: invalidComposer || busy }}
                  disabled={invalidComposer || busy}
                  onPress={startSend}
                  style={({ pressed }) => [
                    styles.compactButton,
                    { backgroundColor: colors.primary, borderColor: colors.primary, opacity: invalidComposer || busy ? 0.5 : pressed ? 0.8 : 1 },
                  ]}
                >
                  <Text style={[styles.compactLabel, { color: colors.onPrimary }]}>Send</Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  centered: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
  statusText: { fontSize: 16, marginTop: 14 },
  stateTitle: { fontSize: 25, fontWeight: "800", marginBottom: 8, textAlign: "center" },
  stateBody: { fontSize: 16, lineHeight: 24, marginBottom: 20, textAlign: "center" },
  notice: { borderBottomWidth: 1, paddingHorizontal: 18, paddingVertical: 12 },
  noticeTitle: { fontSize: 15, fontWeight: "800" },
  noticeBody: { fontSize: 14, lineHeight: 20, marginTop: 3 },
  operationError: { fontSize: 14, lineHeight: 20, paddingHorizontal: 18, paddingVertical: 10 },
  messages: { flexGrow: 1, gap: 12, padding: 16 },
  emptyConversation: { alignItems: "center", flex: 1, justifyContent: "center", paddingVertical: 48 },
  emptyTitle: { fontSize: 20, fontWeight: "800" },
  emptyBody: { fontSize: 16, lineHeight: 24, marginTop: 6, textAlign: "center" },
  messageBubble: { borderRadius: 16, borderWidth: 1, maxWidth: 680, padding: 14, width: "88%" },
  userBubble: { alignSelf: "flex-end" },
  assistantBubble: { alignSelf: "flex-start" },
  speaker: { fontSize: 13, fontWeight: "800", marginBottom: 5 },
  messageText: { fontSize: 16, lineHeight: 24 },
  composer: { borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 10 },
  inputLabel: { fontSize: 14, fontWeight: "700", marginBottom: 6 },
  input: { borderRadius: 14, borderWidth: 1, fontSize: 16, lineHeight: 23, maxHeight: 144, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12 },
  composerMeta: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 56 },
  counter: { flex: 1, fontSize: 12, marginRight: 8 },
  compactButton: { alignItems: "center", borderRadius: 12, borderWidth: 1, justifyContent: "center", minHeight: 48, minWidth: 76, paddingHorizontal: 16 },
  compactLabel: { fontSize: 15, fontWeight: "800" },
});
