import type { HostingService, LureWord } from "../data/index.js";
import type { NormalizedUrl } from "../normalize.js";
import { editDistance } from "./distance.js";
import type { Signal } from "./types.js";

export type HostingDetails = {
  readonly service: string;
  readonly host: string;
  readonly publisherName: string;
  readonly words: readonly string[];
};

export interface HostedPage {
  readonly service: HostingService;
  readonly publisherName: string;
}

const FUZZY_MIN_LENGTH = 8;
const OWN_SITE = "www";
const MANY_WORDS = 3;

function variantFor(found: readonly LureWord[]): string {
  if (found.length === 0) return "plain";
  if (found.length === 1) return "one-word";
  const enough = found.length >= MANY_WORDS || found.some((word) => word.brand);
  return enough ? "words" : "two-words";
}

function simplify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Finds lure words in a name, including words run together and long words off by one letter.
 * Returns each word once, in order of appearance.
 */
export function findLureWords(name: string, lureWords: readonly LureWord[]): LureWord[] {
  const text = simplify(name);
  const covered = new Array<boolean>(text.length).fill(false);
  const found: { index: number; word: LureWord }[] = [];
  const byLength = [...lureWords].sort((a, b) => b.match.length - a.match.length);

  const free = (start: number, length: number) =>
    start >= 0 &&
    start + length <= text.length &&
    !covered.slice(start, start + length).some(Boolean);
  const take = (start: number, length: number, word: LureWord) => {
    covered.fill(true, start, start + length);
    found.push({ index: start, word });
  };

  const missing: LureWord[] = [];
  for (const word of byLength) {
    let matched = false;
    for (let at = text.indexOf(word.match); at !== -1; at = text.indexOf(word.match, at + 1)) {
      if (!free(at, word.match.length)) continue;
      take(at, word.match.length, word);
      matched = true;
    }
    if (!matched) missing.push(word);
  }

  for (const word of missing) {
    const length = word.match.length;
    if (length < FUZZY_MIN_LENGTH) continue;
    search: for (const size of [length, length - 1, length + 1]) {
      for (let start = 0; start + size <= text.length; start++) {
        if (!free(start, size)) continue;
        if (editDistance(text.slice(start, start + size), word.match, 1) === 1) {
          take(start, size, word);
          break search;
        }
      }
    }
  }

  const ordered = found.sort((a, b) => a.index - b.index).map((entry) => entry.word);
  return [...new Set(ordered)];
}

/** Builds the signal for pages on services where anyone can publish. */
export function createHostingSignal(
  services: readonly HostingService[],
  lureWords: readonly LureWord[],
): Signal & { match(url: NormalizedUrl): HostedPage | null } {
  const bySubdomain = new Map<string, HostingService>();
  const byPath = new Map<string, HostingService[]>();
  for (const service of services) {
    if (service.assignment === "subdomain") bySubdomain.set(service.host, service);
    else byPath.set(service.host, [...(byPath.get(service.host) ?? []), service]);
  }

  function match(url: NormalizedUrl): HostedPage | null {
    if (url.isIp) return null;
    const host = url.asciiHost;

    for (const service of byPath.get(host) ?? []) {
      const path = new URL(url.href).pathname;
      const prefix = service.prefix ?? "/";
      if (!path.startsWith(prefix)) continue;
      const publisherName = decode(path.slice(prefix.length).split("/")[0] ?? "");
      if (publisherName !== "") return { service, publisherName };
    }

    const labels = url.labels;
    for (let start = 1; start < labels.length - 1; start++) {
      const service = bySubdomain.get(host.split(".").slice(start).join("."));
      if (!service) continue;
      const publisherName = labels.slice(0, start).join(".");
      return publisherName === OWN_SITE ? null : { service, publisherName };
    }
    return null;
  }

  return {
    id: "hosting",
    kind: "risk",
    variants: ["plain", "one-word", "two-words", "words"],
    match,
    evaluate(url) {
      const page = match(url);
      if (!page) return null;

      const found = findLureWords(page.publisherName, lureWords);
      const words = found.map((word) => word.shown);
      const details: HostingDetails = {
        service: page.service.name,
        host: page.service.host,
        publisherName: page.publisherName,
        words,
      };
      return {
        variant: variantFor(found),
        params: {
          service: page.service.name,
          host: page.service.host,
          publisherName: page.publisherName,
          words: words.map((word) => `«${word}»`).join(", "),
          count: words.length,
        },
        details,
      };
    },
  };
}
