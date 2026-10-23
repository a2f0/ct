import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient({
  fetchOptions: { credentials: "same-origin" },
});

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
