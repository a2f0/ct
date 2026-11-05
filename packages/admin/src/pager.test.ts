import { describe, expect, test } from "bun:test";
import {
  idlePager,
  type PagerEvent,
  type PagerState,
  pagerTransition,
} from "./pager";

const loading = (request: number): PagerState => ({
  status: "loading",
  request,
});
const failed: PagerState = { status: "failed", message: "Network down" };
const stalled: PagerState = { status: "stalled", message: "Cursor repeated" };
const run = (state: PagerState, ...events: PagerEvent[]) =>
  events.reduce(pagerTransition, state);

describe("pagerTransition", () => {
  test("follows every legal transition", () => {
    expect(pagerTransition(idlePager, { type: "start", request: 1 })).toEqual(
      loading(1),
    );
    expect(pagerTransition(failed, { type: "start", request: 2 })).toEqual(
      loading(2),
    );
    expect(pagerTransition(loading(1), { type: "loaded", request: 1 })).toBe(
      idlePager,
    );
    expect(
      pagerTransition(loading(1), {
        type: "failed",
        request: 1,
        message: "Network down",
      }),
    ).toEqual(failed);
    expect(
      pagerTransition(loading(1), {
        type: "stalled",
        request: 1,
        message: "Cursor repeated",
      }),
    ).toEqual(stalled);
  });

  test("ignores a second start while loading or stalled", () => {
    // Observer callbacks can repeat before React commits the loading state.
    const state = loading(1);
    expect(pagerTransition(state, { type: "start", request: 2 })).toBe(state);
    expect(pagerTransition(stalled, { type: "start", request: 2 })).toBe(
      stalled,
    );
  });

  test("ignores results outside a matching request", () => {
    const results: PagerEvent[] = [
      { type: "loaded", request: 1 },
      { type: "failed", request: 1, message: "late" },
      { type: "stalled", request: 1, message: "late" },
    ];
    for (const state of [idlePager, failed, stalled, loading(2)])
      for (const event of results)
        expect(pagerTransition(state, event)).toBe(state);
  });

  test("a superseded request cannot finish its successor", () => {
    expect(
      run(
        idlePager,
        { type: "start", request: 1 },
        { type: "failed", request: 1, message: "Network down" },
        { type: "start", request: 2 },
        { type: "loaded", request: 1 },
      ),
    ).toEqual(loading(2));
  });

  test("keeps a stalled list stalled until it remounts", () => {
    expect(
      run(
        stalled,
        { type: "start", request: 3 },
        { type: "loaded", request: 3 },
        { type: "failed", request: 3, message: "late" },
      ),
    ).toBe(stalled);
  });
});
