import { expect, test } from "bun:test";
import { parseAccountArgs, readPasswordStdin } from "./adminUser";

test("account CLI requires an explicit database and keeps passwords out of arguments", () => {
  const parsed = parseAccountArgs([
    "create",
    "--remote",
    "--email",
    "admin@example.test",
    "--password-stdin",
  ]);
  expect(parsed).toEqual({
    action: "create",
    remote: true,
    email: "admin@example.test",
    name: "Administrator",
    test: false,
    stdin: true,
  });
  for (const args of [
    ["create", "--email", "admin@example.test"],
    ["create", "--remote", "--local", "--email", "admin@example.test"],
    [
      "create",
      "--remote",
      "--email",
      "admin@example.test",
      "--password",
      "not-accepted",
    ],
    [
      "create",
      "--remote",
      "--email",
      "admin@example.test",
      "--config",
      "tests/wrangler.api.json",
    ],
    [
      "create",
      "--local",
      "--email",
      "admin@example.test",
      "--config",
      "/tmp/arbitrary.json",
    ],
    ["create", "--local", "--email", "admin@example.test", "--local"],
  ])
    expect(() => parseAccountArgs(args)).toThrow();
});

test("stdin failures do not print password contents or touch the database", async () => {
  for (const password of [
    "first-secret-line\nsecond-secret-line\n",
    "secret".repeat(200),
  ]) {
    const child = Bun.spawn(
      [
        "node",
        "scripts/adminUser.ts",
        "create",
        "--local",
        "--email",
        "admin@example.test",
        "--password-stdin",
      ],
      { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
    );
    child.stdin.write(password);
    child.stdin.end();
    const [exit, output, error] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exit).toBe(1);
    expect(output).toBe("");
    expect(error).toMatch(
      /Supply one password line|Password input is too large/,
    );
    expect(error.includes(password)).toBe(false);
  }
});

test("stdin passwords preserve multibyte characters split across chunks", async () => {
  const password = "test-only-🐈-café-password";
  const bytes = Buffer.from(`${password}\n`);
  async function* byteChunks() {
    for (const byte of bytes) yield Uint8Array.of(byte);
  }
  expect(await readPasswordStdin(byteChunks())).toBe(password);
});
