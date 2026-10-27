# CT API

The two Cloudflare Workers behind CT and the D1 (SQLite) schema they share. The
ingestion Worker (`wrangler.json`, `src/index.ts`) accepts click batches from
registered origins at <https://ct.a2f0.net/v1/clicks> and runs the daily
retention cleanup. The admin Worker (`wrangler.admin.json`, `src/admin.ts`)
serves the [dashboard](../admin/README.md) build at <https://ct-admin.a2f0.net>
behind Better Auth sign-in, along with the authenticated data API. Migrations
live in `migrations/` and tests in `test/`.

The [API guide](../../docs/api.md) describes endpoint behavior, the
[privacy guide](../../docs/privacy.md) defines what is stored, and
[operations](../../docs/operations.md) covers deployment and administrator
accounts.

## Local development

Run these from the repository root. Apply the local D1 migrations, then start
the ingestion Worker on port 8787 and the dashboard's Vite server on 5173:

```sh
bun run --cwd packages/api db:migrate:local
bun run dev
```

Vite on 5173 is for static UI development only. Authenticated local testing
uses the admin Worker at `http://localhost:8788`, not the Vite proxy. Create an
ignored `packages/api/.dev.vars` with a unique local `BETTER_AUTH_SECRET` (at
least 32 random characters); keep it out of logs and version control. Build the
UI, create a local administrator, and run the admin Worker in a second terminal
on 8788 with the local URL override:

```sh
bun run build
bun run admin:user -- create --local --email admin@example.test
bunx --no-install wrangler dev --config packages/api/wrangler.admin.json --port 8788 --var BETTER_AUTH_URL:http://localhost:8788
```

Both Worker configurations use the same local D1 persistence directory. Local
ingestion still requires a registered Origin; use the Skyline origin in a manual
API request, or explicitly add a development site to a local config. Do not send
test traffic to the production collector.
