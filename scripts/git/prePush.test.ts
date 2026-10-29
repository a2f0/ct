import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

test("pre-push checks the pushed commits even when HEAD is different", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "ct-pre-push-"));
  const root = resolve(import.meta.dir, "../..");
  const cli = resolve(root, "node_modules/.bin/agent-tool");
  const zero = "0".repeat(40);
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("GIT_")) delete env[key];
  }
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = "/dev/null";
  env.GIT_TERMINAL_PROMPT = "0";
  const command = (args: string[], stdin?: string) =>
    Bun.spawnSync(args, {
      cwd: directory,
      stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
      stdout: "pipe",
      stderr: "pipe",
      env,
    });
  // Runs the installed hook asynchronously, so independent pushes run together.
  // Each run's verify step writes its own marker, showing whether it was reached.
  let runs = 0;
  const push = async (refs: string) => {
    const marker = `verified-${++runs}`;
    const child = Bun.spawn(["sh", hook, "origin"], {
      cwd: directory,
      stdin: new TextEncoder().encode(refs),
      stdout: "pipe",
      stderr: "pipe",
      env: { ...env, CT_FIXTURE_MARKER: marker },
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    const verified = Bun.file(resolve(directory, marker));
    return {
      exitCode,
      output: stdout + stderr,
      verified: (await verified.exists()) ? await verified.text() : null,
    };
  };
  const hook = resolve(directory, ".git/hooks/pre-push");
  const git = (...args: string[]) => {
    const result = command(["git", ...args]);
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  };
  try {
    git("init", "-b", "main");
    git("config", "user.name", "Hook fixture");
    git("config", "user.email", "fixture@example.invalid");
    git("config", "commit.gpgSign", "false");
    git("config", "core.hooksPath", resolve(directory, ".git/hooks"));
    git("commit", "--allow-empty", "-m", "chore: fixture base");
    const base = git("rev-parse", "HEAD");
    git("remote", "add", "origin", resolve(directory, "unused-remote"));
    git("update-ref", "refs/remotes/origin/main", base);
    git("switch", "--no-track", "-c", "feat/forbidden");
    git(
      "commit",
      "--allow-empty",
      "-m",
      "feat: forbidden attribution\n\nCo-authored-by: Fixture <fixture@example.invalid>",
    );
    const forbidden = git("rev-parse", "HEAD");
    git("switch", "main");
    git("commit", "--allow-empty", "-m", "feat: valid current head");
    const head = git("rev-parse", "HEAD");
    const source = "scripts/git/hooks/pre-push";
    await mkdir(resolve(directory, "scripts/git/hooks"), { recursive: true });
    await writeFile(
      resolve(directory, source),
      await readFile(resolve(root, source)),
    );
    await writeFile(
      resolve(directory, "agent-tool.json"),
      JSON.stringify({
        schemaVersion: 1,
        branch: { types: ["feat"], exempt: ["main"], maxLength: null },
        commits: { signatures: "none", rejectCoauthors: true },
        hooks: { files: [{ source, target: "pre-push", executable: true }] },
      }),
    );
    await writeFile(
      resolve(directory, "package.json"),
      JSON.stringify({
        scripts: {
          "agent-tool": JSON.stringify(cli),
          verify:
            "bun -e 'await Bun.write(process.env.CT_FIXTURE_MARKER, \"yes\")'",
        },
      }),
    );
    git("add", ".");
    expect(command([cli, "hooks", "install", "--apply"]).exitCode).toBe(0);
    const [newBranch, existingBranch, multiple, accepted] = await Promise.all([
      ...[zero, base].map((destination) =>
        push(
          `refs/heads/feat/forbidden ${forbidden} refs/heads/feat/forbidden ${destination}\n`,
        ),
      ),
      push(
        `refs/heads/main ${head} refs/heads/feat/valid ${zero}\n` +
          `refs/heads/feat/forbidden ${forbidden} refs/heads/feat/forbidden ${zero}\n`,
      ),
      push(`refs/heads/main ${head} refs/heads/feat/valid ${zero}\n`),
    ]);
    for (const rejected of [newBranch, existingBranch, multiple]) {
      expect(rejected?.exitCode).not.toBe(0);
      expect(rejected?.output).toContain("Co-authored-by");
      expect(rejected?.verified).toBeNull();
    }
    expect(accepted?.exitCode, accepted?.output).toBe(0);
    expect(accepted?.verified).toBe("yes");
    git("commit", "-m", "chore: install fixture tooling");
    const previous = git("rev-parse", "HEAD");
    git("update-ref", "refs/remotes/origin/feat/valid", previous);
    git("update-ref", "refs/remotes/origin/main", forbidden);
    git("merge", "--no-ff", forbidden, "-m", "chore: integrate updated main");
    const integrated = git("rev-parse", "HEAD");
    git(
      "commit",
      "--allow-empty",
      "-m",
      "feat: new attribution\n\nCo-authored-by: Fixture <fixture@example.invalid>",
    );
    // Both pushes read the same remote refs; the new commit does not change
    // what `integrated` reaches.
    const [mergedBase, rejectedAfterMerge] = await Promise.all([
      push(`refs/heads/main ${integrated} refs/heads/feat/valid ${previous}\n`),
      push(
        `refs/heads/main ${git("rev-parse", "HEAD")} refs/heads/feat/valid ${previous}\n`,
      ),
    ]);
    expect(mergedBase.exitCode, mergedBase.output).toBe(0);
    expect(mergedBase.verified).toBe("yes");
    expect(rejectedAfterMerge.exitCode).not.toBe(0);
    expect(rejectedAfterMerge.output).toContain("Co-authored-by");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
