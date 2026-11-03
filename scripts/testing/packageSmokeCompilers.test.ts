import { expect, test } from "bun:test";
import { checkDeclarations } from "./packageSmokeCompilers";

test("packed declarations use the build compiler and every selected consumer compiler", () => {
  const commands: string[][] = [];
  checkDeclarations(
    "/build/tsc",
    ["/compat/tsc"],
    "/consumer.mts",
    "/scratch",
    (command, cwd) => {
      expect(cwd).toBe("/scratch");
      commands.push(command);
      return 0;
    },
  );
  expect(
    commands.map((command) => [
      command[0],
      command[command.indexOf("--moduleResolution") + 1],
    ]),
  ).toEqual([
    ["/build/tsc", "Bundler"],
    ["/build/tsc", "NodeNext"],
    ["/compat/tsc", "Bundler"],
    ["/compat/tsc", "NodeNext"],
  ]);
  for (const command of commands) {
    expect(command).toContain("--strict");
    expect(command).toContain("--noEmit");
    expect(command.at(-1)).toBe("/consumer.mts");
  }
});

for (const failureAt of [0, 1, 2, 3]) {
  test(`a failing declaration compiler or resolver fails closed at invocation ${failureAt}`, () => {
    let invocation = 0;
    expect(() =>
      checkDeclarations(
        "/build/tsc",
        ["/compat/tsc"],
        "/consumer.mts",
        "/scratch",
        () => (invocation++ === failureAt ? 1 : 0),
      ),
    ).toThrow("Published declarations cannot be consumed");
    expect(invocation).toBe(failureAt + 1);
  });
}
