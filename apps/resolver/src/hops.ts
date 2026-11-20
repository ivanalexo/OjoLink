import { contactable, isWeb, parseUrl } from "./allow.ts";
import { findRedirect } from "./html.ts";
import { HOP_TIMEOUT_MS, MAX_PAGE_BYTES, MAX_REQUESTS, TOTAL_TIMEOUT_MS } from "./limits.ts";

export type Method = "redirect" | "html";

export type Reason =
  | "no-redirect"
  | "too-many-hops"
  | "loop"
  | "unsupported-destination"
  | "shortener-error"
  | "timeout";

export type Resolution =
  | { status: "resolved"; destination: string; hops: string[]; method: Method }
  | { status: "unresolved"; reason: Reason; hops: string[] };

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export interface ResolveDeps {
  fetch: Fetcher;
  now: () => number;
}

export const OUTGOING_HEADERS: Readonly<Record<string, string>> = {
  "User-Agent": "OjoLink-Resolver/1.0",
  Accept: "text/html",
};

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const TIMED_OUT = Symbol("timed out");

type Step = { target: string; method: Method } | { reason: Reason };

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

async function readStart(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_PAGE_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes.subarray(0, MAX_PAGE_BYTES));
}

async function ask(url: URL, fetcher: Fetcher, signal: AbortSignal): Promise<Step> {
  const response = await fetcher(url.href, {
    method: "GET",
    redirect: "manual",
    headers: { ...OUTGOING_HEADERS },
    signal,
  });
  if (REDIRECTS.has(response.status)) {
    await discard(response);
    const target = response.headers.get("Location");
    return target ? { target, method: "redirect" } : { reason: "no-redirect" };
  }
  if (!response.ok) {
    await discard(response);
    return { reason: "shortener-error" };
  }
  if (!/^text\/html\b/i.test(response.headers.get("Content-Type") ?? "")) {
    await discard(response);
    return { reason: "no-redirect" };
  }
  const target = findRedirect(await readStart(response));
  return target ? { target, method: "html" } : { reason: "no-redirect" };
}

async function askWithin(url: URL, fetcher: Fetcher, ms: number): Promise<Step> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<typeof TIMED_OUT>((settle) => {
    timer = setTimeout(() => {
      controller.abort();
      settle(TIMED_OUT);
    }, ms);
  });
  try {
    const work = ask(url, fetcher, controller.signal).catch((): Step => ({
      reason: "shortener-error",
    }));
    const step = await Promise.race([work, expired]);
    return step === TIMED_OUT ? { reason: "timeout" } : step;
  } finally {
    clearTimeout(timer);
  }
}

/** Follows a short link through listed hosts only and returns the first target outside the list. */
export async function resolve(start: URL, deps: ResolveDeps): Promise<Resolution> {
  const hops: string[] = [];
  const deadline = deps.now() + TOTAL_TIMEOUT_MS;
  const stop = (reason: Reason): Resolution => ({ status: "unresolved", reason, hops });
  let method: Method = "redirect";
  let current = start;

  for (;;) {
    if (hops.includes(current.href)) return stop("loop");
    if (hops.length >= MAX_REQUESTS) return stop("too-many-hops");
    const remaining = deadline - deps.now();
    if (remaining <= 0) return stop("timeout");

    hops.push(current.href);
    const step = await askWithin(current, deps.fetch, Math.min(HOP_TIMEOUT_MS, remaining));
    if ("reason" in step) return stop(step.reason);
    if (step.method === "html") method = "html";

    const next = parseUrl(step.target, current);
    if (!next || !isWeb(next)) return stop("unsupported-destination");
    if (!contactable(next)) return { status: "resolved", destination: next.href, hops, method };
    current = next;
  }
}
