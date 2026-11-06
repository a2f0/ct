import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertOwnsPort, startWorker } from "./workerServer";

const servers: { stop(force?: boolean): unknown }[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
});

const options = { attempts: 200, pauseMs: 20 };
// A child that serves the port it is given, like `wrangler dev --port`.
function serving(port: number) {
  return [
    process.execPath,
    "-e",
    `Bun.serve({ hostname: "127.0.0.1", port: ${port}, fetch: () => new Response("own") }); setInterval(() => {}, 1000);`,
  ];
}
// Like wrangler and its workerd, a wrapper whose own child serves the port; the
// wrapper stops that child when it is stopped.
function wrapping(port: number) {
  const serve = JSON.stringify(serving(port));
  return [
    process.execPath,
    "-e",
    `const child = Bun.spawn(${serve}, { stdio: ["ignore", "ignore", "inherit"] }); process.on("SIGTERM", () => { child.kill(); child.exited.then(() => process.exit(0)); }); setInterval(() => {}, 1000);`,
  ];
}
// A child that is still starting and has not bound its port; it creates
// `marker` once it runs, which is after startWorker's first listener check.
function starting(marker: string) {
  return [
    process.execPath,
    "-e",
    `require("node:fs").writeFileSync(${JSON.stringify(marker)}, ""); setInterval(() => {}, 1000);`,
  ];
}

function foreignServer(port = 0) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch: () => new Response("foreign"),
  });
  servers.push(server);
  return server.port ?? 0;
}

async function bindWhenFree(port: number) {
  for (;;)
    try {
      return foreignServer(port);
    } catch {
      await Bun.sleep(10);
    }
}

function freePort() {
  const probe = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(),
  });
  const port = probe.port ?? 0;
  probe.stop(true);
  return port;
}

test("a server already on the port is refused, not mistaken for the Worker", async () => {
  const port = foreignServer();
  // Like wrangler on a taken port, this child fails at once.
  await expect(
    startWorker(
      [process.execPath, "-e", "process.exit(1)"],
      port,
      `http://127.0.0.1:${port}/login`,
      options,
    ),
  ).rejects.toThrow("already listens");
});

test("a server that takes the port while the Worker starts is refused", async () => {
  const port = freePort();
  const scratch = await mkdtemp(join(tmpdir(), "ct-worker-server-"));
  try {
    const marker = join(scratch, "started");
    const started = startWorker(
      starting(marker),
      port,
      `http://127.0.0.1:${port}/login`,
      options,
    );
    while (!existsSync(marker)) await Bun.sleep(10);
    foreignServer(port);
    await expect(started).rejects.toThrow(
      `Another process listens on port ${port}`,
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("a Worker replaced while its answer is in flight is refused", async () => {
  const port = freePort();
  // This child answers once and exits; another server then takes the port
  // before the answer reaches startWorker.
  const answerOnce = [
    process.execPath,
    "-e",
    `Bun.serve({ hostname: "127.0.0.1", port: ${port}, fetch: () => { setTimeout(() => process.exit(0), 0); return new Response("own"); } }); setInterval(() => {}, 1000);`,
  ];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, init);
    await bindWhenFree(port);
    return response;
  }) as typeof fetch;
  await expect(
    startWorker(answerOnce, port, `http://127.0.0.1:${port}/login`, {
      ...options,
      fetcher,
    }),
  ).rejects.toThrow(/The test Worker exited|Another process listens on port/);
});

test("a Worker that exits before it is ready fails at once", async () => {
  const port = freePort();
  const started = Date.now();
  await expect(
    startWorker(
      [process.execPath, "-e", "process.exit(3)"],
      port,
      `http://127.0.0.1:${port}/login`,
      { attempts: 200, pauseMs: 50 },
    ),
  ).rejects.toThrow("The test Worker exited (3)");
  expect(Date.now() - started).toBeLessThan(5_000);
});

test("the started Worker is returned once it answers, and owns the port until it stops", async () => {
  const port = freePort();
  const server = await startWorker(
    serving(port),
    port,
    `http://127.0.0.1:${port}/login`,
    options,
  );
  try {
    expect(await (await fetch(`http://127.0.0.1:${port}/login`)).text()).toBe(
      "own",
    );
    await assertOwnsPort(server, port);
  } finally {
    server.kill();
    await server.exited;
  }
  // A run whose Worker stopped, or was replaced, does not count.
  await expect(assertOwnsPort(server, port)).rejects.toThrow(
    "The test Worker exited",
  );
});

test("a Worker whose own child serves the port is ready, and a replacement is refused", async () => {
  const port = freePort();
  const url = `http://127.0.0.1:${port}/login`;
  const server = await startWorker(wrapping(port), port, url, options);
  try {
    expect(await (await fetch(url)).text()).toBe("own");
    await assertOwnsPort(server, port);
    // The serving grandchild dies while the wrapper lives on, and another
    // server takes the port.
    const listener = Bun.spawnSync([
      "lsof",
      "-nP",
      `-iTCP:${port}`,
      "-sTCP:LISTEN",
      "-t",
    ]);
    const pid = Number(listener.stdout.toString().trim());
    expect(pid).not.toBe(server.pid);
    process.kill(pid, "SIGKILL");
    await bindWhenFree(port);
    await expect(assertOwnsPort(server, port)).rejects.toThrow(
      `Another process listens on port ${port}`,
    );
  } finally {
    server.kill();
    await server.exited;
  }
});
