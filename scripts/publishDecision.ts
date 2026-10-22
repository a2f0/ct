import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";

const pkg = await Bun.file(
  resolve(import.meta.dir, "../packages/client/package.json"),
).json();
const response = await fetch(
  `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${pkg.version}`,
);
if (!response.ok && response.status !== 404)
  throw new Error(
    `Registry returned ${response.status}; refusing to guess whether to publish.`,
  );
const publish = response.status === 404;
if (process.env.GITHUB_OUTPUT)
  await appendFile(process.env.GITHUB_OUTPUT, `publish=${publish}\n`);
console.log(JSON.stringify({ name: pkg.name, version: pkg.version, publish }));
