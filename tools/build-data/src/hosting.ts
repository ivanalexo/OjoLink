import { header } from "./render.ts";
import type { SourceFile } from "./protected.ts";
import { HOST } from "./shorteners.ts";

export const ASSIGNMENTS = ["subdomain", "path"] as const;
export type Assignment = (typeof ASSIGNMENTS)[number];

export interface CuratedService {
  readonly name: string;
  readonly host: string;
  readonly assignment: Assignment;
  readonly prefix?: string;
}

export interface CuratedLureWord {
  readonly match: string;
  readonly shown: string;
  readonly brand?: boolean;
}

export interface CuratedHosting {
  readonly updated: string;
  readonly services: readonly CuratedService[];
  readonly lureWords: readonly CuratedLureWord[];
}

export interface HostingResult {
  readonly services: readonly (Omit<CuratedService, "prefix"> & { prefix: string | null })[];
  readonly lureWords: readonly Required<CuratedLureWord>[];
}

const MATCH_FORM = /^[a-z]{5,}$/;

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function validateHosting({ file, content }: SourceFile<CuratedHosting>): string[] {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(content.updated ?? "")) {
    errors.push(`${file}: "updated" must be a date (YYYY-MM-DD)`);
  }

  const services = new Set<string>();
  for (const service of content.services ?? []) {
    const where = `${file} service "${String(service.host)}${service.prefix ?? ""}"`;
    if (!isText(service.name)) errors.push(`${where}: missing name`);
    if (typeof service.host !== "string" || !HOST.test(service.host)) {
      errors.push(`${where}: not a valid lowercase host`);
    }
    if (!ASSIGNMENTS.includes(service.assignment)) {
      errors.push(`${where}: missing or unknown assignment`);
    } else if (service.assignment === "path") {
      if (!/^\/(?:[^/\s]+\/)*$/.test(service.prefix ?? "")) {
        errors.push(`${where}: a path service needs a prefix that starts and ends with a slash`);
      }
    } else if (service.prefix !== undefined) {
      errors.push(`${where}: a subdomain service takes no prefix`);
    }
    const key = `${service.host}${service.prefix ?? ""}`;
    if (services.has(key)) errors.push(`${where}: listed more than once`);
    services.add(key);
  }

  const words = new Set<string>();
  for (const word of content.lureWords ?? []) {
    const where = `${file} lure word "${String(word.match)}"`;
    if (typeof word.match !== "string" || !MATCH_FORM.test(word.match)) {
      errors.push(`${where}: the matching form must be 5 or more lowercase unaccented letters`);
    }
    if (!isText(word.shown)) errors.push(`${where}: missing shown form`);
    if (word.brand !== undefined && typeof word.brand !== "boolean") {
      errors.push(`${where}: "brand" must be true or false`);
    }
    if (words.has(word.match)) errors.push(`${where}: listed more than once`);
    words.add(word.match);
  }
  return errors;
}

/** Validates the curated hosting services and lure words and returns them in a stable order. */
export function buildHosting(source: SourceFile<CuratedHosting>): HostingResult {
  const errors = validateHosting(source);
  if (errors.length > 0) throw new Error(`Invalid hosting data:\n- ${errors.join("\n- ")}`);
  const key = (service: CuratedService) => `${service.host}${service.prefix ?? ""}`;
  return {
    services: [...source.content.services]
      .sort((a, b) => key(a).localeCompare(key(b), "en"))
      .map(({ name, host, assignment, prefix }) => ({
        name,
        host,
        assignment,
        prefix: prefix ?? null,
      })),
    lureWords: [...source.content.lureWords]
      .sort((a, b) => a.match.localeCompare(b.match, "en"))
      .map(({ match, shown, brand }) => ({ match, shown, brand: brand === true })),
  };
}

export function renderHosting(result: HostingResult, updated: string): string {
  return `${header("tools/build-data/sources/hosting.json", updated)}
export type HostingAssignment = ${ASSIGNMENTS.map((value) => JSON.stringify(value)).join(" | ")};

export interface HostingService {
  readonly name: string;
  readonly host: string;
  readonly assignment: HostingAssignment;
  readonly prefix: string | null;
}

export interface LureWord {
  readonly match: string;
  readonly shown: string;
  readonly brand: boolean;
}

export const HOSTING_SERVICES: readonly HostingService[] = ${JSON.stringify(result.services, null, 2)};

export const LURE_WORDS: readonly LureWord[] = ${JSON.stringify(result.lureWords, null, 2)};
`;
}
