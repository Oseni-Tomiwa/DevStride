import Link from "next/link";

import { PublicPage } from "../../components/public-page";
import { createPublicMetadata } from "../../lib/site-metadata";

export const metadata = createPublicMetadata(
  "About DevStride",
  "Learn how DevStride helps software engineers practice, review evidence, and choose a useful next step.",
  "/about",
);

export default function AboutPage() {
  return (
    <PublicPage>
      <section className="public-page-hero" aria-labelledby="about-title">
        <p className="eyebrow">About DevStride</p>
        <h1 id="about-title">Practice the work behind the work.</h1>
        <p>DevStride is an AI-powered practice environment for software engineers who want to learn, communicate, prepare, and grow through deliberate reps.</p>
      </section>
      <section className="public-section public-section-surface public-reading-grid" aria-labelledby="about-work-title">
        <div><p className="eyebrow">What it is</p><h2 id="about-work-title">A focused place to rehearse engineering situations.</h2></div>
        <div className="public-prose"><p>Engineering growth includes more than knowing the answer. It also means explaining trade-offs, asking better questions, handling uncertainty, and communicating decisions.</p><p>DevStride brings Mentor Mode, Interview Mode, Team Practice, Live Mentor, Live Interview, Video Interview, Goals, Progress, Reports, and bounded Memory into one practice loop.</p></div>
      </section>
      <section className="public-section" aria-labelledby="about-loop-title">
        <p className="eyebrow">The practice loop</p><h2 id="about-loop-title">Practice → feedback → evidence → next step.</h2>
        <div className="value-grid"><article><span className="value-number">01</span><h3>Practice with purpose</h3><p>Choose a format that matches the situation you want to rehearse.</p></article><article><span className="value-number">02</span><h3>Review what happened</h3><p>Use grounded summaries, reports, and progress evidence to reflect on the session.</p></article><article><span className="value-number">03</span><h3>Keep moving</h3><p>Follow an explainable recommendation toward a useful next practice.</p></article></div>
      </section>
      <section className="public-section public-section-surface public-cta-strip" aria-labelledby="about-cta-title"><div><p className="eyebrow">Start your next rep</p><h2 id="about-cta-title">Make practice a habit you can see.</h2></div><Link className="landing-button" href="/sign-up">Create account</Link></section>
    </PublicPage>
  );
}
