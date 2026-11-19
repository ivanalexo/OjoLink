import { header } from "./render.ts";

export interface Confusables {
  readonly version: string;
  readonly mappings: ReadonlyMap<string, string>;
}

const DOMAIN_CHARACTER = /^[\p{L}\p{N}\p{M}]$/u;

function fromHex(codePoints: string): string {
  return String.fromCodePoint(
    ...codePoints
      .trim()
      .split(/\s+/)
      .map((hex) => parseInt(hex, 16)),
  );
}

/** Keeps characters that can survive in a domain label: letters, digits, and marks in lowercase. */
export function canAppearInDomain(source: string): boolean {
  return DOMAIN_CHARACTER.test(source) && source === source.toLowerCase();
}

/** Parses Unicode confusables.txt (UTS #39) into source character to prototype mappings. */
export function parseConfusables(text: string): Confusables {
  const version = /^# Version: (\S+)/m.exec(text)?.[1];
  if (!version) throw new Error("confusables.txt: missing '# Version:' header");

  const mappings = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const data = (line.charCodeAt(0) === 0xfeff ? line.slice(1) : line).split("#")[0] ?? "";
    const [source, target] = data.split(";");
    if (!source?.trim() || !target?.trim()) continue;
    const character = fromHex(source);
    if (canAppearInDomain(character)) mappings.set(character, fromHex(target));
  }
  if (mappings.size === 0) throw new Error("confusables.txt: no mappings found");
  return { version, mappings };
}

export function renderConfusables(confusables: Confusables): string {
  const entries = [...confusables.mappings].sort(
    ([a], [b]) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0),
  );
  const body = entries
    .map(([source, target]) => `  ${JSON.stringify(source)}: ${JSON.stringify(target)},`)
    .join("\n");
  return `${header("Unicode confusables.txt (UTS #39)", confusables.version)}
export const CONFUSABLES_UNICODE_VERSION = ${JSON.stringify(confusables.version)};

export const CONFUSABLES: Readonly<Record<string, string>> = {
${body}
};
`;
}
