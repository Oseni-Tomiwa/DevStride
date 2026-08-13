import Link from "next/link";
import { DevStrideLogo } from "./brand/devstride-logo";

export function AppFooter() {
  return (
    <footer className="app-footer">
      <div className="app-footer-copy">
        <Link href="/dashboard" className="app-footer-brand" aria-label="DevStride dashboard">
          <DevStrideLogo variant="footer" />
          <span>DevStride</span>
        </Link>
        <p>Focused practice for software engineers.</p>
      </div>
      <nav className="app-footer-nav" aria-label="Footer navigation">
        <Link href="/conversations">Conversations</Link>
        <Link href="/profile">Profile</Link>
        <Link href="/account">Account</Link>
      </nav>
      <p className="app-footer-meta">© {new Date().getUTCFullYear()} DevStride.</p>
    </footer>
  );
}
