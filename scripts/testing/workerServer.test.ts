import { afterEach, expect, test } from "bun:test";
import { startWorker } from "./workerServer";

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
// A child that is still starting and has not bound its port.
const starting = [process.execPath, "-e", "setInterval(() => {}, 1000);"];

function foreignServer(port = 0) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch: () => new Response("foreign"),
  });
  servers.push(server);
  return server.port ?? 0;
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
  const started = startWorker(
    starting,
    port,
    `http://127.0.0.1:${port}/login`,
    options,
  );
  await Bun.sleep(200);
  foreignServer(port);
  await expect(started).rejects.toThrow(`Another process took port ${port}`);
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
  ).rejects.toThrow("exited before it was ready (3)");
  expect(Date.now() - started).toBeLessThan(5_000);
});

test("the started Worker is returned once it answers", async () => {
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
  } finally {
    server.kill();
    await server.exited;
  }
});
