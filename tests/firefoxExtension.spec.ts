import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { expect, firefox, test } from "@playwright/test";

test("Firefox loads the real extension and disables an initialized client", async ({
  request,
}) => {
  const root = resolve(import.meta.dirname, "..");
  const probe = crypto.randomUUID();
  const child = spawn(
    process.execPath,
    [
      resolve(root, "packages/extension/node_modules/web-ext/bin/web-ext.js"),
      "run",
      "--source-dir",
      resolve(root, "packages/extension/dist/firefox"),
      "--firefox",
      firefox.executablePath(),
      "--no-reload",
      "--no-input",
      "--no-config-discovery",
      "--args=-headless",
      "--start-url",
      `http://127.0.0.1:4174/?human=1&probe=${probe}`,
    ],
    { cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (data) => {
    output = (output + data.toString()).slice(-6000);
  });
  child.stderr.on("data", (data) => {
    output = (output + data.toString()).slice(-6000);
  });
  try {
    await expect
      .poll(
        async () => {
          if (child.exitCode !== null)
            throw new Error(`Firefox extension runner exited: ${output}`);
          return (
            await request.get(`http://127.0.0.1:4174/probe-result?id=${probe}`)
          ).json();
        },
        { timeout: 20_000 },
      )
      .toEqual({ marked: true, initialized: false });
  } finally {
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill();
      }
    }
  }
});
