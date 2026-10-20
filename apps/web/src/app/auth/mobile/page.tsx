import type { Metadata } from "next";

import { MobileAuthBridge } from "../../../features/auth/components/mobile-auth-bridge";
import { getPublicSiteOrigin } from "../../../lib/site-metadata";
import { getSupabaseConfig } from "../../../lib/supabase/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Continue securely",
  robots: { index: false, follow: false },
};

export default function MobileAuthPage() {
  const { url } = getSupabaseConfig();
  const bridgeOptions = {
    siteOrigin: getPublicSiteOrigin().origin,
    supabaseOrigin: new URL(url).origin,
  };

  return <MobileAuthBridge bridgeOptions={bridgeOptions} />;
}
