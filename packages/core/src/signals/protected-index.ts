import { parse } from "tldts";
import type { ProtectedCategory, ProtectedPack } from "../data/index.js";
import { skeleton } from "./skeleton.js";

export interface ProtectedDomain {
  readonly domain: string;
  readonly entity: string;
  readonly category: ProtectedCategory;
  readonly label: string;
  readonly suffix: string;
}

export interface ProtectedIndex {
  readonly entries: readonly ProtectedDomain[];
  readonly domains: ReadonlySet<string>;
  readonly byDomainSkeleton: ReadonlyMap<string, ProtectedDomain>;
  readonly byLabelSkeleton: ReadonlyMap<string, ProtectedDomain>;
}

/** The part of a registrable domain in front of its public suffix. */
export function labelOf(domain: string, suffix: string): string {
  return suffix !== "" && domain.endsWith(`.${suffix}`)
    ? domain.slice(0, domain.length - suffix.length - 1)
    : domain;
}

/** Prepares protected domains for lookup by lookalike form. The first entry wins on a collision. */
export function buildProtectedIndex(packs: readonly ProtectedPack[]): ProtectedIndex {
  const entries: ProtectedDomain[] = [];
  const domains = new Set<string>();
  const byDomainSkeleton = new Map<string, ProtectedDomain>();
  const byLabelSkeleton = new Map<string, ProtectedDomain>();

  for (const pack of packs) {
    for (const entry of pack.entries) {
      if (domains.has(entry.domain)) continue;
      const suffix = parse(entry.domain, { allowPrivateDomains: true }).publicSuffix ?? "";
      const item: ProtectedDomain = {
        domain: entry.domain,
        entity: entry.name,
        category: entry.category,
        label: labelOf(entry.domain, suffix),
        suffix,
      };
      entries.push(item);
      domains.add(item.domain);

      const domainKey = skeleton(item.domain);
      if (!byDomainSkeleton.has(domainKey)) byDomainSkeleton.set(domainKey, item);
      const labelKey = skeleton(item.label);
      if (!byLabelSkeleton.has(labelKey)) byLabelSkeleton.set(labelKey, item);
    }
  }
  return { entries, domains, byDomainSkeleton, byLabelSkeleton };
}
