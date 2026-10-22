import { savePreference } from "./preferences";

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
    await savePreference(chrome, disabled);
    render(disabled);
  } catch {
    render(true);
    error.textContent =
      "Could not save the preference. Check extension permissions and try again.";
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
