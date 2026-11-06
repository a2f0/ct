import type { Subprocess } from "bun";

/**
 * Starts a local Worker and waits until that process, not whatever else holds
 * its port, answers `url`. Wrangler exits when the port is taken, so a server
 * already listening there would otherwise pass the readiness poll and the run
 * would test another checkout's build and database.
 */
export async function startWorker(
  command: string[],
  url: string,
  options: { cwd?: string; attempts?: number; pauseMs?: number } = {},
): Promise<Subprocess> {
  const attempts = options.attempts ?? 120;
  const pauseMs = options.pauseMs ?? 500;
  await refuseRunningServer(url);
  const server = Bun.spawn(command, {
    cwd: options.cwd ?? process.cwd(),
    stdout: "ignore",
    stderr: "inherit",
  });
  try {
    for (let attempt = 0; ; attempt += 1) {
      if (server.exitCode !== null || server.signalCode !== null)
        throw new Error(
          `The test Worker exited before it was ready (${server.exitCode ?? server.signalCode}).`,
        );
      if ((await fetch(url).catch(() => null))?.ok) return server;
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

/** Fails when anything already answers `url`, such as another run's Worker. */
export async function refuseRunningServer(url: string): Promise<void> {
  if (await fetch(url).catch(() => null))
    throw new Error(
      `Something already serves ${url}; stop it before starting the test Worker.`,
    );
}
