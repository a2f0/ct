/**
 * The "load older clicks" pager. Loading, the retryable error, and the stalled
 * cursor that needs a full refresh are one state, so they never combine.
 * Each request carries a tag, and only the current request may finish.
 */
export type PagerState =
  | { status: "idle" }
  | { status: "loading"; request: number }
  | { status: "failed"; message: string }
  | { status: "stalled"; message: string };

export type PagerEvent =
  | { type: "start"; request: number }
  | { type: "loaded"; request: number }
  | { type: "failed"; request: number; message: string }
  /** The server repeated a cursor; only Refresh data can restart the list. */
  | { type: "stalled"; request: number; message: string };

export const idlePager: PagerState = { status: "idle" };

/** Events that do not apply to the current state return it unchanged. */
export function pagerTransition(
  state: PagerState,
  event: PagerEvent,
): PagerState {
  switch (event.type) {
    case "start":
      return state.status === "idle" || state.status === "failed"
        ? { status: "loading", request: event.request }
        : state;
    case "loaded":
      return current(state, event.request) ? idlePager : state;
    case "failed":
    case "stalled":
      return current(state, event.request)
        ? { status: event.type, message: event.message }
        : state;
    default:
      return assertNever(event);
  }
}

function current(state: PagerState, request: number): boolean {
  return state.status === "loading" && state.request === request;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled pager event: ${JSON.stringify(value)}`);
}
