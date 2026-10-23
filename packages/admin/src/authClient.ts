import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient({
  fetchOptions: { credentials: "same-origin" },
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

export function returnTo(): string {
  const value = new URLSearchParams(location.search).get("returnTo") ?? "/";
  try {
    const url = new URL(value, location.origin);
    if (
      url.origin === location.origin &&
      ["/", "/recent", "/account"].includes(url.pathname)
    )
      return url.pathname + url.search;
  } catch {
    /* Invalid redirect falls back to overview. */
  }
  return "/";
}
