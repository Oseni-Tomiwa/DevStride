"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

import { DevStrideLogo } from "../../../components/brand/devstride-logo";
import {
  parseMobileAuthBridgeFragment,
  type MobileAuthBridgeOptions,
} from "../../../lib/supabase/mobile-auth-bridge";

type Props = {
  bridgeOptions: MobileAuthBridgeOptions;
  fragment?: string;
  navigate?: (url: string) => void;
};

export function MobileAuthBridge({
  bridgeOptions,
  fragment,
  navigate = (url) => window.location.assign(url),
}: Props) {
  const [busy, setBusy] = useState(false);
  const currentFragment = useSyncExternalStore(
    () => () => undefined,
    () => fragment ?? window.location.hash,
    () => fragment ?? "",
  );
  const result = useMemo(
    () => currentFragment ? parseMobileAuthBridgeFragment(currentFragment, bridgeOptions) : null,
    [bridgeOptions, currentFragment],
  );
  const state = busy || result === null ? "loading" : result.ok ? "ready" : "invalid";

  function continueAuthentication() {
    if (!result?.ok) return;
    setBusy(true);
    navigate(result.verificationUrl);
  }

  return (
    <main className="recovery-page" aria-labelledby="mobile-auth-title">
      <section className="recovery-card mobile-auth-card">
        <DevStrideLogo variant="auth" />
        <h1 id="mobile-auth-title">Continue securely</h1>
        {state === "loading" && <p role="status">Checking this link…</p>}
        {state === "ready" && (
          <>
            <p>This action must be confirmed before DevStride can open.</p>
            <button type="button" onClick={continueAuthentication}>
              Continue to DevStride
            </button>
            <p className="muted">Use the same device where you started this request.</p>
          </>
        )}
        {state === "invalid" && (
          <p className="form-error" role="alert">
            This link is invalid or expired. Return to DevStride and request a new email.
          </p>
        )}
      </section>
    </main>
  );
}
