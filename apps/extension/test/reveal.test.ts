import { describe, expect, it, vi } from "vitest";
import { DIALOG_COLORS, TONE_NAMES, toneIcon } from "../src/dialog.ts";
import { parseResolver, resolverOrigin } from "../src/resolver-config.ts";
import { createReveal, readOutcome, TIMEOUT_MS, type Send } from "../src/reveal.ts";
import {
  CACHE_LIMIT,
  CACHE_MS,
  createPageReveal,
  createRevealService,
  REVEAL_MESSAGE,
  type Remembered,
  type SessionStore,
} from "../src/reveal-service.ts";
import { readSettings } from "../src/settings.ts";
import {
  ACTION,
  dangerStep,
  failedStep,
  hiddenStep,
  RETRYABLE,
  revealedStep,
  revealingStep,
  stillHiddenStep,
} from "../src/steps.ts";
import { createVerdicts } from "../src/verdicts.ts";

const RESOLVER = "https://resolver.example";
const SHORT = "https://bit.ly/3xYz";
const DANGER = "https://bcp.com.bo.verifica.net/";
const OWN_ID = "abcdefghijklmnop";

function answering(body: unknown, status = 200) {
  const calls: { input: string; init: RequestInit }[] = [];
  const send: Send = async (input, init) => {
    calls.push({ input, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  };
  return { calls, send };
}

describe("resolver address", () => {
  it.each([
    ["an https address with a path", "https://resolver.example/api/", "https://resolver.example"],
    ["localhost", "http://localhost:8787", "http://localhost:8787"],
    ["the loopback address", "http://127.0.0.1:8787/", "http://127.0.0.1:8787"],
    ["spaces around it", "  https://resolver.example  ", "https://resolver.example"],
  ])("accepts %s", (_name, value, origin) => {
    expect(resolverOrigin(value)).toBe(origin);
  });

  it.each([undefined, "", "   "])("means none for %j", (value) => {
    expect(resolverOrigin(value)).toBeNull();
  });

  it.each([
    ["plain http", "http://resolver.example"],
    ["credentials", "https://user:secret@resolver.example"],
    ["text that is not an address", "resolver"],
    ["another scheme", "ftp://resolver.example"],
  ])("fails the build on %s", (_name, value) => {
    expect(() => resolverOrigin(value)).toThrow(/WXT_RESOLVER_URL/);
    expect(parseResolver(value)).toBeNull();
  });

  it("gives the page script the resolver and its privacy policy, or neither", () => {
    expect(readSettings({ WXT_RESOLVER_URL: `${RESOLVER}/` })).toEqual({
      resolver: RESOLVER,
      privacyPolicy: `${RESOLVER}/privacidad`,
      donate: null,
    });
    expect(readSettings({})).toEqual({ resolver: null, privacyPolicy: null, donate: null });
    expect(readSettings({ WXT_RESOLVER_URL: "http://resolver.example" }).resolver).toBeNull();
  });
});

describe("the request", () => {
  it("sends the short link and nothing else", async () => {
    const { calls, send } = answering({ status: "resolved", destination: DANGER, hops: [] });
    await createReveal(RESOLVER, send, () => true)(SHORT);
    expect(calls).toHaveLength(1);
    const [{ input, init }] = calls as [{ input: string; init: RequestInit }];
    expect(input).toBe(`${RESOLVER}/resolve`);
    expect(JSON.parse(String(init.body))).toEqual({ url: SHORT });
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      redirect: "error",
    });
    expect(Object.keys(init).sort()).toEqual([
      "body",
      "cache",
      "credentials",
      "headers",
      "method",
      "redirect",
      "referrerPolicy",
      "signal",
    ]);
  });

  it.each([
    [
      "a resolved answer",
      { status: "resolved", destination: DANGER },
      200,
      { kind: "revealed", destination: DANGER },
    ],
    [
      "unresolved",
      { status: "unresolved", reason: "no-redirect" },
      200,
      { kind: "failed", reason: "unresolved" },
    ],
    ["the request limit", { error: "limit" }, 429, { kind: "failed", reason: "limited" }],
    ["a server error", { error: "boom" }, 500, { kind: "failed", reason: "error" }],
    ["text that is not JSON", "<html>", 200, { kind: "failed", reason: "error" }],
    ["an answer of another shape", [1, 2], 200, { kind: "failed", reason: "error" }],
    ["an unknown status", { status: "maybe" }, 200, { kind: "failed", reason: "error" }],
    [
      "a destination that is not a web address",
      { status: "resolved", destination: "javascript:alert(1)" },
      200,
      { kind: "failed", reason: "error" },
    ],
    [
      "a destination that is not text",
      { status: "resolved", destination: { href: DANGER } },
      200,
      { kind: "failed", reason: "error" },
    ],
  ])("reads %s", async (_name, body, status, expected) => {
    const { send } = answering(body, status);
    expect(await createReveal(RESOLVER, send, () => true)(SHORT)).toEqual(expected);
  });

  it("answers unavailable without a request when the package has no resolver", async () => {
    const { calls, send } = answering({});
    expect(await createReveal(null, send, () => true)(SHORT)).toEqual({
      kind: "failed",
      reason: "unavailable",
    });
    expect(calls).toEqual([]);
  });

  it("answers offline without a request, and when the connection drops meanwhile", async () => {
    const { calls, send } = answering({});
    expect(await createReveal(RESOLVER, send, () => false)(SHORT)).toMatchObject({
      reason: "offline",
    });
    expect(calls).toEqual([]);
    let online = true;
    const dropping: Send = async () => {
      online = false;
      throw new TypeError("network");
    };
    expect(await createReveal(RESOLVER, dropping, () => online)(SHORT)).toMatchObject({
      reason: "offline",
    });
  });

  it("gives up after 12 seconds", async () => {
    vi.useFakeTimers();
    const hanging: Send = (_input, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const pending = createReveal(RESOLVER, hanging, () => true)(SHORT);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    expect(await pending).toEqual({ kind: "failed", reason: "error" });
    vi.useRealTimers();
  });

  it("reads an outcome from a message, trusting none of it", () => {
    expect(readOutcome({ kind: "revealed", destination: DANGER })).toEqual({
      kind: "revealed",
      destination: DANGER,
    });
    expect(readOutcome({ kind: "failed", reason: "limited" })).toEqual({
      kind: "failed",
      reason: "limited",
    });
    for (const bad of [
      null,
      undefined,
      "revealed",
      { kind: "revealed" },
      { kind: "revealed", destination: "data:text/html,x" },
      { kind: "failed", reason: "made-up" },
      { kind: "other" },
    ]) {
      expect(readOutcome(bad)).toEqual({ kind: "failed", reason: "error" });
    }
  });
});

function memory(initial: unknown = undefined) {
  const state: { value: unknown; writes: number } = { value: initial, writes: 0 };
  const store: SessionStore = {
    read: async () => state.value,
    write: async (value) => {
      state.value = value;
      state.writes += 1;
    },
  };
  return { state, store };
}

describe("the background's reveal service", () => {
  const request = (link: unknown) => ({ type: REVEAL_MESSAGE, link });
  const revealing = (destination = DANGER) =>
    vi.fn(async () => ({ kind: "revealed" as const, destination }));

  it("ignores messages that are not reveal requests", () => {
    const service = createRevealService(OWN_ID, revealing(), memory().store);
    for (const message of [
      null,
      "x",
      {},
      { type: "other", link: SHORT },
      { type: REVEAL_MESSAGE },
    ]) {
      expect(service.handle(message, OWN_ID)).toBeNull();
    }
  });

  it.each([
    ["another extension", SHORT, "zzzzzzzzzzzzzzzz"],
    ["a page with no extension id", SHORT, undefined],
    ["a link that is not a web address", "javascript:alert(1)", OWN_ID],
    ["text that is not a link", "bit.ly", OWN_ID],
    ["a host that is not a listed service", "https://www.lostiempos.com/nota", OWN_ID],
    ["a dangerous host", DANGER, OWN_ID],
  ])("refuses %s without asking the resolver", async (_name, link, sender) => {
    const reveal = revealing();
    const { state, store } = memory();
    const service = createRevealService(OWN_ID, reveal, store);
    expect(await service.handle(request(link), sender)).toEqual({
      kind: "failed",
      reason: "error",
    });
    expect(reveal).not.toHaveBeenCalled();
    expect(state.writes).toBe(0);
  });

  it("asks for a listed short link and for a listed tracking link", async () => {
    const reveal = revealing();
    const service = createRevealService(OWN_ID, reveal, memory().store);
    expect(await service.handle(request(SHORT), OWN_ID)).toEqual({
      kind: "revealed",
      destination: DANGER,
    });
    await service.handle(request("https://example.us12.list-manage.com/track/click?u=1"), OWN_ID);
    expect(reveal).toHaveBeenCalledTimes(2);
    expect(reveal).toHaveBeenNthCalledWith(1, SHORT);
  });

  it("asks once for a repeated link, even after the background was stopped", async () => {
    const reveal = revealing();
    const { store } = memory();
    await createRevealService(OWN_ID, reveal, store).handle(request(SHORT), OWN_ID);
    const restarted = createRevealService(OWN_ID, reveal, store);
    expect(await restarted.handle(request(SHORT), OWN_ID)).toEqual({
      kind: "revealed",
      destination: DANGER,
    });
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it("asks again after 30 minutes", async () => {
    const reveal = revealing();
    let now = 1_000_000;
    const service = createRevealService(OWN_ID, reveal, memory().store, () => now);
    await service.handle(request(SHORT), OWN_ID);
    now += CACHE_MS - 1;
    await service.handle(request(SHORT), OWN_ID);
    expect(reveal).toHaveBeenCalledTimes(1);
    now += 1;
    await service.handle(request(SHORT), OWN_ID);
    expect(reveal).toHaveBeenCalledTimes(2);
  });

  it("does not remember a failure", async () => {
    const reveal = vi
      .fn()
      .mockResolvedValueOnce({ kind: "failed", reason: "limited" })
      .mockResolvedValueOnce({ kind: "revealed", destination: DANGER });
    const { state, store } = memory();
    const service = createRevealService(OWN_ID, reveal, store);
    expect(await service.handle(request(SHORT), OWN_ID)).toMatchObject({ reason: "limited" });
    expect(state.writes).toBe(0);
    expect(await service.handle(request(SHORT), OWN_ID)).toMatchObject({ kind: "revealed" });
    expect(reveal).toHaveBeenCalledTimes(2);
  });

  it("keeps at most 200 answers, dropping the oldest", async () => {
    let now = 1_000_000;
    const { state, store } = memory();
    const service = createRevealService(OWN_ID, revealing(), store, () => now);
    for (let index = 0; index < CACHE_LIMIT + 5; index++) {
      now += 1;
      await service.handle(request(`https://bit.ly/x${index}`), OWN_ID);
    }
    const kept = Object.keys(state.value as Record<string, Remembered>);
    expect(kept).toHaveLength(CACHE_LIMIT);
    expect(kept).not.toContain("https://bit.ly/x0");
    expect(kept).toContain(`https://bit.ly/x${CACHE_LIMIT + 4}`);
  });

  it("ignores what it cannot read in its memory, and works when memory fails", async () => {
    const reveal = revealing();
    const spoiled = memory({
      [SHORT]: { destination: "javascript:alert(1)", at: Date.now() },
      "https://bit.ly/b": "nonsense",
      "https://bit.ly/c": { destination: DANGER, at: Date.now() + 10_000_000 },
    });
    await createRevealService(OWN_ID, reveal, spoiled.store).handle(request(SHORT), OWN_ID);
    expect(reveal).toHaveBeenCalledTimes(1);

    const broken: SessionStore = {
      read: () => Promise.reject(new Error("no session storage")),
      write: () => Promise.reject(new Error("no session storage")),
    };
    expect(
      await createRevealService(OWN_ID, reveal, broken).handle(request(SHORT), OWN_ID),
    ).toMatchObject({ kind: "revealed" });
  });

  it("answers an error when the resolver call itself throws or answers nonsense", async () => {
    const throwing = createRevealService(
      OWN_ID,
      () => Promise.reject(new Error("x")),
      memory().store,
    );
    expect(await throwing.handle(request(SHORT), OWN_ID)).toEqual({
      kind: "failed",
      reason: "error",
    });
    const odd = createRevealService(
      OWN_ID,
      (async () => ({ kind: "revealed", destination: "about:blank" })) as never,
      memory().store,
    );
    expect(await odd.handle(request(SHORT), OWN_ID)).toEqual({ kind: "failed", reason: "error" });
  });
});

describe("the page script's side of the message", () => {
  it("sends the link and reads only a well-formed answer", async () => {
    const send = vi.fn(async () => ({ kind: "revealed", destination: DANGER, extra: "<b>" }));
    expect(await createPageReveal(send)(SHORT)).toEqual({ kind: "revealed", destination: DANGER });
    expect(send).toHaveBeenCalledWith({ type: REVEAL_MESSAGE, link: SHORT });
  });

  it.each([
    ["a rejected message", () => Promise.reject(new Error("context invalidated"))],
    ["no answer", async () => undefined],
    ["a malformed answer", async () => ({ kind: "revealed", destination: 7 })],
  ])("treats %s as not revealed", async (_name, send) => {
    expect(await createPageReveal(send)(SHORT)).toEqual({ kind: "failed", reason: "error" });
  });
});

describe("steps of the dialog", () => {
  const verdicts = createVerdicts();
  const hidden = { kind: "shortener", service: "bit.ly", link: SHORT } as const;
  const tracker = {
    kind: "tracker",
    service: "list-manage.com",
    link: "https://x.list-manage.com/a",
  } as const;
  const ids = (view: { actions: readonly { id: string }[] }) =>
    view.actions.map((action) => action.id);
  const primary = (view: { actions: readonly { id: string; primary?: boolean }[] }) =>
    view.actions.filter((action) => action.primary).map((action) => action.id);
  const warningFor = (address: string) => {
    const content = verdicts.describe({ address, text: "" });
    const verdict = verdicts.of({ address, text: "" });
    if (!content || !verdict) throw new Error("not analyzed");
    return { content, verdict };
  };

  it("danger: go back first, open anyway second", () => {
    const view = dangerStep(warningFor(DANGER).content);
    expect(view).toMatchObject({
      tone: "danger",
      dismiss: ACTION.back,
      host: "bcp.com.bo.verifica.net",
    });
    expect(ids(view)).toEqual([ACTION.open, ACTION.back]);
    expect(primary(view)).toEqual([ACTION.back]);
  });

  it("hidden, before revealing: three choices, the notice, and reveal as the main one", () => {
    const view = hiddenStep(hidden, true);
    expect(view.tone).toBe("hidden");
    expect(view.title).toContain("bit.ly");
    expect(view.title).toContain("acortador");
    expect(hiddenStep(tracker, true).title).toContain("seguimiento");
    expect(ids(view)).toEqual([ACTION.cancel, ACTION.open, ACTION.reveal]);
    expect(primary(view)).toEqual([ACTION.reveal]);
    expect(view.actions.at(-1)).toMatchObject({ label: "Revelar destino", keep: true });
    expect(view.notice?.text).toMatch(/se envía solo este enlace corto al servicio de OjoLink/);
    expect(view.notice?.action).toMatchObject({ id: ACTION.policy, keep: true });
    expect(view.dismiss).toBe(ACTION.cancel);
  });

  it("hidden, with no resolver: says reveal is not available and offers no reveal", () => {
    const view = hiddenStep(hidden, false);
    expect(ids(view)).toEqual([ACTION.cancel, ACTION.open]);
    expect(view.body).toMatch(/no tiene configurado/);
    expect(view.notice).toBeUndefined();
  });

  it("revealing: busy, with only cancel", () => {
    const view = revealingStep(hidden);
    expect(view.busy).toBe(true);
    expect(ids(view)).toEqual([ACTION.cancel]);
  });

  it("revealed with no warning signs: open or cancel, and never called safe", () => {
    const { verdict } = warningFor("https://www.lostiempos.com/");
    const view = revealedStep(verdict, null);
    expect(view).toMatchObject({
      tone: "clear",
      host: "www.lostiempos.com",
      title: "Sin señales de alerta",
    });
    expect(ids(view)).toEqual([ACTION.cancel, ACTION.open]);
    expect(view.actions.at(-1)?.label).toBe("Abrir");
    expect(`${view.heading} ${view.title} ${view.body}`).not.toMatch(
      /es segur|confiable\b|verificad/i,
    );
    expect(view.body).toMatch(/no garantiza/);
  });

  it("revealed at caution: the reason, open or cancel", () => {
    const { verdict, content } = warningFor("https://netflix-codes.com/");
    const view = revealedStep(verdict, content);
    expect(view).toMatchObject({
      tone: "caution",
      title: content.title,
      host: "netflix-codes.com",
    });
    expect(ids(view)).toEqual([ACTION.cancel, ACTION.open]);
  });

  it("revealed as danger: the danger warning", () => {
    const { verdict, content } = warningFor(DANGER);
    expect(revealedStep(verdict, content)).toEqual(dangerStep(content));
  });

  it("still hidden: says so, and does not offer to reveal again", () => {
    const view = stillHiddenStep("t.co");
    expect(view).toMatchObject({ tone: "hidden", host: "t.co" });
    expect(ids(view)).toEqual([ACTION.cancel, ACTION.open]);
  });

  it.each(["unresolved", "offline", "limited", "unavailable", "error"] as const)(
    "not revealed (%s): caution, and try again only where it can help",
    (reason) => {
      const view = failedStep(reason);
      expect(view.tone).toBe("caution");
      expect(view.heading).toBe("No se pudo revelar el destino");
      expect(ids(view).includes(ACTION.reveal)).toBe(RETRYABLE.includes(reason));
      expect(ids(view)).toContain(ACTION.open);
      expect(ids(view)).toContain(ACTION.cancel);
      expect(`${view.title} ${view.body}`).not.toMatch(/segur/i);
    },
  );

  it("gives every step exactly one main action and a dismissal that opens nothing", () => {
    const { verdict, content } = warningFor(DANGER);
    const views = [
      dangerStep(content),
      hiddenStep(hidden, true),
      hiddenStep(hidden, false),
      revealingStep(hidden),
      revealedStep(verdict, content),
      revealedStep(warningFor("https://www.lostiempos.com/").verdict, null),
      stillHiddenStep("t.co"),
      failedStep("offline"),
      failedStep("unresolved"),
    ];
    for (const view of views) {
      expect(primary(view), view.heading).toHaveLength(1);
      expect([ACTION.back, ACTION.cancel]).toContain(view.dismiss);
      expect(ids(view)).toContain(view.dismiss);
    }
  });
});

describe("tones", () => {
  const luminance = (hex: string) => {
    const [r = 0, g = 0, b = 0] = [1, 3, 5].map((at) => {
      const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  it("meets AA contrast in every text and button of every tone", () => {
    expect(Object.keys(DIALOG_COLORS)).toEqual(
      expect.arrayContaining(TONE_NAMES.map((tone) => `heading-${tone}`)),
    );
    for (const [part, { text, fill }] of Object.entries(DIALOG_COLORS)) {
      const [high = 0, low = 0] = [luminance(text), luminance(fill)].sort((x, y) => y - x);
      expect((high + 0.05) / (low + 0.05), part).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("gives each tone an icon and a heading color of its own", () => {
    expect(TONE_NAMES).toEqual(["danger", "hidden", "caution", "clear"]);
    expect(new Set(TONE_NAMES.map((tone) => toneIcon(tone).join())).size).toBe(4);
    expect(new Set(TONE_NAMES.map((tone) => DIALOG_COLORS[`heading-${tone}`]?.text)).size).toBe(4);
  });
});
