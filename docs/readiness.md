# Release readiness

Use the [app-store-readiness skill](../skills/app-store-readiness/SKILL.md)
for an iOS, Android, and web pre-release assessment of the CT app, and record
each candidate's findings and remaining prerequisites in its PR. The readiness
lanes below supply its artifact and store-record evidence.

Run `bun run --cwd packages/app-capacitor ios:readiness` or `android:readiness`
to inspect an existing signed release artifact of `net.a2f0.ct` and the
corresponding store records. There is one store app and no staging tier. These
lanes **do not build, upload, select a build, submit, or publish**. Android
creates a temporary Play edit for its reads and deletes it without committing.
Keep concurrent Play edits and uploads out of the same run.

The default artifacts are the `build_release` outputs:
`packages/app-capacitor/ios/App/output/CT.ipa` and
`packages/app-capacitor/android/app/build/outputs/bundle/release/app-release.aab`.
Reports go to the gitignored `.readiness/production/ios.json` and
`.readiness/production/android.json` with private file permissions. They
contain the artifact SHA-256, version/build, SDK information, source
provenance when available, and individual `verified`, `failed`, `unverified`,
or `not_applicable` checks. Review contacts, credentials, and raw API errors
are excluded. Don't commit private reports.

```sh
cd packages/app-capacitor
bun run ios:readiness artifact:/absolute/path/candidate.ipa wait_timeout:120
bun run android:readiness artifact:/absolute/path/candidate.aab bundletool:/absolute/path/bundletool-all.jar
# Offline artifact inspection; store checks are explicitly unverified:
bun run ios:readiness store:false
# Fail closed on any unknown evidence (currently always fails: manual checks remain):
bun run android:readiness strict:true
```

Relative artifact and output paths resolve from the repository root.
`output:/absolute/path/report.json` changes the report location. `store:false`
(or `READINESS_STORE=false`) skips credentials and store calls. iOS
`wait_timeout` is 0–1800 seconds (default 0), polling only the inspected
version/build until processing ends or the wait limit is reached. It does not
substitute an older valid build. iOS `precheck:false` skips Fastlane's
editable-listing metadata/URL checks, recording that omission. Android
`track:internal` (or `GOOGLE_PLAY_TRACK`) is the default; production, beta,
and alpha are also supported.

Normal mode exits successfully when a report was generated, **even if its
result is `not_ready` or `incomplete`**. It is a reporting command, not a
release approval. `strict:true` (or `READINESS_STRICT=true`) writes the report
first, then fails unless the result is `ready_within_tested_scope`. Manual
device/accessibility checks, declarations, and current policy review remain
unverified in these automated reports, so strict mode intentionally cannot
certify full readiness alone.

## Tools and build provenance

Use the Fastlane bundle and the store credentials described in the
[app guide](../packages/app-capacitor/README.md#secrets). iOS inspection needs
macOS `codesign` and `security`. Android needs a JDK and Google's
[bundletool](https://github.com/google/bundletool/releases): put its launcher
on PATH or pass `bundletool:/path/to/bundletool-all.jar` or `BUNDLETOOL_JAR`.
The lanes download no tools.

`ios build_release` and `android build_release` write
`<artifact>.build.json` beside the IPA or App Bundle with the source commit,
dirty flag, build time, and artifact hash; the upload lanes run them first.
Keep that receipt beside the artifact when copying it.

A receipt with the wrong hash, a dirty source, or a source commit different
from the audited checkout is a failed check. The build lanes read the source
before their web build and Capacitor sync and again after signing, so a build
step that changes a tracked file marks the receipt dirty. An older artifact
without a receipt has unknown provenance; the lane never assigns it the
current commit. Receipts are local build evidence, not signed supply-chain
attestations. Run release builds from a clean checkout and avoid concurrent
source edits during builds. Build numbering follows the
[release lanes](../packages/app-capacitor/README.md#build-numbers).

## What is and isn't checked

- iOS: the packaged app identifier and that it has no extensions,
  version/SDK, signature integrity, the App Store distribution profile, and
  the privacy manifest's declarations; the exact processed build, the selected
  build, review-contact presence, notes, the `en-US` listing, and completed
  iPhone and iPad screenshot uploads. `precheck` scans the editable listing
  for common metadata problems.
- Android: bundle manifest and structure, version/SDK, the complete merged
  permission list, JAR signature, and native-library inventory; the exact
  version code on the requested track, a matching Play bundle hash, and the
  `en-US` listing and phone screenshots. Release builds are not minified, so
  the R8 mapping check is not applicable.
- `IOS_READINESS_EXPECTATIONS` in `fastlane/lanes/ios.rb` and
  `ANDROID_READINESS_EXPECTATIONS` in `fastlane/lanes/android.rb` hold what
  each artifact must contain. Change them with the privacy manifest, the
  Android permissions, the App Privacy answers, and the Play declarations they
  describe. Both stores' listings are maintained in their consoles;
  `STORE_LISTING` in `fastlane/lanes/store.rb` names the expected locales.
- Missing tools, authentication or network problems, and inaccessible data are
  unverified, not successful checks. Failed requirements make the result
  `not_ready`; otherwise any unknown requirement makes it `incomplete`.
- Reports leave current policy floors, full console declarations, signer
  identity, screenshot accuracy, and real assistive-input and device behavior
  for review; the skill covers those.

## Shared with balebase and nc

a2f0/balebase and a2f0/nc keep byte-identical copies of
`fastlane/lib/readiness.rb`, `readiness_artifacts.rb`, `readiness_stores.rb`,
their library test `fastlane/test/readiness.test.ts`, and the
`skills/app-store-readiness` skill. Change all three repositories together;
the lanes, expectations, and this guide are each repository's own. Install the
skill in a personal skill directory for Codex or Claude Code by linking
`~/.claude/skills/app-store-readiness` or `~/.agents/skills/app-store-readiness`
to one of those copies.

## Device and web checks

Run the release candidate on a dedicated device or simulator against an
ephemeral administrator account, and delete that account afterward; never
generate production clicks. Exercise sign-in, the overview, recent clicks and
geography views, the IP filter and its forget confirmation, the account page's
password change, sign-out, and a relaunch in each signed-in state. Repeat a
core journey with large text, in landscape, and in both themes, and check
Android Back through page history and at the start of it. `bun run test:native
ios` and `bun run test:native android <serial>` drive the sign-in journey in
the real app against the isolated admin Worker (see the
[app guide](../packages/app-capacitor/README.md#native-tests)). For the web
dashboard, run `bun run test:browser` against a production build, and check
the privacy policy and support URLs that the store listings link to.
