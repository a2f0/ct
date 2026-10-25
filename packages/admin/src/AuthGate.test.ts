import { expect, test } from "bun:test";

// Isolate the auth-client mock and browser globals from the real Worker/auth tests.
test("native login and password manager behavior", async () => {
  const child = Bun.spawn(
    [process.execPath, "test", "./AuthGate.dom.checks.tsx"],
    {
      cwd: import.meta.dir,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) throw new Error(stdout + stderr);
  expect(code).toBe(0);
}, 30_000);
