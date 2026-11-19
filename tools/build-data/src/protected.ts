import { getDomain, getPublicSuffix } from "tldts";
import { header, latestDate } from "./render.ts";

export const CATEGORIES = ["bank", "government"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Verification {
  readonly status: "confirmed" | "unconfirmed";
  readonly source: string;
  readonly checked?: string;
}

export interface CuratedAlias {
  readonly domain: string;
  readonly verification: Verification;
}

export interface CuratedEntity {
  readonly domain: string;
  readonly name: string;
  readonly category: Category;
  readonly verification: Verification;
  readonly aliases?: readonly CuratedAlias[];
}

export interface CuratedSuffix {
  readonly suffix: string;
  readonly name: string;
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
}

export interface Pack {
  readonly country: string;
  readonly suffixes: readonly CuratedSuffix[];
  readonly entries: readonly PackEntry[];
}

export interface ProtectedResult {
  readonly packs: readonly Pack[];
  readonly leftOut: readonly string[];
  readonly version: string;
}

const LOWERCASE_ASCII = /^[a-z0-9.-]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PSL = { allowPrivateDomains: true };

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function checkVerification(value: Verification | undefined, where: string, errors: string[]): void {
  if (!value || (value.status !== "confirmed" && value.status !== "unconfirmed")) {
    errors.push(`${where}: missing verification record`);
    return;
  }
  if (!isText(value.source)) errors.push(`${where}: verification has no source`);
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

/** Returns every problem found in the curated files; an empty list means they are valid. */
export function validateProtected(sources: readonly SourceFile<CuratedPack>[]): string[] {
  const errors: string[] = [];
  const seenDomains = new Map<string, string>();
  const seenCountries = new Map<string, string>();

  const claim = (domain: string, where: string) => {
    const previous = seenDomains.get(domain);
    if (previous) errors.push(`${where}: "${domain}" is already listed at ${previous}`);
    else seenDomains.set(domain, where);
  };

  for (const { file, content } of sources) {
    if (!/^[a-z]{2}$/.test(content.country ?? "")) {
      errors.push(`${file}: country must be a two-letter lowercase code`);
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
    }

    for (const entity of content.entities ?? []) {
      const where = `${file} entry "${entity.domain}"`;
      if (!isText(entity.name)) errors.push(`${where}: missing name`);
      if (!CATEGORIES.includes(entity.category))
        errors.push(`${where}: missing or unknown category`);
      checkVerification(entity.verification, where, errors);
      if (checkDomain(entity.domain, where, errors)) claim(entity.domain, where);

      for (const alias of entity.aliases ?? []) {
        const aliasWhere = `${where} alias "${alias.domain}"`;
        checkVerification(alias.verification, aliasWhere, errors);
        if (checkDomain(alias.domain, aliasWhere, errors)) claim(alias.domain, aliasWhere);
      }
    }
  }
  return errors;
}

/** Builds the shipped packs: confirmed entries and confirmed aliases only. */
export function buildProtected(sources: readonly SourceFile<CuratedPack>[]): ProtectedResult {
  const errors = validateProtected(sources);
  if (errors.length > 0) throw new Error(`Invalid protected domains:\n- ${errors.join("\n- ")}`);

  const leftOut: string[] = [];
  const dates: string[] = [];
  const packs = sources.map(({ content }): Pack => {
    const entries: PackEntry[] = [];
    for (const entity of content.entities) {
      const { name, category } = entity;
      const candidates = [entity, ...(entity.aliases ?? [])];
      for (const candidate of candidates) {
        if (candidate.verification.status === "confirmed") {
          entries.push({ domain: candidate.domain, name, category });
          dates.push(candidate.verification.checked ?? "");
        } else {
          leftOut.push(`${content.country}: ${candidate.domain} (${name})`);
        }
      }
    }
    return {
      country: content.country,
      suffixes: [...content.suffixes].sort((a, b) => a.suffix.localeCompare(b.suffix, "en")),
      entries: entries.sort((a, b) => a.domain.localeCompare(b.domain, "en")),
    };
  });

  packs.sort((a, b) => a.country.localeCompare(b.country, "en"));
  return { packs, leftOut: leftOut.sort(), version: latestDate(dates) };
}

export function renderProtected(result: ProtectedResult): string {
  return `${header("tools/build-data/sources/protected/*.json", result.version)}
export type ProtectedCategory = ${CATEGORIES.map((category) => JSON.stringify(category)).join(" | ")};

export interface ProtectedEntry {
  readonly domain: string;
  readonly name: string;
  readonly category: ProtectedCategory;
}

export interface ProtectedSuffix {
  readonly suffix: string;
  readonly name: string;
}

export interface ProtectedPack {
  readonly country: string;
  readonly suffixes: readonly ProtectedSuffix[];
  readonly entries: readonly ProtectedEntry[];
}

export const PROTECTED_PACKS: readonly ProtectedPack[] = ${JSON.stringify(result.packs, null, 2)};
`;
}
