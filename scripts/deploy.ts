import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const preview = process.argv.includes("--dry-run");
const api = await Bun.file(resolve(root, "packages/api/wrangler.json")).json();
const admin = await Bun.file(
  resolve(root, "packages/api/wrangler.admin.json"),
).json();
const database = api.d1_databases[0]?.database_id;
if (
  !database ||
  database.startsWith("00000000") ||
  database !== admin.d1_databases[0]?.database_id
)
  throw new Error(
    "Configure the same provisioned D1 database in both Wrangler files first.",
  );

async function run(args: string[], cwd = root) {
  const child = Bun.spawn(args, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });
  if ((await child.exited) !== 0)
    throw new Error(`Deployment step failed: ${args.join(" ")}`);
}

await run(["bun", "run", "check"]);
await run(["bun", "run", "test"]);
await run(["bun", "run", "build"]);
await run(["bun", "run", "package:smoke"]);
const cwd = resolve(root, "packages/api");
if (preview) {
  await run(
    [
      "bunx",
      "--no-install",
      "wrangler",
      "deploy",
      "--config",
      "wrangler.admin.json",
      "--dry-run",
      "--outdir",
      "dist/admin",
    ],
    cwd,
  );
  console.log("Preview complete: no remote resources changed.");
} else {
  await run(
    [
      "bunx",
      "--no-install",
      "wrangler",
      "d1",
      "migrations",
      "apply",
      "ct",
      "--remote",
    ],
    cwd,
  );
  await run(["bunx", "--no-install", "wrangler", "deploy"], cwd);
  await run(
    [
      "bunx",
      "--no-install",
      "wrangler",
      "deploy",
      "--config",
      "wrangler.admin.json",
    ],
    cwd,
  );
  console.log(
    "Deployment complete. Verify ct.a2f0.net/health and ct-admin.a2f0.net/api/sites.",
  );
}
