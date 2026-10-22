import { expect, test } from "bun:test";
import {
  type PreferenceApi,
  savePreference,
  synchronizeRules,
} from "./preferences";

function fixture() {
  let disabled = true;
  let blocked = true;
  let failUnblock = false;
  const calls: string[] = [];
  const api: PreferenceApi = {
    storage: {
      local: {
        get: async () => ({ disabled }),
        set: async (settings) => {
          disabled = settings.disabled;
          calls.push(`storage:${disabled}`);
        },
      },
    },
    declarativeNetRequest: {
      updateEnabledRulesets: async (options) => {
        const value = options.enableRulesetIds.length > 0;
        if (!value && failUnblock) throw new Error("cannot unblock");
        blocked = value;
        calls.push(`network:${blocked}`);
      },
    },
  };
  return {
    api,
    calls,
    state: () => ({ disabled, blocked }),
    resetRules: () => {
      blocked = true;
    },
    fail: () => {
      failUnblock = true;
    },
  };
}

test("preference changes preserve safe ordering", async () => {
  const state = fixture();
  await savePreference(state.api, false);
  expect(state.calls).toEqual(["storage:false", "network:false"]);
  state.calls.length = 0;
  await savePreference(state.api, true);
  expect(state.calls).toEqual(["network:true", "storage:true"]);
});

test("partial failures restore both opt-out controls", async () => {
  const state = fixture();
  state.fail();
  await expect(savePreference(state.api, false)).rejects.toThrow(
    "cannot unblock",
  );
  expect(state.state()).toEqual({ disabled: true, blocked: true });
});

test("startup/update reconciliation preserves an allowed preference", async () => {
  const state = fixture();
  await savePreference(state.api, false);
  state.resetRules();
  expect(state.state()).toEqual({ disabled: false, blocked: true });
  await synchronizeRules(state.api);
  expect(state.state()).toEqual({ disabled: false, blocked: false });
});
