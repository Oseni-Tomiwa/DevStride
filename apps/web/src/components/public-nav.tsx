"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { DevStrideLogo } from "./brand/devstride-logo";

export function PublicNav() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  return (
    <header className="public-header">
      <Link className="public-brand" href="/" aria-label="DevStride home">
        <DevStrideLogo variant="landing" decorative />
        <span>DevStride</span>
      </Link>
      <nav ref={menuRef} id="public-navigation" className={open ? "public-nav public-nav-open" : "public-nav"} aria-label="Public navigation">
        <a href="#product" onClick={() => setOpen(false)}>Product</a>
        <a href="#how-it-works" onClick={() => setOpen(false)}>How it works</a>
        <a href="#pricing" onClick={() => setOpen(false)}>Pricing</a>
        <a href="#faq" onClick={() => setOpen(false)}>FAQ</a>
        <div className="public-nav-actions">
          <Link href="/login" onClick={() => setOpen(false)}>Sign in</Link>
          <Link className="landing-button landing-button-small" href="/sign-up" onClick={() => setOpen(false)}>Start practicing</Link>
        </div>
      </nav>
      <button ref={toggleRef} className="public-nav-toggle" type="button" aria-expanded={open} aria-controls="public-navigation" aria-label={open ? "Close public navigation" : "Open public navigation"} onClick={() => setOpen((current) => !current)}>
        <span aria-hidden="true">{open ? "×" : "☰"}</span>
      </button>
    </header>
  );
}
