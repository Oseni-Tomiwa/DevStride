import type { Conversation, Message } from "./types";

export const DEFAULT_CONVERSATION_TITLE = "New conversation";
const TITLE_MAX_LENGTH = 60;

export function deriveConversationTitle(content: string): string {
  let title = content.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  title = title.replace(
    /^(?:help me prepare for|help me with|i want to prepare for)\s+(?:(?:a|an|the)\s+)?/i,
    "",
  ).trim();
  if (!title) return DEFAULT_CONVERSATION_TITLE;
  title = title[0].toUpperCase() + title.slice(1);
  if (title.length <= TITLE_MAX_LENGTH) return title;
  const shortened = title.slice(0, TITLE_MAX_LENGTH - 1);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${(lastSpace > 0 ? shortened.slice(0, lastSpace) : shortened)}…`;
}

export function conversationDisplayTitle(
  conversation: Conversation,
  messages: Message[],
): string {
  if (conversation.title !== DEFAULT_CONVERSATION_TITLE) return conversation.title;
  const firstUserMessage = [...messages]
    .filter((message) => message.role === "user")
    .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))[0];
  return firstUserMessage
    ? deriveConversationTitle(firstUserMessage.content)
    : conversation.title;
}
