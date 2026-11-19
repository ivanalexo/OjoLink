import { header } from "./render.ts";
import type { SourceFile } from "./protected.ts";

export const KINDS = ["shortener", "tracker"] as const;
export type Kind = (typeof KINDS)[number];

export interface CuratedShortener {
  readonly host: string;
  readonly kind: Kind;
}

export interface CuratedShorteners {
  readonly updated: string;
  readonly hosts: readonly CuratedShortener[];
}

const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export function validateShorteners({ file, content }: SourceFile<CuratedShorteners>): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(content.updated ?? "")) {
    errors.push(`${file}: "updated" must be a date (YYYY-MM-DD)`);
  }
  for (const entry of content.hosts ?? []) {
    const where = `${file} entry "${String(entry.host)}"`;
    if (typeof entry.host !== "string" || !HOST.test(entry.host)) {
      errors.push(`${where}: not a valid lowercase host`);
    } else if (seen.has(entry.host)) {
      errors.push(`${where}: listed more than once`);
    } else {
      seen.add(entry.host);
    }
    if (!KINDS.includes(entry.kind)) errors.push(`${where}: missing or unknown kind`);
  }
  return errors;
}

/** Validates the curated list and returns it sorted by host. */
export function buildShorteners(source: SourceFile<CuratedShorteners>): CuratedShortener[] {
  const errors = validateShorteners(source);
  if (errors.length > 0) throw new Error(`Invalid shorteners:\n- ${errors.join("\n- ")}`);
  return [...source.content.hosts].sort((a, b) => a.host.localeCompare(b.host, "en"));
}

export function renderShorteners(hosts: readonly CuratedShortener[], updated: string): string {
  const body = hosts
    .map(
      (entry) => `  { host: ${JSON.stringify(entry.host)}, kind: ${JSON.stringify(entry.kind)} },`,
    )
    .join("\n");
  return `${header("tools/build-data/sources/shorteners.json", updated)}
export type ShortenerKind = ${KINDS.map((kind) => JSON.stringify(kind)).join(" | ")};

export interface Shortener {
  readonly host: string;
  readonly kind: ShortenerKind;
}

export const SHORTENERS: readonly Shortener[] = [
${body}
];
`;
}
