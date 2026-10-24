# Operations

For endpoint behavior and dashboard dimensions, see the
[API guide](api.md). The [privacy guide](privacy.md) defines collection limits.

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

After deploying, verify GET /health on the collector, unauthenticated 401s for
/api/sites, /api/summary, /api/events and POST /api/forget on the admin host, a
redirect to /login for /recent, unauthenticated 200s for /favicon.ico, /favicon.svg,
/apple-touch-icon.png, /robots.txt, /privacy and /support, and X-Robots-Tag: noindex, nofollow on
admin responses. In a signed-in session, verify those GET APIs return 200 and
POST /api/events returns 405. Do not generate production clicks
as part of normal tests. A consumer's origin must be listed under its site key in
both configs, mapped to production or staging. Public site identifiers are not credentials.

Dashboard HTML uses Cache-Control: no-transform to prevent Cloudflare's automatic
Web Analytics beacon injection, while the CSP permits only our own scripts.
This follows Cloudflare's [Web Analytics setup guidance](https://developers.cloudflare.com/web-analytics/get-started/).

Neither host belongs in search results. Every admin Worker response, including
redirects, auth replies and errors, carries X-Robots-Tag: noindex, nofollow, and
the dashboard HTML has the matching robots meta tag. The admin robots.txt is
public, allows crawling and names no sitemap: a crawler that robots.txt blocks
never sees the noindex, so linked URLs could still be indexed. The collector adds
the same header to /health and unknown paths only; ingestion and CORS responses
are unchanged, and it serves no robots.txt of its own.

## Administrator accounts

CT uses Better Auth 1.7.12 with the direct D1 adapter, the same email/password
stack as Balebase. It has an independent secret and database tables. Migration
0005_admin_auth.sql creates auth_user, auth_account, auth_session,
auth_verification and auth_rate_limit with the schema expected by this version;
there is no legacy issuer column. It is additive and preserves click data.

For the first authentication deployment, list secret names, then create the
CT-only signing secret if BETTER_AUTH_SECRET is absent. Stream it directly into
Wrangler without printing it or putting it in arguments or a file:

```sh
bunx --no-install wrangler secret list --config packages/api/wrangler.admin.json
openssl rand -base64 48 | bunx --no-install wrangler secret put BETTER_AUTH_SECRET --config packages/api/wrangler.admin.json
bun run deploy
```

If an inactive version already exists, use `wrangler versions secret put
BETTER_AUTH_SECRET --config packages/api/wrangler.admin.json` in that same pipe
instead. It stages the secret without activating the version; verify its name
with `wrangler secret list`, then use the normal migration-first deploy. Never
activate a staged auth version before its schema exists.

Do not replace an existing secret during ordinary deployments. Never reuse
another application's secret. BETTER_AUTH_URL is the public dashboard origin in
the admin config; trusted origins and POST Origin checks use that exact origin.
The deploy script checks the signing secret’s name and exact HTTPS auth origin,
then applies migrations before uploading either Worker. A missing
or invalid auth secret fails closed: private routes return 503, never analytics.
Unauthenticated data requests return 401 with no site names or event metadata;
private page routes redirect to /login with a same-origin return path. Public
static assets and extension downloads contain no click data. The privacy policy
and support pages at /privacy and /support, which the store listings and the
app link to, render from the bundle without a session and request no data. The admin dev and
build scripts render the favicons from assets/brand/logo.svg with the
agent-tool.json favicons target into ignored packages/admin/public files; the
Worker serves only those exact icon paths before sign-in.

Provision an account from a terminal with an authenticated Wrangler session:

```sh
bun run admin:user -- create --remote --email admin@example.com
bun run admin:user -- reset --remote --email admin@example.com
```

The CLI uses pinned Node for Wrangler’s remote binding proxy (Bun still runs the
workspace command). Both commands prompt for a hidden password and confirmation (12–128 characters).
Use --local for the local D1 database. Automation can pass one password line via
stdin with --password-stdin; use a password manager or an in-memory pipe, never a
literal password in shell history, command arguments, environment variables, logs,
or a temporary SQL file. The CLI hashes with Better Auth's compatible password
hasher and uses bound D1 statements in a transaction. It disables Wrangler console
and disk logging during account operations, including when debug logging is set
in the caller’s environment. Reset replaces the credential
and revokes every session atomically. No HTTP provisioning or recovery endpoint
exists, and registration is disabled both in Better Auth and the Worker allowlist.

The only exposed auth routes are sign-in/email, get-session, sign-out, and
change-password under /api/auth. Mutations require same-origin JSON POSTs and
bounded request bodies. Database-backed limits allow five sign-in or password
change attempts per IP per minute, with a general 120/minute auth limit. Production
session cookies are Secure, HttpOnly, SameSite=Lax and host-only. Sessions expire
after eight hours and refresh after an hour of activity; no cookie session cache
bypasses database revocation. Responses are not cached. Signed-in users can change
their password at /account; it revokes their other sessions. Logout or a data API
401 clears the current UI report and shows login. There is no email service;
operator reset is the recovery path. All provisioned accounts have read access to
all registered sites and can forget an IP address's clicks; no click-writing or
account-management HTTP API is exposed.

The admin Worker explicitly sets limits.cpu_ms to 30000 for Better Auth’s scrypt
password verification. Cloudflare must support that budget; the Workers Free
10 ms budget is unsuitable. Verify version metadata/capability on the actual
account, and perform the ephemeral live login after deployment because local
Wrangler does not enforce production CPU limits. Do not weaken password hashing
parameters to fit a smaller budget. See [Worker CPU limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time).

The daily collector cron also removes expired auth sessions and verifications,
and auth rate-limit keys last used over 24 hours ago. With its daily cadence,
expired records normally disappear within 24 hours and inactive rate-limit keys
within 48 hours. The latter include failed/anonymous auth requests, not just
administrator IPs. Active accounts are retained. Migration 0005 must run before
the updated collector because its cron references these auth tables.

The isolated browser suite provisions through the actual CLI, runs both Workers,
and exercises login, private deep links, logout, password change, reset, revoked
sessions, and registration denial in Chrome and Firefox. Auth unit tests compare
the migration to the installed Better Auth schema and exercise its real D1 adapter.
For live verification use only an ephemeral administrator account, keep generated
credentials/cookies in process memory, and delete that account afterward. Do not
write synthetic production clicks.

## Registered integrations

Both Worker configurations register the same exact HTTPS origins. Each hosting
site owns its browser initialization. The collector derives production or staging
from the registered origin and checks any environment sent by the client.

| Site | Apps | Environments | GPC |
| --- | --- | --- | --- |
| skyline | Unknown (legacy client omits app) | Production | Overridden |
| a2f0-net | website, resume, ascii-art, skyline, dnbm, dnbm-player, demo, drive | Production | Overridden |
| devopsrockstars | website, company, search, store, skyline | Production, staging | Honored |
| balebase | website, web-app | Production, staging | Honored |
| tearleads | website, web-app, demo | Production, staging | Honored |
| commandsnippets | website, web-app | Production, staging | Overridden |
| dnbm | sequencer, player | Production | Overridden |
| nc | web-app | Production | Overridden |
| rn-sandbox | web-app | Production | Overridden |
| continuity | gallery | Production | Overridden |

The GPC override is an explicit client initialization option. Every integration
still honors Do Not Track, the CT extension, explicit opt-outs, and automation
guards. Reusable package mounts do not initialize another tracker: their hosting
website captures embedded app clicks through app boundaries. Native and desktop
clients and the CT admin dashboard are not instrumented by this browser rollout.
Private browser apps use a fixed page value rather than record or workspace URLs.

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
It publishes only an unpublished stable version newer than npm latest and fails
closed on registry errors. Use the managed version workflow for client changes; never overwrite a published version.

When an SDK release changes the wire protocol, merge the reviewed change, then
run `bun run deploy` from the merged main checkout before waiting for npm publish.
The Publish client workflow waits for `/health` protocolVersion >= 2 and successful
exact-Origin OPTIONS preflights for every configured origin, plus unauthenticated
401 responses from all three admin data endpoints, before handing the package to
the publish job. The gate sends no click data. This prevents automatic npm
publication from racing the manual migration/Worker rollout. Readiness polling is
bounded; if deployment takes longer, complete it and rerun Publish client. Do not
bypass the gate. Future incompatible wire changes must raise the client readiness
requirement and deploy matching collector support first. Old clients remain
supported. If admin status codes change in future, update the private-access
readiness checks in the same rollout. Only after both deployment and the registry tarball are verified may
consumers adopt the new release.

## Native app

packages/app-capacitor ships the dashboard as the CT app for iOS and Android
(net.a2f0.ct, production only). Its [README](../packages/app-capacitor/README.md)
owns setup, Fastlane lanes, store secrets, and build numbers. Builds call
https://ct-admin.a2f0.net and sign in through the admin Worker's native-origin
handling described in the [API guide](api.md), so deploy a Worker change the app
depends on before uploading the build that needs it. Store uploads are manual
and run only when requested; neither a merge nor a Worker deployment publishes
an app. Audit a store candidate with the [readiness lanes and skill](readiness.md)
and record the result in its PR.

## Browser packages

Build outputs are packages/extension/dist/ct-chrome.zip and ct-firefox.zip.
See the extension README for local installation and the separate store-signing
requirements. The extension's default-on network rule and SDK opt-out signal cover
different startup timing windows; test both when changing the preference protocol.

## Dependency maintenance

Keep Bun, packageManager, CI, exact dependency pins and the lockfile aligned.
Ruby is pinned in .ruby-version and .mise.toml for the app's Fastlane bundle;
after changing Capacitor packages, commit the refreshed Swift Package.resolved,
and expect CI to fail if `bun run mobile:sync` changes a tracked native file. Use
the installed update-dependencies skill for upgrades. Validate Worker dry-runs,
the package tarball and both browser suites. Update agent-tool skills only with
agents:sync; do not edit managed files. Image generation uses agent-tool's declared
brand outputs. No production deployment is triggered automatically by a merge.
