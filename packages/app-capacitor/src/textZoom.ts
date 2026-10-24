import { App, type AppState } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { TextZoom } from "@capacitor/text-zoom";

interface StateApp {
  addListener(
    eventName: "appStateChange",
    listener: (state: AppState) => void,
  ): Promise<unknown>;
}

interface PreferredTextZoom {
  getPreferred(): Promise<{ value: number }>;
  set(options: { value: number }): Promise<void>;
}

/**
 * iOS WebViews ignore the system text size, so the page scales its text to
 * the Dynamic Type setting on every page load and whenever the app becomes
 * active again: after Settings, and after Control Center's text size control,
 * which only makes the app inactive. Android WebViews already follow the
 * system font size.
 */
export function followTextSize(
  zoom: PreferredTextZoom = TextZoom,
  app: StateApp = App,
  platform = Capacitor.getPlatform(),
) {
  if (platform !== "ios") return;
  const apply = async () => {
    try {
      const { value } = await zoom.getPreferred();
      await zoom.set({ value });
    } catch {
      /* The page stays at its default text size. */
    }
  };
  void apply();
  void app.addListener("appStateChange", ({ isActive }) => {
    if (isActive) void apply();
  });
}
