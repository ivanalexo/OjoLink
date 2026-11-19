import { normalizeUrl } from "./normalize.js";

const SEPARATORS = /[\s<>"«»“”‘’`]+/u;
const SCHEME = /https?:\/\//gi;
const LEADING_PUNCTUATION = /^[([{¿¡'*_~-]+/;
const TRAILING_PUNCTUATION = ".,;:!?…'*_~";
const GLUE = ",;|)]}";
const OPENING: Readonly<Record<string, string>> = { ")": "(", "]": "[", "}": "{" };

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

/** Removes sentence punctuation and unmatched closing brackets from the end of a candidate. */
function trimEnd(candidate: string): string {
  let text = candidate;
  for (;;) {
    const last = text.at(-1);
    if (last === undefined) return text;
    const opening = OPENING[last];
    const unmatched = opening !== undefined && count(text, last) > count(text, opening);
    if (!TRAILING_PUNCTUATION.includes(last) && !unmatched) return text;
    text = text.slice(0, -1);
  }
}

function startsWithCapital(label: string): boolean {
  const first = Array.from(label)[0] ?? "";
  return first !== first.toLowerCase();
}

/** Rejects scheme-less text that is an email address, a number, or two sentences run together. */
function looksLikeBareLink(candidate: string): boolean {
  const end = candidate.search(/[/?#]/);
  const authority = end === -1 ? candidate : candidate.slice(0, end);
  if (authority.includes("@")) return false;

  const host = authority.replace(/:\d*$/, "");
  if (!host.includes(".") || /^[\d.]+$/.test(host)) return false;

  const labels = host.split(".");
  const last = labels.at(-1) ?? "";
  const previous = labels.at(-2) ?? "";
  return !(startsWithCapital(last) && !startsWithCapital(previous));
}

function candidatesIn(token: string): string[] {
  const starts: number[] = [];
  for (const match of token.matchAll(SCHEME)) {
    const glued = GLUE.includes(token[match.index - 1] ?? "");
    if (starts.length === 0 || glued) starts.push(match.index);
  }
  if (starts.length > 0) {
    return starts.map((start, position) => trimEnd(token.slice(start, starts[position + 1])));
  }
  const bare = trimEnd(token.replace(LEADING_PUNCTUATION, ""));
  return looksLikeBareLink(bare) ? [bare] : [];
}

/** Finds the links in free text, as written and in order, each one once. Never throws. */
export function extractUrls(text: string): string[] {
  if (typeof text !== "string") return [];

  const found = new Map<string, string>();
  for (const token of text.split(SEPARATORS)) {
    if (!token.includes(".")) continue;
    for (const candidate of candidatesIn(token)) {
      const result = normalizeUrl(candidate);
      if (result.ok && !found.has(result.url.href)) found.set(result.url.href, candidate);
    }
  }
  return [...found.values()];
}
