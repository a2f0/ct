# Repository guidance

Read README.md, scripts/README.md, and docs/operations.md. All workspaces live in packages/: client
is the publishable browser SDK, api owns the two Workers and D1 schema, admin
is the React UI, and extension produces Chrome and Firefox packages.

Use the Bun and Node versions in .mise.toml, placed first on PATH in agent shells. Do not
run mise trust. Install with bun install --frozen-lockfile and bun run hooks:install.
Resolve GitHub identity with gh repo view --json nameWithOwner. Work on feature
branches in <type>/<topic> form, create them with agent-tool branch create,
sign Conventional Commits, preserve unrelated work, and never force-push or add attribution footers.

Validate with bun run check, bun run test, bun run build, bun run package:smoke,
and bun run test:browser. CI's verify job gates merges, including skill drift.
Capture noisy commands with bun run agent:run --label <check> -- <command> and
inspect relevant warnings and artifacts. Keep independent review verdicts visible.
Use the installed ship-pr skill; prepare client versions against the fetched base
with agent-tool versions prepare. Merge does not deploy the Workers. Deploy only
when requested, using bun run deploy; bun run deploy:preview changes no remote state.

The admin UI and every data API require a provisioned Better Auth session; data
access remains read-only. Registration is disabled in the auth configuration and
Worker route allowlist. Accounts are created/reset only through the operator CLI,
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
the lockfile, skills and .agent-tool-skills.json together. Brand sources live in
assets/brand and image outputs are declared in agent-tool.json.

Keep repository-owned scripts grouped by purpose under scripts/ and retain the
package-script entrypoints when moving files. README covers setup and normal
usage; docs/operations.md owns deployment and accounts, docs/api.md owns endpoint
behavior, and docs/privacy.md owns collection limits. Update the authoritative
guide and its links rather than duplicating procedures across documents.
