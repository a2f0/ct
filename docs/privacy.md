# Click data

The dashboard and every data API require an administrator account and are
read-only. Registration is disabled; accounts are provisioned through the
operator CLI. Consumers must still pass stable, non-sensitive labels and route
templates. The collector accepts registered browser origins without a dashboard
session; the browser SDK does not authenticate or send cookies.

Each row contains the public site name, a random per-event UUID, the click time,
normalized page name, optional stable app slug, registered deployment environment, element tag, optional explicit data-ct label, request IP,
and a reference to the shared location record described below. The SDK creates
no separate visitor or session identifier. It never reads text,
href, class, DOM ID, form values, query strings, fragments, or referrers. It sends
no cookies. Route names are supplied by the consumer, with '/' as the default.
Server receipt times are stored internally but excluded from the data API and
pagination cursors to avoid exposing ordinary delivery batches. When a device's
clock is outside the accepted window, the batch is shifted so its newest click
uses server time while preserving the spacing between its clicks.

The ingestion Worker stores the request IP address from Cloudflare's
CF-Connecting-IP header (or the preserved IPv6 address in Pseudo IPv4 overwrite
mode). It also reads Cloudflare's request.cf country, continent, state/region,
region code, city, and timezone. These fields are visible to authenticated administrators through the dashboard
and data API, including full IP addresses. IPs can identify or link activity and
must not be described as anonymous data. There is no separate visitor profile,
session ID, browser geolocation prompt, or external geolocation service.

These are the network address and approximate location at batch delivery, not
necessarily at click time. VPNs, proxies, mobile networks, and shared addresses
can change or obscure the location. An IP may be shared or change over time, so
it is not a reliable unique-user identifier or a verified physical position.
Missing metadata and historical rows stay null
and appear as Unknown. No historical IPs or locations are inferred or backfilled.
Coordinates, street addresses, postal codes, and raw user-agent strings are not
collected with click events. The client cannot supply IP/location fields in click payloads.

Locations are deduplicated by their complete geographic tuple, not by IP, and
joined to clicks. An IP can change location over time without rewriting old
clicks. Duplicate event retries preserve the first successful receipt's IP and
location. Worker request observability remains disabled. Cloudflare still
processes network requests as the hosting provider. No unique-user count is
derived from IP addresses.

Events and their IP addresses older than 90 days are deleted daily; the same
transaction removes locations no longer referenced by retained events.
Cloudflare D1 recovery may retain
previous data according to the account's Time Travel window. The client queue is
bounded, in memory, and best-effort: it retries transient failures while the page
is open, and attempts keepalive delivery when hidden. Closed/offline/crashed pages
can lose clicks. The public ingestion endpoint's origin checks prevent accidental
cross-site use, not forged requests from non-browser clients; counts are not an
audit or billing source.

The client respects the extension, site opt-out, DNT and GPC by default. A consumer
may pass overrideGpc: true to createTracker before init to ignore GPC for that
tracker's capture and delivery. This option defaults to false and does not override
the extension, site opt-out, DNT, storage errors, or automated-browser guards.
Accepted batches receive the same server IP/location metadata even when the
consumer has explicitly enabled the GPC override; ingestion has no separate
Sec-GPC metadata suppression rule. With the default client configuration, GPC
prevents the batch from being sent at all.
Disabling clears the queue and aborts an in-flight request when possible.
It cannot erase data already received. Synthetic clicks and webdriver browsers are
excluded. init must still be called only by the consumer's deployed-site bootstrap,
guarded by the exact origin.

The admin stores its dark/light theme preference in local browser storage
(ct.theme). This preference is never sent with click events or used as an identifier.
Dashboard authentication uses a Secure, HttpOnly, SameSite=Lax, host-only cookie.
Separate auth tables store administrators' names, emails, salted password hashes,
and session tokens, expiry, IP addresses and user agents. Sessions expire after
eight hours without renewal; logout and operator password resets revoke sessions.
Expired sessions are rejected and removed when read; there is no scheduled
auth-record purge, and the 90-day click-retention job does not delete accounts
or auth records. These administrative records
are not joined to click records and are unrelated to visitor attribution. No
self-service registration or email recovery service is enabled.


App attribution comes only from the explicit tracker app option or the nearest
valid data-ct-app boundary, never from DOM text, IDs, class names, or iframe URLs.
App names are bounded lowercase slugs and must not identify users. Environment is
production or staging, resolved against the site's registered request Origin.
These non-sensitive dimensions describe the application and deployment, not the visitor.
Historical app values stay null; only Skyline's previously known production
environment is backfilled. Dashboard views default to production, with staging
and all-environment views available explicitly.
