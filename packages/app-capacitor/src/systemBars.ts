import {
  Capacitor,
  SystemBars,
  SystemBarsStyle,
  type SystemBarsStyleOptions,
} from "@capacitor/core";

/**
 * Where the page draws under the system bars, their icons follow the
 * dashboard's own theme, which the theme switch sets on the root element and
 * which can differ from the system's. Android WebViews before 140 keep the page
 * clear of the bars; Capacitor then reports a zero top inset, and the bars show
 * the black window background (styles.xml). Capacitor names styles for the
 * background, so Dark gives light icons.
 */
export function syncSystemBars(
  root = document.documentElement,
  bars: {
    setStyle(options: SystemBarsStyleOptions): Promise<void>;
  } = SystemBars,
  platform = Capacitor.getPlatform(),
) {
  if (platform !== "ios" && platform !== "android") return;
  let applied: SystemBarsStyle | undefined;
  const update = () => {
    const underBars =
      platform === "ios" ||
      Number.parseFloat(root.style.getPropertyValue("--safe-area-inset-top")) >
        0;
    const style =
      underBars && root.dataset.theme === "light"
        ? SystemBarsStyle.Light
        : SystemBarsStyle.Dark;
    if (style === applied) return;
    applied = style;
    void bars.setStyle({ style });
  };
  new MutationObserver(update).observe(root, {
    attributeFilter: ["data-theme", "style"],
  });
  update();
}
