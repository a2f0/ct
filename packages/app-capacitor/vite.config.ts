import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// The shell bundles the dashboard UI and calls the hosted dashboard's API.
// There is no staging tier, so every build uses production.
const dashboardUrl = "https://ct-admin.a2f0.net";

// The web dashboard serves its pre-paint theme script as a file because its
// CSP forbids inline scripts; the bundled shell inlines the same script.
function dashboardTheme(): Plugin {
  const script = readFileSync(
    new URL("../admin/public/theme.js", import.meta.url),
    "utf8",
  );
  return {
    name: "ct-dashboard-theme",
    transformIndexHtml: () => [
      { tag: "script", children: script, injectTo: "head" },
    ],
  };
}

export default defineConfig({
  plugins: [react(), dashboardTheme()],
  publicDir: false,
  define: { __CT_DASHBOARD_URL__: JSON.stringify(dashboardUrl) },
});
