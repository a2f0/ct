import type { CapacitorConfig } from "@capacitor/cli";

// There is no staging tier: one store app, which
// fastlane/lib/native_release_target.rb identifies the same way.
const config: CapacitorConfig = {
  appId: "net.a2f0.ct",
  appName: "CT",
  webDir: "dist",
  // The dashboard's default dark paper (packages/admin/src/tokens.css).
  backgroundColor: "#000000",
  // Signing in sends the password through the bridge. Disable Capacitor's
  // request/response logging, including on debug builds.
  loggingBehavior: "none",
  server: {
    androidScheme: "https",
    iosScheme: "capacitor",
  },
  plugins: {
    // Native networking carries the session cookie to the hosted dashboard,
    // which allows no cross-origin browser requests. It must stay enabled in
    // release builds.
    CapacitorHttp: { enabled: true },
    // The page draws under the system bars from the first frame and pads
    // itself with their insets (src/shell.css).
    SystemBars: { initialViewportFitValueHint: "cover" },
  },
};

export default config;
