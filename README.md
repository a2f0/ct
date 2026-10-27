# ct

A small click tracker: an explicitly initialized browser client batches clicks,
a Cloudflare Worker stores them in D1 (SQLite), and an authenticated dashboard
shows activity and can forget the clicks recorded from an IP address. A shared
browser extension disables CT in Chrome and Firefox, and the dashboard also
ships as the CT app for iOS and Android. This repo is available on the web at
<https://ct-admin.a2f0.net>.

That host serves the dashboard and its public privacy policy and support pages.
The click collector API is at <https://ct.a2f0.net>, and the
[registered integrations](docs/operations.md#registered-integrations) list the
sites and apps that send it clicks.

## Quick start

Install [mise](https://mise.jdx.dev/) for the Bun, Node and Ruby versions pinned
in `.mise.toml`.

```sh
mise install
bun install --frozen-lockfile
(cd packages/app-capacitor && bundle install)
bun run hooks:install
bun run --cwd packages/api db:migrate:local
bun run dev # API on http://localhost:8787, static UI on http://127.0.0.1:5173
```

Bun manages workspaces; Wrangler development and browser tooling run on Node;
Ruby runs the mobile app's Fastlane lanes, their tests and RuboCop, which
`bun run check` and the pre-push hook include. Vite on 5173 is for static UI
development only; to sign in locally, run the admin Worker as the
[API README](packages/api/README.md#local-development) describes.

## Workspaces

| Package | Purpose |
| --- | --- |
| [packages/client](packages/client/README.md) | Published @a2f0/ct-client; framework-free browser SDK |
| [packages/api](packages/api/README.md) | Ingestion and admin Workers, indexed D1 schema, retention |
| [packages/admin](packages/admin/README.md) | React/Vite dashboard and its accounts |
| [packages/extension](packages/extension/README.md) | One extension source, Chrome and Firefox builds, installation in each browser/profile |
| [packages/app-capacitor](packages/app-capacitor/README.md) | CT app for iOS and Android: the dashboard in a Capacitor shell, with its Fastlane releases |

Sites integrate through @a2f0/ct-client; its [README](packages/client/README.md)
covers initialization, batching, opt-out, and lifecycle behavior.

## Checks

```sh
bun run check
bun run test
bun run build
bun run package:smoke
bunx --no-install playwright install chromium firefox
bun run test:browser
```

`bun run verify` runs the first four, as the pre-push hook does. The browser
suites need the Playwright browsers installed once.

## Guides

- [Operations](docs/operations.md): deployment, administrator accounts, npm
  publication, and the native app's store uploads.
- [API guide](docs/api.md): endpoint behavior and dashboard dimensions.
- [Privacy](docs/privacy.md): data and delivery limits.
- [Release readiness](docs/readiness.md): store candidate audits and the
  readiness lanes.
- [Repository scripts](scripts/README.md): the internal tooling layout and Git
  hooks, including the migration that existing clones with a legacy local hook
  path follow before reinstalling hooks.
