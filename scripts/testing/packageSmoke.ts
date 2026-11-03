import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { checkDeclarations } from "./packageSmokeCompilers";

const root = resolve(import.meta.dir, "../..");
const scratch = await mkdtemp(resolve(tmpdir(), "ct-package-"));
try {
  const pack = Bun.spawnSync(["bun", "pm", "pack", "--destination", scratch], {
    cwd: resolve(root, "packages/client"),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (pack.exitCode !== 0) throw new Error("Client pack failed");
  const tarball = (
    await Array.fromAsync(new Bun.Glob("*.tgz").scan(scratch))
  )[0];
  if (!tarball) throw new Error("Missing package tarball");
  const unpack = Bun.spawnSync([
    "tar",
    "-xzf",
    resolve(scratch, tarball),
    "-C",
    scratch,
  ]);
  if (unpack.exitCode !== 0) throw new Error("Cannot unpack client");
  const pkg = resolve(scratch, "package");
  const module = await import(resolve(pkg, "dist/index.js"));
  if (module.createTracker({ site: "smoke" }).init() !== false)
    throw new Error("SSR must be inert");
  const built = await Bun.build({
    entrypoints: [resolve(pkg, "dist/index.js")],
    target: "browser",
  });
  if (!built.success)
    throw new Error("Published browser entry does not bundle");
  await mkdir(resolve(scratch, "node_modules/@a2f0"), { recursive: true });
  await Bun.$`ln -s ${pkg} ${resolve(scratch, "node_modules/@a2f0/ct-client")}`.quiet();
  await Bun.write(
    resolve(scratch, "consumer.mts"),
    'import { createTracker, type Tracker } from "@a2f0/ct-client"; const ct: Tracker = createTracker({site:"smoke", capture:"all", page:()=>"/", overrideGpc:true}); ct.init(); void ct.flush(); ct.setOptOut(true); ct.destroy();\n// @ts-expect-error site must remain typed as string\ncreateTracker({site:123});\n// @ts-expect-error overrideGpc accepts only booleans\ncreateTracker({site:"smoke", overrideGpc:"true"});\n',
  );
  checkDeclarations(
    resolve(root, "node_modules/.bin/tsc"),
    process.argv.slice(2).map((compiler) => resolve(compiler)),
    resolve(scratch, "consumer.mts"),
    scratch,
  );
  console.log(
    `Package smoke passed: ${tarball}; SSR import, browser bundle, and standalone TypeScript consumer.`,
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
