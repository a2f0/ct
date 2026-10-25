import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import type { Root } from "react-dom/client";
import { configurePasswordSaver } from "./passwords";

const dom = new Window({ url: "https://ct.test/login" });
const globals = {
  window: dom,
  document: dom.document,
  navigator: dom.navigator,
  location: dom.location,
  history: dom.history,
  FormData: dom.FormData,
  HTMLElement: dom.HTMLElement,
  HTMLInputElement: dom.HTMLInputElement,
  IS_REACT_ACT_ENVIRONMENT: true,
};
const originals = new Map<string, PropertyDescriptor | undefined>();
let createRoot: (container: Element) => Root;
let root: Root;
let container: HTMLElement;
let offered: Array<[string, string]>;
let submitted: Array<{ email: string; password: string }>;
let navigations: string[];
let session: {
  data: null | { user: { email: string } };
  isPending: boolean;
  error: null;
};
let AuthGate: typeof import("./AuthGate").AuthGate;
const authClient = {
  useSession: () => session,
  signIn: {
    email: async (values: { email: string; password: string }) => {
      submitted.push(values);
      return result;
    },
  },
  changePassword: async () => result,
};
mock.module("./authClient", () => ({ authClient, returnTo: () => "/" }));
let result: { error: { status: number } | null };
const restores: Array<() => void> = [];
const email = "fixture@example.test";
const password = "isolated-fixture-password";

beforeAll(async () => {
  for (const [key, value] of Object.entries(globals)) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  ({ createRoot } = await import("react-dom/client"));
  ({ AuthGate } = await import("./AuthGate"));
});
beforeEach(async () => {
  dom.happyDOM.setURL("https://ct.test/login");
  offered = [];
  submitted = [];
  navigations = [];
  result = { error: null };
  session = { data: null, isPending: false, error: null } as typeof session;
  const assign = spyOn(dom.location, "assign").mockImplementation((url) => {
    navigations.push(String(url));
  });
  const replace = spyOn(dom.location, "replace").mockImplementation((url) => {
    navigations.push(String(url));
  });
  restores.push(
    () => assign.mockRestore(),
    () => replace.mockRestore(),
  );
  configurePasswordSaver(async (username, secret) => {
    offered.push([username, secret]);
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<AuthGate />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  configurePasswordSaver(undefined);
  for (const restore of restores.splice(0)) restore();
});
afterAll(async () => {
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  await dom.happyDOM.close();
});
function input(name: string) {
  const field = container.querySelector<HTMLInputElement>(`[name="${name}"]`);
  if (!field) throw new Error(`Missing ${name}`);
  return field;
}
async function fill(
  name: string,
  value: string,
  source: "autofill" | "typing" | "paste" | "silent" = "typing",
) {
  const field = input(name);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      dom.HTMLInputElement.prototype,
      "value",
    )?.set?.call(field, value);
    if (source === "silent") return;
    const event =
      source === "autofill"
        ? new dom.Event("input", { bubbles: true })
        : new dom.InputEvent("input", {
            bubbles: true,
            inputType: source === "paste" ? "insertFromPaste" : "insertText",
          });
    Object.defineProperty(event, "isTrusted", { value: true });
    field.dispatchEvent(event as never);
  });
}
async function credentials(
  source: "autofill" | "typing" | "paste" | "silent" = "typing",
) {
  await fill("email", email, source);
  await fill("password", password, source);
}
async function submit() {
  await act(async () => {
    container
      .querySelector("form")
      ?.dispatchEvent(
        new dom.Event("submit", { bubbles: true, cancelable: true }) as never,
      );
  });
}

for (const source of ["typing", "paste", "silent"] as const) {
  test(`offers successfully submitted credentials from ${source}`, async () => {
    await credentials(source);
    await submit();
    expect(submitted).toEqual([{ email, password }]);
    expect(offered).toEqual([[email, password]]);
    expect(navigations).toEqual(["/"]);
  });
}
test("does not offer an iOS keyboard AutoFill login again", async () => {
  await credentials("autofill");
  await submit();
  expect(offered).toEqual([]);
  expect(navigations).toEqual(["/"]);
});
for (const field of ["email", "password"] as const) {
  test(`offers an autofilled login after its ${field} changes`, async () => {
    await credentials("autofill");
    await fill(
      field,
      field === "email" ? "changed@example.test" : "changed-fixture-password",
    );
    await submit();
    expect(offered).toHaveLength(1);
    expect(offered[0]?.[field === "email" ? 0 : 1]).not.toBe(
      field === "email" ? email : password,
    );
  });
}
test("unsupported autofill selectors do not break login", async () => {
  const unsupported = (() => {
    throw new SyntaxError("Unsupported");
  }) as unknown as HTMLInputElement["matches"];
  const matches = spyOn(input("email"), "matches").mockImplementation(
    unsupported,
  );
  await credentials();
  await submit();
  expect(offered).toEqual([[email, password]]);
  expect(navigations).toEqual(["/"]);
  matches.mockRestore();
});
test("CSS autofill detection skips only when both credential fields are autofilled", async () => {
  await credentials();
  const emailMatch = spyOn(input("email"), "matches").mockReturnValue(true);
  const passwordMatch = spyOn(input("password"), "matches").mockReturnValue(
    true,
  );
  await submit();
  expect(offered).toEqual([]);
  emailMatch.mockRestore();
  passwordMatch.mockRestore();
});
test("failed authentication never offers to save", async () => {
  result = { error: { status: 401 } };
  await credentials();
  await submit();
  expect(offered).toEqual([]);
  expect(navigations).toEqual([]);
  expect(input("password").value).toBe("");
});
for (const autofilled of ["email", "password"]) {
  test(`offers to save when only ${autofilled} matches CSS autofill`, async () => {
    await credentials();
    const emailMatch = spyOn(input("email"), "matches").mockReturnValue(
      autofilled === "email",
    );
    const passwordMatch = spyOn(input("password"), "matches").mockReturnValue(
      autofilled === "password",
    );
    await submit();
    expect(offered).toEqual([[email, password]]);
    emailMatch.mockRestore();
    passwordMatch.mockRestore();
  });
}
test("declining or failing to save still completes login", async () => {
  configurePasswordSaver(async () => {
    throw new Error("Unavailable");
  });
  await credentials();
  await submit();
  expect(navigations).toEqual(["/"]);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
test("session refresh waits for a pending save request and navigates once", async () => {
  let finish: (() => void) | undefined;
  configurePasswordSaver(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await credentials();
  await submit();
  session = { ...session, data: { user: { email } } } as typeof session;
  await act(async () => root.render(<AuthGate />));
  expect(container.querySelector("form")).not.toBeNull();
  expect(navigations).toEqual([]);
  await act(async () => finish?.());
  expect(navigations).toEqual(["/"]);
});
test("successful password changes offer the new credential; failures do not", async () => {
  dom.happyDOM.setURL("https://ct.test/account");
  session = { ...session, data: { user: { email } } } as typeof session;
  await act(async () => root.render(<AuthGate />));
  await fill("current-password", password);
  await fill("new-password", "new-fixture-password");
  await fill("confirm-password", "new-fixture-password");
  result = { error: { status: 400 } };
  await submit();
  expect(offered).toEqual([]);
  result = { error: null };
  await submit();
  expect(offered).toEqual([[email, "new-fixture-password"]]);
  expect(input("new-password").value).toBe("");
});
