import type { ReactNode } from "react";

import { PublicFooter } from "./public-footer";
import { PublicNav } from "./public-nav";

export function PublicPage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`public-site ${className}`.trim()}>
      <a className="skip-link public-skip-link" href="#main-content">Skip to content</a>
      <PublicNav />
      <main id="main-content">{children}</main>
      <PublicFooter />
    </div>
  );
}
