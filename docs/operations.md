# Operations

## Cloudflare

Wrangler owns Worker deployments and custom domains. The ct D1 database is shared
by the ingestion and admin Workers and its ID is recorded in both Wrangler files.
The public domains are ct.a2f0.net and ct-admin.a2f0.net; workers.dev and preview
URLs are disabled. Use the existing Wrangler OAuth login, or supply appropriately
scoped CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID through the environment.
Never put credentials into tracked configuration. Any local project secrets belong
in the matrix-managed ct namespace, linked through ignored .secrets.

```sh
bun run deploy:preview # checks, tests, builds and both Worker dry-runs
bun run deploy         # same prerequisites, remote migrations, then both Workers
```

Before a new account's first deployment, run wrangler d1 create ct and replace both
database_id values. The deploy script rejects placeholder or differing IDs, invalid
site names/origins, invalid or conflicting origin environments, and site registries that differ between the two Workers. The
custom-domain deployment creates the corresponding DNS routing after the Workers
are uploaded. Do not reuse another application's database. The scheduled ingestion
Worker deletes events older than 90 days at 03:17 UTC daily.

After deploying, verify GET /health on the collector, /api/sites and /api/summary
on the admin host, and a 405 for POST /api/events. Do not generate production clicks
as part of normal tests. A consumer's origin must be listed under its site key in
both configs, mapped to production or staging. Public site identifiers are not credentials.

Dashboard HTML uses Cache-Control: no-transform to prevent Cloudflare's automatic
Web Analytics beacon injection, while the CSP permits only our own scripts.
This follows Cloudflare's [Web Analytics setup guidance](https://developers.cloudflare.com/web-analytics/get-started/).

## API

POST https://ct.a2f0.net/v1/clicks accepts text/plain JSON or application/json with
an exact allowed Origin and {site, environment?, events}. It accepts 1–50 validated events, up to
32 KiB, and returns 202 only after D1 commits. If a positive integer timestamp is
older than 24 hours or more than five minutes ahead, the entire batch is shifted
so its newest click equals server time, preserving the intervals between clicks.
A batch requiring correction and spanning more than 24 hours is rejected as
inconsistent. Duplicate (site, id) pairs are ignored;
accepted counts acknowledged events, including retries already stored.
Rate limits allow approximately 120 batches/minute/IP per Cloudflare location.
Inserts use up to nine clicks per statement (99 bindings), so a full 50-click
batch plus its location uses seven statements in a single atomic D1 batch. This
stays below D1's 100-parameter limit and its free-plan query budget.

The admin Worker exposes GET /api/sites, /api/summary and /api/events. Optional site, app, environment,
from and to filters apply to both data endpoints; dates are ISO timestamps, from
inclusive and to exclusive. Ranges are capped at 90 days plus the end-day boundary.
Events returns 100 rows in descending click-time order and an opaque nextCursor.
Server receipt times are internal and are not returned. Pass cursor with the same
filters for the next page. All endpoints are public and read-only. Responses are
not cached. The UI displays UTC event dates and no unique-visitor metric.
Each event includes app (slug or null), environment (production, staging, or null), ip (IPv4/IPv6 or null) and location (null or continent,
country, region, regionCode, city, timezone). The Worker adds these from Cloudflare
request metadata; no client upgrade is needed. Country values are two-letter
codes and regions are country-specific. The summary's geography object includes
the top 20 countries, regions, and cities by click count under the same site/date
filters; missing metadata appears as an Unknown group. These are approximate
network locations at delivery, not verified visitor locations.

Migration 0003_ip_locations.sql adds nullable clicks.ip_address and location_id
and a shared locations table. It preserves existing clicks. The location key
deduplicates the full geographic tuple and the foreign key supports the admin's
LEFT JOINs. clicks_location indexes references for retention cleanup. Migrations
run before either Worker uploads; the old Worker remains compatible with the
additive schema. The daily retention transaction deletes expired clicks and then
unreferenced locations, including unused rows created by duplicate retries.

Pagination is a live view, not a snapshot: delayed arrivals can land in a page
already read. Refresh to include arrivals that precede the current cursor.

The dashboard overview is at / and recent clicks are at /recent. Both routes
support direct loads and browser history, and preserve site and day filters in
their URLs. The UI defaults to Production; All environments is encoded as
environment=all in dashboard URLs and omits the API environment filter. The raw
API keeps all environments when its filter is omitted. app=~unknown and
environment=~unknown select missing values. /api/sites includes up to 500
alphabetically sorted app names seen within retention; a valid app slug in a
dashboard URL remains selectable even when outside that list. Unknown sites and invalid day ranges fall back to all sites and seven
days. The recent-click view loads older pages automatically as you scroll, with a
keyboard-accessible Load more fallback. A failed request pauses loading until
Retry; a repeated pagination cursor requires Refresh data. Changing filters or
refreshing starts a new date window and discards pending requests and previously
loaded pages. An overview refresh preserves its last successful report if the
request fails.

Dark Graphite is the default dashboard theme, using a2f0.net's charcoal palette.
The top-bar switch selects light or dark and persists ct.theme in localStorage;
the switch still works if storage is blocked. The external theme.js script
restores the choice before styles load while honoring the existing script CSP.

## npm

The client publishes as @a2f0/ct-client. Initial publication requires an authenticated
maintainer (npm login); build and run package:smoke, then npm publish --ignore-scripts
--access public from packages/client. Confirm the registry tarball before updating
any consumer. The package ships a standalone browser ESM bundle and declarations.

For subsequent releases, configure the package's npm trusted publisher for owner
a2f0, repository ct, workflow npm-publish.yml, environment npm, with publishing
allowed. Restrict that GitHub environment to main, then set the repository variable
NPM_TRUSTED_PUBLISHING=true to enable automated publishing. The workflow validates and packs
without id-token access, then publishes the exact artifact from a separate job.
It skips versions already present and fails closed on registry errors. Use the
managed version workflow for client changes; never overwrite a published version.

## Browser packages

Build outputs are packages/extension/dist/ct-chrome.zip and ct-firefox.zip.
See the extension README for local installation and the separate store-signing
requirements. The extension's default-on network rule and SDK opt-out signal cover
different startup timing windows; test both when changing the preference protocol.

## Dependency maintenance

Keep Bun, packageManager, CI, exact dependency pins and the lockfile aligned. Use
the installed update-dependencies skill for upgrades. Validate Worker dry-runs,
the package tarball and both browser suites. Update agent-tool skills only with
agents:sync; do not edit managed files. Image generation uses agent-tool's declared
brand outputs. No production deployment is triggered automatically by a merge.


## App and environment dimensions

SITES maps each site to exact Origin keys with production or staging values.
Both Worker configurations must agree; deployment rejects invalid environments
and origins assigned conflicting environments across sites. A new batch's
explicit environment must match its registered origin. Missing environment from
older clients is inferred by the server, with no hostname guessing. These checks
prevent accidental mixing, not forged non-browser traffic.

Migration 0004_dimensions.sql adds nullable app/environment columns and indexes
for dimension filters and click-time pagination. It preserves all rows and
backfills only Skyline's known historical production environment. Historical app
stays Unknown. Named-column inserts from the old Worker remain compatible during
the migration-first rollout; any rows received by that Worker in the brief rollout
window can retain a null environment. New Worker receipts always get the registered
environment. Retries preserve the first successful receipt's dimensions.

Summary apps returns the top 20 app counts; environments returns all environment
counts. Site, app, environment and date filters apply to every summary group and
every recent-event page. The cursor order remains timestamp, event ID and site.
The UI defaults to Production to keep staging activity out of the normal overview;
Staging, All environments and Unknown environment are explicit choices.
