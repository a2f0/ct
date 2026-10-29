import { StringDecoder } from "node:string_decoder";
import { provisionAccount } from "@ct/api/accounts";
import { withAccountDatabase } from "./accountDatabase.ts";

export function parseAccountArgs(args: string[]) {
  const action = args.shift();
  if (action !== "create" && action !== "reset")
    throw new Error("Use create or reset");
  const values = new Map<string, string>();
  const flags = new Set<string>();
  while (args.length) {
    const key = args.shift() ?? "";
    if (["--remote", "--local", "--password-stdin"].includes(key)) {
      if (flags.has(key)) throw new Error("Duplicate option");
      flags.add(key);
    } else if (["--email", "--name", "--config"].includes(key)) {
      const value = args.shift();
      if (!value || values.has(key))
        throw new Error("Missing or duplicate option");
      values.set(key, value);
    } else
      throw new Error(
        "Unknown option; passwords must use the hidden prompt or --password-stdin",
      );
  }
  if (flags.has("--remote") === flags.has("--local"))
    throw new Error("Choose exactly one of --remote or --local");
  const email = values.get("--email");
  if (!email) throw new Error("--email is required");
  const config = values.get("--config") ?? "packages/api/wrangler.json";
  if (
    !["packages/api/wrangler.json", "tests/wrangler.api.json"].includes(
      config,
    ) ||
    (config.startsWith("tests/") && flags.has("--remote"))
  )
    throw new Error("Invalid database configuration");
  return {
    action: action as "create" | "reset",
    email,
    test: config.startsWith("tests/"),
    name: values.get("--name") ?? "Administrator",
    remote: flags.has("--remote"),
    stdin: flags.has("--password-stdin"),
  };
}
export async function readPasswordStdin(
  input: AsyncIterable<Uint8Array | string> = process.stdin,
): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of input) {
    const bytes = Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > 1024) throw new Error("Password input is too large");
    chunks.push(bytes);
  }
  const value = Buffer.concat(chunks)
    .toString("utf8")
    .replace(/\r?\n$/, "");
  if (/[\r\n]/.test(value)) throw new Error("Supply one password line");
  return value;
}
async function hiddenPrompt(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("Use an interactive terminal or --password-stdin");
  process.stdout.write(label);
  const previous = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const decoder = new StringDecoder("utf8");
    const finish = (error?: Error) => {
      process.stdin.off("data", read);
      process.stdin.setRawMode(previous);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const read = (chunk: Buffer) => {
      for (const char of decoder.write(chunk)) {
        if (char === "\u0003") {
          finish(new Error("Cancelled"));
          return;
        }
        if (char === "\r" || char === "\n") {
          finish();
          return;
        }
        if (char === "\u007f" || char === "\b")
          value = Array.from(value).slice(0, -1).join("");
        else if (char >= " ") value += char;
        if (value.length > 128) {
          finish(new Error("Password must contain 12–128 characters"));
          return;
        }
      }
    };
    process.stdin.on("data", read);
  });
}

if (import.meta.main) {
  try {
    const options = parseAccountArgs(process.argv.slice(2));
    const password = options.stdin
      ? await readPasswordStdin()
      : await hiddenPrompt("Password (hidden): ");
    if (
      !options.stdin &&
      password !== (await hiddenPrompt("Confirm password (hidden): "))
    )
      throw new Error("Passwords do not match");
    await withAccountDatabase(
      { remote: options.remote, test: options.test },
      (db) =>
        provisionAccount(db, {
          action: options.action,
          email: options.email,
          name: options.name,
          password,
        }),
    );
    console.log(
      options.action === "create"
        ? "Administrator account created."
        : "Password reset; all existing sessions revoked.",
    );
  } catch (error) {
    // Adapter/Wrangler errors can contain SQL; never print credentials or hashes.
    const message = error instanceof Error ? error.message : "";
    const safe = [
      "Invalid database configuration",
      "Use create or reset",
      "Duplicate option",
      "Missing or duplicate option",
      "Unknown option; passwords must use the hidden prompt or --password-stdin",
      "Choose exactly one of --remote or --local",
      "--email is required",
      "Password input is too large",
      "Supply one password line",
      "Use an interactive terminal or --password-stdin",
      "Cancelled",
      "Password must contain 12–128 characters",
      "Passwords do not match",
      "Enter a valid email address",
      "Name must be at most 100 characters",
      "Account already exists; use reset to change its password",
      "Account does not exist",
      "Credential account is missing",
    ];
    console.error(
      safe.includes(message)
        ? message
        : "Account operation failed. Check Wrangler login, the selected database, and applied migrations.",
    );
    process.exitCode = 1;
  }
}
