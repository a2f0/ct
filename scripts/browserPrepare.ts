export {};

for (const args of [
  ["d1", "migrations", "apply", "ct-test", "--local"],
  ["d1", "execute", "ct-test", "--local", "--command", "DELETE FROM clicks"],
  ["d1", "execute", "ct-test", "--local", "--command", "DELETE FROM locations"],
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
