import { analyze, describeLevel, type AnalysisResult, type Level } from "@ojolink/core";

export interface LinkVerdict {
  readonly level: Level;
  /** The word of the level, such as "Peligro". */
  readonly label: string;
  /** One sentence with the main reason. */
  readonly reason: string;
  /** The host the link really leads to, after any wrapper is opened. */
  readonly host: string;
}

export interface LinkInput {
  readonly address: string;
  readonly text: string;
}

export type Analyze = (
  address: string,
  options: { context: { visibleText: string } },
) => AnalysisResult;

export const TEXT_LIMIT = 200;
export const CACHE_SIZE = 1000;

const EDITABLE = '[contenteditable]:not([contenteditable="false"])';
const OUTER_SPACES = /^[ \t\r\n]+|[ \t\r\n]+$/g;

function withoutFragment(address: string): string {
  const at = address.indexOf("#");
  return at === -1 ? address : address.slice(0, at);
}

/**
 * What the engine should judge for a link, or null when the link is not checked: no address,
 * not a web address, a place in the same page, or part of a text the person is writing.
 */
export function readLink(anchor: HTMLAnchorElement): LinkInput | null {
  if (!anchor.hasAttribute("href")) return null;
  if (anchor.protocol !== "http:" && anchor.protocol !== "https:") return null;
  if (anchor.isContentEditable || anchor.closest(EDITABLE) !== null) return null;

  const address = anchor.href;
  const page = anchor.ownerDocument.location?.href ?? "";
  if (withoutFragment(address) === withoutFragment(page)) return null;

  const text = (anchor.textContent ?? "").replace(OUTER_SPACES, "").slice(0, TEXT_LIMIT);
  return { address, text };
}

export interface Verdicts {
  /** The verdict of a link, or null when the engine does not analyze it. */
  of(link: LinkInput): LinkVerdict | null;
  readonly size: number;
}

/** Judges links with the engine and remembers the most recently used verdicts. */
export function createVerdicts(engine: Analyze = analyze, limit: number = CACHE_SIZE): Verdicts {
  const cache = new Map<string, LinkVerdict | null>();

  function judge({ address, text }: LinkInput): LinkVerdict | null {
    const result = engine(address, { context: { visibleText: text } });
    if (!result.analyzed) return null;
    const level = describeLevel(result.level);
    return {
      level: result.level,
      label: level.label,
      reason: result.signals[0]?.tooltip ?? level.description,
      host: result.url.host,
    };
  }

  return {
    get size() {
      return cache.size;
    },
    of(link) {
      const key = `${link.address}\n${link.text}`;
      if (cache.has(key)) {
        const known = cache.get(key) ?? null;
        cache.delete(key);
        cache.set(key, known);
        return known;
      }
      const verdict = judge(link);
      cache.set(key, verdict);
      if (cache.size > limit) {
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
      }
      return verdict;
    },
  };
}
