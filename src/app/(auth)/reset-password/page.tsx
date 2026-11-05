"use client";

/**
 * Set / reset password.
 *
 * Reached from two emails:
 *   - Employee invite (`inviteUserByEmail`, ?invite=1). Admin-API invite
 *     links come back with the session in the URL hash (#access_token=…
 *     &refresh_token=…), because no PKCE verifier exists for them.
 *   - "Forgot password" (`resetPasswordForEmail` from the server client),
 *     which returns ?code=… for a PKCE exchange in this browser.
 *
 * Either way we turn the link into a session, then let the user pick a
 * password with `auth.updateUser`. Without this page invited cleaners
 * had no password and could never sign in to the mobile app.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { routes } from "@/lib/constants/routes";

type Phase = "loading" | "ready" | "invalid" | "saving" | "done";

export default function ResetPasswordPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [isInvite, setIsInvite] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    (async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      setIsInvite(url.searchParams.get("invite") === "1" || hash.get("type") === "invite");

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const code = url.searchParams.get("code");

      try {
        if (accessToken && refreshToken) {
          const { error: e } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (e) throw e;
        } else if (code) {
          const { error: e } = await supabase.auth.exchangeCodeForSession(code);
          if (e) throw e;
        }
      } catch {
        // Fall through to the session check: an expired or reused link
        // leaves no session and shows the "link invalid" state.
      }
      // Strip tokens from the address bar so they don't end up in
      // history, screenshots or a shared link.
      window.history.replaceState(null, "", url.pathname + (url.searchParams.get("invite") ? "?invite=1" : ""));

      const { data } = await supabase.auth.getUser();
      // Show whose password is being set: if the link failed but the
      // browser already holds someone else's session, the form would
      // otherwise silently change that account's password.
      setEmail(data.user?.email ?? null);
      setPhase(data.user ? "ready" : "invalid");
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Mindestens 8 Zeichen. / At least 8 characters.");
    if (password.length > 72) return setError("Höchstens 72 Zeichen. / At most 72 characters.");
    if (password !== confirm)
      return setError("Die Passwörter stimmen nicht überein. / Passwords do not match.");
    setPhase("saving");
    const supabase = createSupabaseBrowserClient();
    const { error: e2 } = await supabase.auth.updateUser({ password });
    if (e2) {
      setError(
        e2.message.toLowerCase().includes("different")
          ? "Bitte ein neues Passwort wählen. / Please choose a new password."
          : "Speichern fehlgeschlagen. Bitte erneut versuchen. / Saving failed, please try again.",
      );
      setPhase("ready");
      return;
    }
    setPhase("done");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-tertiary-200 px-6">
      <div className="card w-full max-w-md p-8">
        <h1 className="mb-2 text-[22px] font-bold text-neutral-900">
          {isInvite ? "Willkommen! Passwort festlegen" : "Neues Passwort festlegen"}
        </h1>
        <p className="mb-6 text-[13px] text-neutral-500">
          {isInvite
            ? "Lege dein Passwort fest. Damit meldest du dich in der Priya's-App an. / Choose your password for the Priya's app."
            : "Wähle ein neues Passwort. / Choose a new password."}
        </p>

        {phase === "loading" && <p className="text-[13px] text-neutral-500">…</p>}

        {phase === "invalid" && (
          <p className="rounded-md bg-error-50 px-4 py-3 text-[13px] text-error-700">
            Dieser Link ist abgelaufen oder wurde schon benutzt. Fordere unter „Passwort vergessen“
            einen neuen an. / This link has expired or was already used. Request a new one via
            “Forgot password”.
          </p>
        )}

        {(phase === "ready" || phase === "saving") && (
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
            {email && (
              <p className="rounded-md bg-tertiary-200 px-3 py-2 text-[13px] text-neutral-700">
                Konto / Account: <strong>{email}</strong>
              </p>
            )}
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Neues Passwort / New password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Passwort wiederholen / Repeat password"
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {error && <p className="text-[12px] text-error-700">{error}</p>}
            <button
              type="submit"
              disabled={phase === "saving"}
              className="btn btn--primary"
              style={{ minHeight: 48 }}
            >
              Passwort speichern / Save password
            </button>
          </form>
        )}

        {phase === "done" && (
          <p className="rounded-md bg-success-50 px-4 py-3 text-[13px] text-success-700">
            Passwort gespeichert. Öffne jetzt die Priya&apos;s-App und melde dich mit deiner E-Mail
            und diesem Passwort an. / Password saved. Now open the Priya&apos;s app and sign in with
            your email and this password.
          </p>
        )}

        <Link
          href={phase === "done" ? routes.dashboard : routes.forgotPassword}
          className="mt-6 block text-center text-[13px] text-primary-600 hover:underline"
        >
          {phase === "done" ? "Weiter zur Web-Ansicht →" : "Passwort vergessen? Neuen Link anfordern"}
        </Link>
      </div>
    </main>
  );
}
