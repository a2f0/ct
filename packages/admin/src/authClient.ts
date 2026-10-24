import { createAuthClient } from "better-auth/react";
import { nativeDashboard, requestInit } from "./host";

export const authClient = createAuthClient({
  ...(nativeDashboard ? { baseURL: nativeDashboard } : {}),
  fetchOptions: requestInit(),
});

type PasswordCredentialConstructor = new (data: {
  id: string;
  password: string;
}) => Credential;

// Offer the browser's password manager the credential after a fetch-based
// sign-in or password change, which form heuristics alone can miss.
export async function rememberPassword(
  id: string,
  password: string,
): Promise<void> {
  const PasswordCredential = (
    window as Window & { PasswordCredential?: PasswordCredentialConstructor }
  ).PasswordCredential;
  if (!PasswordCredential || !navigator.credentials) return;
  try {
    await navigator.credentials.store(new PasswordCredential({ id, password }));
  } catch {
    /* Saving is best effort; autocomplete hints still apply. */
  }
}

export function returnTo(search = location.search): string {
  const value = new URLSearchParams(search).get("returnTo") ?? "/";
  try {
    // A placeholder origin keeps only same-origin paths. The app shell's
    // capacitor:// URLs have an opaque origin, so location.origin cannot.
    const base = "https://ct.invalid";
    const url = new URL(value, base);
    if (
      url.origin === base &&
      ["/", "/recent", "/account"].includes(url.pathname)
    )
      return url.pathname + url.search;
  } catch {
    /* Invalid redirect falls back to overview. */
  }
  return "/";
}
