import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { requireRubyBundle } from "./support/requireRubyBundle";

const packageRoot = resolve(import.meta.dir, "../..");

/** Runs Ruby in the package's bundle and returns the JSON it prints last. */
async function runRuby(script: string, environment: Record<string, string>) {
  await requireRubyBundle();
  const child = Bun.spawn(["bundle", "exec", "ruby", "-e", script], {
    cwd: packageRoot,
    env: {
      ...process.env,
      FASTLANE_OPT_OUT_USAGE: "1",
      FASTLANE_SKIP_UPDATE_CHECK: "1",
      NATIVE_RELEASE_SECRETS_DIR: "",
      NATIVE_RELEASE_TIER: "production",
      ...environment,
    },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ]);
  if (exitCode !== 0) throw new Error(`Ruby failed: ${stderr}`);
  return {
    result: JSON.parse(stdout.trim().split("\n").at(-1) ?? "null"),
    output: stderr + stdout,
  };
}

const appfileScript =
  'require "json"; require "credentials_manager"; puts JSON.generate({appIdentifier: CredentialsManager::AppfileConfig.try_fetch_value(:app_identifier), packageName: CredentialsManager::AppfileConfig.try_fetch_value(:package_name)})';

test("Fastlane Appfile selects the production store identity", async () => {
  const { result, output } = await runRuby(appfileScript, {});
  expect(result).toEqual({
    appIdentifier: "net.a2f0.ct",
    packageName: "net.a2f0.ct",
  });
  expect(output).not.toContain("already initialized constant");
});

// CredentialsManager reports a failing Appfile and leaves the identity unset.
test("Fastlane Appfile rejects an undeclared release tier", async () => {
  const { result, output } = await runRuby(appfileScript, {
    NATIVE_RELEASE_TIER: "staging",
  });
  expect(result).toEqual({ appIdentifier: null, packageName: null });
  expect(output).toContain(
    'Unknown NATIVE_RELEASE_TIER="staging". Expected production.',
  );
});

const pathConstantsScript = [
  'require "json"',
  'require "fastlane"',
  "Fastlane.load_actions",
  'Fastlane::FastFile.new("fastlane/Fastfile")',
  "names = %w[ANDROID_DIR IOS_PACKAGE_DIR IOS_DIR GOOGLE_PLAY_DEFAULT_JSON_KEY_PATH ANDROID_UPLOAD_KEYSTORE_PATH]",
  "constants = names.to_h { |name| [name, Fastlane::FastFile.const_get(name)] }",
  'puts JSON.generate(constants.merge("NATIVE_SECRETS_DIR" => NATIVE_SECRETS_DIR))',
].join("; ");

function expectedPathConstants(secretsDir: string) {
  return {
    ANDROID_DIR: resolve(packageRoot, "android"),
    IOS_PACKAGE_DIR: packageRoot,
    IOS_DIR: resolve(packageRoot, "ios"),
    NATIVE_SECRETS_DIR: secretsDir,
    GOOGLE_PLAY_DEFAULT_JSON_KEY_PATH: resolve(
      secretsDir,
      "google-play-service-account-admin.json",
    ),
    ANDROID_UPLOAD_KEYSTORE_PATH: resolve(secretsDir, "ct-upload.keystore"),
  };
}

test("Fastlane lane files resolve production paths outside their directory", async () => {
  const { result } = await runRuby(pathConstantsScript, {});
  expect(result).toEqual(
    expectedPathConstants(resolve(packageRoot, "../../.secrets/prod")),
  );
});

test("NATIVE_RELEASE_SECRETS_DIR replaces the production secrets folder", async () => {
  const absolute = await runRuby(pathConstantsScript, {
    NATIVE_RELEASE_SECRETS_DIR: "/tmp/ct-native-secrets",
  });
  expect(absolute.result).toEqual(
    expectedPathConstants("/tmp/ct-native-secrets"),
  );
  // A relative folder resolves against the package, as Gradle resolves it.
  const relative = await runRuby(pathConstantsScript, {
    NATIVE_RELEASE_SECRETS_DIR: "fixtures/secrets",
  });
  expect(relative.result).toEqual(
    expectedPathConstants(resolve(packageRoot, "fixtures/secrets")),
  );
});

// The lanes docs/fastlane.md in a2f0/matrix requires, plus the optional
// profile, build number, readiness, and Android development lanes this
// repository keeps.
const expectedLanes = {
  general: ["store_build_numbers"],
  android: [
    "build_debug_apk",
    "build_release",
    "build_release_apk",
    "clean",
    "install_debug",
    "install_release",
    "readiness",
    "sideload",
    "test",
    "upload_release",
  ],
  ios: [
    "build_release",
    "fetch_profiles",
    "profiles",
    "readiness",
    "upload_release",
  ],
};

test("Fastlane declares the standard production lanes", async () => {
  const { result } = await runRuby(
    [
      'require "json"',
      'require "fastlane"',
      "Fastlane.load_actions",
      'fastfile = Fastlane::FastFile.new("fastlane/Fastfile")',
      'lanes = fastfile.runner.lanes.to_h { |platform, platform_lanes| [(platform || "general").to_s, platform_lanes.keys.map(&:to_s).sort] }',
      "puts JSON.generate(lanes)",
    ].join("; "),
    {},
  );
  expect(result).toEqual(expectedLanes);
});

test("iOS build flags preserve a keychain path containing whitespace and Unicode", async () => {
  const { result } = await runRuby(
    [
      'require "json"',
      'require "fastlane"',
      "Fastlane.load_actions",
      'fastfile = Fastlane::FastFile.new("fastlane/Fastfile")',
      'FastlaneCore::Helper.singleton_class.define_method(:keychain_path) { |_name| "/tmp/Signing Keys/署名 keychain-db" }',
      'ENV["MATCH_KEYCHAIN_NAME"] = "release keychain"',
      'xcargs = fastfile.send(:ios_build_xcargs, { build_number: 2, version: "1.0" }, "TEAM")',
      "puts JSON.generate(Shellwords.split(xcargs))",
    ].join("; "),
    {},
  );
  expect(result).toContain(
    "OTHER_CODE_SIGN_FLAGS=--keychain /tmp/Signing\\ Keys/\\署\\名\\ keychain-db",
  );
});
