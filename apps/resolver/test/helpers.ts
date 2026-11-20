import type { AnswerCache, HandlerDeps, Limiter } from "../src/handler.ts";
import type { Fetcher } from "../src/hops.ts";

type Answer = () => Response | Promise<Response>;

export interface Call {
  url: string;
  host: string;
  headers: Record<string, string>;
  init: RequestInit;
}

export interface Shorteners {
  fetch: Fetcher;
  calls: Call[];
  hosts(): string[];
}

export function redirect(location: string, status = 302): Answer {
  return () => new Response(null, { status, headers: { Location: location } });
}

export function page(html: string, type = "text/html; charset=utf-8"): Answer {
  return () => new Response(html, { headers: { "Content-Type": type } });
}

export function status(code: number): Answer {
  return () => new Response("x", { status: code });
}

export function shorteners(table: Record<string, Answer>): Shorteners {
  const calls: Call[] = [];
  return {
    calls,
    hosts: () => calls.map((call) => call.host),
    fetch: async (url, init) => {
      const headers = Object.fromEntries(new Headers(init.headers).entries());
      calls.push({ url, host: new URL(url).hostname, headers, init });
      const answer = table[url];
      if (!answer) throw new Error("no simulated answer");
      return answer();
    },
  };
}

export function memoryCache(): AnswerCache & {
  entries: Map<string, { answer: string; ttl: number }>;
} {
  const entries = new Map<string, { answer: string; ttl: number }>();
  return {
    entries,
    get: async (key) => entries.get(key)?.answer ?? null,
    put: async (key, answer, ttl) => void entries.set(key, { answer, ttl }),
  };
}

export function limiterFor(blocked: string[] = []): Limiter & { keys: string[] } {
  const keys: string[] = [];
  return {
    keys,
    allow: async (key) => {
      keys.push(key);
      return !blocked.includes(key);
    },
  };
}

export function deps(fake: Shorteners, extra: Partial<HandlerDeps> = {}): HandlerDeps {
  return {
    fetch: fake.fetch,
    now: () => Date.now(),
    limiter: limiterFor(),
    cache: memoryCache(),
    ...extra,
  };
}

export function post(url: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://resolver.test/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.7", ...headers },
    body: JSON.stringify({ url }),
  });
}
