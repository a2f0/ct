# App Capacitor

The CT app for iOS and Android: the dashboard from `packages/admin` in a native
Capacitor shell, with the same administrator accounts. There is one store app,
`net.a2f0.ct`, and no staging app. Releases require iOS 16 or later and
Android 7 (API 24) or later.

The shell bundles the dashboard UI and serves it from the WebView's own origin
(`capacitor://localhost` on iOS, `https://localhost` on Android). Its API
requests go to https://ct-admin.a2f0.net, fixed in `vite.config.ts`, through
Capacitor's native HTTP stack (`CapacitorHttp`), which keeps the session cookie
in the platform's cookie store. Native requests carry no Origin header, so the
dashboard sends `X-CT-Native-Origin` and the admin Worker restores its own
origin for the auth and forget checks (see the [API guide](../../docs/api.md)).
A build can sign in only against an admin Worker deployed with that handling.
Capacitor's bridge logging is off, including in debug builds, because sign-in
sends the password through it.

The page draws under the system bars and pads itself with their insets
(`src/shell.css`), so the dashboard's own paper shows behind them. The bars'
icons follow the dashboard's theme switch rather than the system appearance
(`src/systemBars.ts`). Android WebViews before 140 keep the page clear of the
bars, which then show the black window background with light icons. Android's
Back steps back through page history and backgrounds the app at the start of
it (`src/backButton.ts`). The browser extension downloads are not shown.

## Set up

Install the pinned Ruby with mise, then the Fastlane bundle:

```sh
mise install
cd packages/app-capacitor
bundle install
```

`bun run mobile:sync` from the repository root builds the bundle and runs
`cap:sync`, which renders the icons and splash screens from
`assets/brand/logo.svg` with the agent-tool.json `native` target, restores the
Gradle wrapper JAR from the pinned Capacitor CLI, and copies the bundle into
both native projects. Those outputs are gitignored. CI runs the same sync and
fails if it changes a tracked native file. `bun run mobile:ios` and
`bun run mobile:android` sync and open Xcode or Android Studio.

The iOS project uses Swift Package Manager. Release archives resolve packages
only from the committed
`ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`;
refresh it with `xcodebuild -resolvePackageDependencies` after changing
Capacitor packages, and commit it. `ios/App/App/PrivacyInfo.xcprivacy` declares
the administrator's email address, linked to the account for app functionality,
and no tracking; App Store Connect's App Privacy answers must agree.

## Releases

The Fastlane lanes follow the shared layout in a2f0/matrix `docs/fastlane.md`:
`lanes/ios.rb`, `lanes/android.rb`, `lanes/store.rb` for the lane outside a
platform, and plain Ruby helpers in `lib/`. `lib/native_release_target.rb`
declares the single `production` tier; `NATIVE_RELEASE_TIER` defaults to it and
any other value fails before a lane runs. Their tests are in `fastlane/test/`
and run with `bun run test`; `bun run check` runs RuboCop.

| Lane | Does | Options |
| --- | --- | --- |
| `ios build_release` | Signed App Store IPA, without uploading | `build_number:` |
| `ios upload_release` | `build_release`, then uploads to TestFlight | `build_number:`, `changelog:`, `distribute_external:`, `groups:` |
| `ios profiles` | Creates or renews the match App Store profile | `force:true` regenerates it |
| `ios fetch_profiles` | Installs the match App Store profile read-only | |
| `android build_release` | Signed release App Bundle, without uploading | `build_number:` |
| `android upload_release` | `build_release`, then uploads to a Google Play track | `build_number:`, `track:` (`internal`), `release_status:` (`completed`), `validate_only:` |
| `store_build_numbers` | Prints the latest build numbers in both stores | `track:` |
| `android build_debug_apk`, `android build_release_apk` | Builds an APK for sideloading | |
| `android install_debug`, `android install_release`, `android sideload` | Builds and installs an APK on a connected device | `build_type:release` (`sideload`) |
| `android test`, `android clean` | Runs the Gradle unit tests; removes Gradle build outputs | |

Every lane but `android test` and `android clean` has a package script named
`<platform>:<lane in kebab case>` (`store:build-numbers` for
`store_build_numbers`) that sets `NATIVE_RELEASE_TIER=production`. Arguments
pass through to Fastlane. The store lanes also have repository-root scripts:

```sh
bun run mobile:build:ios          # ios:build-release
bun run mobile:upload:ios         # ios:upload-release
bun run mobile:build:android      # android:build-release
bun run mobile:upload:android track:beta
```

Uploads are manual; merges and Worker deployments never publish an app.

### Secrets

Lanes read `.secrets/prod/`, the clone's gitignored link into
`../matrix-secrets/ct/prod/`, unless `NATIVE_RELEASE_SECRETS_DIR` names another
folder (relative to this package), as the tests do. Gradle reads the upload key
from the same folder. The lanes load `shared.env` and then `app.env`, import
only the store names below, and never override a variable already in the
environment.

| File | Contents |
| --- | --- |
| `shared.env` | `TEAM_ID`, `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `MATCH_GIT_URL`, `MATCH_GIT_BASIC_AUTHORIZATION`, `MATCH_PASSWORD` |
| `app.env` | `ANDROID_KEYSTORE_STORE_PASS` and `ANDROID_KEYSTORE_KEY_PASS` for the upload key |
| `AuthKey_<APP_STORE_CONNECT_KEY_ID>.p8` | App Store Connect API key |
| `google-play-service-account-admin.json` | Google Play publishing service account |
| `ct-upload.keystore` | Android upload key (alias `upload`), registered with the Play app |

### Build numbers

`build_release` defaults to the larger of the latest PR merged today and the
store's next number (the next TestFlight build number or Play version code),
checked against the store when its credentials are available. The PR comes from
`gh`, falling back to local squash-merge subjects like `(#18)`. Override the
date or PR with `merged_date:YYYY-MM-DD` and `merged_pr_number:<number>`, or
`IOS_RELEASE_MERGED_DATE` and `IOS_RELEASE_PR_NUMBER` (`ANDROID_RELEASE_*` for
Android).

`upload_release` takes the store's next number unless a build number, PR, or
date is chosen. Set the number with `build_number:<number>`, or with
`IOS_BUILD_NUMBER` or `APPLE_BUILD_NUMBER` on iOS and `ANDROID_BUILD_NUMBER` or
`ANDROID_VERSION_CODE` (the name Gradle reads outside the lanes) on Android.
`next_testflight:true` and `next_google_play:true` take the store's next number
explicitly. The marketing version and Android version name are this package's
version.

### TestFlight

`ios build_release` runs a release sync, verifies the generated native config is
fully bundled, installs the App Store certificate and profile with read-only
`match` into a temporary keychain, and builds `ios/App/output/CT.ipa`. Signing
requires a Developer Team ID via `IOS_TEAM_ID`, `APPLE_TEAM_ID`,
`DEVELOPMENT_TEAM`, `FASTLANE_TEAM_ID`, `TEAM_ID`, or `team_id:<id>`. Run
`bun run ios:profiles` once to create the `match AppStore net.a2f0.ct` profile
in the shared match repository; release builds only read it. `Info.plist`
declares that the app uses no non-exempt encryption.

`ios upload_release` only uploads by default. `changelog:<text>` sets the What
to Test notes, and `distribute_external:true` with `groups:<name,name>`
distributes to external testers, waiting for processing and submitting for
review unless `skip_waiting_for_build_processing:true` or
`skip_submission:true` says otherwise.

### Google Play

`android build_release` requires the upload key and its passwords, runs a
release sync, and builds
`android/app/build/outputs/bundle/release/app-release.aab`.
`android upload_release` uploads it with the service account, skipping Play
metadata, changelogs, images, and screenshots. Play accepts API uploads only
after the app's first bundle has been uploaded in the Play Console. Validate
without committing the Play edit with `validate_only:true`.

### Android sideload

`bun run android:install-debug` builds and installs the debug APK on a connected
device; `bun run android:install-release` does the same for the release APK.
Set `ANDROID_SERIAL` when more than one device or emulator is attached. Without
the upload key's passwords in the environment, a release APK is signed with the
debug key so it can still be sideloaded.
