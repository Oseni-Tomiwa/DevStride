import { redirect } from "next/navigation";

import { AppShell } from "../../components/app-shell";
import { AccountSettings } from "../../features/account/components/account-settings";
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
        <h1>Account settings.</h1>
        <p className="muted">Manage your sign-in and security settings.</p>
      </header>
      <AccountSettings email={user.email ?? null} emailConfirmedAt={user.email_confirmed_at ?? null} createdAt={user.created_at ?? null} />
    </AppShell>
  );
}
