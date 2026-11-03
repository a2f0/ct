# Dependency compatibility

## Runtime and package boundaries

Keep `.mise.toml`, `packageManager`, `.ruby-version`, workflow setup versions,
Biome's schema, and the resolved lockfiles consistent. CT has no minimum-release-age
exception list. Query the configured registries rather than substituting prereleases
for stable direct dependencies. Preserve each owner's transitive ranges; a recursive
Bun update refreshes permitted lock resolutions without adding blanket overrides.

`@a2f0/ct-client` has no runtime dependencies. Runtime/toolchain changes still need
`bun run package:smoke` and clean consumers that install the packed tarball with
both npm and Bun. Check ESM exports, declarations, browser globals, inert imports,
explicit initialization, opt-out/GPC, and automation guards. Exercise older supported
consumer runtimes as well as the new build runtime; a new build runtime does not
itself justify a new SDK runtime floor. Run evidence and exact tested versions belong
in the PR, not this document.

Use CT-owned GEM/Bundler paths. When changing Ruby, a frozen install can reuse native
gems linked to the previous Ruby dylib; rebuild those extensions with `bundle pristine`
under the new Ruby before repeating the full failed gate. Do not reuse another
checkout's `GEM_HOME`, `GEM_PATH`, or Bundler configuration. Update dependency,
Ruby, and Bundler locks in separate Bundler operations, and select the stable Bundler
version explicitly. Keep frozen installation enabled outside those update operations.

## Native owners

Capacitor's core, CLI, Android, and iOS packages move together. Compare the installed
CLI templates and the [Capacitor 8 migration requirements](https://capacitorjs.com/docs/updating/8-0)
before changing Gradle, Android Gradle Plugin, AndroidX, Cordova, Java, SDK levels,
or deployment targets. These are a compatibility group, not independent latest-version
pins. In particular, Gradle 9/AGP 9 and Cordova 15 are not implied by a Capacitor 8
patch. Revisit when a stable Capacitor migration adopts them and both native builds
and sign-in flows pass. CT-owned Credential Manager dependencies must also remain
compatible with the declared Android minimum SDK and native credentials plugin.

`bun run mobile:sync` regenerates `CapApp-SPM/Package.swift`; resolve the matching
Swift package graph with Xcode and commit its `Package.resolved`, then verify a
second sync produces no drift. Read the [Capacitor release notes](https://github.com/ionic-team/capacitor/releases)
and [SwiftPM package](https://github.com/ionic-team/capacitor-swift-pm) rather than
hand-editing a revision. Build iOS Simulator and Android artifacts sequentially on
space-constrained hosts. Test an explicitly owned device, with only one Maestro
run on the machine. An unsigned or ad-hoc simulator build is not an App Store
signing/readiness result; release signing and store actions require separate scope.

## Cloudflare and authentication

Read [operations](operations.md) before changing Wrangler or Better Auth. Match the
actual account, Worker names, routes, D1 binding/ID, and deployed version against
both Wrangler configurations. Query existing migration-table and schema metadata
read-only; `wrangler d1 migrations list --remote` can initialize a missing table,
so it is not an acceptable substitute for a read-only SQL inspection.

Better Auth 1.7 uses the direct D1 adapter, CT's `auth_*` names, and millisecond
SQLite dates. The account schema has no issuer column. Compare the installed
schema and [upstream changes](https://github.com/better-auth/better-auth/releases)
against the local migration fixtures and live schema before inferring any migration.
Keep API/admin auth versions aligned. Preserve admin route authentication, existing
public collector behavior, privacy/opt-outs/GPC, and read-only production inspection.

Run the actual build previews and isolated browser suite; a version query or install
alone is not infrastructure compatibility evidence. Keep `compatibility_date` fixed
unless deliberately testing changed Workers behavior against the
[compatibility-date policy](https://developers.cloudflare.com/workers/configuration/compatibility-dates/).
Do not deploy Workers or apply remote migrations as part of a dependency refresh.

## Audit constraints

Audit the baseline and candidate locks against the same registry/advisory sources.
Report remaining advisory IDs, owning direct dependency paths, exposure, and the
revisit condition. A clean Ruby or npm audit is not coverage of native Maven/Swift
artifacts, store signing, or deployment state.

The latest `web-ext` 10.8.0 dependency graph still includes `deepmerge` 4.3.1 and
`minimatch` 3.1.5. The npm advisories
[GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) and
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) remain in
development-only extension tooling, not the SDK or Worker runtime. Do not suppress
the findings or force incompatible transitive majors. Revisit on a
[web-ext release](https://github.com/mozilla/web-ext/releases) that adopts patched
owners/ranges, and rerun extension lint/build/tests and the full audit.

## Managed assets and publishing

Agent-tool owns `.agents`, `.claude`, permission rules, and their manifests;
regenerate them with `bun run agents:sync`, never patch their contents. The
project-owned readiness skill is synchronized according to [readiness](readiness.md),
not reformatted by Biome's Markdown formatter. Keep the producer copy byte-identical.

Only the client package is version-prepared. The normal publish workflow triggers
on its manifest change and is gated by `NPM_TRUSTED_PUBLISHING`; check that gate
before expecting publication. Preserve the named, zipped package-artifact handoff
when upgrading [upload-artifact](https://github.com/actions/upload-artifact) and
[download-artifact](https://github.com/actions/download-artifact). After merge,
verify the exact workflow head, artifact, registry version, and tarball rather than
running a manual publish or treating a successful merge as a release. Merges do
not deploy the Workers or upload native stores.
