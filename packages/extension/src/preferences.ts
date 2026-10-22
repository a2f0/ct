export interface PreferenceApi {
  storage: {
    local: {
      get(defaults: { disabled: boolean }): Promise<{ disabled?: unknown }>;
      set(settings: { disabled: boolean }): Promise<void>;
    };
  };
  declarativeNetRequest: {
    updateEnabledRulesets(options: {
      enableRulesetIds: string[];
      disableRulesetIds: string[];
    }): Promise<void>;
  };
}

function rules(api: PreferenceApi, disabled: boolean) {
  return api.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: disabled ? ["ct-block"] : [],
    disableRulesetIds: disabled ? [] : ["ct-block"],
  });
}

export async function synchronizeRules(api: PreferenceApi): Promise<void> {
  const settings = await api.storage.local.get({ disabled: true });
  await rules(api, settings.disabled !== false);
}

export async function savePreference(
  api: PreferenceApi,
  disabled: boolean,
): Promise<void> {
  try {
    if (disabled) await rules(api, true);
    await api.storage.local.set({ disabled });
    if (!disabled) await rules(api, false);
  } catch (error) {
    // Attempt both protections independently after a partial preference update.
    await Promise.allSettled([
      api.storage.local.set({ disabled: true }),
      rules(api, true),
    ]);
    throw error;
  }
}
