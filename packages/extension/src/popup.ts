export {};

const toggle = document.querySelector<HTMLInputElement>("#disabled");
const status = document.querySelector<HTMLElement>("#status");
const detail = document.querySelector<HTMLElement>("#detail");
const error = document.querySelector<HTMLElement>("#error");

function render(disabled: boolean) {
  if (!toggle || !status || !detail) return;
  toggle.checked = disabled;
  status.textContent = disabled
    ? "Your clicks stay yours."
    : "CT tracking is allowed.";
  detail.textContent = disabled
    ? "CT clicks are blocked across this browser. Open tabs update immediately."
    : "Sites can collect clicks after they initialize CT. Your site preferences still apply.";
}

async function update() {
  if (!toggle || !error) return;
  const disabled = toggle.checked;
  toggle.disabled = true;
  error.textContent = "";
  try {
    if (disabled) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: ["ct-block"],
        disableRulesetIds: [],
      });
      await chrome.storage.local.set({ disabled: true });
    } else {
      await chrome.storage.local.set({ disabled: false });
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: [],
        disableRulesetIds: ["ct-block"],
      });
    }
    render(disabled);
  } catch {
    // Preserve privacy on partial failures; report that the preference may need a retry.
    await chrome.storage.local.set({ disabled: true }).catch(() => undefined);
    await chrome.declarativeNetRequest
      .updateEnabledRulesets({
        enableRulesetIds: ["ct-block"],
        disableRulesetIds: [],
      })
      .catch(() => undefined);
    render(true);
    error.textContent =
      "Could not change the preference. Tracking remains disabled; please try again.";
  } finally {
    toggle.disabled = false;
  }
}

if (toggle) {
  toggle.addEventListener("change", () => {
    void update();
  });
  void chrome.storage.local
    .get({ disabled: true })
    .then((settings) => {
      render(settings.disabled !== false);
      toggle.disabled = false;
    })
    .catch(() => {
      if (error)
        error.textContent =
          "Could not read the preference. Reopen this popup to try again.";
    });
}
