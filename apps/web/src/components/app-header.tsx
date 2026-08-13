import React from "react";
import Link from "next/link";

import { LogoutButton } from "../features/auth/components/logout-button";
import { DevStrideLogo } from "./brand/devstride-logo";

export type AppSection = "dashboard" | "onboarding" | "account" | "profile" | "conversations" | "progress" | "goals" | "memories";

type AppHeaderProps = {
  current?: AppSection;
};

const links: Array<{ href: string; label: string; section: AppSection }> = [
  { href: "/dashboard", label: "Dashboard", section: "dashboard" },
  { href: "/conversations", label: "Conversations", section: "conversations" },
  { href: "/progress", label: "Progress", section: "progress" },
  { href: "/goals", label: "Goals", section: "goals" },
  { href: "/memories", label: "Memory", section: "memories" },
  { href: "/profile", label: "Profile", section: "profile" },
  { href: "/account", label: "Account", section: "account" },
];

export function AppHeader({ current }: AppHeaderProps) {
  return (
    <header className="app-header">
      <Link href="/dashboard" className="app-brand" aria-label="DevStride dashboard">
        <DevStrideLogo variant="header" />
        <span className="app-brand-name">DevStride</span>
      </Link>
      <nav className="app-nav" aria-label="Authenticated navigation">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={current === link.section ? "nav-link nav-link-active" : "nav-link"}
            aria-current={current === link.section ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
        <LogoutButton />
      </nav>
    </header>
  );
}
