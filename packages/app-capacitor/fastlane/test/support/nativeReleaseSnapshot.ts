import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { requireRubyBundle } from "./requireRubyBundle";

const packageRoot = resolve(import.meta.dir, "../../..");
const nativeReleaseTargetPath = resolve(
  packageRoot,
  "fastlane/lib/native_release_target.rb",
);
const snapshotScriptPath = resolve(
  packageRoot,
  "fastlane/test/support/native_release_snapshot.rb",
);

interface NativeReleaseSnapshot {
  androidBuildVariant: string;
  androidBuildVariantTask: string;
  appIdentifier: string;
  iosArchiveRelativePath: string;
  releaseAabRelativePath: string;
  releaseMappingRelativePath: string;
  releaseNativeDebugSymbolsRelativePath: string;
  environment: Record<string, string | null>;
  iosConfiguration: string;
  iosScheme: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const targetFields = [
  "androidBuildVariant",
  "androidBuildVariantTask",
  "appIdentifier",
  "iosArchiveRelativePath",
  "iosConfiguration",
  "iosScheme",
  "releaseAabRelativePath",
  "releaseMappingRelativePath",
  "releaseNativeDebugSymbolsRelativePath",
] as const;

function parseNativeReleaseSnapshot(stdout: string): NativeReleaseSnapshot {
  const value: unknown = JSON.parse(stdout);
  if (!isRecord(value) || !isRecord(value.environment)) {
    throw new Error(
      "Native release snapshot must be an object with an environment",
    );
  }
  const target = {} as Record<(typeof targetFields)[number], string>;
  for (const field of targetFields) {
    const entry = value[field];
    if (typeof entry !== "string") {
      throw new Error("Native release snapshot target fields must be strings");
    }
    target[field] = entry;
  }
  const environment: Record<string, string | null> = {};
  for (const [name, entry] of Object.entries(value.environment)) {
    if (entry !== null && typeof entry !== "string") {
      throw new Error(
        "Native release snapshot environment values must be nullable strings",
      );
    }
    environment[name] = entry;
  }
  return { ...target, environment };
}

export const productionTarget = {
  androidBuildVariant: "release",
  androidBuildVariantTask: "Release",
  appIdentifier: "net.a2f0.ct",
  iosArchiveRelativePath: "output/CT.xcarchive",
  iosConfiguration: "Release",
  iosScheme: "App",
  releaseAabRelativePath: "bundle/release/app-release.aab",
  releaseMappingRelativePath: "mapping/release/mapping.txt",
  releaseNativeDebugSymbolsRelativePath:
    "native-debug-symbols/release/native-debug-symbols.zip",
};

// Names the snapshot reports; the caller's environment must not leak them.
const snapshotEnvironmentNames = [
  "ANDROID_KEYSTORE_KEY_PASS",
  "ANDROID_KEYSTORE_STORE_PASS",
  "APP_STORE_CONNECT_KEY_ID",
  "MATCH_PASSWORD",
  "NATIVE_RELEASE_SECRETS_DIR",
  "NATIVE_RELEASE_TIER",
  "NATIVE_TEST_VALUE",
  "SERVER_SECRET",
  "TEAM_ID",
];

// Loads a copy of native_release_target.rb from a temporary repository whose
// `.secrets/prod` holds the given shared.env and app.env. `files` adds or
// replaces files by path from the temporary root.
export async function readNativeReleaseEnvironment(
  sharedEnv: string,
  appEnv: string,
  processEnvironment: Record<string, string> = {},
  files: Record<string, string> = {},
) {
  await requireRubyBundle();
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "ct-native-release-target-"),
  );
  const copiedTargetPath = join(
    temporaryRoot,
    "packages/app-capacitor/fastlane/lib/native_release_target.rb",
  );
  const fixtureFiles: Record<string, string> = {
    ".secrets/prod/shared.env": sharedEnv,
    ".secrets/prod/app.env": appEnv,
    ...files,
  };
  await mkdir(dirname(copiedTargetPath), { recursive: true });
  await Bun.write(copiedTargetPath, Bun.file(nativeReleaseTargetPath));
  await Promise.all(
    Object.entries(fixtureFiles).map(([path, contents]) =>
      Bun.write(join(temporaryRoot, path), contents),
    ),
  );

  const environment = { ...process.env };
  for (const name of snapshotEnvironmentNames) {
    Reflect.deleteProperty(environment, name);
  }
  Object.assign(environment, processEnvironment);

  try {
    const child = Bun.spawn(
      ["bundle", "exec", "ruby", snapshotScriptPath, copiedTargetPath],
      {
        cwd: packageRoot,
        env: environment,
        stderr: "pipe",
        stdout: "pipe",
      },
    );
    const [exitCode, stderr, stdout] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
      new Response(child.stdout).text(),
    ]);
    if (exitCode !== 0) {
      throw new Error(`Ruby native release target failed: ${stderr}`);
    }
    return parseNativeReleaseSnapshot(stdout);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
