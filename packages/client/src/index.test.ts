import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import { validClick } from "../../api/src/validation";
import { createTracker } from "./index";
import type { Tracker, TrackerOptions } from "./types";

let browser: Window;
let trackers: Tracker[];
const originalFetch = globalThis.fetch;
const descriptors = new Map<string, PropertyDescriptor | undefined>();
let requests: {
  body: {
    site: string;
    events: {
      id: string;
      page: string;
      target: string;
      label: string | null;
    }[];
  };
  init: RequestInit;
}[];

beforeEach(() => {
  browser = new Window({
    url: "https://skyline.devopsrockstars.com/?secret=hidden",
  });
  // Model a human browser only in these fixtures; a separate test verifies the guard.
  Object.defineProperty(browser.navigator, "webdriver", {
    value: false,
    configurable: true,
  });
  for (const key of [
    "window",
    "document",
    "navigator",
    "localStorage",
    "Element",
    "Event",
  ]) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: Reflect.get(browser, key),
    });
  }
  requests = [];
  trackers = [];
  globalThis.fetch = mock(async (_url, init) => {
    requests.push({ body: JSON.parse(String(init?.body)), init: init ?? {} });
    return new Response(null, { status: 202 });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  for (const tracker of trackers) tracker.destroy();
  globalThis.fetch = originalFetch;
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  void browser.happyDOM.close();
});

function tracker(
  options: Parameters<typeof createTracker>[0] = {
    site: "skyline",
    capture: "all",
  },
) {
  const instance = createTracker(options);
  trackers.push(instance);
  return instance;
}

function click(
  html = "<button>Private customer name</button>",
  trusted = true,
) {
  browser.document.body.innerHTML = html;
  const event = new browser.MouseEvent("click", {
    bubbles: true,
    composed: true,
  });
  Object.defineProperty(event, "isTrusted", { value: trusted });
  browser.document.body.firstElementChild?.dispatchEvent(event);
}

describe("explicit lifecycle", () => {
  test("construction and flush are inert until initialized; init is idempotent", async () => {
    const ct = tracker();
    click();
    await ct.flush();
    expect(requests).toHaveLength(0);
    expect(ct.init()).toBe(true);
    expect(ct.init()).toBe(true);
    click();
    await ct.flush();
    expect(requests[0]?.body.events).toHaveLength(1);
    ct.destroy();
    click();
    await ct.flush();
    expect(requests).toHaveLength(1);
  });
  test("SSR import and construction need no browser", () => {
    Reflect.deleteProperty(globalThis, "window");
    expect(tracker().init()).toBe(false);
  });
  test("automated browsers and synthetic events never capture", async () => {
    Object.defineProperty(browser.navigator, "webdriver", {
      value: true,
      configurable: true,
    });
    expect(tracker().init()).toBe(false);
    Object.defineProperty(browser.navigator, "webdriver", { value: false });
    const ct = tracker();
    ct.init();
    click("<button>Test</button>", false);
    await ct.flush();
    expect(requests).toHaveLength(0);
  });
});

describe("click metadata", () => {
  test("unusual tags cannot poison a batch and emitted fields match the API", async () => {
    const ct = tracker();
    ct.init();
    for (const tag of ["foo_bar", "my.widget", "svg", "my-element"])
      click(`<${tag} data-ct="valid-label">private</${tag}>`);
    await ct.flush();
    expect(requests[0]?.body.events).toHaveLength(4);
    expect(requests[0]?.body.events.every((event) => validClick(event))).toBe(
      true,
    );
  });
  test("captures all target types but no text, attributes or URLs", async () => {
    const ct = tracker({
      site: "skyline",
      capture: "all",
      page: () => "/building/:id?token=secret#private",
    });
    ct.init();
    click(
      '<div id="customer-123" class="private" data-email="person@example.com">Sensitive text</div>',
    );
    await ct.flush();
    expect(requests[0]?.body.events[0]).toMatchObject({
      page: "/building/:id",
      target: "div",
      label: null,
    });
    expect(JSON.stringify(requests)).not.toContain("Sensitive");
    expect(JSON.stringify(requests)).not.toContain("person@example.com");
    expect(requests[0]?.init.credentials).toBe("omit");
    expect(requests[0]?.init.referrerPolicy).toBe("no-referrer");
  });
  test("supports explicit labels, marked-only mode, and subtree exclusions", async () => {
    const ct = tracker({ site: "skyline", capture: "marked" });
    ct.init();
    click("<button>Unmarked</button>");
    click('<button data-ct="open-building">Open</button>');
    click(
      '<div data-ct-ignore><button data-ct="secret">Private</button></div>',
    );
    click('<input data-ct="password" value="hidden">');
    click('<div contenteditable="true" data-ct="editor">private</div>');
    await ct.flush();
    expect(requests[0]?.body.events).toHaveLength(1);
    expect(requests[0]?.body.events[0]?.label).toBe("open-building");
  });
  test("captures SVG and shadow-root targets through composed paths", async () => {
    const ct = tracker();
    ct.init();
    browser.document.body.innerHTML =
      '<div id="host"></div><svg><path data-ct="building"/></svg>';
    const shadow = browser.document
      .querySelector("#host")
      ?.attachShadow({ mode: "open" });
    if (shadow)
      shadow.innerHTML = '<button data-ct="shadow-control">Open</button>';
    for (const element of [
      shadow?.firstElementChild,
      browser.document.querySelector("path"),
    ]) {
      const event = new browser.MouseEvent("click", {
        bubbles: true,
        composed: true,
      });
      Object.defineProperty(event, "isTrusted", { value: true });
      element?.dispatchEvent(event);
    }
    await ct.flush();
    expect(requests[0]?.body.events.map((event) => event.label)).toEqual([
      "shadow-control",
      "building",
    ]);
  });
});

describe("queue and privacy", () => {
  test.each([
    { name: "omitted", options: {} },
    { name: "false", options: { overrideGpc: false } },
    {
      name: "a truthy non-boolean",
      options: { overrideGpc: "true" as unknown as boolean },
    },
  ])(
    "GPC blocks capture and flush when overrideGpc is $name",
    async ({ options }) => {
      const setGpc = (value: boolean) =>
        Object.defineProperty(browser.navigator, "globalPrivacyControl", {
          value,
          configurable: true,
        });
      setGpc(true);
      const ct = tracker({ site: "skyline", ...options });
      expect(ct.init()).toBe(false);
      click();
      setGpc(false);
      await ct.flush();
      expect(requests).toHaveLength(0);
      click();
      setGpc(true);
      await ct.flush();
      expect(requests).toHaveLength(0);
      setGpc(false);
      await ct.flush();
      expect(requests).toHaveLength(0);
      click();
      await ct.flush();
      expect(requests[0]?.body.events).toHaveLength(1);
    },
  );
  test("explicit GPC override captures and flushes only for that tracker", async () => {
    Object.defineProperty(browser.navigator, "globalPrivacyControl", {
      value: true,
      configurable: true,
    });
    const options: TrackerOptions = { site: "overridden", overrideGpc: true };
    const overridden = tracker(options);
    const normal = tracker({ site: "normal" });
    // Configuration is fixed per tracker rather than a global privacy setting.
    options.overrideGpc = false;
    expect(overridden.init()).toBe(true);
    expect(normal.init()).toBe(false);
    click();
    await Promise.all([normal.flush(), overridden.flush()]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.body.site).toBe("overridden");
    expect(requests[0]?.body.events).toHaveLength(1);
    expect(Reflect.get(browser.navigator, "globalPrivacyControl")).toBe(true);
  });
  test.each([
    "DNT",
    "extension",
    "saved opt-out",
    "webdriver",
    "storage error",
    "privacy read error",
  ])("GPC override preserves %s at init, capture and flush", async (guard) => {
    Object.defineProperty(browser.navigator, "globalPrivacyControl", {
      value: true,
    });
    const storage = browser.localStorage;
    function setGuard(enabled: boolean) {
      switch (guard) {
        case "DNT":
          Object.defineProperty(browser.navigator, "doNotTrack", {
            value: enabled ? "1" : "0",
            configurable: true,
          });
          break;
        case "extension":
          browser.document.documentElement.toggleAttribute(
            "data-ct-disabled",
            enabled,
          );
          break;
        case "saved opt-out":
          if (enabled) storage.setItem("ct:opt-out", "1");
          else storage.removeItem("ct:opt-out");
          break;
        case "webdriver":
          Object.defineProperty(browser.navigator, "webdriver", {
            value: enabled,
            configurable: true,
          });
          break;
        case "storage error":
          Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            get() {
              if (enabled) throw new Error("Storage blocked");
              return storage;
            },
          });
          break;
        case "privacy read error":
          Object.defineProperty(browser.navigator, "doNotTrack", {
            configurable: true,
            get() {
              if (enabled) throw new Error("Privacy setting unavailable");
              return "0";
            },
          });
          break;
      }
    }
    const ct = tracker({ site: "skyline", overrideGpc: true });
    setGuard(true);
    expect(ct.init()).toBe(false);
    setGuard(false);
    expect(ct.init()).toBe(true);
    click();
    setGuard(true);
    await ct.flush();
    expect(requests).toHaveLength(0);
    click();
    setGuard(false);
    await ct.flush();
    expect(requests).toHaveLength(0);
    click();
    await ct.flush();
    expect(requests[0]?.body.events).toHaveLength(1);
  });
  test("GPC override preserves explicit opt-out even without saved storage", async () => {
    Object.defineProperty(browser.navigator, "globalPrivacyControl", {
      value: true,
    });
    const ct = tracker({ site: "skyline", overrideGpc: true });
    expect(ct.init()).toBe(true);
    click();
    ct.setOptOut(true);
    browser.localStorage.removeItem("ct:opt-out");
    click();
    await ct.flush();
    expect(requests).toHaveLength(0);
    ct.setOptOut(false);
    await ct.flush();
    expect(requests).toHaveLength(0);
    click();
    await ct.flush();
    expect(requests[0]?.body.events).toHaveLength(1);
  });
  test.each([408, 429, 500, 503])(
    "retries status %i without changing event IDs",
    async (status) => {
      const ct = tracker();
      ct.init();
      click();
      let attempt = 0;
      globalThis.fetch = mock(async (_url, init) => {
        requests.push({
          body: JSON.parse(String(init?.body)),
          init: init ?? {},
        });
        return new Response(null, { status: ++attempt === 1 ? status : 202 });
      }) as unknown as typeof fetch;
      await ct.flush();
      await ct.flush();
      expect(requests[0]?.body).toEqual(requests[1]?.body);
    },
  );
  test("opting out during a request does not throttle a later opt-in", async () => {
    const ct = tracker({ site: "skyline", capture: "all", batchSize: 1 });
    ct.init();
    let calls = 0;
    globalThis.fetch = mock(async (_url, init) => {
      if (++calls > 1) return new Response(null, { status: 202 });
      return new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        ),
      );
    }) as unknown as typeof fetch;
    click();
    const pending = ct.flush();
    ct.setOptOut(true);
    await pending;
    ct.setOptOut(false);
    click();
    expect(calls).toBe(2);
    await ct.flush();
  });
  test("retries the same event IDs after failure; successes empty the queue", async () => {
    const ct = tracker();
    ct.init();
    click();
    let attempts = 0;
    globalThis.fetch = mock(async (_url, init) => {
      requests.push({ body: JSON.parse(String(init?.body)), init: init ?? {} });
      if (++attempts === 1) throw new Error("offline");
      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch;
    await ct.flush();
    await ct.flush();
    await ct.flush();
    expect(requests).toHaveLength(2);
    expect(requests[0]?.body).toEqual(requests[1]?.body);
  });
  test("rate limits retain the batch and concurrent flushes share one request", async () => {
    const ct = tracker();
    ct.init();
    click();
    let finish: ((response: Response) => void) | undefined;
    const fetcher = mock(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    globalThis.fetch = fetcher as unknown as typeof fetch;
    const first = ct.flush();
    const second = ct.flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    finish?.(new Response(null, { status: 429 }));
    await Promise.all([first, second]);
    globalThis.fetch = mock(
      async () => new Response(null, { status: 202 }),
    ) as unknown as typeof fetch;
    await ct.flush();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
  test("permanent rejections drop invalid data rather than retry forever", async () => {
    const ct = tracker();
    ct.init();
    click();
    globalThis.fetch = mock(
      async () => new Response(null, { status: 400 }),
    ) as unknown as typeof fetch;
    await ct.flush();
    await ct.flush();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
  test("extension and site opt-outs clear queued clicks and can resume", async () => {
    const ct = tracker();
    ct.init();
    click();
    browser.document.documentElement.setAttribute("data-ct-disabled", "");
    browser.document.dispatchEvent(new browser.Event("ct:opt-out-change"));
    browser.document.documentElement.removeAttribute("data-ct-disabled");
    await ct.flush();
    expect(requests).toHaveLength(0);
    ct.setOptOut(true);
    click();
    await ct.flush();
    expect(requests).toHaveLength(0);
    ct.setOptOut(false);
    click();
    await ct.flush();
    expect(requests).toHaveLength(1);
  });
  test("initial opt-out may be lifted without reinitializing", async () => {
    browser.localStorage.setItem("ct:opt-out", "1");
    const ct = tracker();
    expect(ct.init()).toBe(false);
    click();
    await ct.flush();
    expect(requests).toHaveLength(0);
    ct.setOptOut(false);
    click();
    await ct.flush();
    expect(requests).toHaveLength(1);
  });
  test("DNT and GPC stop capture", async () => {
    const ct = tracker();
    ct.init();
    Object.defineProperty(browser.navigator, "doNotTrack", {
      value: "1",
      configurable: true,
    });
    click();
    await ct.flush();
    expect(requests).toHaveLength(0);
    Object.defineProperty(browser.navigator, "doNotTrack", { value: "0" });
    Object.defineProperty(browser.navigator, "globalPrivacyControl", {
      value: true,
    });
    click();
    await ct.flush();
    expect(requests).toHaveLength(0);
  });
});
