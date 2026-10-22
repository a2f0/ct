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
database_id values. The deploy script rejects placeholder or differing IDs. The
custom-domain deployment creates the corresponding DNS routing after the Workers
are uploaded. Do not reuse another application's database. The scheduled ingestion
Worker deletes events older than 90 days at 03:17 UTC daily.

After deploying, verify GET /health on the collector, /api/sites and /api/summary
on the admin host, and a 405 for POST /api/events. Do not generate production clicks
as part of normal tests. A consumer's origin must be listed under its site key in
both configs. Public site identifiers are not credentials.

## API

POST https://ct.a2f0.net/v1/clicks accepts text/plain JSON or application/json with
an exact allowed Origin and {site, events}. It accepts 1–50 validated events, up to
32 KiB, and returns 202 only after D1 commits. Events older than 24 hours or more
than five minutes in the future are rejected. Duplicate (site, id) pairs are ignored.
Rate limits allow approximately 120 batches/minute/IP per Cloudflare location.

The admin Worker exposes GET /api/sites, /api/summary and /api/events. Optional site,
from and to filters apply to both data endpoints; dates are ISO timestamps, from
inclusive and to exclusive. Ranges are capped at 90 days plus the end-day boundary.
Events returns 100 rows and an opaque nextCursor. Pass it as cursor with the same
filters for the next page. All endpoints are public and read-only. Responses are
not cached. The UI displays UTC event dates and no unique-visitor metric.

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
