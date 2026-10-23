import { expect, test } from "bun:test";
import {
  type Drill,
  drillHref,
  readFilters,
  readScope,
  scopeHeading,
} from "./filters";

const defaults = readFilters("");

test("drill-down links round-trip values that paths cannot carry", () => {
  for (const scope of [
    { ip: "2001:db8::8" },
    { ip: null },
    { country: "US" },
    { country: "CH", region: "Bern", regionCode: "BE", city: "Biel/Bienne" },
    { country: "BR", region: null, city: "São Paulo" },
    { page: "//docs/../:id" },
    { target: "button", label: ".." },
    { target: "button", label: null },
  ] satisfies Drill[]) {
    const href = drillHref(scope, defaults);
    expect(href.startsWith("/recent?")).toBe(true);
    expect(readScope(new URL(href, "https://ct.test").search)).toEqual(scope);
  }
});

test("links replace the scope and keep the shared filters", () => {
  const filters = { ...defaults, site: "skyline", days: 30 };
  expect(drillHref({ environment: "staging" }, filters)).toBe(
    "/recent?site=skyline&environment=staging&days=30",
  );
  expect(drillHref({ app: null }, filters)).toBe(
    "/recent?site=skyline&app=%7Eunknown&days=30",
  );
  expect(drillHref({ site: "other", page: "/x" }, filters)).toBe(
    "/recent?page=%2Fx&site=other&days=30",
  );
  expect(drillHref({ city: "Austin", country: "US" }, filters)).toBe(
    "/recent?country=US&city=Austin&site=skyline&days=30",
  );
});

test("only drill-down dimensions are read as the scope", () => {
  expect(
    readScope("?site=skyline&app=x&environment=all&ip=&region=~unknown"),
  ).toEqual({ region: null });
});

test("headings name the drill-down, including partial scopes", () => {
  expect(scopeHeading({})).toBeNull();
  expect(scopeHeading({ country: "US", region: "Texas", city: null })).toEqual({
    eyebrow: "LOCATION",
    title: "Unknown city, Texas, United States",
  });
  expect(scopeHeading({ city: "Austin" })?.title).toBe("Austin");
  expect(scopeHeading({ label: null })?.title).toBe("No label");
  expect(scopeHeading({ ip: null })?.title).toBe("Unknown IP address");
  expect(
    scopeHeading({ country: "FR", region: null, regionCode: "AA" })?.title,
  ).toBe("AA, France");
  // Hand-edited URLs reach Intl, which throws for malformed codes.
  expect(scopeHeading({ country: "USA" })?.title).toBe("USA");
});
