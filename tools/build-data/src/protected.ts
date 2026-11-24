import { getDomain, getPublicSuffix } from "tldts";
import { header, latestDate } from "./render.ts";

export const CATEGORIES = [
  "bank",
  "government",
  "payments",
  "mail",
  "streaming",
  "social",
  "shopping",
  "shipping",
  "telecom",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** The pack of brands that phishing imitates anywhere, next to the packs of each country. */
export const GLOBAL_PACK = "global";
export const GLOBAL_CATEGORIES: readonly Category[] = [
  "payments",
  "bank",
  "mail",
  "streaming",
  "social",
  "shopping",
  "shipping",
  "telecom",
];

/**
 * A domain is confirmed by a ranking when it is within this many first places. The line is
 * the whole Majestic Million: regional banks and carriers sit far below the global brands.
 */
export const RANK_LIMIT = 1_000_000;
export const SHORT_NAME_LENGTH = 4;

export interface Verification {
  readonly status: "confirmed" | "unconfirmed";
  readonly source?: string;
  readonly method?: "site" | "ranking";
  readonly ranking?: string;
  readonly rank?: number | null;
  readonly checked?: string;
}

export interface CuratedAlias {
  readonly domain: string;
  readonly verification: Verification;
  readonly names?: readonly string[];
  readonly commonWord?: boolean;
}

export interface CuratedEntity extends CuratedAlias {
  readonly name: string;
  readonly category: Category;
  readonly aliases?: readonly CuratedAlias[];
}

export interface CuratedSuffix {
  readonly suffix: string;
  readonly name: string;
  readonly lookalikes?: readonly string[];
}

export interface PackSuffix {
  readonly suffix: string;
  readonly name: string;
  readonly lookalikes: readonly string[];
}

export interface CuratedPack {
  readonly country: string;
  readonly suffixes: readonly CuratedSuffix[];
  readonly entities: readonly CuratedEntity[];
}

export interface SourceFile<T> {
  readonly file: string;
  readonly content: T;
}

export interface PackEntry {
  readonly domain: string;
  readonly name: string;
  readonly category: Category;
  readonly names?: readonly string[];
  readonly common?: true;
}

export interface Pack {
  readonly country: string;
  readonly suffixes: readonly PackSuffix[];
  readonly entries: readonly PackEntry[];
}

export interface ProtectedResult {
  readonly packs: readonly Pack[];
  readonly leftOut: readonly string[];
  readonly version: string;
}

const LOWERCASE_ASCII = /^[a-z0-9.-]+$/;
const MATCHING_NAME = /^[a-z0-9]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PSL = { allowPrivateDomains: true };

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isRanking(value: Verification): boolean {
  return value.method === "ranking";
}

/** Why a record that says "confirmed" does not count, or null when it does. */
export function rankingProblem(value: Verification): string | null {
  if (!isRanking(value) || value.status !== "confirmed") return null;
  if (typeof value.rank !== "number" || !Number.isInteger(value.rank) || value.rank < 1) {
    return "not found in the ranking";
  }
  return value.rank > RANK_LIMIT ? `rank ${value.rank} is past ${RANK_LIMIT}` : null;
}

function isConfirmed(value: Verification): boolean {
  return value.status === "confirmed" && rankingProblem(value) === null;
}

function checkVerification(value: Verification | undefined, where: string, errors: string[]): void {
  if (!value || (value.status !== "confirmed" && value.status !== "unconfirmed")) {
    errors.push(`${where}: missing verification record`);
    return;
  }
  if (value.method !== undefined && value.method !== "site" && value.method !== "ranking") {
    errors.push(`${where}: verification method must be "site" or "ranking"`);
  }
  if (isRanking(value)) {
    if (!isText(value.ranking)) errors.push(`${where}: verification does not name its ranking`);
  } else if (!isText(value.source)) {
    errors.push(`${where}: verification has no source`);
  }
  if (value.status === "confirmed" && !ISO_DATE.test(value.checked ?? "")) {
    errors.push(`${where}: confirmed entries need a checked date (YYYY-MM-DD)`);
  }
}

function checkDomain(domain: unknown, where: string, errors: string[]): domain is string {
  if (!isText(domain) || !LOWERCASE_ASCII.test(domain)) {
    errors.push(`${where}: "${String(domain)}" is not a lowercase ASCII domain`);
    return false;
  }
  if (getDomain(domain, PSL) !== domain) {
    errors.push(`${where}: "${domain}" is not a registrable domain`);
    return false;
  }
  return true;
}

/** The part of a registrable domain in front of its public suffix. */
export function nameOf(domain: string): string {
  const suffix = getPublicSuffix(domain, PSL) ?? "";
  return suffix !== "" && domain.endsWith(`.${suffix}`)
    ? domain.slice(0, domain.length - suffix.length - 1)
    : domain;
}

/** The names that find a brand inside other domains: the declared ones, or the domain's own. */
export function matchingNames(item: CuratedAlias): readonly string[] {
  return item.names ?? [nameOf(item.domain)];
}

function checkNames(item: CuratedAlias, where: string, errors: string[]): boolean {
  if (item.commonWord !== undefined && typeof item.commonWord !== "boolean") {
    errors.push(`${where}: commonWord must be true or false`);
  }
  if (item.names !== undefined && !Array.isArray(item.names)) {
    errors.push(`${where}: names must be a list`);
    return false;
  }
  const invalid = matchingNames(item).filter(
    (name) => typeof name !== "string" || !MATCHING_NAME.test(name),
  );
  for (const name of invalid) {
    errors.push(
      item.names === undefined
        ? `${where}: the name "${name}" has characters other than lowercase letters and digits; declare its names`
        : `${where}: the name "${String(name)}" must be lowercase letters and digits only`,
    );
  }
  return invalid.length === 0;
}

/** Returns every problem found in the curated files; an empty list means they are valid. */
export function validateProtected(sources: readonly SourceFile<CuratedPack>[]): string[] {
  const errors: string[] = [];
  const seenDomains = new Map<string, string>();
  const seenCountries = new Map<string, string>();
  const seenNames = new Map<string, { entity: string; where: string; declared: boolean }>();

  const claim = (domain: string, where: string): boolean => {
    const previous = seenDomains.get(domain);
    if (previous) errors.push(`${where}: "${domain}" is already listed at ${previous}`);
    else seenDomains.set(domain, where);
    return !previous;
  };
  const claimNames = (item: CuratedAlias, entity: string, where: string) => {
    const declared = item.names !== undefined;
    for (const name of matchingNames(item)) {
      const previous = seenNames.get(name);
      if (!previous) seenNames.set(name, { entity, where, declared });
      else if (previous.entity !== entity && (declared || previous.declared)) {
        errors.push(`${where}: the name "${name}" is already used at ${previous.where}`);
      }
    }
  };

  for (const { file, content } of sources) {
    if (content.country !== GLOBAL_PACK && !/^[a-z]{2}$/.test(content.country ?? "")) {
      errors.push(`${file}: country must be a two-letter lowercase code or "${GLOBAL_PACK}"`);
    } else if (seenCountries.has(content.country)) {
      errors.push(
        `${file}: country "${content.country}" is already defined in ${seenCountries.get(content.country)}`,
      );
    } else {
      seenCountries.set(content.country, file);
    }

    for (const suffix of content.suffixes ?? []) {
      const where = `${file} suffix "${suffix.suffix}"`;
      if (!isText(suffix.name)) errors.push(`${where}: missing name`);
      if (!isText(suffix.suffix) || getPublicSuffix(suffix.suffix, PSL) !== suffix.suffix) {
        errors.push(`${where}: not a public suffix`);
      }
      for (const lookalike of suffix.lookalikes ?? []) {
        const lookalikeWhere = `${where} lookalike "${String(lookalike)}"`;
        if (!isText(lookalike) || !LOWERCASE_ASCII.test(lookalike)) {
          errors.push(`${lookalikeWhere}: not a lowercase ASCII ending`);
        } else if (getPublicSuffix(lookalike, PSL) === lookalike) {
          errors.push(`${lookalikeWhere}: is a real public suffix, not an imitation`);
        } else {
          claim(lookalike, lookalikeWhere);
        }
      }
    }

    for (const entity of content.entities ?? []) {
      const where = `${file} entry "${entity.domain}"`;
      const key = `${file}#${entity.domain}`;
      if (!isText(entity.name)) errors.push(`${where}: missing name`);
      if (!CATEGORIES.includes(entity.category))
        errors.push(`${where}: missing or unknown category`);
      checkVerification(entity.verification, where, errors);
      if (checkDomain(entity.domain, where, errors) && claim(entity.domain, where)) {
        if (checkNames(entity, where, errors)) claimNames(entity, key, where);
      }

      for (const alias of entity.aliases ?? []) {
        const aliasWhere = `${where} alias "${alias.domain}"`;
        checkVerification(alias.verification, aliasWhere, errors);
        if (checkDomain(alias.domain, aliasWhere, errors) && claim(alias.domain, aliasWhere)) {
          if (checkNames(alias, aliasWhere, errors)) claimNames(alias, key, aliasWhere);
        }
      }
    }
  }
  return errors;
}

function entryFor(item: CuratedAlias, name: string, category: Category): PackEntry {
  const names = matchingNames(item);
  const isDefault = names.length === 1 && names[0] === nameOf(item.domain);
  return {
    domain: item.domain,
    name,
    category,
    ...(isDefault ? {} : { names: [...names] }),
    ...(item.commonWord ? { common: true as const } : {}),
  };
}

/** Builds the shipped packs: confirmed entries and confirmed aliases only. */
export function buildProtected(sources: readonly SourceFile<CuratedPack>[]): ProtectedResult {
  const errors = validateProtected(sources);
  if (errors.length > 0) throw new Error(`Invalid protected domains:\n- ${errors.join("\n- ")}`);

  const leftOut: string[] = [];
  const dates: string[] = [];
  const packs = sources.map(({ file, content }): Pack => {
    const entries: PackEntry[] = [];
    for (const entity of content.entities) {
      const { name, category } = entity;
      const candidates: CuratedAlias[] = [entity, ...(entity.aliases ?? [])];
      for (const candidate of candidates) {
        if (isConfirmed(candidate.verification)) {
          entries.push(entryFor(candidate, name, category));
          dates.push(candidate.verification.checked ?? "");
        } else {
          const problem = rankingProblem(candidate.verification);
          const reason = problem ? `, ${problem}` : "";
          leftOut.push(`${content.country}: ${candidate.domain} (${name}${reason})`);
        }
      }
    }
    if (content.country === GLOBAL_PACK) {
      const empty = GLOBAL_CATEGORIES.filter(
        (category) => !entries.some((entry) => entry.category === category),
      );
      if (empty.length > 0) {
        throw new Error(
          `Invalid protected domains:\n- ${file}: no confirmed entry in ${empty.join(", ")}`,
        );
      }
    }
    return {
      country: content.country,
      suffixes: (content.suffixes ?? [])
        .map(({ suffix, name, lookalikes }): PackSuffix => ({
          suffix,
          name,
          lookalikes: [...(lookalikes ?? [])].sort(),
        }))
        .sort((a, b) => a.suffix.localeCompare(b.suffix, "en")),
      entries: entries.sort((a, b) => a.domain.localeCompare(b.domain, "en")),
    };
  });

  packs.sort((a, b) => a.country.localeCompare(b.country, "en"));
  return { packs, leftOut: leftOut.sort(), version: latestDate(dates) };
}

/** Domains whose confirmation comes from a ranking, in every pack. */
export function rankedDomains(pack: CuratedPack): string[] {
  return pack.entities
    .flatMap((entity) => [entity, ...(entity.aliases ?? [])])
    .filter((item) => isRanking(item.verification))
    .map((item) => item.domain);
}

/** Writes the rank found for each ranking-confirmed domain, or null when it is not in the ranking. */
export function applyRanks(
  pack: CuratedPack,
  ranks: ReadonlyMap<string, number>,
  ranking: string,
  checked: string,
): CuratedPack {
  const update = <T extends CuratedAlias>(item: T): T =>
    isRanking(item.verification)
      ? {
          ...item,
          verification: {
            ...item.verification,
            ranking,
            rank: ranks.get(item.domain) ?? null,
            checked,
          },
        }
      : item;
  return {
    ...pack,
    entities: pack.entities.map((entity) => ({
      ...update(entity),
      ...(entity.aliases ? { aliases: entity.aliases.map(update) } : {}),
    })),
  };
}

export function renderProtected(result: ProtectedResult): string {
  return `${header("tools/build-data/sources/protected/*.json", result.version)}
export type ProtectedCategory = ${CATEGORIES.map((category) => JSON.stringify(category)).join(" | ")};

export interface ProtectedEntry {
  readonly domain: string;
  readonly name: string;
  readonly category: ProtectedCategory;
  /** Names that find the brand inside other domains. Absent when it is the domain's own name. */
  readonly names?: readonly string[];
  /** True when the name is an ordinary word, so it is not a sign of imitation by itself. */
  readonly common?: true;
}

export interface ProtectedSuffix {
  readonly suffix: string;
  readonly name: string;
  readonly lookalikes: readonly string[];
}

export interface ProtectedPack {
  /** A two-letter country code, or "global". */
  readonly country: string;
  readonly suffixes: readonly ProtectedSuffix[];
  readonly entries: readonly ProtectedEntry[];
}

export const SHORT_NAME_LENGTH = ${SHORT_NAME_LENGTH};

export const PROTECTED_PACKS: readonly ProtectedPack[] = ${JSON.stringify(result.packs, null, 2)};
`;
}
