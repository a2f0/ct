import { expect, test } from "bun:test";
import { canonicalSites } from "./sites";

test("deployment compares site registries independently of ordering", () => {
  expect(
    canonicalSites({
      skyline: {
        "https://b.example": "staging",
        "https://a.example": "production",
      },
      other: { "https://c.example": "production" },
    }),
  ).toBe(
    canonicalSites({
      other: { "https://c.example": "production" },
      skyline: {
        "https://a.example": "production",
        "https://b.example": "staging",
      },
    }),
  );
});

test("deployment refuses invalid site names and origins before uploading", () => {
  for (const invalid of [
    null,
    [],
    {},
    { Invalid_Site: ["https://a.example"] },
    { skyline: [] },
    { skyline: ["https://a.example/path"] },
    { skyline: ["http://a.example"] },
    { skyline: ["https://user:pass@a.example"] },
    { skyline: { "https://a.example/path": "production" } },
    { skyline: { "http://a.example": "production" } },
    { skyline: { "https://user:pass@a.example": "production" } },
    { skyline: { "https://a.example": "preview" } },
    {
      skyline: { "https://a.example": "production" },
      other: { "https://a.example": "staging" },
    },
  ])
    expect(() => canonicalSites(invalid)).toThrow();
});

test("malformed origins identify the owning site", () => {
  expect(() =>
    canonicalSites({ skyline: { "not a URL": "production" } }),
  ).toThrow("Invalid origin for skyline");
});
