import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/handler.ts";
import { RATE_LIMIT, RESOLVED_TTL_SECONDS, STABLE_TTL_SECONDS } from "../src/limits.ts";
import { describeDuration } from "../src/policy.ts";
import {
  deps,
  limiterFor,
  memoryCache,
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
      send_metrics: boolean;
      ratelimits: { name: string; simple: { limit: number; period: number } }[];
    };
    expect(config.ratelimits).toHaveLength(1);
    expect(config.ratelimits[0]).toMatchObject({ name: "LIMITER", simple: RATE_LIMIT });
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
      "Cloudflare Workers",
    ]) {
      expect(html).toContain(phrase);
    }
  });

  it("fits in under a page", async () => {
    const html = await (await handle(request("GET", "/privacidad"), deps(one()))).text();
    const words = html
      .replace(/<style>[\s\S]*<\/style>/, "")
      .replace(/<[^>]+>/g, " ")
      .trim()
      .split(/\s+/);
    expect(words.length).toBeLessThan(350);
  });
});
