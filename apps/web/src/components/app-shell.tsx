import type { ReactNode } from "react";

import { AppFooter } from "./app-footer";
import { AppHeader, type AppSection } from "./app-header";

type AppShellProps = {
  children: ReactNode;
  current?: AppSection;
  contentClassName?: string;
};

export function AppShell({ children, current, contentClassName = "page-content" }: AppShellProps) {
  return (
    <div className="page-shell app-page app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <AppHeader current={current} />
      <main className={`app-main ${contentClassName}`} id="main-content" tabIndex={-1}>
        {children}
      </main>
      <AppFooter />
    </div>
  );
}
