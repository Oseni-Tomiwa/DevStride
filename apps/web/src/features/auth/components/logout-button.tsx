"use client";

import React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "../../../lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setError(null);
    const { error: logoutError } = await createClient().auth.signOut({ scope: "local" });
    if (logoutError) {
      setError("We could not log you out. Please try again.");
      return;
    }
    await fetch("/auth/session-policy", { method: "DELETE", credentials: "same-origin", cache: "no-store" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div>
      <button type="button" onClick={handleLogout}>Log out</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
