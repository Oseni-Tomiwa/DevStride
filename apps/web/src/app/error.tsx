"use client";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="recovery-page" aria-labelledby="error-title">
      <section className="recovery-card">
        <p className="eyebrow">DevStride</p>
        <h1 id="error-title">Something went off track.</h1>
        <p className="muted">We could not finish loading this page. Try again, or return to your dashboard.</p>
        <div className="recovery-actions">
          <button type="button" onClick={reset}>Try again</button>
          <a className="landing-button landing-button-secondary" href="/dashboard">Go to dashboard</a>
        </div>
      </section>
    </main>
  );
}
