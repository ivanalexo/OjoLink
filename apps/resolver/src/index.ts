import { handle, type AnswerCache, type Limiter } from "./handler.ts";

interface Env {
  LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

function cacheKey(key: string): Request {
  return new Request(`https://cache.ojolink.invalid/resolve?u=${encodeURIComponent(key)}`);
}

function edgeCache(): AnswerCache {
  const store = (globalThis as unknown as { caches: { default: EdgeCache } }).caches.default;
  return {
    async get(key) {
      const hit = await store.match(cacheKey(key));
      return hit ? await hit.text() : null;
    },
    async put(key, answer, ttlSeconds) {
      const headers = { "Cache-Control": `public, max-age=${ttlSeconds}` };
      await store.put(cacheKey(key), new Response(answer, { headers }));
    },
  };
}

function edgeLimiter(env: Env): Limiter {
  return {
    async allow(key) {
      return (await env.LIMITER.limit({ key })).success;
    },
  };
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, {
      fetch: (url, init) => fetch(url, init),
      now: () => Date.now(),
      limiter: edgeLimiter(env),
      cache: edgeCache(),
    });
  },
};
