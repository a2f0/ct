// The native app shell (packages/app-capacitor) bundles this dashboard on its
// WebView origin and defines the hosted dashboard it calls. The web build
// leaves it undefined and stays same-origin.
declare const __CT_DASHBOARD_URL__: string | undefined;

export const nativeDashboard =
  typeof __CT_DASHBOARD_URL__ === "string" ? __CT_DASHBOARD_URL__ : null;

/** Where a dashboard API path is served from. */
export const apiUrl = (path: string, dashboard = nativeDashboard) =>
  `${dashboard ?? ""}${path}`;

/**
 * Request options for the dashboard API. The shell's requests go through the
 * platform's HTTP stack, which keeps the session cookie but drops the WebView's
 * Origin; the marker names the WebView origin so the dashboard can restore its
 * own for mutation checks (docs/api.md).
 */
export function requestInit(
  init: RequestInit = {},
  dashboard = nativeDashboard,
): RequestInit {
  if (!dashboard) return { ...init, credentials: "same-origin" };
  const headers = new Headers(init.headers);
  headers.set("X-CT-Native-Origin", location.origin);
  return { ...init, headers, credentials: "include" };
}
