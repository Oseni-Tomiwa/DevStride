export default function ConversationLoading() {
  return (
    <main className="page-shell">
      <section className="conversation-shell conversation-empty" role="status" aria-live="polite">
        <p className="eyebrow">Practice space</p>
        <h1>Loading conversation…</h1>
      </section>
    </main>
  );
}
