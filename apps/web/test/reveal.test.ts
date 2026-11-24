import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkText, type CheckedLink } from "../src/lib/check";
import { isInstalled, isIos } from "../src/lib/platform";
import {
  createReveal,
  DEEP_TIMEOUT_MS,
  TIMEOUT_MS,
  type Reveal,
  type RevealOutcome,
} from "../src/lib/reveal";
import { AUTOMATIC_LIMIT, settle, startReveals, type RevealStates } from "../src/lib/reveals";
import { parseLink, parseOrigin, readSettings } from "../src/lib/settings";
import { appRoot, isShareRoute, readShared } from "../src/lib/share";
import { contentSecurityPolicyFor, resolverOrigin } from "../vite.config";

const RESOLVER = "https://resolver.example";
const SHORT = "https://bit.ly/3xYz";
const cp = (...values: number[]) => String.fromCodePoint(...values);
const FAKE_BCP = `https://b${cp(0x0441, 0x0440)}.com.bo/validar`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function sender(answer: () => Response | Promise<Response>) {
  const calls: { input: string; init: RequestInit }[] = [];
  const send = async (input: string, init: RequestInit) => {
    calls.push({ input, init });
    return answer();
  };
  return { calls, send };
}

function items(text: string): readonly CheckedLink[] {
  const outcome = checkText(text);
  if (outcome.kind !== "results") throw new Error("no results");
  return outcome.items;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("build settings", () => {
  it.each([
    ["https://resolver.example", "https://resolver.example"],
    ["https://resolver.example/", "https://resolver.example"],
    [" https://resolver.example/ruta?x=1 ", "https://resolver.example"],
    ["http://localhost:8787", "http://localhost:8787"],
    ["http://127.0.0.1:8787/", "http://127.0.0.1:8787"],
  ])("reads the origin of %j", (value, origin) => {
    expect(parseOrigin(value)).toBe(origin);
  });

  it.each([
    undefined,
    "",
    "   ",
    "resolver.example",
    "http://resolver.example",
    "ftp://resolver.example",
    "https://user:clave@resolver.example",
    "javascript:alert(1)",
    42,
  ])("returns null for %j", (value) => {
    expect(parseOrigin(value)).toBeNull();
    expect(parseLink(value)).toBeNull();
  });

  it("reads both settings from the build environment", () => {
    expect(readSettings({})).toEqual({ resolver: null, shortcut: null });
    expect(
      readSettings({
        VITE_RESOLVER_URL: "https://resolver.example/",
        VITE_IOS_SHORTCUT_URL: "https://www.icloud.com/shortcuts/abc",
      }),
    ).toEqual({
      resolver: "https://resolver.example",
      shortcut: "https://www.icloud.com/shortcuts/abc",
    });
  });
});

describe("content security policy", () => {
  it("allows no other origin when there is no resolver", () => {
    expect(contentSecurityPolicyFor(null)).toContain("connect-src 'self';");
    expect(contentSecurityPolicyFor(null)).not.toMatch(/https?:/);
  });

  it("allows only the resolver's origin when there is one", () => {
    const policy = contentSecurityPolicyFor(resolverOrigin("https://resolver.example/x"));
    expect(policy).toContain("connect-src 'self' https://resolver.example;");
    expect(policy.match(/https?:\/\/[^\s;]+/g)).toEqual(["https://resolver.example"]);
    expect(policy).toContain("script-src 'self'");
  });

  it("builds with no setting and fails on a malformed one", () => {
    expect(resolverOrigin(undefined)).toBeNull();
    expect(resolverOrigin("  ")).toBeNull();
    expect(() => resolverOrigin("resolver.example")).toThrow(/VITE_RESOLVER_URL/);
    expect(() => resolverOrigin("http://resolver.example")).toThrow(/VITE_RESOLVER_URL/);
  });
});

describe("asking the resolver", () => {
  const resolved = { status: "resolved", destination: "https://example.org/oferta", hops: [SHORT] };

  it("sends the short link and nothing else", async () => {
    const { calls, send } = sender(() => json(resolved));
    await createReveal(RESOLVER, send, () => true)(SHORT, { deep: false });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("https://resolver.example/resolve");
    expect(calls[0]?.init).toMatchObject({
      method: "POST",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
    });
    expect(calls[0]?.init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ url: SHORT });
  });

  it("marks a deep request and gives it more time", async () => {
    vi.useFakeTimers();
    const { calls, send } = sender(() => new Promise<Response>(() => undefined));
    const ask = createReveal(RESOLVER, send, () => true);
    void ask(SHORT, { deep: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ url: SHORT, deep: true });
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    expect(calls[0]?.init.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(DEEP_TIMEOUT_MS - TIMEOUT_MS);
    expect(calls[0]?.init.signal?.aborted).toBe(true);
  });

  it("gives up on an ordinary request after its time limit", async () => {
    vi.useFakeTimers();
    const send = (_input: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const pending = createReveal(RESOLVER, send, () => true)(SHORT, { deep: false });
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    expect(await pending).toEqual({ kind: "failed", reason: "error", deepOffered: false });
  });

  const ask = (answer: () => Response | Promise<Response>, deep = false) =>
    createReveal(RESOLVER, sender(answer).send, () => true)(SHORT, { deep });

  it("returns the destination of a resolved answer", async () => {
    expect(await ask(() => json(resolved))).toEqual({
      kind: "revealed",
      destination: "https://example.org/oferta",
      hops: [SHORT],
    });
  });

  it.each(["no-redirect", "shortener-error", "timeout"])(
    "offers a deep analysis after an ordinary %s",
    async (reason) => {
      const answer = () => json({ status: "unresolved", reason, hops: [SHORT] });
      expect(await ask(answer)).toEqual({
        kind: "failed",
        reason: "unresolved",
        deepOffered: true,
      });
      expect(await ask(answer, true)).toEqual({
        kind: "failed",
        reason: "unresolved",
        deepOffered: false,
      });
    },
  );

  it.each(["loop", "too-many-hops", "unsupported-destination"])(
    "does not offer a deep analysis after %s",
    async (reason) => {
      const answer = () => json({ status: "unresolved", reason, hops: [SHORT] });
      expect(await ask(answer)).toEqual({
        kind: "failed",
        reason: "unresolved",
        deepOffered: false,
      });
    },
  );

  it.each<[string, () => Response | Promise<Response>, RevealOutcome]>([
    [
      "the limit",
      () => json({ error: "rate-limited" }, 429),
      { kind: "failed", reason: "limited", deepOffered: false },
    ],
    [
      "deep unavailable",
      () => json({ status: "unresolved", reason: "deep-unavailable", hops: [SHORT] }),
      { kind: "failed", reason: "deep-unavailable", deepOffered: true },
    ],
    [
      "a rejected request",
      () => json({ error: "host-not-allowed" }, 403),
      { kind: "failed", reason: "error", deepOffered: false },
    ],
    [
      "a server failure",
      () => json({ error: "internal" }, 500),
      { kind: "failed", reason: "error", deepOffered: false },
    ],
    [
      "a network failure",
      () => Promise.reject(new TypeError("Failed to fetch")),
      { kind: "failed", reason: "error", deepOffered: false },
    ],
    [
      "an answer that is not JSON",
      () => new Response("<html>", { status: 200 }),
      { kind: "failed", reason: "error", deepOffered: false },
    ],
    [
      "an unknown shape",
      () => json({ ok: true }),
      { kind: "failed", reason: "error", deepOffered: false },
    ],
    [
      "a destination that is a script",
      () => json({ status: "resolved", destination: "javascript:alert(1)", hops: [] }),
      { kind: "failed", reason: "error", deepOffered: false },
    ],
    [
      "a destination that is not text",
      () => json({ status: "resolved", destination: { href: "https://example.org/" } }),
      { kind: "failed", reason: "error", deepOffered: false },
    ],
  ])("maps %s", async (_name, answer, expected) => {
    expect(await ask(answer)).toEqual(expected);
  });

  it("makes no request when offline", async () => {
    const { calls, send } = sender(() => json(resolved));
    const outcome = await createReveal(RESOLVER, send, () => false)(SHORT, { deep: false });
    expect(outcome).toEqual({ kind: "failed", reason: "offline", deepOffered: false });
    expect(calls).toEqual([]);
  });

  it("reports offline when the connection drops during the request", async () => {
    let online = true;
    const send = () => {
      online = false;
      return Promise.reject(new TypeError("Failed to fetch"));
    };
    const outcome = await createReveal(RESOLVER, send, () => online)(SHORT, { deep: false });
    expect(outcome).toMatchObject({ reason: "offline" });
  });

  it("is the only source file that reaches the network, with one fixed payload", () => {
    const source = readFileSync(join(process.cwd(), "src", "lib", "reveal.ts"), "utf8");
    expect(source.match(/\bfetch\s*\(/g)).toHaveLength(1);
    expect(source.match(/JSON\.stringify\((.*)\),$/m)?.[1]).toBe(
      "deep ? { url: shortLink, deep: true } : { url: shortLink }",
    );
    expect(source).toContain('credentials: "omit"');
    expect(source).toContain('referrerPolicy: "no-referrer"');
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|sendBeacon/);
  });
});

describe("short link of each result", () => {
  it("gives the short link the engine read", () => {
    expect(items(SHORT)[0]?.shortLink).toBe(SHORT);
  });

  it("gives the inner short link of a wrapped one", () => {
    const wrapped = `https://nam02.safelinks.protection.outlook.com/?url=${encodeURIComponent(SHORT)}&data=x`;
    const [item] = items(wrapped);
    expect(item?.link).toBe(wrapped);
    expect(item?.shortLink).toBe(SHORT);
  });

  it("gives none for other links, or for a short link that is already dangerous", () => {
    expect(items("https://www.lostiempos.com/")[0]?.shortLink).toBeNull();
    expect(items(FAKE_BCP)[0]?.shortLink).toBeNull();
  });

  it("keeps one result for a repeated link", () => {
    const found = items(`Mira ${SHORT} y otra vez ${SHORT} y https://example.org/`);
    expect(found.map((item) => item.link)).toEqual([SHORT, "https://example.org/"]);
  });
});

describe("revealing the short links of an analysis", () => {
  const destination = (link: string): RevealOutcome => ({
    kind: "revealed",
    destination: `https://example.org/${link.split("/").pop()}`,
    hops: [link],
  });

  function fake(answer: (link: string, deep: boolean) => RevealOutcome | Promise<RevealOutcome>) {
    const calls: [string, boolean][] = [];
    const reveal: Reveal = async (link, { deep }) => {
      calls.push([link, deep]);
      return answer(link, deep);
    };
    return { calls, reveal };
  }

  const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("starts the first five by itself and leaves the rest to a button", async () => {
    const links = Array.from({ length: 8 }, (_, index) => `https://bit.ly/n${index}`);
    const { calls, reveal } = fake(destination);
    let latest: RevealStates = [];
    const reveals = startReveals(items(links.join(" ")), reveal, (states) => (latest = states));
    expect(reveals.states.map((state) => state?.kind)).toEqual([
      ...Array(AUTOMATIC_LIMIT).fill("waiting"),
      "manual",
      "manual",
      "manual",
    ]);
    await settled();
    expect(calls.map(([link]) => link)).toEqual(links.slice(0, AUTOMATIC_LIMIT));
    expect(latest.map((state) => state?.kind)).toEqual([
      ...Array(AUTOMATIC_LIMIT).fill("revealed"),
      "manual",
      "manual",
      "manual",
    ]);

    await reveals.request(6, false);
    expect(calls.at(-1)).toEqual([links[6], false]);
    expect(reveals.states[6]?.kind).toBe("revealed");
  });

  it("asks once for a short link that arrives inside two different links", async () => {
    const wrapped = `https://nam02.safelinks.protection.outlook.com/?url=${encodeURIComponent(SHORT)}&data=x`;
    const { calls, reveal } = fake(destination);
    const reveals = startReveals([...items(SHORT), ...items(wrapped)], reveal, () => undefined);
    await settled();
    expect(calls).toEqual([[SHORT, false]]);
    expect(reveals.states.map((state) => state?.kind)).toEqual(["revealed", "revealed"]);
  });

  it("leaves ordinary links alone", async () => {
    const { calls, reveal } = fake(destination);
    const reveals = startReveals(
      items(`https://example.org/ ${FAKE_BCP}`),
      reveal,
      () => undefined,
    );
    await settled();
    expect(calls).toEqual([]);
    expect(reveals.states).toEqual([null, null]);
  });

  it("does nothing when there is no resolver", async () => {
    const reveals = startReveals(items(SHORT), null, () => undefined);
    await reveals.request(0, false);
    expect(reveals.states).toEqual([null]);
  });

  it("ignores an answer that arrives after a new analysis started", async () => {
    let release: (outcome: RevealOutcome) => void = () => undefined;
    const { reveal } = fake(() => new Promise<RevealOutcome>((resolve) => (release = resolve)));
    const changes: RevealStates[] = [];
    const reveals = startReveals(items(SHORT), reveal, (states) => changes.push(states));
    await settled();
    reveals.cancel();
    release(destination(SHORT));
    await settled();
    expect(changes).toHaveLength(1);
    expect(reveals.states[0]?.kind).toBe("waiting");
  });

  it("sends a deep request only when asked", async () => {
    const { calls, reveal } = fake((_link, deep) =>
      deep ? destination(SHORT) : { kind: "failed", reason: "unresolved", deepOffered: true },
    );
    const reveals = startReveals(items(SHORT), reveal, () => undefined);
    await settled();
    expect(calls).toEqual([[SHORT, false]]);
    expect(reveals.states[0]).toEqual({ kind: "failed", reason: "unresolved", deepOffered: true });
    await reveals.request(0, true);
    expect(calls).toEqual([
      [SHORT, false],
      [SHORT, true],
    ]);
    expect(reveals.states[0]?.kind).toBe("revealed");
  });
});

describe("verdict of a revealed destination", () => {
  it("analyzes the destination on the device", () => {
    const state = settle({ kind: "revealed", destination: FAKE_BCP, hops: [SHORT] });
    expect(state).toMatchObject({ kind: "revealed", destination: FAKE_BCP });
    expect(state.kind === "revealed" && state.description.level).toBe("danger");
  });

  it("never promotes a destination that is still hidden", () => {
    expect(
      settle({ kind: "revealed", destination: "https://tinyurl.com/abc", hops: [SHORT] }),
    ).toEqual({ kind: "failed", reason: "unresolved", deepOffered: false });
  });

  it("passes a failure through", () => {
    const failure: RevealOutcome = { kind: "failed", reason: "limited", deepOffered: false };
    expect(settle(failure)).toEqual(failure);
  });
});

describe("shared content", () => {
  it.each([
    ["/analizar", true],
    ["/app/analizar", true],
    ["/analizar/", true],
    ["/", false],
    ["/analizar-otro", false],
    ["/otro/analizar/x", false],
  ])("recognizes the share route in %s: %s", (pathname, expected) => {
    expect(isShareRoute(pathname)).toBe(expected);
  });

  it("finds the app's start page from the share route", () => {
    expect(appRoot("/analizar")).toBe("/");
    expect(appRoot("/app/analizar/")).toBe("/app/");
  });

  const shared = (fields: Record<string, string>) =>
    readShared(`?${new URLSearchParams(fields).toString()}`);
  const linksOf = (text: string) => {
    const outcome = checkText(text);
    return outcome.kind === "results" ? outcome.items.map((item) => item.link) : [];
  };

  it("finds a link that is only inside the text", () => {
    const text = shared({ text: `Mira esto ${SHORT}` });
    expect(text).toBe(`Mira esto ${SHORT}`);
    expect(linksOf(text)).toEqual([SHORT]);
  });

  it("keeps one result for the same link in text and url", () => {
    const text = shared({ text: `Mira esto ${SHORT}`, url: SHORT });
    expect(text).toBe(`Mira esto ${SHORT}`);
    expect(linksOf(text)).toEqual([SHORT]);
  });

  it("keeps different links from different fields, in order", () => {
    const text = shared({
      url: "https://example.org/tercero",
      text: `Oferta ${SHORT}`,
      title: "Aviso https://example.org/primero",
    });
    expect(linksOf(text)).toEqual([
      "https://example.org/primero",
      SHORT,
      "https://example.org/tercero",
    ]);
  });

  it("returns the shared text when it has no link, and nothing when no field arrives", () => {
    expect(shared({ title: "Hola", text: "sin enlaces" })).toBe("Hola\nsin enlaces");
    expect(linksOf("Hola\nsin enlaces")).toEqual([]);
    expect(readShared("")).toBe("");
    expect(shared({ text: "   ", otro: "https://example.org/" })).toBe("");
  });
});

describe("platform", () => {
  const media = (matches: boolean) => ({
    matchMedia: (() => ({ matches })) as unknown as Window["matchMedia"],
  });

  it("knows when it runs as an installed app", () => {
    expect(isInstalled(media(true))).toBe(true);
    expect(isInstalled(media(false))).toBe(false);
    expect(isInstalled({})).toBe(false);
  });

  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1", 5, true],
    ["Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Safari/604.1", 5, true],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 5, true],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 0, false],
    ["Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/131.0 Mobile Safari/537.36", 5, false],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36", 0, false],
  ])("detects iOS in %s with %i touch points: %s", (userAgent, maxTouchPoints, expected) => {
    expect(isIos({ userAgent, maxTouchPoints })).toBe(expected);
  });
});
