export type FailureReason = "unresolved" | "offline" | "limited" | "unavailable" | "error";

export type RevealOutcome =
  | { readonly kind: "revealed"; readonly destination: string }
  | { readonly kind: "failed"; readonly reason: FailureReason };

/** Asks where a short link leads. Never rejects. */
export type RevealLink = (shortLink: string) => Promise<RevealOutcome>;

export type Send = (input: string, init: RequestInit) => Promise<Response>;

export const TIMEOUT_MS = 12_000;
export const REASONS: readonly FailureReason[] = [
  "unresolved",
  "offline",
  "limited",
  "unavailable",
  "error",
];

export function failed(reason: FailureReason): RevealOutcome {
  return { kind: "failed", reason };
}

/** The address as the browser would open it, or null when it is not a web address. */
export function webAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/** Reads an outcome that crossed a message channel, trusting none of it. */
export function readOutcome(value: unknown): RevealOutcome {
  if (typeof value !== "object" || value === null) return failed("error");
  const { kind, destination, reason } = value as Record<string, unknown>;
  if (kind === "revealed") {
    const address = webAddress(destination);
    return address ? { kind: "revealed", destination: address } : failed("error");
  }
  const known = REASONS.find((candidate) => candidate === reason);
  return failed(kind === "failed" && known ? known : "error");
}

function read(answer: unknown): RevealOutcome {
  if (typeof answer !== "object" || answer === null) return failed("error");
  const { status, destination } = answer as Record<string, unknown>;
  if (status === "resolved") {
    const address = webAddress(destination);
    return address ? { kind: "revealed", destination: address } : failed("error");
  }
  return failed(status === "unresolved" ? "unresolved" : "error");
}

/**
 * The only place where the extension talks to the network. It sends one short link to the
 * OjoLink resolver and nothing else: no cookies, no referrer, nothing about the page.
 */
export function createReveal(
  resolver: string | null,
  send: Send = (input, init) => fetch(input, init),
  online: () => boolean = () => navigator.onLine,
): RevealLink {
  return async (shortLink) => {
    if (resolver === null) return failed("unavailable");
    if (!online()) return failed("offline");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await send(`${resolver}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: shortLink }),
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status === 429) return failed("limited");
      if (!response.ok) return failed("error");
      return read(await response.json());
    } catch {
      return failed(online() ? "error" : "offline");
    } finally {
      clearTimeout(timer);
    }
  };
}
