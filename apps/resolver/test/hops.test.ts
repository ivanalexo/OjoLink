import { afterEach, describe, expect, it, vi } from "vitest";
import { OUTGOING_HEADERS, resolve } from "../src/hops.ts";
import { MAX_PAGE_BYTES } from "../src/limits.ts";
import { page, redirect, shorteners, status } from "./helpers.ts";

const now = () => Date.now();
const run = (url: string, fake: ReturnType<typeof shorteners>) =>
  resolve(new URL(url), { fetch: fake.fetch, now });

afterEach(() => {
  vi.useRealTimers();
});

describe("level 2: redirects", () => {
  it("returns the first target outside the list without contacting it", async () => {
    const fake = shorteners({ "https://bit.ly/3xYz": redirect("https://example.org/oferta") });
    expect(await run("https://bit.ly/3xYz", fake)).toEqual({
      status: "resolved",
      destination: "https://example.org/oferta",
      hops: ["https://bit.ly/3xYz"],
      method: "redirect",
    });
    expect(fake.hosts()).toEqual(["bit.ly"]);
  });

  it.each([301, 302, 303, 307, 308])("reads a %i redirect", async (code) => {
    const fake = shorteners({ "https://bit.ly/a": redirect("https://example.org/", code) });
    expect(await run("https://bit.ly/a", fake)).toMatchObject({ status: "resolved" });
  });

  it("follows a chain of two shorteners", async () => {
    const fake = shorteners({
      "https://bit.ly/a": redirect("https://tinyurl.com/b"),
      "https://tinyurl.com/b": redirect("https://example.org/"),
    });
    expect(await run("https://bit.ly/a", fake)).toEqual({
      status: "resolved",
      destination: "https://example.org/",
      hops: ["https://bit.ly/a", "https://tinyurl.com/b"],
      method: "redirect",
    });
    expect(fake.hosts()).toEqual(["bit.ly", "tinyurl.com"]);
  });

  it("reads a relative redirect against the hop that gave it", async () => {
    const fake = shorteners({
      "https://bit.ly/a": redirect("/b"),
      "https://bit.ly/b": redirect("https://example.org/"),
    });
    expect(await run("https://bit.ly/a", fake)).toMatchObject({
      destination: "https://example.org/",
      hops: ["https://bit.ly/a", "https://bit.ly/b"],
    });
  });

  it.each([
    "https://banco-falso.example.net/login",
    "http://127.0.0.1/admin",
    "http://169.254.169.254/",
    "https://bit.ly:8443/interno",
    "https://user@bit.ly/abc",
  ])("returns %s as the destination and never asks for it", async (target) => {
    const fake = shorteners({ "https://bit.ly/a": redirect(target) });
    expect(await run("https://bit.ly/a", fake)).toMatchObject({
      status: "resolved",
      destination: target,
    });
    expect(fake.calls).toHaveLength(1);
  });

  it("stops after five requests", async () => {
    const fake = shorteners(
      Object.fromEntries(
        [1, 2, 3, 4, 5, 6].map((n) => [`https://bit.ly/${n}`, redirect(`https://bit.ly/${n + 1}`)]),
      ),
    );
    const result = await run("https://bit.ly/1", fake);
    expect(result).toMatchObject({ status: "unresolved", reason: "too-many-hops" });
    expect(result.hops).toHaveLength(5);
    expect(fake.calls).toHaveLength(5);
  });

  it("stops on a loop", async () => {
    const fake = shorteners({
      "https://bit.ly/a": redirect("https://tinyurl.com/b"),
      "https://tinyurl.com/b": redirect("https://bit.ly/a"),
    });
    expect(await run("https://bit.ly/a", fake)).toEqual({
      status: "unresolved",
      reason: "loop",
      hops: ["https://bit.ly/a", "https://tinyurl.com/b"],
    });
    expect(fake.calls).toHaveLength(2);
  });

  it.each(["javascript:alert(1)", "data:text/html,hola", "intent://abrir#Intent;end", "http://"])(
    "does not return %s as a destination",
    async (target) => {
      const fake = shorteners({ "https://bit.ly/a": redirect(target) });
      expect(await run("https://bit.ly/a", fake)).toEqual({
        status: "unresolved",
        reason: "unsupported-destination",
        hops: ["https://bit.ly/a"],
      });
    },
  );

  it.each([
    ["an error status", status(500)],
    ["a blocked request", status(403)],
    ["a missing link", status(404)],
    ["a network failure", () => Promise.reject(new TypeError("fallo de red"))],
  ])("reports %s as a shortener error", async (_name, answer) => {
    const fake = shorteners({ "https://bit.ly/a": answer });
    expect(await run("https://bit.ly/a", fake)).toMatchObject({ reason: "shortener-error" });
  });

  it("reports a redirect with no target as no redirect", async () => {
    const fake = shorteners({ "https://bit.ly/a": () => new Response(null, { status: 302 }) });
    expect(await run("https://bit.ly/a", fake)).toMatchObject({ reason: "no-redirect" });
  });

  it("gives up on a shortener that never answers", async () => {
    vi.useFakeTimers();
    const fake = shorteners({ "https://bit.ly/a": () => new Promise<Response>(() => undefined) });
    const pending = run("https://bit.ly/a", fake);
    await vi.advanceTimersByTimeAsync(3999);
    expect(fake.calls[0]?.init.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({
      status: "unresolved",
      reason: "timeout",
      hops: ["https://bit.ly/a"],
    });
    expect(fake.calls[0]?.init.signal?.aborted).toBe(true);
  });

  it("gives up when the whole resolution takes over eight seconds", async () => {
    vi.useFakeTimers();
    const slow = (location: string) => () =>
      new Promise<Response>((settle) =>
        setTimeout(() => settle(redirect(location)() as Response), 3000),
      );
    const fake = shorteners({
      "https://bit.ly/1": slow("https://bit.ly/2"),
      "https://bit.ly/2": slow("https://bit.ly/3"),
      "https://bit.ly/3": slow("https://example.org/"),
    });
    const pending = run("https://bit.ly/1", fake);
    await vi.advanceTimersByTimeAsync(8000);
    const result = await pending;
    expect(result).toMatchObject({ status: "unresolved", reason: "timeout" });
    expect(result.hops).toHaveLength(3);
  });

  it("sends only its own fixed headers and follows no redirect by itself", async () => {
    const fake = shorteners({ "https://bit.ly/a": redirect("https://example.org/") });
    await run("https://bit.ly/a", fake);
    expect(fake.calls[0]?.headers).toEqual({
      "user-agent": OUTGOING_HEADERS["User-Agent"],
      accept: "text/html",
    });
    expect(fake.calls[0]?.init).toMatchObject({ method: "GET", redirect: "manual" });
    expect(fake.calls[0]?.init.body).toBeUndefined();
  });
});

describe("level 3: redirects written in a page", () => {
  it("resolves a meta refresh with the html method", async () => {
    const fake = shorteners({
      "https://t.co/abc": page(
        '<html><head><meta http-equiv="refresh" content="0; url=https://example.org/"></head></html>',
      ),
    });
    expect(await run("https://t.co/abc", fake)).toEqual({
      status: "resolved",
      destination: "https://example.org/",
      hops: ["https://t.co/abc"],
      method: "html",
    });
    expect(fake.hosts()).toEqual(["t.co"]);
  });

  it("resolves a location assigned in a script", async () => {
    const fake = shorteners({
      "https://t.co/abc": page('<script>window.location.href = "https://example.org/";</script>'),
    });
    expect(await run("https://t.co/abc", fake)).toMatchObject({
      destination: "https://example.org/",
      method: "html",
    });
  });

  it("continues when the target in the page is another listed shortener", async () => {
    const fake = shorteners({
      "https://t.co/abc": page('<meta http-equiv="refresh" content="0;url=https://bit.ly/b">'),
      "https://bit.ly/b": redirect("https://example.org/"),
    });
    expect(await run("https://t.co/abc", fake)).toEqual({
      status: "resolved",
      destination: "https://example.org/",
      hops: ["https://t.co/abc", "https://bit.ly/b"],
      method: "html",
    });
  });

  it("reads a relative target in a page against the hop", async () => {
    const fake = shorteners({
      "https://t.co/abc": page('<meta http-equiv="refresh" content="0;url=/otra">'),
      "https://t.co/otra": redirect("https://example.org/"),
    });
    expect(await run("https://t.co/abc", fake)).toMatchObject({
      hops: ["https://t.co/abc", "https://t.co/otra"],
    });
  });

  it.each([
    ["a page with no redirect", page("<html><body>Hola</body></html>")],
    ["a target built by code", page('<script>location.href = base + "/x";</script>')],
    [
      "an answer that is not HTML",
      page(
        '{"url":"<meta http-equiv=refresh content=0;url=https://example.org/>"}',
        "application/json",
      ),
    ],
  ])("reports %s as no redirect", async (_name, answer) => {
    const fake = shorteners({ "https://bit.ly/a": answer });
    expect(await run("https://bit.ly/a", fake)).toEqual({
      status: "unresolved",
      reason: "no-redirect",
      hops: ["https://bit.ly/a"],
    });
  });

  it("reads only the start of a very large page", async () => {
    const chunk = new TextEncoder().encode("x".repeat(16 * 1024));
    let pulled = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulled += 1;
          controller.enqueue(chunk);
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const fake = shorteners({
      "https://bit.ly/a": () => new Response(body, { headers: { "Content-Type": "text/html" } }),
    });
    expect(await run("https://bit.ly/a", fake)).toMatchObject({ reason: "no-redirect" });
    expect(pulled * chunk.byteLength).toBeLessThanOrEqual(MAX_PAGE_BYTES + chunk.byteLength);
    expect(cancelled).toBe(true);
  });

  it("ignores a redirect written after the read limit", async () => {
    const html =
      "<!-- " +
      "x".repeat(MAX_PAGE_BYTES) +
      ' --><meta http-equiv="refresh" content="0;url=https://example.org/">';
    const fake = shorteners({ "https://bit.ly/a": page(html) });
    expect(await run("https://bit.ly/a", fake)).toMatchObject({ reason: "no-redirect" });
  });
});
