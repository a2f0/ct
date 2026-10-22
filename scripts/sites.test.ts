import { expect, test } from "bun:test";
import { canonicalSites } from "./sites";

test("deployment compares site registries independently of ordering", () => {
  expect(
    canonicalSites({
      skyline: ["https://b.example", "https://a.example"],
      other: ["https://c.example"],
    }),
  ).toBe(
    canonicalSites({
      other: ["https://c.example"],
      skyline: ["https://a.example", "https://b.example"],
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
  ])
    expect(() => canonicalSites(invalid)).toThrow();
});
