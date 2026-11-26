import { parse } from "tldts";
import { SHORT_NAME_LENGTH } from "../data/index.js";
import type { ProtectedCategory, ProtectedPack } from "../data/index.js";
import { skeleton } from "./skeleton.js";

export interface ProtectedDomain {
  readonly domain: string;
  readonly entity: string;
  readonly category: ProtectedCategory | "user";
  readonly label: string;
  readonly suffix: string;
}

/** A name that finds a brand inside other domains. */
export interface BrandName {
  readonly name: string;
  readonly entry: ProtectedDomain;
  /** An ordinary word: it is not a sign of imitation by itself. */
  readonly common: boolean;
  /** Too short to be matched except as a whole word next to a lure word. */
  readonly short: boolean;
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
  readonly byDomain: ReadonlyMap<string, ProtectedDomain>;
  readonly byDomainSkeleton: ReadonlyMap<string, ProtectedDomain>;
  readonly byLabelSkeleton: ReadonlyMap<string, ProtectedDomain>;
  readonly byName: ReadonlyMap<string, BrandName>;
}

const NO_USER_DOMAINS: readonly string[] = Object.freeze([]);
const MATCHING_NAME = /^[a-z0-9]+$/;
const MIN_NAME_LENGTH = 3;
const cache = new WeakMap<readonly ProtectedPack[], WeakMap<readonly string[], ProtectedIndex>>();

/** The part of a registrable domain in front of its public suffix. */
export function labelOf(domain: string, suffix: string): string {
  return suffix !== "" && domain.endsWith(`.${suffix}`)
    ? domain.slice(0, domain.length - suffix.length - 1)
    : domain;
}

function build(packs: readonly ProtectedPack[], userDomains: readonly string[]): ProtectedIndex {
  const entries: ProtectedDomain[] = [];
  const suffixes: ProtectedSuffixGroup[] = [];
  const domains = new Set<string>();
  const byDomain = new Map<string, ProtectedDomain>();
  const byDomainSkeleton = new Map<string, ProtectedDomain>();
  const byLabelSkeleton = new Map<string, ProtectedDomain>();
  const byName = new Map<string, BrandName>();

  const add = (
    domain: string,
    entity: string,
    category: ProtectedDomain["category"],
    names?: readonly string[],
    common = false,
  ) => {
    if (domains.has(domain)) return;
    const suffix = parse(domain, { allowPrivateDomains: true }).publicSuffix ?? "";
    const item: ProtectedDomain = {
      domain,
      entity,
      category,
      label: labelOf(domain, suffix),
      suffix,
    };
    entries.push(item);
    domains.add(domain);
    byDomain.set(domain, item);

    const domainKey = skeleton(domain);
    if (!byDomainSkeleton.has(domainKey)) byDomainSkeleton.set(domainKey, item);
    const labelKey = skeleton(item.label);
    if (!byLabelSkeleton.has(labelKey)) byLabelSkeleton.set(labelKey, item);

    for (const name of names ?? [item.label]) {
      if (name.length < MIN_NAME_LENGTH || !MATCHING_NAME.test(name) || byName.has(name)) continue;
      byName.set(name, { name, entry: item, common, short: name.length <= SHORT_NAME_LENGTH });
    }
  };

  for (const pack of packs) {
    for (const entry of pack.entries) {
      add(entry.domain, entry.name, entry.category, entry.names, entry.common === true);
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
  for (const domain of userDomains) add(domain, domain, "user");
  return { entries, suffixes, domains, byDomain, byDomainSkeleton, byLabelSkeleton, byName };
}

/**
 * Prepares protected domains and suffixes for lookup by lookalike form.
 * User domains come after the embedded ones, the first entry wins on a collision,
 * and the result is reused for the same packs and user domains arrays.
 */
export function buildProtectedIndex(
  packs: readonly ProtectedPack[],
  userDomains: readonly string[] = NO_USER_DOMAINS,
): ProtectedIndex {
  let byUserDomains = cache.get(packs);
  if (!byUserDomains) {
    byUserDomains = new WeakMap();
    cache.set(packs, byUserDomains);
  }
  let index = byUserDomains.get(userDomains);
  if (!index) {
    index = build(packs, userDomains);
    byUserDomains.set(userDomains, index);
  }
  return index;
}

/** The protected domain a host is, or sits under, or null when nobody protected owns it. */
export function ownerOf(index: ProtectedIndex, host: string): ProtectedDomain | null {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  for (let start = 0; start < labels.length - 1; start++) {
    const owner = index.byDomain.get(labels.slice(start).join("."));
    if (owner) return owner;
  }
  return null;
}
