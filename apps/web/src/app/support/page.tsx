import Link from "next/link";

import { PublicPage } from "../../components/public-page";
import { createPublicMetadata } from "../../lib/site-metadata";

export const metadata = createPublicMetadata(
  "DevStride Support",
  "Find help with your DevStride account, practice sessions, realtime setup, and data questions.",
  "/support",
);

function configuredSupportEmail() {
  const value = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

export default function SupportPage() {
  const supportEmail = configuredSupportEmail();
  return (
    <PublicPage>
      <section className="public-page-hero" aria-labelledby="support-title"><p className="eyebrow">Support</p><h1 id="support-title">A clear place to get unstuck.</h1><p>Find the right next step for account access, practice sessions, or realtime setup. We keep support guidance practical and safe.</p></section>
      <section className="public-section public-section-surface" aria-labelledby="support-topics-title"><p className="eyebrow">Help topics</p><h2 id="support-topics-title">Start with the area that needs attention.</h2><div className="support-grid"><article><h3>Account and sign-in</h3><p>For email confirmation, login, session, or logout issues, check the <Link href="/login">login page</Link> and your Supabase confirmation email.</p></article><article><h3>Practice and reports</h3><p>For conversation, Goals, Progress, Reports, or Memory questions, refresh the page and check that you are using the intended authenticated account.</p></article><article><h3>Microphone and camera</h3><p>Allow the browser permission for realtime practice. Camera preview is local-only; microphone audio powers the live interaction.</p></article><article><h3>Privacy and data</h3><p>Read the <Link href="/privacy">Privacy page</Link> for the data categories DevStride currently stores and how the Video Interview camera behaves.</p></article></div></section>
      <section className="public-section public-support-contact" aria-labelledby="support-contact-title"><p className="eyebrow">Need more help?</p><h2 id="support-contact-title">Choose the safest available route.</h2>{supportEmail ? <p>Contact <a href={`mailto:${supportEmail}`}>{supportEmail}</a> with a short description of the issue. Do not include passwords, access tokens, or API keys.</p> : <p>Support contact details are not configured yet. The product owner should set <code>NEXT_PUBLIC_SUPPORT_EMAIL</code> before launch. Until then, use the launch channel provided to your team and do not share passwords, access tokens, or API keys.</p>}<p><Link className="text-link" href="/#faq">Read common questions on the home page →</Link></p></section>
    </PublicPage>
  );
}
