"use client";

import React, { useState } from "react";

import { Dialog } from "../../../components/dialog";
import { ApiError } from "../../../lib/api/client";
import { createClient } from "../../../lib/supabase/client";
import { createMemory, deleteMemory, updateMemory } from "../api";
import type { Memory, MemoryCategory } from "../types";

const categories: MemoryCategory[] = ["goal", "preference", "project", "skill", "weakness", "achievement"];
const labels: Record<string, string> = { goal: "Goal", preference: "Preference", project: "Project", skill: "Skill", weakness: "Weakness", achievement: "Achievement" };
const sources: Record<string, string> = { manual: "Added by you", mentor_summary: "Learned from Mentor session", interview_summary: "Learned from Interview practice" };

function memoryAccessibleName(content: string): string {
  const normalized = content.trim().replace(/\s+/g, " ").slice(0, 70);
  return normalized || "saved memory";
}

export function MemoryManager({ initialMemories }: { initialMemories: Memory[] }) {
  const [memories, setMemories] = useState(initialMemories);
  const [category, setCategory] = useState<MemoryCategory>("goal");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [deletingMemory, setDeletingMemory] = useState<Memory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addMemory(event: React.FormEvent) {
    event.preventDefault();
    if (!content.trim()) { setError("Tell us one useful fact to remember."); return; }
    setBusy(true); setError(null);
    try {
      const record = await createMemory(createClient(), { category, content: content.trim() });
      setMemories((current) => current.some((item) => item.id === record.id) ? current.map((item) => item.id === record.id ? record : item) : [record, ...current]);
      setContent("");
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 400 ? "That looks like sensitive or unsupported information. Save only a useful coaching fact, not a secret." : "The memory could not be saved. Please try again.");
    } finally { setBusy(false); }
  }

  async function saveEdit(memory: Memory) {
    if (!editingContent.trim()) { setError("Memory content cannot be blank."); return; }
    setBusy(true); setError(null);
    try { const updated = await updateMemory(createClient(), memory.id, { content: editingContent.trim() }); setMemories((current) => current.map((item) => item.id === updated.id ? updated : item)); setEditingId(null); }
    catch { setError("The memory could not be updated. Please try again."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!deletingMemory) return;
    const memory = deletingMemory;
    setBusy(true); setError(null);
    try { await deleteMemory(createClient(), memory.id); setMemories((current) => current.filter((item) => item.id !== memory.id)); setDeletingMemory(null); }
    catch { setError("The memory could not be deleted. Please try again."); }
    finally { setBusy(false); }
  }

  return <div className="memory-manager">
    <form className="memory-add-form" onSubmit={addMemory}>
      <div className="form-field"><label htmlFor="memory-category">Category</label><select id="memory-category" value={category} onChange={(event) => setCategory(event.target.value as MemoryCategory)}>{categories.map((item) => <option key={item} value={item}>{labels[item]}</option>)}</select></div>
      <div className="form-field memory-content-field"><label htmlFor="memory-content">What should DevStride remember?</label><textarea id="memory-content" value={content} onChange={(event) => setContent(event.target.value)} maxLength={1000} placeholder="For example: I am targeting backend engineering roles." /></div>
      <button type="submit" disabled={busy}>Add memory</button>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    {memories.length === 0 ? <div className="conversation-empty memory-empty"><h2>Nothing saved yet</h2><p className="muted">Add a goal, preference, project, skill, weakness, or achievement you want to carry into relevant practice.</p></div> : <ul className="memory-list">{memories.map((memory) => <li className="memory-card" key={memory.id}>
      <div className="memory-card-heading"><span className="status-pill">{labels[memory.category]}</span><span className="muted">{sources[memory.source_type] ?? "Saved context"}</span></div>
      {editingId === memory.id ? <div className="memory-edit"><label htmlFor={`edit-${memory.id}`}>Edit memory</label><textarea id={`edit-${memory.id}`} value={editingContent} onChange={(event) => setEditingContent(event.target.value)} maxLength={1000} /><div className="memory-actions"><button type="button" onClick={() => void saveEdit(memory)} disabled={busy}>Save</button><button type="button" className="button-secondary" onClick={() => setEditingId(null)}>Cancel</button></div></div> : <><p>{memory.content}</p><div className="memory-actions"><button type="button" className="button-secondary" onClick={() => { setEditingId(memory.id); setEditingContent(memory.content); }} aria-label={`Edit memory: ${memoryAccessibleName(memory.content)}`}>Edit</button><button type="button" className="button-secondary" onClick={() => setDeletingMemory(memory)} disabled={busy} aria-label={`Delete memory: ${memoryAccessibleName(memory.content)}`}>Delete</button></div></>}
    </li>)}</ul>}
    <Dialog open={deletingMemory !== null} title="Delete saved memory?" description="This removes the saved coaching context from your active Memory." onClose={() => setDeletingMemory(null)}>
      <div className="dialog-actions"><button type="button" className="button-danger" onClick={() => void remove()} disabled={busy}>Delete memory</button><button type="button" className="button-secondary" onClick={() => setDeletingMemory(null)}>Cancel</button></div>
    </Dialog>
  </div>;
}
