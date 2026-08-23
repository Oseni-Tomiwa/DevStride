import Link from "next/link";

import { PublicPage } from "../components/public-page";

const practiceCards = [
  { eyebrow: "Mentor", title: "Get unstuck with focused guidance.", text: "Mentor Mode and Live Mentor help you work through technical ideas, trade-offs, and communication with useful feedback." },
  { eyebrow: "Interview", title: "Practice the conversation, not just the answer.", text: "Prepare with technical, behavioral, Live Interview, and Video Interview formats that keep the interviewer experience in view." },
  { eyebrow: "Team", title: "Rehearse how engineering work gets done.", text: "Team Practice gives you scenarios for explaining decisions, collaborating, and communicating under realistic constraints." },
];

const workflow = [
  ["01", "Set your direction", "Build your profile and choose the skills or communication habits you want to improve."],
  ["02", "Practice", "Use Mentor, Interview, Team, Live, or Video practice for the situation you want to rehearse."],
  ["03", "Review evidence", "See practice reports, strengths, weaknesses, and progress grounded in completed sessions."],
  ["04", "Keep moving", "Use the next-practice recommendation to choose a useful next step, with a reason you can understand."],
] as const;

const faqs = [
  ["What is DevStride?", "DevStride is an AI-powered practice environment for software engineers to learn, communicate, prepare for interviews, and grow professionally."],
  ["Who is DevStride for?", "It is for junior engineers, self-taught developers, students, and working engineers who want structured technical or communication practice."],
  ["What can I practice?", "You can work through Mentor, Interview, Team Practice, Live Mentor, Live Interview, and Video Interview experiences."],
  ["Does DevStride replace a real mentor?", "No. DevStride is a practice and reflection tool. It can help you rehearse and review, but it does not replace human mentorship or hiring decisions."],
  ["Does the AI see my camera?", "No. In Video Interview, the camera preview stays local in your browser. Camera video is not sent to OpenAI and is not stored or recorded by DevStride. Audio is used for the realtime interview interaction."],
  ["How does progress tracking work?", "Progress uses your owned practice history, structured session summaries, reports, and bounded evidence to show what you have practiced and suggest what to try next."],
  ["Can I use DevStride on mobile?", "The core application is responsive across desktop and mobile. Live voice and video experiences still depend on your browser, microphone, and camera permissions."],
  ["Is DevStride free?", "DevStride is currently available during its launch and beta period. Availability and future pricing will be communicated as the product develops."],
  ["How do I contact support?", "Support and feedback contact details are coming soon. For now, use the application and share feedback through the launch channel provided to your team."],
] as const;

export default function HomePage() {
  return (
    <PublicPage>
        <section className="public-hero" aria-labelledby="hero-title">
          <div className="public-hero-copy">
            <p className="eyebrow">Your next engineering stride</p>
            <h1 id="hero-title">Grow into the engineer you want to become.</h1>
            <p className="public-hero-description">Practice real engineering conversations, interviews, and problem-solving with AI guidance that adapts to your goals and tracks how you improve.</p>
            <div className="landing-actions public-hero-actions"><Link className="landing-button" href="/sign-up">Start practicing</Link><a className="landing-button landing-button-secondary" href="#how-it-works">See how it works</a></div>
            <p className="public-hero-note">A focused workspace for practice, feedback, evidence, and the next step.</p>
          </div>
          <div className="product-visual" aria-label="Representative DevStride practice workspace">
            <div className="product-visual-topline"><span className="status-dot" /> Practice Space <span className="product-visual-mode">Mentor Mode</span></div>
            <div className="product-visual-body"><p className="eyebrow">Recommended next practice</p><h2>Explain API failure handling clearly</h2><p>Because your recent practice touched API design and communicating trade-offs.</p><div className="product-visual-actions"><span>Goal focus</span><strong>Backend readiness</strong><span className="product-visual-arrow">→</span></div></div>
            <div className="product-visual-footer"><span>Practice report</span><span>Progress evidence</span><span>Memory stays in your control</span></div>
          </div>
        </section>

        <section className="public-section public-section-narrow" id="product" aria-labelledby="product-title"><p className="eyebrow">Practice like the real thing</p><h2 id="product-title">Build confidence through deliberate reps.</h2><p className="section-intro">DevStride brings the parts of engineering growth together in one place, so every practice session has a purpose and a useful follow-through.</p><div className="value-grid"><article><span className="value-number">01</span><h3>Practice real situations</h3><p>Technical interviews, behavioral interviews, live voice, video setup, and team communication scenarios.</p></article><article><span className="value-number">02</span><h3>Get guidance when it matters</h3><p>Mentor Mode and Live Mentor help you reason, revise, and communicate without generic praise.</p></article><article><span className="value-number">03</span><h3>Know what to do next</h3><p>Goals, Progress, Practice Reports, and Memory connect evidence to a focused next-practice recommendation.</p></article></div></section>

        <section className="public-section public-section-surface" id="how-it-works" aria-labelledby="how-title"><div className="section-heading-row"><div><p className="eyebrow">How it works</p><h2 id="how-title">A clearer loop for getting better.</h2></div><p className="section-heading-aside">No certification claims. No mystery score. Just practice you can review and build on.</p></div><ol className="workflow-grid">{workflow.map(([number, title, text]) => <li key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></li>)}</ol></section>

        <section className="public-section" aria-labelledby="formats-title"><div className="section-heading-row"><div><p className="eyebrow">Choose your format</p><h2 id="formats-title">Meet the moment you want to rehearse.</h2></div><p className="section-heading-aside">Start in text, then move into live formats when you are ready to practice under more pressure.</p></div><div className="practice-card-grid">{practiceCards.map((card) => <article className="public-practice-card" key={card.eyebrow}><p className="eyebrow">{card.eyebrow}</p><h3>{card.title}</h3><p>{card.text}</p></article>)}</div></section>

        <section className="public-section public-section-surface public-feature-split" aria-labelledby="evidence-title"><div><p className="eyebrow">Practice → feedback → evidence → next step</p><h2 id="evidence-title">A workspace that remembers the useful parts.</h2><p>Set Goals and Focus Areas, work through practice, and review grounded reports in Progress. Bounded Memory helps continuity stay transparent and under your control.</p><Link className="text-link" href="/sign-up">Build your practice loop →</Link></div><div className="evidence-stack"><div><span>Goal</span><strong>Backend readiness</strong><small>Focus: API design</small></div><div><span>Report</span><strong>Strength: clear trade-offs</strong><small>Next: explain failure handling</small></div><div><span>Progress</span><strong>Keep the evidence moving</strong><small>Recommendation has a reason</small></div></div></section>

        <section className="public-section public-privacy" aria-labelledby="privacy-title"><div><p className="eyebrow">Video Interview</p><h2 id="privacy-title">Camera stays where it belongs: with you.</h2></div><p>Video Interview uses your camera for a local preview only. Camera video is not sent to OpenAI and is not stored or recorded by DevStride. Your microphone audio powers the realtime interview interaction.</p></section>

        <section className="public-section public-section-surface" id="pricing" aria-labelledby="pricing-title"><div className="pricing-card"><div><p className="eyebrow">Launch availability</p><h2 id="pricing-title">Start with the whole practice workspace.</h2><p>DevStride is currently available during its launch/beta period. No paid tiers or future pricing promises are being presented here.</p></div><Link className="landing-button" href="/sign-up">Start practicing</Link></div></section>

        <section className="public-section public-faq" id="faq" aria-labelledby="faq-title"><p className="eyebrow">Questions, answered</p><h2 id="faq-title">Before you take your next stride.</h2><div className="faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
    </PublicPage>
  );
}
