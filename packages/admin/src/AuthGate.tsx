import { type FormEvent, useEffect, useState } from "react";
import { App } from "./App";
import { authClient, returnTo } from "./authClient";
import { Frame, PolicyLinks } from "./Frame";
import { rememberPassword } from "./passwords";
import { SignOut } from "./SignOut";
import { useSavedSignIn } from "./useSavedSignIn";

export function AuthGate() {
  const { data: session, isPending, error } = authClient.useSession();
  const [expired, setExpired] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  useEffect(() => {
    const expire = () => {
      setExpired(true);
      if (location.pathname !== "/login")
        history.replaceState(
          null,
          "",
          `/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`,
        );
    };
    window.addEventListener("ct:session-expired", expire);
    return () => window.removeEventListener("ct:session-expired", expire);
  }, []);
  useEffect(() => {
    if (session && !expired && !signingIn && location.pathname === "/login")
      location.replace(returnTo());
  }, [session, expired, signingIn]);
  if (
    !signingIn &&
    (isPending ||
      (session && !expired && !error && location.pathname === "/login"))
  )
    return (
      <div className="auth-shell" role="status">
        Checking your session…
      </div>
    );
  // A session refresh must not unmount the form or navigate while the native
  // password manager is presenting its save offer.
  if (!session || expired || error || signingIn)
    return (
      <Login
        expired={expired}
        unavailable={Boolean(error)}
        onBusy={setSigningIn}
      />
    );
  return location.pathname === "/account" ? (
    <Account email={session.user.email} />
  ) : (
    <App />
  );
}
function Login({
  expired,
  unavailable,
  onBusy,
}: {
  expired: boolean;
  unavailable: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const savedSignIn = useSavedSignIn();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    // Password managers can update the DOM without firing React's onChange.
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") ?? "");
    const password = String(fields.get("password") ?? "");
    const needsSave = !savedSignIn.isSaved(
      event.currentTarget,
      email,
      password,
    );
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(
          result.error.status === 429
            ? "Too many attempts. Please wait a minute."
            : result.error.status >= 500
              ? "Sign-in is temporarily unavailable. Please try again."
              : "Sign-in failed. Check your email and password.",
        );
        setPassword("");
        return;
      }
      if (needsSave) await rememberPassword(email, password);
      location.assign(returnTo());
    } catch {
      setError("Sign-in is temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <Frame>
      <p className="eyebrow">PRIVATE ANALYTICS</p>
      <h1>
        Sign in<span>.</span>
      </h1>
      <p className="subtitle">Access your click activity.</p>
      {expired && (
        <p role="status">Your session expired. Sign in again to continue.</p>
      )}
      {unavailable && (
        <p role="alert">
          Could not verify your session. Please try signing in again.
        </p>
      )}
      <form
        method="post"
        autoComplete="on"
        onInput={savedSignIn.onInput}
        onSubmit={submit}
      >
        <label>
          Email
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="muted">
        Accounts are provisioned by your administrator. Contact them if you need
        access or a password reset.
      </p>
      <PolicyLinks />
    </Frame>
  );
}
function Account({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.changePassword({
        currentPassword: current,
        newPassword: password,
        revokeOtherSessions: true,
      });
      if (result.error) {
        if (result.error.status === 401)
          window.dispatchEvent(new Event("ct:session-expired"));
        setError(
          "Could not change your password. Check your current password and try again.",
        );
        return;
      }
      await rememberPassword(email, password);
      setCurrent("");
      setPassword("");
      setConfirm("");
      setMessage("Password changed. Other sessions have been signed out.");
    } catch {
      setError("Password change is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Frame>
      <h1>
        Account<span>.</span>
      </h1>
      <p>
        <a href="/">Back to overview</a>
      </p>
      <form method="post" autoComplete="on" onSubmit={submit}>
        <input
          type="email"
          name="email"
          autoComplete="username"
          value={email}
          readOnly
          hidden
        />
        <label>
          Current password
          <input
            type="password"
            name="current-password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </label>
        <label>
          New password
          <input
            type="password"
            name="new-password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            name="confirm-password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        <p className="muted">
          Use 12–128 characters. Other sessions will be revoked.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? "Changing password…" : "Change password"}
        </button>
      </form>
      <SignOut />
      <PolicyLinks />
    </Frame>
  );
}
