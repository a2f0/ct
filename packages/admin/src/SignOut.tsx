import { useState } from "react";
import { authClient } from "./authClient";

export function SignOut() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      window.dispatchEvent(new Event("ct:session-expired"));
      location.assign("/login");
    } catch {
      setError("Sign-out failed. Please try again.");
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="theme-switch"
        disabled={busy}
        onClick={() => void logout()}
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && <span role="alert">{error}</span>}
    </>
  );
}
