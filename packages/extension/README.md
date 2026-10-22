# CT browser opt-out

One Manifest V3 extension source produces Chrome and Firefox builds. Tracking is
disabled by default. The toolbar popup can allow it again. The extension collects
and sends no data; it stores one boolean preference locally in the browser.

```sh
bun run --cwd packages/extension build
```

Chrome: open chrome://extensions, enable Developer mode, choose Load unpacked,
and select packages/extension/dist/chrome. The corresponding ZIP can be extracted
elsewhere before loading.

Firefox: open about:debugging#/runtime/this-firefox, choose Load Temporary Add-on,
and select packages/extension/dist/firefox/manifest.json. Temporary installation
ends on browser restart. Permanent Firefox installation requires Mozilla signing;
dist/ct-firefox.zip is the artifact to submit through AMO (including unlisted
distribution). Chrome Web Store distribution is also a separate publishing step.

Install separately in every browser/profile. Allow private/incognito access in the
browser's extension settings if you also want protection there. The extension does
not change DNT/GPC or a site's saved opt-out when you allow tracking again.

The content script marks pages at document_start and updates open frames when the
preference changes. The client discards queued events on the signal. An enabled
declarativeNetRequest rule also blocks ct.a2f0.net/v1/clicks independently of page
JavaScript. HTTP/HTTPS host access lets the signal work on current and future CT
consumers. Restricted browser pages cannot run content scripts and do not use CT.
Custom collector URLs receive the page opt-out signal but are not covered by the
network rule. Already received requests cannot be recalled.
