import type { ProtectedPack, Shortener } from "../data/index.js";
import { extractUrls } from "../extract.js";
import { normalizeUrl, type NormalizedUrl } from "../normalize.js";
import { stripInvisible } from "./invisible.js";
import { buildProtectedIndex, ownerOf } from "./protected-index.js";
import { matchShortener } from "./shortener.js";
import type { Signal } from "./types.js";

export type LinkMismatchDetails = {
  /** The registrable domain the visible text shows. */
  readonly shown: string;
  /** The registrable domain the link leads to. */
  readonly real: string;
  /** Who owns the shown domain, when it is protected. */
  readonly entity: string | null;
};

export interface LinkMismatchOptions {
  /** True when the destination cannot be read; another signal reports those. */
  readonly isHidden?: (url: NormalizedUrl) => boolean;
}

const TEXT_LIMIT = 500;
/** Endings that are public suffixes and, far more often, the end of a file name. */
const FILE_ENDINGS = new Set(["zip", "mov", "app", "md", "sh", "py", "rs", "pl", "so", "cc", "ai"]);

function domainOf(url: NormalizedUrl): string {
  return url.registrableDomain ?? url.asciiHost;
}

function isFileName(written: string, url: NormalizedUrl): boolean {
  return (
    url.schemeAssumed &&
    url.labels.length === 2 &&
    !/[/?#]/.test(written) &&
    FILE_ENDINGS.has(url.publicSuffix ?? "")
  );
}

/** The web addresses a person can read in a link's text, in order. */
function addressesIn(text: string): NormalizedUrl[] {
  const found: NormalizedUrl[] = [];
  for (const written of extractUrls(stripInvisible(text.slice(0, TEXT_LIMIT)))) {
    const result = normalizeUrl(written);
    if (!result.ok) continue;
    const { url } = result;
    if (!url.suffixKnown || url.isIp || url.registrableDomain === null) continue;
    if (isFileName(written, url)) continue;
    found.push(url);
  }
  return found;
}

/**
 * Builds the signal for a link whose visible text shows the address of one site while the
 * link leads to another, such as "outlook.com/verificar" on a link to an unrelated page.
 */
export function createLinkMismatchSignal(
  packs: readonly ProtectedPack[],
  shorteners: readonly Shortener[],
  userDomains?: readonly string[],
  options: LinkMismatchOptions = {},
): Signal {
  const index = buildProtectedIndex(packs, userDomains);

  return {
    id: "link-text-mismatch",
    kind: "risk",
    variants: ["brand", "other"],
    evaluate(url, context) {
      const text = context.visibleText;
      if (typeof text !== "string" || !text.includes(".")) return null;

      const shownAddresses = addressesIn(text);
      const [first] = shownAddresses;
      if (!first) return null;
      if (options.isHidden?.(url)) return null;

      const real = domainOf(url);
      if (shownAddresses.some((address) => domainOf(address) === real)) return null;
      if (matchShortener(first.asciiHost, shorteners)) return null;

      const owner = ownerOf(index, first.asciiHost);
      if (owner && ownerOf(index, url.asciiHost)?.entity === owner.entity) return null;

      const shown = domainOf(first);
      const details: LinkMismatchDetails = { shown, real, entity: owner?.entity ?? null };
      return owner
        ? { variant: "brand", params: { shown, real, entity: owner.entity }, details }
        : { variant: "other", params: { shown, real }, details };
    },
  };
}
