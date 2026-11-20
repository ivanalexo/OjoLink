import { validateRequest } from "./allow.ts";
import { resolve, type Fetcher, type Resolution } from "./hops.ts";
import { MAX_BODY_LENGTH, RATE_LIMIT, RESOLVED_TTL_SECONDS, STABLE_TTL_SECONDS } from "./limits.ts";
import { policyPage } from "./policy.ts";

export interface Limiter {
  allow(key: string): Promise<boolean>;
}

export interface AnswerCache {
  get(key: string): Promise<string | null>;
  put(key: string, answer: string, ttlSeconds: number): Promise<void>;
}

export interface HandlerDeps {
  fetch: Fetcher;
  now: () => number;
  limiter: Limiter;
  cache: AnswerCache;
}

const CORS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function failure(status: number, error: string, headers?: Record<string, string>): Response {
  return json(status, JSON.stringify({ error }), headers);
}

function ttlFor(answer: Resolution): number {
  if (answer.status === "resolved") return RESOLVED_TTL_SECONDS;
  return answer.reason === "timeout" || answer.reason === "shortener-error"
    ? 0
    : STABLE_TTL_SECONDS;
}

async function resolveRequest(request: Request, deps: HandlerDeps): Promise<Response> {
  const body = await request.text();
  if (body.length > MAX_BODY_LENGTH) return failure(400, "invalid-request");
  const checked = validateRequest(body);
  if (!checked.ok) return failure(checked.error === "invalid-request" ? 400 : 403, checked.error);

  const address = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!(await deps.limiter.allow(address))) {
    return failure(429, "rate-limited", { "Retry-After": String(RATE_LIMIT.period) });
  }

  const key = checked.url.href;
  const cached = await deps.cache.get(key).catch(() => null);
  if (cached !== null) return json(200, cached);

  const answer = await resolve(checked.url, deps);
  const text = JSON.stringify(answer);
  const ttl = ttlFor(answer);
  if (ttl > 0) await deps.cache.put(key, text, ttl).catch(() => undefined);
  return json(200, text);
}

/** Answers one request to the resolver. Nothing here writes a URL to a log. */
export async function handle(request: Request, deps: HandlerDeps): Promise<Response> {
  try {
    const { pathname } = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (pathname === "/privacidad" && request.method === "GET") {
      return new Response(policyPage(), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Content-Language": "es" },
      });
    }
    if (pathname !== "/resolve") return failure(404, "not-found");
    if (request.method !== "POST") return failure(405, "method-not-allowed", { Allow: "POST" });
    return await resolveRequest(request, deps);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("resolver failure:", error instanceof Error ? error.name : "unknown");
    return failure(500, "internal");
  }
}
