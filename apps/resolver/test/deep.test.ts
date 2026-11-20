import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveDeep } from "../src/deep.ts";
import { isolatePage } from "../src/isolate.ts";
import { DEEP_TIMEOUT_MS } from "../src/limits.ts";
import { asset, browserThat, navigation } from "./helpers.ts";

const START = "https://t.co/abc";
const verdictFor = (fake: ReturnType<typeof browserThat>, url: string) =>
  fake.verdicts.find(([seen]) => seen === url)?.[1];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("level 4: the browser never leaves the list", () => {
  it.each([
    "https://example.org/oferta",
    "http://127.0.0.1/admin",
    "http://169.254.169.254/",
    "https://bit.ly:8443/interno",
    "https://user@bit.ly/abc",
  ])("stops a navigation to %s and returns it as the destination", async (target) => {
    const fake = browserThat([navigation(target)]);
    expect(await resolveDeep([START], fake)).toEqual({
      status: "resolved",
      destination: target,
      hops: [START],
      method: "headless",
    });
    expect(verdictFor(fake, target)).toBe("abort");
    expect(fake.verdicts.filter(([, verdict]) => verdict === "continue")).toEqual([
      [START, "continue"],
    ]);
  });

  it.each([
    ["a script", "script"],
    ["a frame", "document"],
    ["a beacon", "ping"],
    ["a request made by code", "fetch"],
  ])("stops %s on another site without taking it for the destination", async (_name, type) => {
    const other = "https://cdn.example.net/recurso";
    const fake = browserThat([asset(other, type), navigation("https://example.org/")]);
    expect(await resolveDeep([START], fake)).toMatchObject({
      destination: "https://example.org/",
    });
    expect(verdictFor(fake, other)).toBe("abort");
  });

  it.each(["image", "media", "font", "stylesheet"])(
    "never loads a %s, even from the shortener",
    async (type) => {
      const fake = browserThat([
        asset("https://t.co/recurso", type),
        navigation("https://example.org/"),
      ]);
      await resolveDeep([START], fake);
      expect(verdictFor(fake, "https://t.co/recurso")).toBe("abort");
    },
  );

  it.each(["script", "xhr", "fetch", "document"])(
    "lets the shortener's own %s through",
    async (type) => {
      const fake = browserThat([
        asset("https://t.co/propio", type),
        navigation("https://example.org/"),
      ]);
      await resolveDeep([START], fake);
      expect(verdictFor(fake, "https://t.co/propio")).toBe("continue");
    },
  );

  it("follows a navigation to another listed shortener and adds it to the hops", async () => {
    const fake = browserThat([navigation("https://bit.ly/b"), navigation("https://example.org/")]);
    expect(await resolveDeep(["https://bit.ly/a", START], fake)).toEqual({
      status: "resolved",
      destination: "https://example.org/",
      hops: ["https://bit.ly/a", START, "https://bit.ly/b"],
      method: "headless",
    });
    expect(verdictFor(fake, "https://bit.ly/b")).toBe("continue");
  });

  it("stops on an address already visited", async () => {
    const fake = browserThat([navigation("https://bit.ly/a")]);
    expect(await resolveDeep(["https://bit.ly/a", START], fake)).toEqual({
      status: "unresolved",
      reason: "loop",
      hops: ["https://bit.ly/a", START],
    });
    expect(verdictFor(fake, "https://bit.ly/a")).toBe("abort");
  });

  it("stops past five addresses, counting the hops of the cheap levels", async () => {
    const before = ["https://bit.ly/1", "https://bit.ly/2", "https://bit.ly/3", START];
    const fake = browserThat([navigation("https://bit.ly/5"), navigation("https://bit.ly/6")]);
    expect(await resolveDeep(before, fake)).toEqual({
      status: "unresolved",
      reason: "too-many-hops",
      hops: [...before, "https://bit.ly/5"],
    });
    expect(verdictFor(fake, "https://bit.ly/6")).toBe("abort");
  });

  it.each(["javascript:alert(1)", "data:text/html,hola", "intent://abrir#Intent;end"])(
    "never returns %s as a destination",
    async (target) => {
      const fake = browserThat([navigation(target)]);
      expect(await resolveDeep([START], fake)).toEqual({
        status: "unresolved",
        reason: "unsupported-destination",
        hops: [START],
      });
      expect(verdictFor(fake, target)).toBe("abort");
    },
  );

  it("stops everything once the answer is known", async () => {
    const fake = browserThat([
      navigation("https://example.org/"),
      asset("https://t.co/tarde", "script"),
    ]);
    await resolveDeep([START], fake);
    expect(verdictFor(fake, "https://t.co/tarde")).toBe("abort");
  });

  it("gives the browser only the address to open", async () => {
    const fake = browserThat([navigation("https://example.org/")]);
    await resolveDeep(["https://bit.ly/a", START], fake);
    expect(fake.opened).toHaveLength(1);
    expect(fake.opened[0]).toHaveLength(2);
    expect(fake.opened[0]?.[0]).toBe(START);
  });
});

describe("level 4: time limit and closing", () => {
  it("returns at once when the destination comes early, and closes the session", async () => {
    vi.useFakeTimers();
    const fake = browserThat([navigation("https://example.org/")]);
    const answer = await resolveDeep([START], fake);
    expect(answer.status).toBe("resolved");
    expect(fake.closed).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives up after ten seconds on a page that never navigates, and closes the session", async () => {
    vi.useFakeTimers();
    const fake = browserThat([asset("https://t.co/app.js", "script")]);
    let answer: unknown;
    void resolveDeep([START], fake).then((result) => (answer = result));
    await vi.advanceTimersByTimeAsync(DEEP_TIMEOUT_MS - 1);
    expect(answer).toBeUndefined();
    expect(fake.closed).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(answer).toEqual({ status: "unresolved", reason: "timeout", hops: [START] });
    expect(fake.closed).toBe(1);
  });

  it("closes a browser that finishes starting after the time limit", async () => {
    vi.useFakeTimers();
    const fake = browserThat([], {
      open: () => new Promise((resolve) => setTimeout(resolve, DEEP_TIMEOUT_MS + 3000)),
    });
    const pending = resolveDeep([START], fake);
    await vi.advanceTimersByTimeAsync(DEEP_TIMEOUT_MS);
    expect(await pending).toMatchObject({ reason: "timeout" });
    expect(fake.closed).toBe(0);
    await vi.advanceTimersByTimeAsync(3000);
    expect(fake.closed).toBe(1);
  });

  it("still answers when closing fails or hangs", async () => {
    vi.useFakeTimers();
    const failing = browserThat([navigation("https://example.org/")], {
      close: () => Promise.reject(new Error("no cierra")),
    });
    expect(await resolveDeep([START], failing)).toMatchObject({ status: "resolved" });

    const hanging = browserThat([navigation("https://example.org/")], {
      close: () => new Promise(() => undefined),
    });
    const pending = resolveDeep([START], hanging);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toMatchObject({ status: "resolved" });
  });
});

describe("level 4: a browser that cannot start", () => {
  it.each([
    "Unable to create new browser: code: 429: message: Browser time limit exceeded for today",
    "Unable to create new browser: code: 429: message: Too many requests",
    `fallo al abrir ${START}`,
  ])("answers deep-unavailable and writes nothing: %s", async (message) => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const fake = browserThat([], { open: () => Promise.reject(new Error(message)) });
    expect(await resolveDeep(["https://bit.ly/a", START], fake)).toEqual({
      status: "unresolved",
      reason: "deep-unavailable",
      hops: ["https://bit.ly/a", START],
    });
    expect(spies.flatMap((spy) => spy.mock.calls)).toEqual([]);
  });

  it("answers deep-unavailable when there is no address to open", async () => {
    const fake = browserThat([]);
    expect(await resolveDeep([], fake)).toMatchObject({ reason: "deep-unavailable" });
    expect(fake.opened).toEqual([]);
  });
});

describe("page isolation script", () => {
  const scope = () => {
    const register = () => Promise.resolve("registrado");
    return {
      location: { href: "https://t.co/abc" },
      navigator: { serviceWorker: { register } },
      WebSocket: class {},
      WebTransport: class {},
      RTCPeerConnection: class {},
      webkitRTCPeerConnection: class {},
      Worker: class {},
      SharedWorker: class {},
      open: (url?: unknown): unknown => ({ ventana: url }),
      fetch: () => undefined,
    };
  };

  it("disables every way around request interception", async () => {
    const page = scope();
    isolatePage(page);
    for (const name of [
      "WebSocket",
      "WebTransport",
      "RTCPeerConnection",
      "webkitRTCPeerConnection",
      "Worker",
      "SharedWorker",
    ] as const) {
      expect(page[name], name).toBeUndefined();
    }
    await expect(page.navigator.serviceWorker.register()).rejects.toThrow("disabled");
    expect(page.fetch).toBeTypeOf("function");
  });

  it("turns a new window into a navigation of the same page", () => {
    const page = scope();
    isolatePage(page);
    expect(page.open("https://example.org/")).toBeNull();
    expect(page.location.href).toBe("https://example.org/");
  });

  it("cannot be undone by the page", () => {
    const page = scope();
    isolatePage(page);
    expect(() => {
      "use strict";
      (page as { WebSocket: unknown }).WebSocket = class {};
    }).toThrow(TypeError);
    expect(page.WebSocket).toBeUndefined();
  });

  it("uses nothing defined outside itself", () => {
    const rebuilt = new Function(`return (${isolatePage.toString()})`)() as typeof isolatePage;
    const page = scope();
    rebuilt(page);
    expect(page.WebSocket).toBeUndefined();
    expect(page.open("https://example.org/")).toBeNull();
  });
});

describe("page isolation script: new windows", () => {
  const nodeClass = () =>
    class FakeNode {
      static made = true;
      attributes: Record<string, string> = {};
      parentNode: unknown = null;
      form: unknown = null;
      calls: string[] = [];
      tagName: string;
      constructor(tagName: string, target?: string) {
        this.tagName = tagName;
        if (target) this.attributes.target = target;
      }
      setAttribute(name: string, value: string): void {
        this.attributes[name] = value;
      }
      dispatchEvent(): boolean {
        this.calls.push(`dispatch:${this.attributes.target}`);
        return true;
      }
      click(): void {
        this.calls.push(`click:${this.attributes.target ?? this.attributes.formtarget}`);
      }
      submit(): void {
        this.calls.push(`submit:${this.attributes.target}`);
      }
      requestSubmit(submitter?: unknown): void {
        this.form = submitter ?? this.form;
        this.calls.push(`request:${this.attributes.target}`);
      }
    };

  const prepared = () => {
    const FakeNode = nodeClass();
    const listeners: Record<string, (event: unknown) => void> = {};
    isolatePage({
      location: { href: "https://t.co/abc" },
      HTMLElement: FakeNode,
      HTMLFormElement: FakeNode,
      EventTarget: FakeNode,
      addEventListener: (type: string, listener: (event: unknown) => void, capture: boolean) => {
        if (capture) listeners[type] = listener;
      },
    } as Parameters<typeof isolatePage>[0]);
    return { listeners, FakeNode };
  };

  it("keeps links, forms, and submit buttons in the same window", () => {
    const { listeners, FakeNode } = prepared();

    const link = new FakeNode("A", "_blank");
    link.click();
    expect(link.calls).toEqual(["click:_self"]);

    const inner = new FakeNode("SPAN");
    const outer = new FakeNode("a", "nueva");
    inner.parentNode = outer;
    inner.dispatchEvent();
    expect(outer.attributes.target).toBe("_self");

    const form = new FakeNode("FORM", "_blank");
    form.submit();
    form.attributes.target = "_blank";
    form.requestSubmit();
    expect(form.calls).toEqual(["submit:_self", "request:_self"]);

    const owner = new FakeNode("FORM", "_blank");
    const button = new FakeNode("BUTTON");
    button.attributes.formtarget = "_blank";
    button.form = owner;
    button.click();
    expect(button.calls).toEqual(["click:_self"]);
    expect(owner.attributes.target).toBe("_self");

    const based = new FakeNode("AREA");
    listeners.click?.({ composedPath: () => [new FakeNode("B"), based] });
    expect(based.attributes.target).toBe("_self");

    const submitted = new FakeNode("FORM", "_blank");
    const submitter = new FakeNode("INPUT");
    listeners.submit?.({ composedPath: () => [submitted], submitter });
    expect(submitted.attributes.target).toBe("_self");
    expect(submitter.attributes.formtarget).toBe("_self");

    expect(Object.keys(listeners).sort()).toEqual(["auxclick", "click", "submit"]);
  });

  it("leaves other elements alone", () => {
    const { FakeNode } = prepared();
    const plain = new FakeNode("DIV");
    plain.click();
    expect(plain.attributes).toEqual({});
  });
});
