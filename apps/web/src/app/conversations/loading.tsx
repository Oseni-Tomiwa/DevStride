export default function ConversationsLoading() {
  return (
    <main className="page-shell">
      <section className="conversation-shell conversation-empty" role="status" aria-live="polite">
        <p className="eyebrow">Practice space</p>
        <h1>Loading conversations…</h1>
      </section>
    </main>
  );
}
