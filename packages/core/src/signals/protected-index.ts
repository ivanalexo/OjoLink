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

export interface ProtectedSuffixGroup {
  readonly suffix: string;
  readonly name: string;
  readonly labels: readonly string[];
  readonly skeleton: string;
  readonly lookalikes: readonly string[];
}

export interface ProtectedIndex {
  readonly entries: readonly ProtectedDomain[];
  readonly suffixes: readonly ProtectedSuffixGroup[];
  readonly domains: ReadonlySet<string>;
  readonly byDomainSkeleton: ReadonlyMap<string, ProtectedDomain>;
  readonly byLabelSkeleton: ReadonlyMap<string, ProtectedDomain>;
}

const cache = new WeakMap<readonly ProtectedPack[], ProtectedIndex>();

/** The part of a registrable domain in front of its public suffix. */
export function labelOf(domain: string, suffix: string): string {
  return suffix !== "" && domain.endsWith(`.${suffix}`)
    ? domain.slice(0, domain.length - suffix.length - 1)
    : domain;
}

function build(packs: readonly ProtectedPack[]): ProtectedIndex {
  const entries: ProtectedDomain[] = [];
  const suffixes: ProtectedSuffixGroup[] = [];
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

    for (const { suffix, name, lookalikes } of pack.suffixes) {
      if (suffixes.some((group) => group.suffix === suffix)) continue;
      suffixes.push({
        suffix,
        name,
        labels: suffix.split("."),
        skeleton: skeleton(suffix),
        lookalikes,
      });
    }
  }
  return { entries, suffixes, domains, byDomainSkeleton, byLabelSkeleton };
}

/**
 * Prepares protected domains and suffixes for lookup by lookalike form.
 * The first entry wins on a collision, and the result is reused for the same packs array.
 */
export function buildProtectedIndex(packs: readonly ProtectedPack[]): ProtectedIndex {
  let index = cache.get(packs);
  if (!index) {
    index = build(packs);
    cache.set(packs, index);
  }
  return index;
}
