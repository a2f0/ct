import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

test("browser setup uses checkout files when launched from another directory", () => {
  const caller = realpathSync(mkdtempSync(join(tmpdir(), "browser setup ")));
  const root = resolve(import.meta.dir, "../..");
  try {
    writeFileSync(
      join(caller, "bunx"),
      "#!/bin/sh\ntest -f tests/wrangler.api.json && pwd -P\n",
      { mode: 0o755 },
    );
    writeFileSync(
      join(caller, "node"),
      '#!/bin/sh\ntest -f "$1" && cat >/dev/null && pwd -P\n',
      { mode: 0o755 },
    );
    for (const cwd of [root, caller]) {
      const output = execFileSync(
        process.execPath,
        [relative(cwd, join(import.meta.dir, "browserPrepare.ts"))],
        {
          cwd,
          env: { ...process.env, PATH: caller + ":/usr/bin:/bin" },
          encoding: "utf8",
        },
      )
        .trim()
        .split("\n");
      expect(new Set(output)).toEqual(new Set([realpathSync(root)]));
      expect(output).toHaveLength(6);
    }
  } finally {
    rmSync(caller, { recursive: true, force: true });
  }
});
