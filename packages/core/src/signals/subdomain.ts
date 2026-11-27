import type { ProtectedPack } from "../data/index.js";
import { buildProtectedIndex, type ProtectedDomain } from "./protected-index.js";
import { skeleton } from "./skeleton.js";
import type { Signal, SignalHit } from "./types.js";

export type SubdomainCase = "domain" | "suffix" | "suffix-lookalike";

export type SubdomainDetails = {
  readonly case: SubdomainCase;
  readonly shown: string;
  readonly entity: string;
  readonly realDomain: string;
};

function windows(tokens: readonly string[], size: number): string[] {
  const result: string[] = [];
  for (let start = 0; start + size <= tokens.length; start++) {
    result.push(tokens.slice(start, start + size).join("."));
  }
  return result;
}

/** Builds the signal for protected names and endings shown inside another site's address. */
export function createSubdomainSignal(
  packs: readonly ProtectedPack[],
  userDomains?: readonly string[],
): Signal {
  const index = buildProtectedIndex(packs, userDomains);
  // A host is compared word by word, with hyphens and dots both ending a word, so a protected
  // domain that has a hyphen of its own, such as t-mobile.com, is cut the same way.
  const byWords = new Map<string, ProtectedDomain>();
  for (const entry of index.entries) {
    const key = skeleton(entry.domain.replaceAll("-", "."));
    if (!byWords.has(key)) byWords.set(key, entry);
  }
  const domainSizes = [...new Set(index.entries.map((entry) => entry.domain.split(/[.-]/).length))];

  return {
    id: "subdomain",
    kind: "risk",
    variants: ["domain", "suffix", "suffix-lookalike"],
    evaluate(url) {
      const realDomain = url.registrableDomain;
      if (url.isIp || realDomain === null || url.publicSuffix === null) return null;
      if (index.domains.has(realDomain)) return null;

      const suffixLength = url.publicSuffix.split(".").length;
      const tokens = url.labels
        .slice(0, url.labels.length - suffixLength)
        .flatMap((label) => label.split("-"));

      const report = (
        kind: SubdomainCase,
        shown: string,
        entity: string,
        written = shown,
      ): SignalHit => {
        const details: SubdomainDetails = { case: kind, shown, entity, realDomain };
        return {
          variant: kind,
          params: { shown, entity, realDomain, written, asciiHost: url.asciiHost },
          details,
        };
      };

      for (const size of domainSizes) {
        for (const candidate of windows(tokens, size)) {
          const shown = byWords.get(skeleton(candidate));
          if (shown) return report("domain", shown.domain, shown.entity);
        }
      }

      for (const group of index.suffixes) {
        const embedded = windows(tokens, group.labels.length).some(
          (candidate) => skeleton(candidate) === group.skeleton,
        );
        if (embedded) return report("suffix", group.suffix, group.name);
      }

      for (const group of index.suffixes) {
        for (const lookalike of group.lookalikes) {
          const written = url.labels.slice(-lookalike.split(".").length).join(".");
          if (skeleton(written) === skeleton(lookalike)) {
            return report("suffix-lookalike", group.suffix, group.name, lookalike);
          }
        }
      }
      return null;
    },
  };
}
