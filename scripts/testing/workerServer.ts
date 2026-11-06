import type { Subprocess } from "bun";

/**
 * Starts a local Worker on `port` and waits until it answers `url`. Readiness
 * counts only when every process listening on the port belongs to the started
 * Worker: wrangler exits when the port is taken, so another server there would
 * otherwise pass the poll and the run would test another checkout's build and
 * database.
 */
export async function startWorker(
  command: string[],
  port: number,
  url: string,
  options: {
    cwd?: string;
    attempts?: number;
    pauseMs?: number;
    fetcher?: typeof fetch;
  } = {},
): Promise<Subprocess> {
  const attempts = options.attempts ?? 120;
  const pauseMs = options.pauseMs ?? 500;
  const fetcher = options.fetcher ?? fetch;
  if ((await listeners(port)).length)
    throw new Error(
      `Something already listens on port ${port}; stop it before starting the test Worker.`,
    );
  const server = Bun.spawn(command, {
    cwd: options.cwd ?? process.cwd(),
    stdout: "ignore",
    stderr: "inherit",
  });
  // Every await can let the child exit and another server bind the port, so
  // the answer counts only when the child still owns the port afterwards.
  const owns = async () => {
    if (server.exitCode !== null || server.signalCode !== null)
      throw new Error(
        `The test Worker exited before it was ready (${server.exitCode ?? server.signalCode}).`,
      );
    const pids = await listeners(port);
    if (!pids.length) return false;
    const own = await processTree(server.pid);
    if (pids.some((pid) => !own.has(pid)))
      throw new Error(
        `Another process took port ${port} while the test Worker started.`,
      );
    return true;
  };
  try {
    for (let attempt = 0; ; attempt += 1) {
      if (await owns()) {
        const response = await fetcher(url, {
          signal: AbortSignal.timeout(5_000),
        }).catch(() => null);
        if (response?.ok && (await owns())) return server;
      }
      if (attempt === attempts)
        throw new Error("The test Worker did not start");
      await Promise.race([server.exited, Bun.sleep(pauseMs)]);
    }
  } catch (error) {
    server.kill();
    await server.exited;
    throw error;
  }
}

/** PIDs listening on a local TCP port; lsof exits 1 when there are none. */
async function listeners(port: number): Promise<number[]> {
  const lsof = Bun.spawn(
    ["lsof", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [text, exitCode] = await Promise.all([
    new Response(lsof.stdout).text(),
    lsof.exited,
  ]);
  const pids = text.split(/\s+/).filter(Boolean).map(Number);
  if (exitCode !== 0 && (exitCode !== 1 || pids.length))
    throw new Error(`Could not list listeners on port ${port}`);
  return pids;
}

/** The process and all of its descendants. */
async function processTree(root: number): Promise<Set<number>> {
  const ps = Bun.spawn(["ps", "-A", "-o", "pid=,ppid="], { stdout: "pipe" });
  const [text, exitCode] = await Promise.all([
    new Response(ps.stdout).text(),
    ps.exited,
  ]);
  if (exitCode !== 0) throw new Error("Could not list processes");
  const children = new Map<number, number[]>();
  for (const line of text.trim().split("\n")) {
    const [pid, parent] = line.trim().split(/\s+/).map(Number);
    if (pid === undefined || parent === undefined) continue;
    children.set(parent, [...(children.get(parent) ?? []), pid]);
  }
  const tree = new Set([root]);
  for (const pid of tree)
    for (const child of children.get(pid) ?? []) tree.add(child);
  return tree;
}
