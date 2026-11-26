import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/handler.ts";
import {
  DEEP_RATE_LIMIT,
  DEEP_TIMEOUT_MS,
  RATE_LIMIT,
  RESOLVED_TTL_SECONDS,
  STABLE_TTL_SECONDS,
} from "../src/limits.ts";
import { describeDuration } from "../src/policy.ts";
import {
  browserThat,
  deps,
  limiterFor,
  memoryCache,
  navigation,
  page,
  post,
  redirect,
  shorteners,
  status,
} from "./helpers.ts";

const SHORT = "https://bit.ly/3xYz";
const DESTINATION = "https://example.org/oferta";
const one = () => shorteners({ [SHORT]: redirect(DESTINATION) });
const request = (method: string, path: string) =>
  new Request(`https://resolver.test${path}`, { method });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /resolve", () => {
  it("answers a resolved link with its destination, hops, and method", async () => {
    const response = await handle(post(SHORT), deps(one()));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toMatch(/^application\/json/);
    expect(await response.json()).toEqual({
      status: "resolved",
      destination: DESTINATION,
      hops: [SHORT],
      method: "redirect",
    });
  });

  it("answers an unresolved link with a reason and no risk level", async () => {
    const fake = shorteners({ [SHORT]: page("<html></html>") });
    const response = await handle(post(SHORT), deps(fake));
    expect(response.status).toBe(200);
    const answer = (await response.json()) as Record<string, unknown>;
    expect(answer).toEqual({ status: "unresolved", reason: "no-redirect", hops: [SHORT] });
    expect(Object.keys(answer)).not.toContain("level");
  });

  it.each([
    ["a host outside the list", post("https://example.org/pagina"), 403, "host-not-allowed"],
    ["a lookalike of a listed host", post("https://notbit.ly/abc"), 403, "host-not-allowed"],
    ["another scheme", post("ftp://bit.ly/abc"), 400, "invalid-request"],
    ["credentials", post("https://user@bit.ly/abc"), 400, "invalid-request"],
    ["a port", post("https://bit.ly:8443/abc"), 400, "invalid-request"],
    ["a missing url", post(undefined), 400, "invalid-request"],
    [
      "a body that is not JSON",
      new Request("https://resolver.test/resolve", { method: "POST", body: "hola" }),
      400,
      "invalid-request",
    ],
    [
      "a very large body",
      new Request("https://resolver.test/resolve", { method: "POST", body: " ".repeat(5000) }),
      400,
      "invalid-request",
    ],
  ])("rejects %s without contacting anyone", async (_name, incoming, code, error) => {
    const fake = one();
    const limiter = limiterFor();
    const response = await handle(incoming, deps(fake, { limiter }));
    expect(response.status).toBe(code);
    expect(await response.json()).toEqual({ error });
    expect(fake.calls).toEqual([]);
    expect(limiter.keys).toEqual([]);
  });

  it.each([
    ["another path", request("GET", "/"), 404, "not-found"],
    ["a path under resolve", request("POST", "/resolve/x"), 404, "not-found"],
    ["GET on resolve", request("GET", "/resolve"), 405, "method-not-allowed"],
    ["DELETE on resolve", request("DELETE", "/resolve"), 405, "method-not-allowed"],
  ])("answers %s with an error and contacts no host", async (_name, incoming, code, error) => {
    const fake = one();
    const response = await handle(incoming, deps(fake));
    expect(response.status).toBe(code);
    expect(await response.json()).toEqual({ error });
    expect(fake.calls).toEqual([]);
  });

  it("passes nothing of the caller on to the shortener", async () => {
    const fake = one();
    await handle(
      post(SHORT, {
        Cookie: "sesion=secreta",
        "User-Agent": "Mozilla/5.0 (persona real)",
        "X-Forwarded-For": "203.0.113.7",
        Referer: "https://correo.example/bandeja",
        Authorization: "Bearer secreto",
      }),
      deps(fake),
    );
    expect(fake.calls[0]?.headers).toEqual({
      "user-agent": "OjoLink-Resolver/1.0",
      accept: "text/html",
    });
    expect(JSON.stringify(fake.calls[0])).not.toMatch(/203\.0\.113\.7|secret|Mozilla|correo/);
  });
});

describe("browser access", () => {
  const allowed = (response: Response) => ({
    origin: response.headers.get("Access-Control-Allow-Origin"),
    methods: response.headers.get("Access-Control-Allow-Methods"),
    headers: response.headers.get("Access-Control-Allow-Headers"),
  });
  const expected = { origin: "*", methods: "POST, OPTIONS", headers: "Content-Type" };

  it("grants the preliminary request without contacting a shortener", async () => {
    const fake = one();
    const response = await handle(request("OPTIONS", "/resolve"), deps(fake));
    expect(response.status).toBe(204);
    expect(allowed(response)).toEqual(expected);
    expect(fake.calls).toEqual([]);
  });

  it("puts the allow headers on answers and on errors", async () => {
    expect(allowed(await handle(post(SHORT), deps(one())))).toEqual(expected);
    expect(allowed(await handle(post("https://example.org/"), deps(one())))).toEqual(expected);
    const limiter = limiterFor(["203.0.113.7"]);
    expect(allowed(await handle(post(SHORT), deps(one(), { limiter })))).toEqual(expected);
  });

  it("sets no cookie", async () => {
    const response = await handle(post(SHORT), deps(one()));
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });
});

describe("limit per address", () => {
  it("answers 429 with a retry time and contacts no shortener", async () => {
    const fake = one();
    const cache = memoryCache();
    const limiter = limiterFor(["203.0.113.7"]);
    const response = await handle(post(SHORT), deps(fake, { limiter, cache }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe(String(RATE_LIMIT.period));
    expect(await response.json()).toEqual({ error: "rate-limited" });
    expect(fake.calls).toEqual([]);
  });

  it("serves another address normally", async () => {
    const limiter = limiterFor(["203.0.113.7"]);
    const other = post(SHORT, { "CF-Connecting-IP": "198.51.100.9" });
    const response = await handle(other, deps(one(), { limiter }));
    expect(response.status).toBe(200);
    expect(limiter.keys).toEqual(["198.51.100.9"]);
  });

  it("applies the limit before a cached answer", async () => {
    const cache = memoryCache();
    await handle(post(SHORT), deps(one(), { cache }));
    const limiter = limiterFor(["203.0.113.7"]);
    const response = await handle(post(SHORT), deps(one(), { cache, limiter }));
    expect(response.status).toBe(429);
  });

  it("matches the limit written in the Worker's configuration", () => {
    const config = JSON.parse(
      readFileSync(new URL("../wrangler.json", import.meta.url), "utf8"),
    ) as {
      observability: { enabled: boolean };
      browser: { binding: string };
      send_metrics: boolean;
      ratelimits: { name: string; simple: { limit: number; period: number } }[];
    };
    expect(config.ratelimits).toHaveLength(2);
    expect(config.ratelimits[0]).toMatchObject({ name: "LIMITER", simple: RATE_LIMIT });
    expect(config.ratelimits[1]).toMatchObject({ name: "DEEP_LIMITER", simple: DEEP_RATE_LIMIT });
    expect(DEEP_RATE_LIMIT.limit).toBeLessThan(RATE_LIMIT.limit);
    expect(config.browser).toEqual({ binding: "BROWSER" });
    expect(config.observability.enabled).toBe(false);
    expect(config.send_metrics).toBe(false);
  });
});

describe("cache by short URL", () => {
  it("serves a repeated request without contacting the shortener", async () => {
    const fake = one();
    const cache = memoryCache();
    const first = await (await handle(post(SHORT), deps(fake, { cache }))).json();
    const second = await (await handle(post(`${SHORT}#otra`), deps(fake, { cache }))).json();
    expect(second).toEqual(first);
    expect(fake.calls).toHaveLength(1);
  });

  it("keeps only the answer, under the short URL, for one hour", async () => {
    const cache = memoryCache();
    await handle(post(SHORT, { Cookie: "sesion=secreta" }), deps(one(), { cache }));
    expect([...cache.entries.keys()]).toEqual([SHORT]);
    const entry = cache.entries.get(SHORT);
    expect(entry?.ttl).toBe(RESOLVED_TTL_SECONDS);
    expect(JSON.parse(entry?.answer ?? "")).toEqual({
      status: "resolved",
      destination: DESTINATION,
      hops: [SHORT],
      method: "redirect",
    });
    expect(entry?.answer).not.toMatch(/203\.0\.113\.7|secreta/);
  });

  it("keeps a stable unresolved answer for ten minutes", async () => {
    const cache = memoryCache();
    await handle(post(SHORT), deps(shorteners({ [SHORT]: page("<html></html>") }), { cache }));
    expect(cache.entries.get(SHORT)?.ttl).toBe(STABLE_TTL_SECONDS);
  });

  it.each([
    ["a shortener error", status(500)],
    ["a network failure", () => Promise.reject(new TypeError("fallo de red"))],
  ])("does not keep %s and asks again", async (_name, answer) => {
    const fake = shorteners({ [SHORT]: answer });
    const cache = memoryCache();
    await handle(post(SHORT), deps(fake, { cache }));
    await handle(post(SHORT), deps(fake, { cache }));
    expect(cache.entries.size).toBe(0);
    expect(fake.calls).toHaveLength(2);
  });

  it("does not keep a timeout", async () => {
    vi.useFakeTimers();
    const fake = shorteners({ [SHORT]: () => new Promise<Response>(() => undefined) });
    const cache = memoryCache();
    const pending = handle(post(SHORT), deps(fake, { cache }));
    await vi.advanceTimersByTimeAsync(4000);
    expect(await (await pending).json()).toMatchObject({ reason: "timeout" });
    expect(cache.entries.size).toBe(0);
    vi.useRealTimers();
  });

  it("still answers when the cache fails", async () => {
    const cache = {
      get: () => Promise.reject(new Error("sin caché")),
      put: () => Promise.reject(new Error("sin caché")),
    };
    const response = await handle(post(SHORT), deps(one(), { cache }));
    expect(await response.json()).toMatchObject({ status: "resolved" });
  });
});

describe("no record of URLs", () => {
  const METHODS = ["log", "info", "warn", "error", "debug", "trace"] as const;
  const spies = () =>
    METHODS.map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));
  const written = (all: ReturnType<typeof spies>) =>
    all.flatMap((spy) => spy.mock.calls.map((call) => call.map(String).join(" ")));

  it("writes nothing for resolved, unresolved, and rejected requests", async () => {
    const all = spies();
    await handle(post(SHORT), deps(one()));
    await handle(post(SHORT), deps(shorteners({ [SHORT]: status(500) })));
    await handle(post("https://example.org/pagina"), deps(one()));
    await handle(post(SHORT), deps(one(), { limiter: limiterFor(["203.0.113.7"]) }));
    expect(written(all)).toEqual([]);
  });

  it("names the kind of an unexpected failure and no URL", async () => {
    const all = spies();
    const limiter = { allow: () => Promise.reject(new RangeError(`fallo con ${SHORT}`)) };
    const response = await handle(post(SHORT), deps(one(), { limiter }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal" });
    expect(written(all)).toEqual(["resolver failure: RangeError"]);
  });
});

describe("privacy policy", () => {
  it("is served in Spanish and states the times the code uses", async () => {
    const response = await handle(request("GET", "/privacidad"), deps(one()));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toMatch(/^text\/html/);
    const html = await response.text();
    expect(html).toContain('<html lang="es">');
    expect(describeDuration(RESOLVED_TTL_SECONDS)).toBe("1 hora");
    expect(describeDuration(STABLE_TTL_SECONDS)).toBe("10 minutos");
    expect(describeDuration(RATE_LIMIT.period)).toBe("1 minuto");
    expect(html).toContain("durante 1 hora cuando");
    expect(html).toContain("o 10 minutos cuando");
    expect(html).toContain(`hasta ${RATE_LIMIT.limit} cada 1 minuto`);
    for (const phrase of [
      "Solo el enlace corto",
      "nunca sale de tu dispositivo",
      "No guardamos registros",
      "Análisis profundo",
      "tampoco visita el destino",
      "Cloudflare Workers",
    ]) {
      expect(html).toContain(phrase);
    }
  });

  it("covers the browser extension: what stays on the device and the one thing it sends", async () => {
    const html = await (await handle(request("GET", "/privacidad"), deps(one()))).text();
    for (const phrase of [
      "La extensión del navegador",
      "en tu equipo",
      "Los dominios que decides proteger",
      "no se sincronizan",
      "«Revelar destino»",
      "ese enlace y nada más",
      "viene apagado",
      "No vendemos ni compartimos datos",
      "no mostramos publicidad",
      "no pedimos una cuenta",
      "la app web y para la extensión",
    ]) {
      expect(html, phrase).toContain(phrase);
    }
  });

  it("fits in under a page", async () => {
    const html = await (await handle(request("GET", "/privacidad"), deps(one()))).text();
    const words = html
      .replace(/<style>[\s\S]*<\/style>/, "")
      .replace(/<[^>]+>/g, " ")
      .trim()
      .split(/\s+/);
    expect(words.length).toBeLessThan(480);
  });
});

describe("deep resolution on request", () => {
  const CODE = "https://t.co/abc";
  const byCode = () =>
    shorteners({ [CODE]: page('<script>location.href = base + "/x";</script>') });
  const found = () => browserThat([navigation(DESTINATION)]);
  const deep = (url: string, headers: Record<string, string> = {}) =>
    post(url, headers, { deep: true });
  const answerOf = async (response: Response) => (await response.json()) as Record<string, unknown>;

  it.each([["yes"], [1], [null], [{}]])("rejects a deep value of %j", async (value) => {
    const browser = found();
    const response = await handle(post(CODE, {}, { deep: value }), deps(byCode(), { browser }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid-request" });
    expect(browser.opened).toEqual([]);
  });

  it.each([[{}], [{ deep: false }]])("never starts a browser for %j", async (extra) => {
    const browser = found();
    const response = await handle(post(CODE, {}, extra), deps(byCode(), { browser }));
    expect(await response.json()).toEqual({
      status: "unresolved",
      reason: "no-redirect",
      hops: [CODE],
    });
    expect(browser.opened).toEqual([]);
  });

  it("reveals a redirect made by code with the headless method", async () => {
    const browser = found();
    const response = await handle(deep(CODE), deps(byCode(), { browser }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "resolved",
      destination: DESTINATION,
      hops: [CODE],
      method: "headless",
    });
    expect(browser.closed).toBe(1);
  });

  it("tries the browser after a shortener error", async () => {
    const browser = found();
    const fake = shorteners({ [CODE]: status(403) });
    const response = await handle(deep(CODE), deps(fake, { browser }));
    expect(await response.json()).toMatchObject({ status: "resolved", method: "headless" });
  });

  it("starts no browser for a link that redirects plainly", async () => {
    const browser = found();
    const deepLimiter = limiterFor();
    const response = await handle(deep(SHORT), deps(one(), { browser, deepLimiter }));
    expect(await response.json()).toMatchObject({ status: "resolved", method: "redirect" });
    expect(browser.opened).toEqual([]);
    expect(deepLimiter.keys).toEqual([]);
  });

  it.each([
    [
      "a loop",
      {
        "https://bit.ly/a": redirect("https://bit.ly/b"),
        "https://bit.ly/b": redirect("https://bit.ly/a"),
      },
      "loop",
    ],
    [
      "too many hops",
      Object.fromEntries(
        [1, 2, 3, 4, 5].map((n) => [`https://bit.ly/${n}`, redirect(`https://bit.ly/${n + 1}`)]),
      ),
      "too-many-hops",
    ],
    [
      "a target that is not a web address",
      { "https://bit.ly/a": redirect("javascript:alert(1)") },
      "unsupported-destination",
    ],
  ])("starts no browser after %s", async (_name, table, reason) => {
    const browser = found();
    const first = Object.keys(table)[0] ?? "";
    const response = await handle(deep(first), deps(shorteners(table), { browser }));
    expect(await response.json()).toMatchObject({ status: "unresolved", reason });
    expect(browser.opened).toEqual([]);
  });

  it("opens the last hop reached and lists every address", async () => {
    const fake = shorteners({
      "https://bit.ly/a": redirect(CODE),
      [CODE]: page("<html><body>Espera</body></html>"),
    });
    const browser = found();
    const response = await handle(deep("https://bit.ly/a"), deps(fake, { browser }));
    expect(await response.json()).toEqual({
      status: "resolved",
      destination: DESTINATION,
      hops: ["https://bit.ly/a", CODE],
      method: "headless",
    });
    expect(browser.opened[0]?.[0]).toBe(CODE);
  });

  it("passes nothing of the caller to the browser", async () => {
    const browser = found();
    const headers = { Cookie: "sesion=secreta", "User-Agent": "Mozilla/5.0 (persona real)" };
    await handle(deep(CODE, headers), deps(byCode(), { browser }));
    expect(browser.opened).toHaveLength(1);
    expect(browser.opened[0]).toHaveLength(2);
    expect(browser.opened[0]?.[0]).toBe(CODE);
    expect(browser.opened[0]?.[1]).toBeTypeOf("function");
  });

  it("answers deep-unavailable when the browser cannot start, and keeps nothing of it", async () => {
    const browser = browserThat([], { open: () => Promise.reject(new Error("429")) });
    const cache = memoryCache();
    const fake = byCode();
    const response = await handle(deep(CODE), deps(fake, { browser, cache }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "unresolved",
      reason: "deep-unavailable",
      hops: [CODE],
    });
    expect(cache.entries.get(CODE)?.answer).toContain("no-redirect");

    const again = await handle(deep(CODE), deps(fake, { browser: found(), cache }));
    expect(await again.json()).toMatchObject({ status: "resolved", method: "headless" });
  });

  it("does not keep a deep timeout", async () => {
    vi.useFakeTimers();
    const cache = memoryCache();
    const browser = browserThat([]);
    const pending = handle(deep(CODE), deps(byCode(), { browser, cache }));
    await vi.advanceTimersByTimeAsync(DEEP_TIMEOUT_MS);
    expect(await answerOf(await pending)).toMatchObject({ reason: "timeout" });
    expect(cache.entries.get(CODE)?.answer).toContain("no-redirect");
    expect(browser.closed).toBe(1);
    vi.useRealTimers();
  });

  it("serves a destination found by the browser from the cache, deep or not", async () => {
    const cache = memoryCache();
    const fake = byCode();
    await handle(deep(CODE), deps(fake, { browser: found(), cache }));
    expect(cache.entries.get(CODE)?.ttl).toBe(RESOLVED_TTL_SECONDS);

    const browser = found();
    const again = await answerOf(await handle(deep(CODE), deps(fake, { browser, cache })));
    const plain = await answerOf(await handle(post(CODE), deps(fake, { browser, cache })));
    expect(again).toMatchObject({ destination: DESTINATION, method: "headless" });
    expect(plain).toEqual(again);
    expect(browser.opened).toEqual([]);
    expect(fake.calls).toHaveLength(1);
  });

  it("reaches the browser over a cached unresolved answer", async () => {
    const cache = memoryCache();
    const fake = byCode();
    await handle(post(CODE), deps(fake, { cache }));
    expect(cache.entries.get(CODE)?.answer).toContain("no-redirect");
    const browser = found();
    const response = await handle(deep(CODE), deps(fake, { browser, cache }));
    expect(await response.json()).toMatchObject({ status: "resolved", method: "headless" });
    expect(browser.opened).toHaveLength(1);
  });

  it("applies the deep limit only when a browser is about to start", async () => {
    const browser = found();
    const deepLimiter = limiterFor(["203.0.113.7"]);
    const response = await handle(deep(CODE), deps(byCode(), { browser, deepLimiter }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe(String(DEEP_RATE_LIMIT.period));
    expect(await response.json()).toEqual({ error: "rate-limited" });
    expect(browser.opened).toEqual([]);

    const plain = await handle(post(CODE), deps(byCode(), { browser, deepLimiter }));
    expect(plain.status).toBe(200);
    const other = deep(CODE, { "CF-Connecting-IP": "198.51.100.9" });
    expect((await handle(other, deps(byCode(), { browser, deepLimiter }))).status).toBe(200);
    expect(deepLimiter.keys).toEqual(["203.0.113.7", "198.51.100.9"]);
  });

  it("writes no URL for a deep success, a deep timeout, or a browser failure", async () => {
    vi.useFakeTimers();
    const spies = (["log", "info", "warn", "error", "debug", "trace"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    await handle(deep(CODE), deps(byCode(), { browser: found() }));
    const failing = browserThat([], {
      open: () => Promise.reject(new Error(`fallo con ${CODE}`)),
    });
    await handle(deep(CODE), deps(byCode(), { browser: failing }));
    const pending = handle(deep(CODE), deps(byCode(), { browser: browserThat([]) }));
    await vi.advanceTimersByTimeAsync(DEEP_TIMEOUT_MS);
    await pending;
    expect(spies.flatMap((spy) => spy.mock.calls)).toEqual([]);
    vi.useRealTimers();
  });
});
