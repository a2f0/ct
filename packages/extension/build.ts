import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = import.meta.dir;
await rm(resolve(root, "dist"), { recursive: true, force: true });
const icons = Bun.spawnSync(
  ["bun", "run", "agent-tool", "images", "build", "extension"],
  { cwd: resolve(root, "../.."), stdout: "inherit", stderr: "inherit" },
);
if (icons.exitCode !== 0) throw new Error("Icon build failed");
for (const browser of ["chrome", "firefox"]) {
  const dir = resolve(root, "dist", browser);
  await mkdir(dir, { recursive: true });
  await cp(resolve(root, "public"), dir, { recursive: true });
  await cp(resolve(root, "dist/icons"), resolve(dir, "icons"), {
    recursive: true,
  });
  const build = await Bun.build({
    entrypoints: [
      resolve(root, "src/content.ts"),
      resolve(root, "src/popup.ts"),
    ],
    outdir: dir,
    target: "browser",
    format: "iife",
  });
  if (!build.success) throw new Error("Extension build failed");
  const manifest = {
    manifest_version: 3,
    name: "CT — Disable click tracking",
    version: "0.1.0",
    description:
      "Turn off CT click tracking in this browser. Enabled by default. No data is collected by the extension.",
    permissions: ["storage", "declarativeNetRequest"],
    host_permissions: ["http://*/*", "https://*/*"],
    icons: {
      16: "icons/16.png",
      32: "icons/32.png",
      48: "icons/48.png",
      128: "icons/128.png",
    },
    action: {
      default_popup: "popup.html",
      default_title: "CT privacy control",
    },
    content_scripts: [
      {
        matches: ["http://*/*", "https://*/*"],
        js: ["content.js"],
        run_at: "document_start",
        all_frames: true,
      },
    ],
    declarative_net_request: {
      rule_resources: [{ id: "ct-block", enabled: true, path: "rules.json" }],
    },
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "ct-opt-out@a2f0.net",
              strict_min_version: "142.0",
              data_collection_permissions: { required: ["none"] },
            },
          },
        }
      : {}),
  };
  await Bun.write(
    resolve(dir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await Bun.write(
    resolve(dir, "rules.json"),
    JSON.stringify(
      [
        {
          id: 1,
          priority: 1,
          action: { type: "block" },
          condition: {
            urlFilter: "||ct.a2f0.net/v1/clicks",
            resourceTypes: ["xmlhttprequest", "ping", "other"],
          },
        },
      ],
      null,
      2,
    ),
  );
  const zipped = Bun.spawnSync(
    ["zip", "-qr", resolve(root, "dist", `ct-${browser}.zip`), "."],
    { cwd: dir, stdout: "inherit", stderr: "inherit" },
  );
  if (zipped.exitCode !== 0) throw new Error(`Could not package ${browser}`);
}
