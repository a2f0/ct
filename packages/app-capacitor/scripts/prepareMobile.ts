import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

// Restore the binary wrapper from the pinned CLI rather than tracking a JAR.
// cap:prepare renders the native icons and splash screens into place first.
const packageRoot = resolve(import.meta.dir, "..");
const cliRoot = dirname(
  createRequire(import.meta.url).resolve("@capacitor/cli/package.json"),
);
execFileSync("tar", [
  "-xzf",
  join(cliRoot, "assets/android-template.tar.gz"),
  "-C",
  join(packageRoot, "android"),
  "gradle/wrapper/gradle-wrapper.jar",
]);
console.log("Prepared the Gradle wrapper.");
