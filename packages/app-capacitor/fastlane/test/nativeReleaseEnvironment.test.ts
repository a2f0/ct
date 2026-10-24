import { expect, test } from "bun:test";
import {
  productionTarget,
  readNativeReleaseEnvironment,
} from "./support/nativeReleaseSnapshot";

// Both files also hold server values; only store names may reach the lanes.
const sharedEnv =
  "TEAM_ID=shared-team\nAPP_STORE_CONNECT_KEY_ID=shared-key\nANDROID_KEYSTORE_STORE_PASS=shared-pass\nSERVER_SECRET=shared-server\nNATIVE_TEST_VALUE=shared\n";
const appEnv =
  "ANDROID_KEYSTORE_STORE_PASS=app-pass\nANDROID_KEYSTORE_KEY_PASS=app-key\nSERVER_SECRET=app-server\nNATIVE_TEST_VALUE=app\nVITE_API_URL=https://example.test\n";

test("production imports only store names from shared.env, then app.env", async () => {
  expect(await readNativeReleaseEnvironment(sharedEnv, appEnv)).toEqual({
    ...productionTarget,
    environment: {
      ANDROID_KEYSTORE_KEY_PASS: "app-key",
      ANDROID_KEYSTORE_STORE_PASS: "app-pass",
      APP_STORE_CONNECT_KEY_ID: "shared-key",
      MATCH_PASSWORD: null,
      NATIVE_TEST_VALUE: null,
      SERVER_SECRET: null,
      TEAM_ID: "shared-team",
    },
  });
});

test("explicit environment values beat both secrets files", async () => {
  const snapshot = await readNativeReleaseEnvironment(sharedEnv, appEnv, {
    ANDROID_KEYSTORE_STORE_PASS: "process-pass",
    NATIVE_RELEASE_TIER: " Production ",
    NATIVE_TEST_VALUE: "process",
  });
  expect(snapshot.appIdentifier).toBe("net.a2f0.ct");
  expect(snapshot.environment).toMatchObject({
    ANDROID_KEYSTORE_KEY_PASS: "app-key",
    ANDROID_KEYSTORE_STORE_PASS: "process-pass",
    NATIVE_TEST_VALUE: "process",
  });
});

test("NATIVE_RELEASE_SECRETS_DIR replaces the production secrets folder", async () => {
  const snapshot = await readNativeReleaseEnvironment(
    sharedEnv,
    appEnv,
    { NATIVE_RELEASE_SECRETS_DIR: "override" },
    {
      "packages/app-capacitor/override/shared.env": "TEAM_ID=override-team\n",
    },
  );
  expect(snapshot.environment).toMatchObject({
    ANDROID_KEYSTORE_STORE_PASS: null,
    TEAM_ID: "override-team",
  });
});

test("an undeclared tier fails before any lane runs", async () => {
  await expect(
    readNativeReleaseEnvironment("", "", { NATIVE_RELEASE_TIER: "staging" }),
  ).rejects.toThrow(
    'Unknown NATIVE_RELEASE_TIER="staging". Expected production.',
  );
});
