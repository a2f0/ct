# @a2f0/ct-client

Framework-free, batched click tracking. Importing or constructing a tracker starts
no listeners, timers, storage writes, or requests. Call init explicitly in the
deployed browser bootstrap; keep that call out of shared components and tests.

Install with `bun add @a2f0/ct-client` or `npm install @a2f0/ct-client`.

```ts
import { createTracker } from '@a2f0/ct-client';
const tracker = createTracker({
  site: 'a2f0-net',
  app: 'desktop',
  environment: 'production',
  capture: 'all',
  page: () => '/skyline-3d',
});
tracker.init();
await tracker.flush();
tracker.setOptOut(true);
tracker.destroy();
```

The site must be registered with its exact origin at the API. The default endpoint
is https://ct.a2f0.net/v1/clicks. Browser ESM is self-contained; TypeScript types
are included. There are no runtime dependencies.
init throws for an invalid site/app name, environment, or endpoint URL, before adding listeners.
Validate configuration before initializing the tracker.

## Options

| Option | Default | Behavior |
| --- | --- | --- |
| site | Required | Public site identifier, lowercase letters/numbers/hyphens |
| app | null | Default app slug, lowercase letters/numbers/hyphens, 1–64 characters |
| environment | Inferred by server | production or staging; must match registered site and exact origin |
| page | () => '/' | Stable route template, maximum 200 characters |
| capture | interactive | all elements, interactive controls, or marked elements |
| batchSize | 20 | 1–50 clicks per request |
| flushIntervalMs | 5000 | 100–60000 milliseconds |
| maxQueueSize | 500 | Bounded between batch size and 1000 |
| enabled | true | false makes init inert |
| overrideGpc | false | Only true ignores Global Privacy Control; other opt-outs still apply |
| endpoint | CT endpoint | HTTPS, or HTTP on localhost for development |

capture values are 'all', 'interactive', and 'marked'. Assign a stable label with
data-ct="open-building". Never put user content in this attribute. Use
data-ct-ignore on an element or ancestor to exclude a subtree. Inputs, textareas,
selects, and editable content are always excluded. Open shadow DOM and SVG work.

Wrap an embedded app with `data-ct-app="skyline"`. The nearest such attribute in
the click's composed path overrides the tracker default, including unlabeled
canvas clicks inside an open shadow root. An invalid or empty nearest attribute
produces null instead of inheriting another app. Use one tracker per hosting
website; the site remains `a2f0-net` while its desktop, Skyline and other embedded
apps get separate app values. Closed shadow roots expose only their host, and
cross-origin iframe clicks require a tracker inside that frame.

Environment is fixed per tracker and sent once per batch. The collector derives
it from the registered site and exact request Origin; an explicit mismatched
value rejects the entire batch. Old clients may omit both dimensions: app is
null and environment is inferred. Never put user data in app names. Initialize
only on deliberately registered production or staging origins, never on local,
preview, test or automated pages.

Only trusted clicks are captured. init is idempotent and returns whether capture
is currently allowed. destroy removes listeners, aborts requests, and discards
the queue; a later init can start it again. flush sends one batch and schedules
remaining work. Network errors, timeouts, 408 and 429 retry with capped backoff;
other 4xx responses discard the rejected batch. Event IDs make retries idempotent.

## Opt out

setOptOut(true) saves ct:opt-out=1 in localStorage, clears the queue and stops
capture for this site. setOptOut(false) removes that preference. Trackers also
honor DNT, Global Privacy Control and the CT extension's data-ct-disabled marker.
To explicitly override only Global Privacy Control, pass overrideGpc: true to
createTracker before calling init. The default is false. This applies to capture
and delivery for that tracker only; DNT, saved and in-memory opt-outs, the extension,
storage errors, and automated-browser guards still disable tracking.
An opt-out cannot retract a request the server already received. Storage errors
disable tracking. The extension applies across all sites and must be installed
separately in each browser/profile. Preferences are not synchronized between them.

The queue is in memory. Clicks are dropped when it is full. Page hiding attempts
a keepalive flush, but closing/crashing/offline navigation can lose unsent events.
This is best-effort analytics, not an audit trail or billing source. No cookies,
visitor IDs, local click history, text, hrefs, DOM IDs, classes, or form values
are collected by the SDK. page defaults to '/' so dynamic routes are never inferred.

The default CT collector adds the full request IP and approximate country,
state/region, city, continent, and timezone when a batch arrives. These fields
are stored for up to 90 days and visible to provisioned administrators on the
authenticated dashboard and data API. The SDK sends no dashboard credentials. IPs can link activity; this is not anonymous analytics. Accepted
batches receive this metadata even when overrideGpc is explicitly enabled.
See the [collector data policy](https://github.com/a2f0/ct/blob/main/docs/privacy.md)
when deciding what to disclose to your site's visitors.
