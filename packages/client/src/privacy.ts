export const OPT_OUT_KEY = "ct:opt-out";
export const OPT_OUT_EVENT = "ct:opt-out-change";
export const EXTENSION_ATTRIBUTE = "data-ct-disabled";

export function optedOut(overrideGpc = false): boolean {
  try {
    return (
      navigator.webdriver === true ||
      navigator.doNotTrack === "1" ||
      (!overrideGpc &&
        (navigator as Navigator & { globalPrivacyControl?: boolean })
          .globalPrivacyControl === true) ||
      document.documentElement?.hasAttribute(EXTENSION_ATTRIBUTE) === true ||
      localStorage.getItem(OPT_OUT_KEY) === "1"
    );
  } catch {
    // Storage restrictions must not turn a saved opt-out into permission.
    return true;
  }
}

export function safePage(value: string): string {
  const path = value.split(/[?#]/, 1)[0] ?? "/";
  return /^\/[a-zA-Z0-9/:_.-]{0,199}$/.test(path) ? path : "/";
}

export function clickTarget(
  event: Event,
  capture: "all" | "interactive" | "marked",
  defaultApp: string | null = null,
) {
  const path = event.composedPath();
  const elements = path.filter(
    (item): item is Element => item instanceof Element,
  );
  if (
    elements.some((element) =>
      element.matches(
        "[data-ct-ignore], input, textarea, select, [contenteditable]:not([contenteditable='false'])",
      ),
    )
  )
    return null;
  const selector =
    capture === "marked"
      ? "[data-ct]"
      : "[data-ct], a, button, [role='button'], [role='link']";
  const target =
    elements.find((element) => element.matches(selector)) ??
    (capture === "all" ? elements[0] : undefined);
  if (!target) return null;
  const label = target.getAttribute("data-ct");
  const app = elements
    .find((element) => element.hasAttribute("data-ct-app"))
    ?.getAttribute("data-ct-app");
  const tag = target.tagName.toLowerCase();
  return {
    app:
      app === undefined
        ? defaultApp
        : app && /^[a-z0-9][a-z0-9-]{0,63}$/.test(app)
          ? app
          : null,
    target: /^[a-z][a-z0-9-]{0,31}$/.test(tag) ? tag : "unknown",
    label: label && /^[a-zA-Z0-9_.:-]{1,80}$/.test(label) ? label : null,
  };
}
