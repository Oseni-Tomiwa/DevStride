import Link from "next/link";

import { DevStrideLogo } from "./brand/devstride-logo";

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-footer-brand">
        <Link className="public-brand" href="/" aria-label="DevStride home"><DevStrideLogo variant="footer" decorative /><span>DevStride</span></Link>
        <p>Practice with purpose. Keep moving forward.</p>
      </div>
      <div className="public-footer-group"><h2>Product</h2><a href="#product">Product</a><a href="#how-it-works">How it works</a><a href="#pricing">Pricing</a></div>
      <div className="public-footer-group"><h2>Explore</h2><Link href="/about">About</Link><Link href="/support">Support</Link></div>
      <div className="public-footer-group"><h2>Account</h2><Link href="/login">Log in</Link><Link href="/sign-up">Create account</Link></div>
      <div className="public-footer-group"><h2>Legal</h2><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
      <p className="public-footer-meta">© {new Date().getUTCFullYear()} DevStride.</p>
    </footer>
  );
}
