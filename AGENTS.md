# Repository guidance

Read README.md, the README of each package you change, scripts/README.md, and
docs/operations.md. All workspaces live in packages/: client
is the publishable browser SDK, api owns the two Workers and D1 schema, admin
is the React UI, app-capacitor ships it as the iOS and Android app, and
extension produces Chrome and Firefox packages.

Use the Bun, Node and Ruby versions in .mise.toml, placed first on PATH in agent shells. Do not
run mise trust. Install with bun install --frozen-lockfile, bundle install in
packages/app-capacitor, and bun run hooks:install.
Resolve GitHub identity with gh repo view --json nameWithOwner. Work on feature
branches in <type>/<topic> form, create them with agent-tool branch create,
sign Conventional Commits, preserve unrelated work, and never force-push or add
attribution footers.

Validate with bun run check, bun run test, bun run build, bun run package:smoke,
and bun run test:browser. CI's verify job gates merges, including skill drift.

Run finite, noisy commands, such as installs, builds, tests, linters, and Git
commands that run hooks, through
`bun run agent:run --label <name> -- <command> [args...]`. It keeps complete
output in a private log, preserves the exit status, and prints a compact
receipt, with a bounded excerpt of the log on failure. Read more with
`bun run agent:logs <log-path>`, raising `--tail-lines` or `--max-bytes` as
needed, or with a targeted search of the log. A zero exit does not rule out
warnings: inspect required warnings, timings, and artifacts before accepting a
check. Run reviews, version preparation, audits, infrastructure previews, and
run-group checks directly so their results stay visible, and run interactive
tools and servers directly too. Never narrow a suite or silence warnings to
reduce output. For example, capture the browser suites with
`bun run agent:run --label browser -- bun run test:browser`. Run `bun run check`
and `bun run verify` directly: they are agent-tool run groups that already
record each step.

Use the installed ship-pr skill; prepare client versions against the fetched base
with agent-tool versions prepare. Merge does not deploy the Workers or publish the apps. Deploy only
when requested, using bun run deploy; bun run deploy:preview changes no remote state.
Upload store builds only when requested, through the app-capacitor README's lanes.
Before a store submission, audit the candidate with skills/app-store-readiness
and the readiness lanes in docs/readiness.md, and record its findings in the PR.

The admin UI and every data API require a provisioned Better Auth session; data
access remains read-only except the confirmed forget-IP deletion in docs/api.md.
Registration is disabled in the auth configuration and Worker route allowlist. Accounts are created/reset only through the operator CLI,
which uses bound D1 statements and hidden prompts or stdin, never password args.
Keep auth tables separate from clicks; an administrator's account/session is not
a visitor identifier. Never expose data or site metadata before authorization.
Do not add raw text, form values, URLs, user identifiers, or persistent visitor identifiers to clicks.
The only exception is server-recorded request IP addresses and coarse Cloudflare
location metadata as documented in docs/privacy.md. Do not add separate visitor
profiles, session identifiers, hashed IP identifiers, or browser fingerprints.
The client must remain inert until init, honor opt-outs before capture and flush,
and refuse automated browsers. The per-tracker overrideGpc option may bypass only
GPC when explicitly true; it defaults to false. Cover behavioral changes with tests.

Use .secrets only as a gitignored link to the matrix-secrets/ct namespace if one
is configured. Never read, print, log, or commit secret values. Wrangler's existing
OAuth session is sufficient for local deployment. Never copy another project's keys.

Managed skills in .agents/skills and .claude/skills come from the exact agent-tool
pin. Do not edit them; run bun run agents:sync after changing the pin and commit
the lockfile, skills and .agent-tool-skills.json together. skills/ holds the
repository-owned app-store-readiness skill, kept byte-identical with balebase and
nc as docs/readiness.md describes. Brand sources live in
assets/brand and image outputs are declared in agent-tool.json.

Keep repository-owned scripts grouped by purpose under scripts/ and retain the
package-script entrypoints when moving files. README covers setup and normal
usage; docs/operations.md owns deployment and accounts, docs/api.md owns endpoint
behavior, and docs/privacy.md owns collection limits. Update the authoritative
guide and its links rather than duplicating procedures across documents.
