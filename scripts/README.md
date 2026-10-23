# Repository scripts

Run supported commands through the root package scripts so callers do not depend
on internal file locations. Application source and package build entrypoints stay
inside their workspaces.

| Directory | Purpose | Entrypoint |
| --- | --- | --- |
| `admin/` | Account provisioning and its D1 adapter | `bun run admin:user -- <arguments>` |
| `deploy/` | Worker deployment, site registry validation, live release readiness | `bun run deploy:preview`, `bun run deploy`; publishing CI checks collector readiness |
| `release/` | Registry publication decisions | Publishing CI |
| `testing/` | Browser fixture preparation and packed SDK smoke tests | `bun run test:browser`, `bun run package:smoke` |
| `git/hooks/` | Commit-message and pre-push gates | `bun run hooks:install` |

After pulling changes that relocate hook sources, run `bun run hooks:install`
again. Existing clones that still use `.githooks` need this step to enable the
hooks at `scripts/git/hooks/`.

Tests for a script live beside it and run with `bun run test`. The scripts
TypeScript project includes these directories recursively. Keep relative root
resolution and every CI, test, and package-script caller consistent when moving a
script. Shared review, PR, version, image, and managed-skill behavior comes from
the pinned agent-tool; repository-specific behavior stays here.

See [repository guidance](../AGENTS.md) for required checks and shipping policy,
[operations](../docs/operations.md) for deployment and account commands, and the
[API guide](../docs/api.md) for endpoint behavior.
