import { expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

// Runs this repository's committed pre-push hook, the pinned agent-tool push
// gate it calls, and the branch and attribution policy from agent-tool.json,
// so it fails if the wiring stops refusing attributed commits before the
// declared steps run.
test("pre-push checks the pushed commits even when HEAD is different", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "ct-pre-push-"));
  const repository = resolve(directory, "repository");
  const remote = resolve(directory, "remote.git");
  const root = resolve(import.meta.dir, "../..");
  const cli = resolve(root, "node_modules/.bin/agent-tool");
  const zero = "0".repeat(40);
  const policy = JSON.parse(
    await readFile(resolve(root, "agent-tool.json"), "utf8"),
  );
  expect(policy.commits.rejectCoauthors).toBe(true);
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("GIT_")) delete env[key];
  }
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = "/dev/null";
  env.GIT_TERMINAL_PROMPT = "0";
  const command = (cwd: string, args: string[]) =>
    Bun.spawnSync(args, { cwd, stdout: "pipe", stderr: "pipe", env });
  const git = (cwd: string, ...args: string[]) => {
    const result = command(cwd, ["git", ...args]);
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  };
  // Runs the installed hook asynchronously, so independent pushes run together.
  // Each run's declared step writes its own marker, showing whether it was
  // reached. Markers live in the Git directory: a step that changed the
  // working tree would fail the gate's run group.
  let runs = 0;
  const push = async (refs: string) => {
    const marker = resolve(repository, `.git/verified-${++runs}`);
    const child = Bun.spawn(["sh", hook, "origin", remote], {
      cwd: repository,
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
    const verified = Bun.file(marker);
    return {
      exitCode,
      output: stdout + stderr,
      verified: (await verified.exists()) ? await verified.text() : null,
    };
  };
  const hook = resolve(repository, ".git/hooks/pre-push");
  try {
    git(directory, "init", "-q", "-b", "main", repository);
    git(directory, "init", "-q", "--bare", remote);
    git(repository, "config", "user.name", "Hook fixture");
    git(repository, "config", "user.email", "fixture@example.invalid");
    git(repository, "config", "commit.gpgSign", "false");
    git(
      repository,
      "config",
      "core.hooksPath",
      resolve(repository, ".git/hooks"),
    );
    git(repository, "remote", "add", "origin", remote);
    const source = "scripts/git/hooks/pre-push";
    await mkdir(resolve(repository, "scripts/git/hooks"), { recursive: true });
    await writeFile(
      resolve(repository, source),
      await readFile(resolve(root, source)),
      { mode: 0o755 },
    );
    // The hook runs the agent-tool that the repository's node_modules holds.
    await symlink(
      resolve(root, "node_modules"),
      resolve(repository, "node_modules"),
    );
    await writeFile(resolve(repository, ".gitignore"), "node_modules\n");
    await writeFile(
      resolve(repository, "agent-tool.json"),
      JSON.stringify({
        schemaVersion: 1,
        branch: policy.branch,
        // Fixture commits are unsigned; attribution is checked on its own.
        commits: { ...policy.commits, signatures: "none" },
        hooks: { files: [{ source, target: "pre-push", executable: true }] },
        pushGate: {
          steps: [
            {
              label: "marker",
              command: ["sh", "-c", 'printf yes > "$CT_FIXTURE_MARKER"'],
            },
          ],
        },
      }),
    );
    git(repository, "add", ".");
    git(repository, "commit", "-q", "-m", "chore: fixture base");
    expect(
      command(repository, [cli, "hooks", "install", "--apply"]).exitCode,
    ).toBe(0);
    git(repository, "push", "-q", "--no-verify", "origin", "main");
    const base = git(repository, "rev-parse", "HEAD");
    git(repository, "switch", "-q", "--no-track", "-c", "feat/forbidden");
    git(
      repository,
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "feat: forbidden attribution\n\nCo-authored-by: Fixture <fixture@example.invalid>",
    );
    const forbidden = git(repository, "rev-parse", "HEAD");
    git(repository, "switch", "-q", "main");
    git(
      repository,
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "feat: valid current head",
    );
    const head = git(repository, "rev-parse", "HEAD");
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
    // The destination's main moves to the attributed commit, as if another
    // branch had merged it; integrating it does not recheck what it has.
    git(
      repository,
      "push",
      "-q",
      "--no-verify",
      "origin",
      `${head}:refs/heads/feat/valid`,
      `${forbidden}:refs/heads/main`,
    );
    git(
      repository,
      "merge",
      "-q",
      "--no-ff",
      forbidden,
      "-m",
      "chore: integrate updated main",
    );
    const integrated = git(repository, "rev-parse", "HEAD");
    git(
      repository,
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "feat: new attribution\n\nCo-authored-by: Fixture <fixture@example.invalid>",
    );
    // Both pushes read the same destination; the new commit does not change
    // what `integrated` reaches.
    const [mergedBase, rejectedAfterMerge] = await Promise.all([
      push(`refs/heads/main ${integrated} refs/heads/feat/valid ${head}\n`),
      push(
        `refs/heads/main ${git(repository, "rev-parse", "HEAD")} refs/heads/feat/valid ${head}\n`,
      ),
    ]);
    expect(mergedBase.exitCode, mergedBase.output).toBe(0);
    expect(mergedBase.verified).toBe("yes");
    expect(rejectedAfterMerge.exitCode).not.toBe(0);
    expect(rejectedAfterMerge.output).toContain("Co-authored-by");
    expect(rejectedAfterMerge.verified).toBeNull();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
