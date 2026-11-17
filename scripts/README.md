# Repository scripts

Run supported commands through the root package scripts so callers do not depend
on internal file locations. Application source and package build entrypoints stay
inside their workspaces.

| Directory    | Purpose                                                              | Entrypoint                                                                           |
| ------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `admin/`     | Account provisioning and its D1 adapter                              | `bun run admin:user -- <arguments>`                                                  |
| `deploy/`    | Worker deployment, site registry validation, live release readiness  | `bun run deploy:preview`, `bun run deploy`; publishing CI checks collector readiness |
| `testing/`   | Browser fixture preparation, packed SDK smoke tests, native app runs | `bun run test:browser`, `bun run package:smoke`, `bun run test:native`               |
| `git/hooks/` | Commit-message hook and the generated pre-push push gate             | `bun run hooks:install`                                                              |

After pulling hook-source changes, reinstall the hooks. The shared installer
copies tracked `scripts/git/hooks/` sources
into Git's hooks directory and tracks ownership. Existing clones with local
`core.hooksPath` exactly `.githooks` or `scripts/git/hooks` first remove that local
setting with `git config --local --unset core.hooksPath`, then run
`bun run hooks:install`. Inspect other custom hook paths before changing them;
use `--adopt` only after reviewing unmanaged hook replacements.

`bun run check` records lint, typechecking, RuboCop, managed skills, harness
permission rules, and the push-gate check. `bun run verify` adds unit tests,
builds, and packed SDK smoke tests. Browser and extension validation remain
separate documented CI steps. Registry decisions
use `bun run release:plan`; the [npm operations guide](../docs/operations.md#npm)
owns version eligibility, collector readiness, and trusted-publishing gates.

For a TypeScript upgrade, `bun run package:smoke /path/to/older/typescript/bin/tsc`
also checks the packed declarations with that installed compiler. Supply multiple
compiler paths to check multiple supported lines. The normal build compiler and
both Bundler and NodeNext resolution always run; any compiler failure fails the
smoke test. The command does not download compilers or change dependency pins.

Tests for a script live beside it, or beside its hook directory, and run with
`bun run test`. The scripts
TypeScript project includes these directories recursively. Keep relative root
resolution and every CI, test, and package-script caller consistent when moving a
script. Shared review, PR, version, image, and managed-skill behavior comes from
the pinned agent-tool; repository-specific behavior stays here.

See [operations](../docs/operations.md) for deployment and account commands,
and the [API guide](../docs/api.md) for endpoint behavior.

`pre-push` is the unchanged output of `agent-tool push-gate hook`, which runs
agent-tool's push gate. Its shared guards check the installed hooks, managed
skills and permission rules, and destination branch names, then the
signatures, attribution, and binary files of the commits the push adds: those
the destination does not already have, so integrating an updated main does not
recheck published commits, while a destination with nothing in common is
checked whole. It then runs the lint, typecheck and RuboCop steps that
`pushGate` in `agent-tool.json` declares, records their timings in
`agent-tool runs list`, and warns when the gate takes longer than its
60-second budget. It runs no tests, builds, or installs; CI's required `verify`
job does. `bun run lint:push-gate`, part of `bun run check`, fails when the hook
drifts from that output or a declared step reaches a test run or an install.
