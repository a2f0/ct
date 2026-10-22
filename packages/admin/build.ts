import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const downloads = resolve(import.meta.dir, "dist/downloads");
await mkdir(downloads, { recursive: true });
for (const browser of ["chrome", "firefox"]) {
  await copyFile(
    resolve(import.meta.dir, `../extension/dist/ct-${browser}.zip`),
    resolve(downloads, `ct-${browser}.zip`),
  );
}
