import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { PlatformProxy } from "wrangler";
import type { AccountDatabase } from "../../packages/api/src/accounts";

/** Wrangler owns OAuth credentials; this never reads or exposes their values. */
export async function withAccountDatabase<T>(
  options: { remote: boolean; test?: boolean },
  work: (db: AccountDatabase) => Promise<T>,
): Promise<T> {
  const root = resolve(import.meta.dirname, "../..");
  const source = options.test
    ? "tests/wrangler.api.json"
    : "packages/api/wrangler.json";
  const config = JSON.parse(await readFile(resolve(root, source), "utf8"));
  const directory = await mkdtemp(resolve(tmpdir(), "ct-account-config-"));
  let proxy: PlatformProxy<{ DB: AccountDatabase }> | undefined;
  // Wrangler debug logs may include adapter details. Disable disk and console
  // logging before loading its runtime, even if the operator enabled debugging.
  const logging = {
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG: "none",
    WRANGLER_LOG_SANITIZE: "true",
  };
  const previous = new Map(
    Object.keys(logging).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, logging);
  try {
    const { getPlatformProxy } = await import("wrangler");
    const configPath = resolve(directory, "wrangler.json");
    await writeFile(
      configPath,
      JSON.stringify({
        name: "ct-account-cli",
        compatibility_date: config.compatibility_date,
        d1_databases: [
          {
            ...config.d1_databases[0],
            migrations_dir: undefined,
            remote: options.remote,
          },
        ],
      }),
      { mode: 0o600 },
    );
    proxy = await getPlatformProxy<{ DB: AccountDatabase }>({
      configPath,
      envFiles: [],
      remoteBindings: options.remote,
      persist: options.remote
        ? false
        : {
            path: resolve(
              root,
              options.test
                ? "tests/.wrangler/state/v3"
                : "packages/api/.wrangler/state/v3",
            ),
          },
    });
    return await work(proxy.env.DB);
  } finally {
    try {
      await proxy?.dispose();
      await rm(directory, { recursive: true, force: true });
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }
}
