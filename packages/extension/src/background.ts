import { synchronizeRules } from "./preferences";

// Chrome resets static rulesets on update. Reconcile with the saved preference;
// serializing reads also prevents rapid preference changes from ending out of order.
let pending = Promise.resolve();
function synchronize(): void {
  pending = pending.catch(() => undefined).then(() => synchronizeRules(chrome));
  void pending.catch(() => undefined);
}
chrome.runtime.onInstalled.addListener(synchronize);
chrome.runtime.onStartup.addListener(synchronize);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.disabled) synchronize();
});
