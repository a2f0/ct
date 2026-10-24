import { expect, test } from "bun:test";
import { followTextSize } from "./textZoom";

async function start(platform: string, preferred: () => Promise<number>) {
  const calls: string[] = [];
  let resume: (() => void) | undefined;
  followTextSize(
    {
      getPreferred: async () => ({ value: await preferred() }),
      set: async ({ value }) => {
        calls.push(`set:${value}`);
      },
    },
    {
      addListener: async (eventName, listener) => {
        calls.push(`listen:${eventName}`);
        resume = listener;
      },
    },
    platform,
  );
  await Bun.sleep(0);
  return { calls, resume: () => resume?.() };
}

test("iOS scales text to Dynamic Type now and on every resume", async () => {
  let size = 1.5;
  const { calls, resume } = await start("ios", async () => size);
  size = 2;
  resume();
  await Bun.sleep(0);
  expect(calls).toEqual(["listen:resume", "set:1.5", "set:2"]);
});

test("a failed lookup leaves the default text size", async () => {
  const { calls } = await start("ios", async () => {
    throw new Error("unavailable");
  });
  expect(calls).toEqual(["listen:resume"]);
});

test("Android and the browser keep their own text sizing", async () => {
  for (const platform of ["android", "web"])
    expect((await start(platform, async () => 2)).calls).toEqual([]);
});
