import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { TextZoom } from "@capacitor/text-zoom";

interface ResumeApp {
  addListener(eventName: "resume", listener: () => void): Promise<unknown>;
}

interface PreferredTextZoom {
  getPreferred(): Promise<{ value: number }>;
  set(options: { value: number }): Promise<void>;
}

/**
 * iOS WebViews ignore the system text size, so the page scales its text to
 * the Dynamic Type setting on every page load and whenever the app returns to
 * the foreground, where the setting may have changed. Android WebViews already
 * follow the system font size.
 */
export function followTextSize(
  zoom: PreferredTextZoom = TextZoom,
  app: ResumeApp = App,
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
  void app.addListener("resume", () => void apply());
}
