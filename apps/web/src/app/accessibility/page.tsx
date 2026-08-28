import Link from "next/link";

import { PublicPage } from "../../components/public-page";
import { createPublicMetadata } from "../../lib/site-metadata";

export const metadata = createPublicMetadata(
  "DevStride Accessibility",
  "Learn about DevStride's accessibility goal, supported considerations, and how to report accessibility problems.",
  "/accessibility",
);

export default function AccessibilityPage() {
  return (
    <PublicPage>
      <section className="public-page-hero" aria-labelledby="accessibility-title">
        <p className="eyebrow">Accessibility</p>
        <h1 id="accessibility-title">Practice should be open to more people.</h1>
        <p>
          DevStride aims to make software-engineering practice usable with different
          ways of navigating, reading, listening, and interacting.
        </p>
      </section>
      <article className="public-section public-section-surface public-prose" aria-labelledby="accessibility-content-title">
        <h2 id="accessibility-content-title">Our accessibility commitment</h2>
        <p>
          Accessibility is part of how we design and build DevStride. We aim to
          conform to WCAG 2.2 Level AA, while recognizing that this is an ongoing
          product and engineering goal rather than a certification or guarantee.
        </p>
        <h2>Accessibility goal</h2>
        <p>
          We work toward an experience that supports keyboard navigation, screen
          readers, magnification, voice control, and other assistive technologies
          across the public site and authenticated application.
        </p>
        <h2>Supported accessibility considerations</h2>
        <p>
          The application uses semantic structure, labeled forms, visible focus
          states, keyboard-accessible controls, responsive layouts, and text-based
          status and error messages. Audio and video practice includes permission
          states, text transcripts where technically available, and alternatives
          so users are not required to use realtime features to access the rest of
          DevStride.
        </p>
        <h2>AI-generated content</h2>
        <p>
          AI-generated responses, reports, and feedback can be incomplete or
          incorrect. We aim to present generated content in readable, navigable
          text and to communicate loading, error, and completion states clearly.
          Generated content should not be treated as professional, employment, or
          other high-stakes advice.
        </p>
        <h2>Ongoing improvements</h2>
        <p>
          We review accessibility as the product evolves, add automated coverage
          where practical, and use reported issues to prioritize improvements.
          Some advanced realtime and media experiences may still have limitations
          that require further testing with assistive technologies.
        </p>
        <h2>Feedback and accessibility problems</h2>
        <p>
          If a page or workflow creates an accessibility barrier, please use the
          <Link href="/support">Support page</Link> to find the currently available
          support route. Include the page, what you expected, what happened, and
          the input method or assistive technology involved when it is safe to do
          so. Do not include passwords, access tokens, API keys, or other secrets.
        </p>
      </article>
    </PublicPage>
  );
}
