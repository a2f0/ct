import { expect, test } from "bun:test";
import { returnTo } from "./authClient";

test("sign-in returns to dashboard paths only, on the web and in the app shell", () => {
  const cases: [string, string][] = [
    ["?returnTo=%2Frecent%3Fip%3D203.0.113.8", "/recent?ip=203.0.113.8"],
    ["?returnTo=%2Faccount", "/account"],
    ["", "/"],
    ["?returnTo=%2Flogin", "/"],
    ["?returnTo=https%3A%2F%2Fevil.example%2Frecent", "/"],
    ["?returnTo=%2F%2Fevil.example%2Frecent", "/"],
    ["?returnTo=%2F%5Cevil.example%2Frecent", "/"],
    ["?returnTo=capacitor%3A%2F%2Flocalhost%2Frecent", "/"],
  ];
  for (const [search, expected] of cases)
    expect(returnTo(search)).toBe(expected);
});
