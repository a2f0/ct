export {};

const attribute = "data-ct-disabled";
let disabled = true;

function apply() {
  const root = document.documentElement;
  if (!root) return;
  root.toggleAttribute(attribute, disabled);
  document.dispatchEvent(new Event("ct:opt-out-change"));
}

// Block immediately, before asynchronous storage resolves. The enabled network
// rule also protects the interval before documentElement is available.
apply();
if (!document.documentElement) {
  const observer = new MutationObserver(() => {
    if (document.documentElement) {
      apply();
      observer.disconnect();
    }
  });
  observer.observe(document, { childList: true });
}
void chrome.storage.local.get({ disabled: true }).then((settings) => {
  disabled = settings.disabled !== false;
  apply();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.disabled) {
    disabled = changes.disabled.newValue !== false;
    apply();
  }
});
