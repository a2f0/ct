import { expect, test } from "bun:test";
import type { BackButtonListenerEvent } from "@capacitor/app";
import { handleBackButton } from "./backButton";

function start(platform: string) {
  const calls: string[] = [];
  let listener: ((event: BackButtonListenerEvent) => void) | undefined;
  handleBackButton(
    {
      addListener: async (eventName, callback) => {
        calls.push(`listen:${eventName}`);
        listener = callback;
      },
      minimizeApp: async () => {
        calls.push("minimize");
      },
    },
    { back: () => calls.push("back") },
    platform,
  );
  return { calls, press: (canGoBack: boolean) => listener?.({ canGoBack }) };
}

test("Android Back steps through page history, then backgrounds the app", () => {
  const { calls, press } = start("android");
  press(true);
  press(false);
  expect(calls).toEqual(["listen:backButton", "back", "minimize"]);
});

test("iOS and the browser keep their own Back handling", () => {
  for (const platform of ["ios", "web"])
    expect(start(platform).calls).toEqual([]);
});
