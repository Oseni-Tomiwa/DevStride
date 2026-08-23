"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";

import { createClient } from "../../../lib/supabase/client";
import { Dialog } from "../../../components/dialog";
import { PASSWORD_MIN_LENGTH } from "../../auth/validation";
import { deleteAccount, exportAccountData } from "../api";

type AccountSettingsProps = {
  email: string | null;
  emailConfirmedAt: string | null;
  createdAt: string | null;
};

type SessionScope = "others" | "global";
type PendingAction = "email" | "password" | "local" | "export" | "delete" | SessionScope | null;

const emailSchema = z.string().trim().email("Enter a valid email address.");
const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);

function formatAccountDate(value: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

export function AccountSettings({ email, emailConfirmedAt, createdAt }: AccountSettingsProps) {
  const router = useRouter();
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionSuccess, setSessionSuccess] = useState<string | null>(null);
  const [confirmationScope, setConfirmationScope] = useState<SessionScope | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [privacySuccess, setPrivacySuccess] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  async function handleEmailChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailError(null);
    setEmailSuccess(null);

    const parsed = emailSchema.safeParse(newEmail);
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
      return;
    }
    if (email && parsed.data.toLowerCase() === email.toLowerCase()) {
      setEmailError("Enter a different email address.");
      return;
    }

    setPendingAction("email");
    try {
      const { error } = await createClient().auth.updateUser(
        { email: parsed.data },
        { emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Faccount` },
      );
      if (error) {
        setEmailError("We could not request that email change. Please try again.");
        return;
      }
      setNewEmail("");
      setEmailSuccess(
        "Confirmation instructions have been sent. Your current email remains in place until Supabase confirms the change.",
      );
    } catch {
      setEmailError("We could not request that email change. Please try again.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handlePasswordChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success) {
      setPasswordError(parsed.error.issues[0]?.message ?? "Enter a valid password.");
      return;
    }
    if (newPassword !== passwordConfirmation) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setPendingAction("password");
    try {
      const { error } = await createClient().auth.updateUser({ password: parsed.data });
      if (error) {
        setPasswordError("We could not update your password. Please try again.");
        return;
      }
      setNewPassword("");
      setPasswordConfirmation("");
      setPasswordSuccess("Your password has been updated.");
    } catch {
      setPasswordError("We could not update your password. Please try again.");
    } finally {
      setPendingAction(null);
    }
  }

  async function signOut(scope: "local" | SessionScope) {
    setSessionError(null);
    setSessionSuccess(null);
    setPendingAction(scope);
    try {
      const { error } = await createClient().auth.signOut({ scope });
      if (error) {
        setSessionError("We could not update your sessions. Please try again.");
        return;
      }
      if (scope !== "others") {
        await fetch("/auth/session-policy", { method: "DELETE", credentials: "same-origin", cache: "no-store" });
      }
      setConfirmationScope(null);
      if (scope === "others") {
        setSessionSuccess("Other sessions have been signed out. This session remains active.");
        return;
      }
      router.push("/login");
      router.refresh();
    } catch {
      setSessionError("We could not update your sessions. Please try again.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleExport() {
    setPrivacyError(null);
    setPrivacySuccess(null);
    setPendingAction("export");
    try {
      const payload = await exportAccountData(createClient());
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `devstride-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setPrivacySuccess("Your data export is ready.");
    } catch {
      setPrivacyError("We could not prepare your export. Please try again.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDelete() {
    if (deleteConfirmation !== "DELETE") return;
    setPrivacyError(null);
    setPrivacySuccess(null);
    setPendingAction("delete");
    try {
      await deleteAccount(createClient());
      try {
        await createClient().auth.signOut({ scope: "local" });
      } catch {
        // The backend deletion has already completed; local cleanup is best effort.
      }
      await fetch("/auth/session-policy", { method: "DELETE", credentials: "same-origin", cache: "no-store" });
      setDeleteDialogOpen(false);
      router.push("/");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error && error.message.includes("Recent authentication")
        ? "Please sign in again, then return here to confirm account deletion."
        : "We could not delete your account. No further action was taken; please try again.";
      setPrivacyError(message);
    } finally {
      setPendingAction(null);
    }
  }

  const isBusy = pendingAction !== null;

  return (
    <div className="account-settings">
      <section className="account-card" aria-labelledby="sign-in-details-title">
        <div className="account-section-heading">
          <div>
            <h2 id="sign-in-details-title">Sign-in details</h2>
            <p className="muted">Review your authenticated Supabase account information.</p>
          </div>
        </div>
        <dl className="account-details">
          <div><dt>Email</dt><dd>{email ?? "Not available"}</dd></div>
          <div>
            <dt>Email status</dt>
            <dd><span className={emailConfirmedAt ? "status-pill status-pill-success" : "status-pill"}>{emailConfirmedAt ? "Verified" : "Not verified"}</span></dd>
          </div>
          <div><dt>Account created</dt><dd><time dateTime={createdAt ?? undefined}>{formatAccountDate(createdAt)}</time></dd></div>
        </dl>
        <form className="account-form" onSubmit={handleEmailChange} noValidate>
          <div className="field-group">
            <label htmlFor="new-email">Change email</label>
            <input id="new-email" name="new-email" type="email" autoComplete="email" value={newEmail} aria-invalid={Boolean(emailError)} aria-describedby={emailError ? "new-email-error" : "new-email-hint"} onChange={(event) => { setNewEmail(event.target.value); setEmailError(null); setEmailSuccess(null); }} />
            <p className="field-hint" id="new-email-hint">Supabase may require confirmation from your current and new addresses.</p>
            {emailError && <p className="field-error" id="new-email-error" role="alert">{emailError}</p>}
          </div>
          {emailSuccess && <p className="form-success" role="status">{emailSuccess}</p>}
          <div className="account-form-actions"><button type="submit" disabled={isBusy}>{pendingAction === "email" ? "Requesting change…" : "Change email"}</button></div>
        </form>
      </section>

      <section className="account-card" aria-labelledby="security-title">
        <div className="account-section-heading"><div><h2 id="security-title">Security</h2><p className="muted">Choose a new password for this signed-in account.</p></div></div>
        <form className="account-form" onSubmit={handlePasswordChange} noValidate>
          <div className="field-grid">
            <div className="field-group">
              <label htmlFor="new-password">New password</label>
              <input id="new-password" name="new-password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} value={newPassword} aria-describedby="password-hint" onChange={(event) => { setNewPassword(event.target.value); setPasswordError(null); setPasswordSuccess(null); }} />
            </div>
            <div className="field-group">
              <label htmlFor="confirm-password">Confirm new password</label>
              <input id="confirm-password" name="confirm-password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} value={passwordConfirmation} aria-invalid={Boolean(passwordError)} aria-describedby={passwordError ? "password-error" : "password-hint"} onChange={(event) => { setPasswordConfirmation(event.target.value); setPasswordError(null); setPasswordSuccess(null); }} />
            </div>
          </div>
          <p className="field-hint" id="password-hint">Use at least {PASSWORD_MIN_LENGTH} characters.</p>
          {passwordError && <p className="form-error" id="password-error" role="alert">{passwordError}</p>}
          {passwordSuccess && <p className="form-success" role="status">{passwordSuccess}</p>}
          <div className="account-form-actions"><button type="submit" disabled={isBusy}>{pendingAction === "password" ? "Updating password…" : "Change password"}</button></div>
        </form>
      </section>

      <section className="account-card" aria-labelledby="sessions-title">
        <div className="account-section-heading"><div><h2 id="sessions-title">Sessions</h2><p className="muted">Control where your DevStride account remains signed in.</p></div></div>
        <div className="session-actions">
          <div><div><h3>This device</h3><p className="muted">End only the session in this browser.</p></div><button type="button" className="button-secondary" disabled={isBusy} onClick={() => void signOut("local")}>Sign out this session</button></div>
          <div><div><h3>Other sessions</h3><p className="muted">Keep this browser signed in and revoke other sessions.</p></div><button type="button" className="button-secondary" disabled={isBusy} onClick={() => setConfirmationScope("others")}>Sign out other sessions</button></div>
          <div><div><h3>Everywhere</h3><p className="muted">Revoke all sessions, including this browser.</p></div><button type="button" className="button-danger" disabled={isBusy} onClick={() => setConfirmationScope("global")}>Sign out everywhere</button></div>
        </div>
        {confirmationScope && (
          <div className="session-confirmation" role="group" aria-labelledby="session-confirmation-title">
            <div><h3 id="session-confirmation-title">{confirmationScope === "others" ? "Sign out other sessions?" : "Sign out everywhere?"}</h3><p>{confirmationScope === "others" ? "Other browsers and devices will need to log in again. This session stays active." : "Every browser and device, including this one, will need to log in again."}</p></div>
            <div className="session-confirmation-actions">
              <button type="button" className="button-secondary" disabled={isBusy} onClick={() => setConfirmationScope(null)}>Cancel</button>
              <button type="button" className={confirmationScope === "global" ? "button-danger" : undefined} disabled={isBusy} onClick={() => void signOut(confirmationScope)}>{pendingAction === confirmationScope ? "Signing out…" : "Confirm sign out"}</button>
            </div>
          </div>
        )}
        {sessionError && <p className="form-error" role="alert">{sessionError}</p>}
        {sessionSuccess && <p className="form-success" role="status">{sessionSuccess}</p>}
      </section>

      <section className="account-card account-privacy-card" aria-labelledby="privacy-controls-title">
        <div className="account-section-heading"><div><h2 id="privacy-controls-title">Data &amp; privacy</h2><p className="muted">Take your data with you or permanently remove your active DevStride account data.</p></div></div>
        <div className="privacy-actions">
          <div><h3>Export my data</h3><p className="muted">Download a JSON copy of your account, Profile, Goals, conversations, reports, realtime metrics, and Memory.</p><button type="button" className="button-secondary" disabled={isBusy} onClick={() => void handleExport()}>{pendingAction === "export" ? "Preparing export…" : "Export my data"}</button></div>
          <div><h3>Delete account</h3><p className="muted">This removes active DevStride product data. Export first if you may need a copy.</p><button type="button" className="button-danger" disabled={isBusy} onClick={() => { setPrivacyError(null); setPrivacySuccess(null); setDeleteConfirmation(""); setDeleteDialogOpen(true); }}>Delete account</button></div>
        </div>
        {privacyError && <p className="form-error" role="alert">{privacyError}</p>}
        {privacySuccess && <p className="form-success" role="status">{privacySuccess}</p>}
      </section>

      <Dialog open={deleteDialogOpen} title="Delete your DevStride account?" description="This is permanent for active DevStride data. You may need to sign in again if your recent authentication is too old." onClose={() => { if (!isBusy) setDeleteDialogOpen(false); }} closeOnEscape={!isBusy}>
        <div className="delete-account-dialog">
          <p>We will remove your Profile, Goals and focus areas, conversations and messages, reports, realtime metrics, and Memory. Supabase will then delete the authenticated account.</p>
          <p>Export your data first if you want a copy. Narrow security or legal records are not created by this application; future infrastructure policies must be disclosed separately.</p>
          <div className="field-group"><label htmlFor="delete-account-confirmation">Type DELETE to confirm</label><input id="delete-account-confirmation" value={deleteConfirmation} autoComplete="off" onChange={(event) => setDeleteConfirmation(event.target.value)} aria-describedby="delete-account-hint" /><p className="field-hint" id="delete-account-hint">This confirmation is not a substitute for recent authentication.</p></div>
          <div className="dialog-actions"><button type="button" className="button-secondary" disabled={isBusy} onClick={() => setDeleteDialogOpen(false)}>Cancel</button><button type="button" className="button-danger" disabled={isBusy || deleteConfirmation !== "DELETE"} onClick={() => void handleDelete()}>{pendingAction === "delete" ? "Deleting account…" : "Permanently delete account"}</button></div>
        </div>
      </Dialog>
    </div>
  );
}
