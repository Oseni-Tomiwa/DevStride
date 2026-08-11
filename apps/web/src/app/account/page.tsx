import { redirect } from "next/navigation";

import { AppShell } from "../../components/app-shell";
import { createClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell current="account">
      <header className="page-heading">
        <p className="eyebrow">Account</p>
        <h1>Your account.</h1>
        <p className="muted">Review the sign-in information connected to DevStride.</p>
      </header>
      <section className="account-card" aria-labelledby="account-details-title">
        <div>
          <h2 id="account-details-title">Sign-in details</h2>
          <p className="muted">Your email comes from your authenticated Supabase account.</p>
        </div>
        <dl className="account-details">
          <div>
            <dt>Email</dt>
            <dd>{user.email ?? "Not available"}</dd>
          </div>
        </dl>
      </section>
    </AppShell>
  );
}
