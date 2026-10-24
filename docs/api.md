# API and dashboard behavior

The [operations guide](operations.md) covers deployment, administrator accounts,
and release readiness. The [privacy guide](privacy.md) describes collection and
delivery limits.

Protocol or schema rollouts must also satisfy the
[npm publication readiness gate](operations.md#npm) before releasing
a client that depends on them.

## Endpoints

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
inclusive and to exclusive. The exact-match drill-down filters ip, country,
region, regionCode, city, page, target and label apply the same way and combine
with the others; ~unknown selects missing values, matching the Unknown groups in summary
rankings. Location filters compare the joined location, so country=~unknown
also matches clicks without one. IPs are canonicalized like stored addresses;
other values must match the stored form, and invalid values return 400.
Ranges are capped at 90 days plus the end-day boundary.
Events returns 100 rows in descending click-time order and an opaque nextCursor.
Server receipt times are internal and are not returned. Pass cursor with the same
filters for the next page. All data endpoints require a valid administrator session. Responses are
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

POST /api/forget is the only data mutation. It takes a JSON body of exactly
{ip}, canonicalized like the ip filter, from a signed-in session with the exact
dashboard Origin, bounded to 1 KiB. One atomic D1 batch deletes every retained
click from that address, whatever its site, app, environment or date, and then
the locations no remaining click references. It returns {ip, deleted} with the
number of clicks removed; repeating it deletes nothing. Clicks without an IP
cannot be forgotten this way. Other methods return 405, a foreign or missing
Origin 403, other media types 415 and invalid addresses 400. It shares the read
rate limit. Every other data route stays GET/HEAD only.

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

Every overview ranking and recent-click cell links to the clicks it represents
under the current site, app, environment and day filters. Site, app and
environment values select that filter on /recent. Other values open a
drill-down of /recent, such as /recent?ip=203.0.113.8 or
/recent?country=US&region=Texas&city=Austin, which pages and scrolls exactly
like the unfiltered list. Drill-down values stay in the query string because
Cloudflare's asset router re-encodes paths and merges slashes, which would alter
values such as Biel/Bienne. Changing a shared filter keeps the drill-down; the
navigation links return to the unscoped views. Migration 0006_ip_filter.sql
indexes IP addresses in click-time order for IP drill-downs, and for forgetting.

IP addresses in the recent-click table replace the browser's context menu with
the dashboard's own. It opens from a right-click, Shift+F10 or the context-menu
key, or a touch long press, and offers the IP drill-down, copying the address
and Forget this IP. Forgetting asks for confirmation in a modal that names the
address and focuses Cancel; Escape cancels until the request starts. Failures
stay in the dialog. Success reloads the current view and reports how many clicks
were deleted.

Dark Graphite is the default dashboard theme, using a2f0.net's charcoal palette.
The top-bar switch selects light or dark and persists ct.theme in localStorage;
the switch still works if storage is blocked. The external theme.js script
restores the choice before styles load while honoring the existing script CSP.
It also owns the theme-color tag, which follows data-theme so browser chrome
matches the page background in either theme.

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

The app-choice query is optional metadata: if it fails, `/api/sites` still returns
the static site/environment registry with an empty app list. Existing valid app
URL selections remain usable, and summary/events requests keep their normal error
handling.
