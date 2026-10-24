import { afterAll, beforeAll, expect, test } from "bun:test";
import { SystemBarsStyle, type SystemBarsStyleOptions } from "@capacitor/core";
import { Window } from "happy-dom";
import { syncSystemBars } from "./systemBars";

const dom = new Window();
const observer = globalThis.MutationObserver;
beforeAll(() => {
  globalThis.MutationObserver =
    dom.MutationObserver as unknown as typeof MutationObserver;
});
afterAll(async () => {
  globalThis.MutationObserver = observer;
  await dom.happyDOM.close();
});

function start(platform: string, theme = "dark") {
  const root = dom.document.createElement("html") as unknown as HTMLElement;
  root.setAttribute("data-theme", theme);
  const styles: SystemBarsStyle[] = [];
  syncSystemBars(
    root,
    {
      setStyle: async ({ style }: SystemBarsStyleOptions) => {
        styles.push(style);
      },
    },
    platform,
  );
  return { root, styles };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("iOS bar icons follow the dashboard theme, setting each change once", async () => {
  const { root, styles } = start("ios");
  root.setAttribute("data-theme", "light");
  await settle();
  root.setAttribute("data-theme", "light");
  root.style.setProperty("--unrelated", "1");
  await settle();
  root.setAttribute("data-theme", "dark");
  await settle();
  expect(styles).toEqual([
    SystemBarsStyle.Dark,
    SystemBarsStyle.Light,
    SystemBarsStyle.Dark,
  ]);
});

test("Android follows the theme only once the page draws under the bars", async () => {
  const { root, styles } = start("android", "light");
  // Older WebViews report a zero inset and show the black window background.
  root.style.setProperty("--safe-area-inset-top", "0px");
  await settle();
  root.style.setProperty("--safe-area-inset-top", "24px");
  await settle();
  root.setAttribute("data-theme", "dark");
  await settle();
  expect(styles).toEqual([
    SystemBarsStyle.Dark,
    SystemBarsStyle.Light,
    SystemBarsStyle.Dark,
  ]);
});

test("the browser has no system bars to style", () => {
  expect(start("web").styles).toEqual([]);
});
