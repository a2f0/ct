import { afterEach, expect, test } from "bun:test";
import { apiUrl, nativeDashboard, requestInit } from "./host";

const dashboard = "https://ct-admin.a2f0.net";
const location = Object.getOwnPropertyDescriptor(globalThis, "location");
afterEach(() => {
  if (location) Object.defineProperty(globalThis, "location", location);
  else Reflect.deleteProperty(globalThis, "location");
});

test("the web dashboard stays same-origin without a native marker", () => {
  expect(nativeDashboard).toBeNull();
  expect(apiUrl("/api/sites")).toBe("/api/sites");
  const init = requestInit({ method: "POST", headers: { A: "1" } });
  expect(init.credentials).toBe("same-origin");
  expect(new Headers(init.headers).has("X-CT-Native-Origin")).toBe(false);
});

test("the app shell calls the hosted dashboard and marks its WebView origin", () => {
  for (const origin of ["capacitor://localhost", "https://localhost"]) {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { origin },
    });
    expect(apiUrl("/api/events?site=a", dashboard)).toBe(
      `${dashboard}/api/events?site=a`,
    );
    const init = requestInit(
      { method: "POST", headers: { "Content-Type": "application/json" } },
      dashboard,
    );
    const headers = new Headers(init.headers);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-CT-Native-Origin")).toBe(origin);
  }
});
