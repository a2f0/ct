# Click data

The initial dashboard and data API are public and read-only by request. Every
stored field is visible there; consumers must pass stable, non-sensitive labels
and route templates. Authentication can be added later without changing ingestion.

Each row contains the public site name, a random per-event UUID, the click time,
server receipt time, normalized page name, element tag, and optional explicit
data-ct label. There is no visitor or session identifier. The SDK never reads text,
href, class, DOM ID, form values, query strings, fragments, or referrers. It sends
no cookies. Route names are supplied by the consumer, with '/' as the default.

IP addresses are used transiently by Cloudflare's rate limiter and are not stored
in D1. Worker request observability is disabled. Cloudflare still processes network
requests as the hosting provider. No claims are made about visitors or unique users.

Events older than 90 days are deleted daily. Cloudflare D1 recovery may retain
previous data according to the account's Time Travel window. The client queue is
bounded, in memory, and best-effort: it retries transient failures while the page
is open, and attempts keepalive delivery when hidden. Closed/offline/crashed pages
can lose clicks. The public ingestion endpoint's origin checks prevent accidental
cross-site use, not forged requests from non-browser clients; counts are not an
audit or billing source.

The client respects the extension, site opt-out, DNT and GPC. Disabling clears the
queue and aborts an in-flight request when possible. It cannot erase data already
received. Synthetic clicks and webdriver browsers are excluded. init must still
be called only by the consumer's production bootstrap, guarded by the exact origin.
