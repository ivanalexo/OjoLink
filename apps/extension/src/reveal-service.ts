import { matchShortener } from "@ojolink/core";
import { failed, readOutcome, webAddress, type RevealLink, type RevealOutcome } from "./reveal.ts";

export const REVEAL_MESSAGE = "ojolink:reveal";
export const CACHE_KEY = "revealed";
export const CACHE_LIMIT = 200;
export const CACHE_MS = 30 * 60 * 1000;

export interface RevealRequest {
  readonly type: typeof REVEAL_MESSAGE;
  readonly link: string;
}

export interface Remembered {
  readonly destination: string;
  readonly at: number;
}

/** Memory the browser keeps for the session: never on disk, gone when the browser closes. */
export interface SessionStore {
  read(): Promise<unknown>;
  write(value: Readonly<Record<string, Remembered>>): Promise<void>;
}

export interface RevealService {
  /** Answers a message, or returns null when the message is not a reveal request. */
  handle(message: unknown, senderId: string | undefined): Promise<RevealOutcome> | null;
}

export function isRevealRequest(message: unknown): message is RevealRequest {
  if (typeof message !== "object" || message === null) return false;
  const { type, link } = message as Record<string, unknown>;
  return type === REVEAL_MESSAGE && typeof link === "string";
}

function remembered(value: unknown, now: number): Map<string, Remembered> {
  const entries = new Map<string, Remembered>();
  if (typeof value !== "object" || value === null) return entries;
  for (const [link, entry] of Object.entries(value)) {
    const { destination, at } = (entry ?? {}) as Record<string, unknown>;
    const address = webAddress(destination);
    if (address && typeof at === "number" && now >= at && now - at < CACHE_MS) {
      entries.set(link, { destination: address, at });
    }
  }
  return entries;
}

/**
 * Reveals short links for the page script: only for this extension, only for listed
 * shorteners and trackers, asking the resolver once per link while the answer is remembered.
 */
export function createRevealService(
  ownId: string,
  reveal: RevealLink,
  store: SessionStore,
  now: () => number = () => Date.now(),
): RevealService {
  async function answer(link: string): Promise<RevealOutcome> {
    const address = webAddress(link);
    if (address === null || matchShortener(new URL(address).hostname) === null) {
      return failed("error");
    }

    let entries = new Map<string, Remembered>();
    try {
      entries = remembered(await store.read(), now());
    } catch {
      // No memory this time; ask the resolver.
    }
    const known = entries.get(address);
    if (known) return { kind: "revealed", destination: known.destination };

    const outcome = readOutcome(await reveal(address));
    if (outcome.kind === "revealed") {
      entries.set(address, { destination: outcome.destination, at: now() });
      const kept = [...entries].sort((a, b) => a[1].at - b[1].at).slice(-CACHE_LIMIT);
      try {
        await store.write(Object.fromEntries(kept));
      } catch {
        // The answer is still good; it is just not remembered.
      }
    }
    return outcome;
  }

  return {
    handle(message, senderId) {
      if (!isRevealRequest(message)) return null;
      if (senderId !== ownId) return Promise.resolve(failed("error"));
      return answer(message.link).catch(() => failed("error"));
    },
  };
}

/** What the page script uses to ask the background. It reads only the background's answer. */
export function createPageReveal(send: (message: RevealRequest) => Promise<unknown>): RevealLink {
  return async (link) => {
    try {
      return readOutcome(await send({ type: REVEAL_MESSAGE, link }));
    } catch {
      return failed("error");
    }
  };
}
