# ct

A small click tracker: an explicitly initialized browser client batches clicks,
a Cloudflare Worker stores them in D1 (SQLite), and an authenticated dashboard
shows activity and can forget the clicks recorded from an IP address. A shared
browser extension disables CT in Chrome and Firefox.

- API: https://ct.a2f0.net
- Dashboard: https://ct-admin.a2f0.net
- Integrations: see the [registered sites and apps](docs/operations.md#registered-integrations)

## Workspaces

| Package | Purpose |
| --- | --- |
| packages/client | Published @a2f0/ct-client; framework-free browser SDK |
| packages/api | Ingestion and admin Workers, indexed D1 schema, retention |
| packages/admin | React/Vite dashboard |
| packages/extension | One extension source, Chrome and Firefox builds |
| packages/app-capacitor | CT app for iOS and Android: the dashboard in a Capacitor shell |

## Development

Use Bun 1.4.3, Node 24.22.1 and Ruby 4.0.7 (pinned in .mise.toml). Bun manages
workspaces; Wrangler development and browser tooling run on Node; Ruby runs the
mobile app's Fastlane lanes, their tests and RuboCop.

```sh
bun install --frozen-lockfile
(cd packages/app-capacitor && bundle install)
bun run hooks:install
bun run --cwd packages/api db:migrate:local
bun run dev
```

Existing clones should follow the [hook migration](scripts/README.md) before
reinstalling hooks; it removes only the known legacy local hook-path setting.

The API runs on port 8787; Vite on 5173 is for static UI development only.
Authenticated local testing uses the admin Worker at http://localhost:8788,
not the Vite proxy. Build the UI
and run the admin Worker in a second terminal on 8788. Create an ignored
packages/api/.dev.vars with a unique local BETTER_AUTH_SECRET (at least 32 random
characters); keep it out of logs and version control. Use the local URL override:

```sh
bun run build
bun run admin:user -- create --local --email admin@example.test
bunx --no-install wrangler dev --config packages/api/wrangler.admin.json --port 8788 --var BETTER_AUTH_URL:http://localhost:8788
```

Both Worker configurations use the same local D1 persistence directory. Local
ingestion still requires a registered Origin; use the Skyline origin in a manual
API request, or explicitly add a development site to a local config. Do not send
test traffic to the production collector.

## Dashboard access

Sign in at https://ct-admin.a2f0.net. Registration is disabled; administrators
provision accounts with `bun run admin:user -- create --remote --email <email>`.
The CLI asks for a password without echoing it. Signed-in users can change their
password at /account; an operator can recover access with the CLI's reset action,
which revokes every existing session. See [operations](docs/operations.md#administrator-accounts)
for first deployment and account recovery.

## Use the client

```ts
import { createTracker } from '@a2f0/ct-client';

const clicks = createTracker({
  site: 'skyline',
  app: 'skyline',
  environment: 'production',
  capture: 'all',
  page: () => '/skyline-3d', // a stable route name, without record IDs or tokens
});

// Call only from your registered production or staging browser bootstrap, behind an exact origin guard.
clicks.init();
```

Imports and construction do nothing by themselves. init also refuses webdriver
browsers; synthetic clicks are ignored. See the [client API](packages/client/README.md)
for batching, opt-out, and lifecycle behavior. The [extension guide](packages/extension/README.md)
covers installation in each browser/profile.

## Mobile app

The dashboard also ships as the CT app for iOS and Android (net.a2f0.ct). Run
`bun run mobile:ios` or `bun run mobile:android` to sync it and open Xcode or
Android Studio. The [app guide](packages/app-capacitor/README.md) covers the
native shell and its Fastlane releases.

## Checks and deployment

```sh
bun run check
bun run test
bun run build
bun run package:smoke
bunx --no-install playwright install chromium firefox
bun run test:browser
```

Use bun run agent:run --label tests -- bun run test for compact output and private
full logs. [Repository scripts](scripts/README.md) describes the internal tooling
layout. [Operations](docs/operations.md) covers deployment, npm publication, and
account provisioning. The [API guide](docs/api.md) describes endpoint behavior and
dashboard dimensions; [Privacy](docs/privacy.md) defines data and delivery limits.
[Release readiness](docs/readiness.md) covers store candidate audits and the
readiness lanes.
