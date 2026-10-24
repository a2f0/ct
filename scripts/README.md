# Repository scripts

Run supported commands through the root package scripts so callers do not depend
on internal file locations. Application source and package build entrypoints stay
inside their workspaces.

| Directory | Purpose | Entrypoint |
| --- | --- | --- |
| `admin/` | Account provisioning and its D1 adapter | `bun run admin:user -- <arguments>` |
| `deploy/` | Worker deployment, site registry validation, live release readiness | `bun run deploy:preview`, `bun run deploy`; publishing CI checks collector readiness |
| `testing/` | Browser fixture preparation and packed SDK smoke tests | `bun run test:browser`, `bun run package:smoke` |
| `git/hooks/` | Commit-message and pre-push gates | `bun run hooks:install` |

After pulling hook-source changes, reinstall the hooks. The shared installer
copies tracked `scripts/git/hooks/` sources
into Git's hooks directory and tracks ownership. Existing clones with local
`core.hooksPath` exactly `.githooks` or `scripts/git/hooks` first remove that local
setting with `git config --local --unset core.hooksPath`, then run
`bun run hooks:install`. Inspect other custom hook paths before changing them;
use `--adopt` only after reviewing unmanaged hook replacements.

`bun run check` records lint, typechecking, RuboCop, and managed skills. `bun run verify`
adds unit tests, builds, and packed SDK smoke tests; the pre-push hook also checks
actual destination branches and signed, unattributed commits. Browser and
extension validation remain separate documented CI steps. Registry decisions
use `bun run release:plan`; the [npm operations guide](../docs/operations.md#npm)
owns version eligibility, collector readiness, and trusted-publishing gates.

Tests for a script live beside it, or beside its hook directory, and run with
`bun run test`. The scripts
TypeScript project includes these directories recursively. Keep relative root
resolution and every CI, test, and package-script caller consistent when moving a
script. Shared review, PR, version, image, and managed-skill behavior comes from
the pinned agent-tool; repository-specific behavior stays here.

See [repository guidance](../AGENTS.md) for required checks and shipping policy,
[operations](../docs/operations.md) for deployment and account commands, and the
[API guide](../docs/api.md) for endpoint behavior.

Pre-push validates commits newly introduced to a named remote. It excludes that
remote's tracking refs even when updating an existing branch, so a normal merge
of main does not recheck already published commits. URL-only destinations use
the advertised previous tip, or all history on a first push.
