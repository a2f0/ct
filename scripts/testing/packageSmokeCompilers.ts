type CompilerRunner = (command: string[], cwd: string) => number;

export function checkDeclarations(
  buildCompiler: string,
  additionalCompilers: readonly string[],
  consumer: string,
  cwd: string,
  run: CompilerRunner = (command, directory) =>
    Bun.spawnSync(command, {
      cwd: directory,
      stdout: "inherit",
      stderr: "inherit",
    }).exitCode,
) {
  for (const compiler of [buildCompiler, ...additionalCompilers]) {
    for (const [module, resolution] of [
      ["ESNext", "Bundler"],
      ["NodeNext", "NodeNext"],
    ] as const) {
      const status = run(
        [
          compiler,
          "--noEmit",
          "--strict",
          "--target",
          "ES2022",
          "--module",
          module,
          "--moduleResolution",
          resolution,
          consumer,
        ],
        cwd,
      );
      if (status !== 0) {
        throw new Error(
          `Published declarations cannot be consumed with ${compiler} (${resolution})`,
        );
      }
    }
  }
}
