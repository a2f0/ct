import { describe, expect, it } from "bun:test";
import { nativePasswordSaver } from "./savePassword";

describe("native password saving", () => {
  it("saves the credentials for the hosted app's domain", async () => {
    const saved: unknown[] = [];
    const save = nativePasswordSaver("https://ct-admin.a2f0.net", {
      save: async (options) => {
        saved.push(options);
      },
    });
    await save("owner@example.com", "correct horse battery");
    expect(saved).toEqual([
      {
        domain: "ct-admin.a2f0.net",
        password: "correct horse battery",
        username: "owner@example.com",
      },
    ]);
  });
});
