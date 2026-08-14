"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { useState } from "react";

import { Dialog } from "../../../components/dialog";
import { ApiError } from "../../../lib/api/client";
import { createClient } from "../../../lib/supabase/client";
import {
  createConversation,
  deleteConversation,
  renameConversation,
} from "../api";
import type { Conversation } from "../types";

type ConversationListProps = {
  initialConversations: Conversation[];
};

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function sortedConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort(
    (left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at),
  );
}

export function ConversationList({ initialConversations }: ConversationListProps) {
  const router = useRouter();
  const [conversations, setConversations] = useState(() => sortedConversations(initialConversations));
  const [renamingConversation, setRenamingConversation] = useState<Conversation | null>(null);
  const [deletingConversation, setDeletingConversation] = useState<Conversation | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleApiError(cause: unknown) {
    if (cause instanceof ApiError && cause.status === 401) {
      router.push("/login");
      return;
    }
    setError(cause instanceof ApiError && cause.status === 0
      ? "We could not reach DevStride. Check your connection and try again."
      : "We could not update your conversations. Please try again.");
  }

  async function handleCreate() {
    setError(null);
    setSuccess(null);
    setIsCreating(true);
    try {
      const conversation = await createConversation(createClient(), {
        title: "New conversation",
        mode: "general",
      });
      router.push(`/conversations/${conversation.id}`);
    } catch (cause) {
      handleApiError(cause);
    } finally {
      setIsCreating(false);
    }
  }

  function beginRename(conversation: Conversation) {
    setError(null);
    setSuccess(null);
    setRenamingConversation(conversation);
    setRenameValue(conversation.title);
  }

  async function handleRename() {
    if (!renamingConversation) return;
    const conversationId = renamingConversation.id;
    const title = renameValue.trim();
    if (!title) {
      setError("A conversation title is required.");
      return;
    }

    setBusyId(conversationId);
    setError(null);
    try {
      const updated = await renameConversation(createClient(), conversationId, { title });
      setConversations((current) => sortedConversations(
        current.map((conversation) => conversation.id === conversationId ? updated : conversation),
      ));
      setRenamingConversation(null);
      setSuccess("Conversation renamed.");
    } catch (cause) {
      handleApiError(cause);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!deletingConversation) return;
    const conversationId = deletingConversation.id;

    setBusyId(conversationId);
    setError(null);
    setSuccess(null);
    try {
      await deleteConversation(createClient(), conversationId);
      setConversations((current) => current.filter(({ id }) => id !== conversationId));
      setDeletingConversation(null);
      setSuccess("Conversation deleted.");
    } catch (cause) {
      handleApiError(cause);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="conversation-shell" aria-labelledby="conversation-list-title">
      <header className="conversation-header">
        <div>
          <p className="eyebrow">Practice space</p>
          <h1 id="conversation-list-title">Conversations</h1>
          <p className="muted">Keep your learning notes and practice prompts in one place.</p>
        </div>
        <button type="button" onClick={handleCreate} disabled={isCreating}>
          {isCreating ? "Creating…" : "New conversation"}
        </button>
      </header>

      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="form-success" role="status">{success}</p>}

      {conversations.length === 0 ? (
        <div className="conversation-empty" role="status">
          <h2>No conversations yet</h2>
          <p className="muted">Start a conversation when you are ready to capture your next practice session.</p>
          <button type="button" onClick={handleCreate} disabled={isCreating}>Create one</button>
        </div>
      ) : (
        <div className="conversation-list" aria-label="Your conversations">
          {conversations.map((conversation) => (
            <article className="conversation-row" key={conversation.id}>
              <>
                  <div>
                    <Link href={`/conversations/${conversation.id}`} className="conversation-title">
                      {conversation.title}
                    </Link>
                    <p className="conversation-meta">
                      <span>{conversation.mode}</span>
                      <span>Updated {formatUpdatedAt(conversation.updated_at)}</span>
                    </p>
                  </div>
                  <div className="conversation-actions">
                    <button type="button" className="button-secondary" onClick={() => beginRename(conversation)}>Rename</button>
                    <button type="button" className="button-danger" onClick={() => setDeletingConversation(conversation)} disabled={busyId === conversation.id}>Delete</button>
                  </div>
              </>
            </article>
          ))}
        </div>
      )}
      <Dialog open={renamingConversation !== null} title="Rename conversation" description="Choose a short title that will help you find this practice later." onClose={() => setRenamingConversation(null)}>
        <form className="dialog-form" onSubmit={(event) => { event.preventDefault(); void handleRename(); }}>
          <label htmlFor="conversation-title">Conversation title</label>
          <input id="conversation-title" value={renameValue} maxLength={200} onChange={(event) => setRenameValue(event.target.value)} autoFocus />
          <div className="dialog-actions"><button type="submit" disabled={busyId === renamingConversation?.id}>Save title</button><button type="button" className="button-secondary" onClick={() => setRenamingConversation(null)}>Cancel</button></div>
        </form>
      </Dialog>
      <Dialog open={deletingConversation !== null} title="Delete conversation?" description="This removes the conversation and its messages. This cannot be undone." onClose={() => setDeletingConversation(null)}>
        <div className="dialog-actions"><button type="button" className="button-danger" onClick={() => void handleDelete()} disabled={busyId === deletingConversation?.id}>Delete conversation</button><button type="button" className="button-secondary" onClick={() => setDeletingConversation(null)}>Cancel</button></div>
      </Dialog>
    </section>
  );
}
