import type { LureWord, ProtectedPack } from "../data/index.js";
import type { NormalizedUrl } from "../normalize.js";
import { editDistance } from "./distance.js";
import { findLureWords } from "./hosting.js";
import { buildProtectedIndex, type BrandName } from "./protected-index.js";
import type { Signal } from "./types.js";

export type CombosquatDetails = {
  readonly entity: string;
  readonly imitated: string;
  readonly word: string;
  readonly inSubdomain: boolean;
  readonly words: readonly string[];
};

export interface CombosquatOptions {
  /** True for hosts where anyone can publish; another signal judges those. */
  readonly isHosted?: (url: NormalizedUrl) => boolean;
  /** Signals that name the brand they think a host imitates; this one stays silent when they do. */
  readonly others?: readonly Signal[];
}

interface Candidate {
  readonly brand: BrandName;
  readonly inSubdomain: boolean;
  readonly joined: LureWord | null;
}

const JOINED_MIN_LENGTH = 8;
const MIN_PART_LENGTH = 3;
const FUZZY_MIN_LENGTH = 8;

/**
 * Builds the signal for a protected brand's name used as a word in a domain that is not
 * the brand's, such as `netflix-pago.com`.
 */
export function createCombosquatSignal(
  packs: readonly ProtectedPack[],
  lureWords: readonly LureWord[],
  userDomains?: readonly string[],
  options: CombosquatOptions = {},
): Signal {
  const index = buildProtectedIndex(packs, userDomains);
  const plainLures = lureWords.filter((word) => !word.brand);
  const lureByMatch = new Map(plainLures.map((word) => [word.match, word]));

  function lureFor(text: string): LureWord | null {
    const exact = lureByMatch.get(text);
    if (exact) return exact;
    if (text.length < FUZZY_MIN_LENGTH - 1) return null;
    for (const word of plainLures) {
      const length = word.match.length;
      if (length < FUZZY_MIN_LENGTH || Math.abs(length - text.length) > 1) continue;
      if (editDistance(text, word.match, 1) === 1) return word;
    }
    return null;
  }

  function strong(name: string): BrandName | null {
    const brand = index.byName.get(name);
    return brand && !brand.common && !brand.short ? brand : null;
  }

  /** A brand joined to a lure word with nothing between them. */
  function joined(word: string): Candidate | null {
    if (word.length < JOINED_MIN_LENGTH) return null;
    for (let at = MIN_PART_LENGTH; at <= word.length - MIN_PART_LENGTH; at++) {
      const left = word.slice(0, at);
      const right = word.slice(at);
      const first = strong(left);
      const firstLure = first ? lureFor(right) : null;
      if (first && firstLure) return { brand: first, inSubdomain: false, joined: firstLure };
      const last = strong(right);
      const lastLure = last ? lureFor(left) : null;
      if (last && lastLure) return { brand: last, inSubdomain: false, joined: lastLure };
    }
    return null;
  }

  function longest(candidates: readonly Candidate[]): Candidate | null {
    let best: Candidate | null = null;
    for (const candidate of candidates) {
      if (best === null || candidate.brand.name.length > best.brand.name.length) best = candidate;
    }
    return best;
  }

  return {
    id: "combosquat",
    kind: "risk",
    variants: ["brand", "lure"],
    evaluate(url, context) {
      const realDomain = url.registrableDomain;
      const suffix = url.publicSuffix;
      if (url.isIp || realDomain === null || suffix === null) return null;
      if (index.domains.has(realDomain)) return null;
      if (index.suffixes.some((group) => group.suffix === suffix)) return null;
      if (options.isHosted?.(url)) return null;

      const labels = url.asciiHost.split(".");
      const nameAt = labels.length - suffix.split(".").length - 1;
      if (nameAt < 0) return null;
      const words = (labels[nameAt] ?? "").split("-").filter((word) => word !== "");
      const subdomainWords = labels.slice(0, nameAt).flatMap((label) => label.split("-"));

      const [only] = words;
      if (words.length === 1 && only !== undefined && index.byName.has(only)) return null;

      const inName: Candidate[] = [];
      for (const word of words) {
        const brand = index.byName.get(word);
        if (brand) inName.push({ brand, inSubdomain: false, joined: null });
        else {
          const match = joined(word);
          if (match) inName.push(match);
        }
      }
      const inSubdomain: Candidate[] = [];
      if (inName.length === 0) {
        for (const word of subdomainWords) {
          const brand = index.byName.get(word);
          if (brand) inSubdomain.push({ brand, inSubdomain: true, joined: null });
        }
      }
      const found = longest(inName) ?? longest(inSubdomain);
      if (!found) return null;

      const { brand } = found;
      const lures = new Map<string, LureWord>();
      if (found.joined) lures.set(found.joined.match, found.joined);
      for (const word of [...subdomainWords, ...words]) {
        if (word === brand.name) continue;
        for (const lure of findLureWords(word, plainLures)) lures.set(lure.match, lure);
      }

      const needsLure = found.inSubdomain || brand.common || brand.short;
      if (lures.size === 0 && needsLure) return null;

      for (const other of options.others ?? []) {
        if (other.evaluate(url, context)?.details?.entity === brand.entry.entity) return null;
      }

      const shown = [...lures.values()].map((word) => word.shown);
      const details: CombosquatDetails = {
        entity: brand.entry.entity,
        imitated: brand.entry.domain,
        word: brand.name,
        inSubdomain: found.inSubdomain,
        words: shown,
      };
      return {
        variant: shown.length > 0 ? "lure" : "brand",
        params: {
          entity: brand.entry.entity,
          imitated: brand.entry.domain,
          word: brand.name,
          realDomain,
          host: url.asciiHost,
          words: shown.map((word) => `«${word}»`).join(", "),
          count: shown.length,
        },
        details,
      };
    },
  };
}
