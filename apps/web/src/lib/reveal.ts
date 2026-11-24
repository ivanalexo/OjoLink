export type FailureReason = "unresolved" | "offline" | "limited" | "deep-unavailable" | "error";

export type RevealOutcome =
  | { readonly kind: "revealed"; readonly destination: string; readonly hops: readonly string[] }
  | { readonly kind: "failed"; readonly reason: FailureReason; readonly deepOffered: boolean };

export type Reveal = (shortLink: string, options: { deep: boolean }) => Promise<RevealOutcome>;

export type Send = (input: string, init: RequestInit) => Promise<Response>;

export const TIMEOUT_MS = 12_000;
export const DEEP_TIMEOUT_MS = 30_000;

const WORTH_A_BROWSER = new Set(["no-redirect", "shortener-error", "timeout"]);

function failed(reason: FailureReason, deepOffered = false): RevealOutcome {
  return { kind: "failed", reason, deepOffered };
}

function webAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function read(answer: unknown, deep: boolean): RevealOutcome {
  if (typeof answer !== "object" || answer === null) return failed("error");
  const { status, destination, hops, reason } = answer as Record<string, unknown>;
  if (status === "resolved") {
    const address = webAddress(destination);
    const path = Array.isArray(hops) ? hops.filter((hop) => typeof hop === "string") : [];
    return address ? { kind: "revealed", destination: address, hops: path } : failed("error");
  }
  if (status !== "unresolved") return failed("error");
  if (reason === "deep-unavailable") return failed("deep-unavailable", true);
  return failed("unresolved", !deep && typeof reason === "string" && WORTH_A_BROWSER.has(reason));
}

/**
 * The only place where the app talks to the network. It sends one short link to the OjoLink
 * resolver and nothing else: no cookies, no referrer, no other part of the pasted text.
 */
export function createReveal(
  resolver: string,
  send: Send = (input, init) => fetch(input, init),
  online: () => boolean = () => navigator.onLine,
): Reveal {
  return async (shortLink, { deep }) => {
    if (!online()) return failed("offline");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deep ? DEEP_TIMEOUT_MS : TIMEOUT_MS);
    try {
      const response = await send(`${resolver}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deep ? { url: shortLink, deep: true } : { url: shortLink }),
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status === 429) return failed("limited");
      if (!response.ok) return failed("error");
      return read(await response.json(), deep);
    } catch {
      return failed(online() ? "error" : "offline");
    } finally {
      clearTimeout(timer);
    }
  };
}
