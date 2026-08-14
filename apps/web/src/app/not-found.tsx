import Link from "next/link";

export default function NotFound() {
  return (
    <main className="recovery-page" aria-labelledby="not-found-title">
      <section className="recovery-card">
        <p className="eyebrow">DevStride</p>
        <h1 id="not-found-title">That page is not here.</h1>
        <p className="muted">The link may be outdated, or the page may have moved.</p>
        <div className="recovery-actions">
          <Link className="landing-button" href="/dashboard">Go to dashboard</Link>
          <Link className="landing-button landing-button-secondary" href="/">Return home</Link>
        </div>
      </section>
    </main>
  );
}
