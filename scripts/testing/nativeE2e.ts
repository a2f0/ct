import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Drives the CT app on a booted iOS simulator or a connected Android device
// against the isolated browser-test admin Worker. CI has no simulators.
const [platform, chosenDevice] = process.argv.slice(2);
if (platform !== "ios" && platform !== "android")
  throw new Error("Usage: bun run test:native <ios|android> [device]");

const root = resolve(import.meta.dir, "../..");
const app = resolve(root, "packages/app-capacitor");
const worker = "http://127.0.0.1:4176";

async function run(command: string[], cwd = root) {
  const child = Bun.spawn(command, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await child.exited) !== 0)
    throw new Error(`Command failed: ${command.join(" ")}`);
}

async function output(command: string[]) {
  const child = Bun.spawn(command, { stdout: "pipe", stderr: "inherit" });
  const [text, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);
  if (exitCode !== 0) throw new Error(`Command failed: ${command.join(" ")}`);
  return text;
}

function only(devices: string[], kind: string) {
  if (devices.length === 1 && devices[0]) return devices[0];
  throw new Error(
    `Expected one ${kind}, found ${devices.length}; pass the device to use.`,
  );
}

async function iosDevice() {
  const { devices } = JSON.parse(
    await output(["xcrun", "simctl", "list", "devices", "booted", "--json"]),
  ) as { devices: Record<string, { udid: string }[]> };
  return only(
    Object.values(devices)
      .flat()
      .map(({ udid }) => udid),
    "booted iOS simulator",
  );
}

async function androidDevice() {
  const lines = (await output(["adb", "devices"])).trim().split("\n").slice(1);
  return only(
    lines
      .map((line) => line.split(/\s+/))
      .filter(([, state]) => state === "device")
      .map(([serial]) => serial ?? ""),
    "connected Android device",
  );
}

async function installIos(device: string) {
  const derivedData = await mkdtemp(join(tmpdir(), "ct-native-e2e-"));
  try {
    await run(
      [
        "xcodebuild",
        "-project",
        "ios/App/App.xcodeproj",
        "-scheme",
        "App",
        "-configuration",
        "Debug",
        "-destination",
        "generic/platform=iOS Simulator",
        "-derivedDataPath",
        derivedData,
        "-disableAutomaticPackageResolution",
        "-quiet",
        "CODE_SIGNING_ALLOWED=NO",
        "build",
      ],
      app,
    );
    await run([
      "xcrun",
      "simctl",
      "install",
      device,
      join(derivedData, "Build/Products/Debug-iphonesimulator/App.app"),
    ]);
  } finally {
    await rm(derivedData, { recursive: true, force: true });
  }
}

async function installAndroid(device: string) {
  await run(["./gradlew", "assembleDebug", "--quiet"], join(app, "android"));
  // The app reaches the Worker on the device's own loopback.
  await run(["adb", "-s", device, "reverse", "tcp:4176", "tcp:4176"]);
  await run([
    "adb",
    "-s",
    device,
    "install",
    "-r",
    join(app, "android/app/build/outputs/apk/debug/app-debug.apk"),
  ]);
}

const device =
  chosenDevice ??
  (platform === "ios" ? await iosDevice() : await androidDevice());
// The Worker serves the built dashboard, and the flow signs in to the browser
// suite's fixture account in its freshly reset database.
await run(["bun", "run", "build"]);
await run(["bun", "scripts/testing/browserPrepare.ts"]);
const now = Date.now();
await run([
  "bunx",
  "--no-install",
  "wrangler",
  "d1",
  "execute",
  "ct-test",
  "--local",
  "--config",
  "tests/wrangler.api.json",
  "--command",
  `INSERT INTO clicks (site, id, timestamp, received_at, page, target, label, app, environment, ip_address) VALUES ('skyline', 'native-1', ${now}, ${now}, '/skyline-3d', 'button', 'Launch', 'skyline', 'production', '203.0.113.8'), ('skyline', 'native-2', ${now - 60_000}, ${now - 60_000}, '/skyline-3d', 'a', 'Docs', 'skyline', 'production', '198.51.100.7')`,
]);
const server = Bun.spawn(
  [
    "bunx",
    "--no-install",
    "wrangler",
    "dev",
    "--config",
    "tests/wrangler.admin.json",
    "--port",
    "4176",
    "--ip",
    "127.0.0.1",
  ],
  { cwd: root, stdout: "ignore", stderr: "inherit" },
);
try {
  for (let attempt = 0; ; attempt += 1) {
    if ((await fetch(`${worker}/login`).catch(() => null))?.ok) break;
    if (attempt === 120) throw new Error("The test admin Worker did not start");
    await Bun.sleep(500);
  }
  await run(["bun", "run", "build:e2e"], app);
  await run(["bun", "run", "cap:sync", platform], app);
  await (platform === "ios" ? installIos(device) : installAndroid(device));
  await run(
    ["maestro", "--device", device, "test", "maestro/signIn.yaml"],
    app,
  );
} finally {
  server.kill();
  if (platform === "android")
    await run(["adb", "-s", device, "reverse", "--remove", "tcp:4176"]).catch(
      () => undefined,
    );
  // Leave the native project holding the store bundle again.
  await run(["bun", "run", "build"], app);
  await run(["bunx", "--no-install", "cap", "copy", platform], app);
}
