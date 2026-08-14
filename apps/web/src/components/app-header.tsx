"use client";

import React, { useEffect, useRef, useState } from "react";
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isMenuOpen]);

  function closeMenu() {
    setIsMenuOpen(false);
  }

  return (
    <header className="app-header">
      <Link href="/dashboard" className="app-brand" aria-label="DevStride dashboard">
        <DevStrideLogo variant="header" decorative />
        <span className="app-brand-name">DevStride</span>
      </Link>
      <div className="app-nav-wrap" ref={menuRef}>
        <button
          ref={menuButtonRef}
          type="button"
          className="app-nav-toggle"
          aria-expanded={isMenuOpen}
          aria-controls="authenticated-navigation"
          aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <span aria-hidden="true">{isMenuOpen ? "×" : "☰"}</span>
        </button>
        <nav
          id="authenticated-navigation"
          className={isMenuOpen ? "app-nav app-nav-open" : "app-nav"}
          aria-label="Authenticated navigation"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={current === link.section ? "nav-link nav-link-active" : "nav-link"}
              aria-current={current === link.section ? "page" : undefined}
              onClick={closeMenu}
            >
              {link.label}
            </Link>
          ))}
          <div className="app-nav-logout" onClick={closeMenu}>
            <LogoutButton />
          </div>
        </nav>
      </div>
    </header>
  );
}
