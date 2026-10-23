export {};

for (const args of [
  ["d1", "migrations", "apply", "ct-test", "--local"],
  ["d1", "execute", "ct-test", "--local", "--command", "DELETE FROM clicks"],
  ["d1", "execute", "ct-test", "--local", "--command", "DELETE FROM locations"],
  ["d1", "execute", "ct-test", "--local", "--command", "DELETE FROM auth_user"],
  [
    "d1",
    "execute",
    "ct-test",
    "--local",
    "--command",
    "DELETE FROM auth_rate_limit",
  ],
]) {
  const child = Bun.spawn(
    [
      "bunx",
      "--no-install",
      "wrangler",
      ...args,
      "--config",
      "tests/wrangler.api.json",
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if ((await child.exited) !== 0)
    throw new Error("Could not initialize isolated browser-test database");
}

const account = Bun.spawn(
  [
    "node",
    "scripts/admin/adminUser.ts",
    "create",
    "--local",
    "--config",
    "tests/wrangler.api.json",
    "--email",
    "browser@example.test",
    "--password-stdin",
  ],
  { stdin: "pipe", stdout: "inherit", stderr: "inherit" },
);
account.stdin.write("isolated-browser-password-0001\n");
account.stdin.end();
if ((await account.exited) !== 0)
  throw new Error("Could not provision isolated browser account");
