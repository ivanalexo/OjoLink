import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SIGNALS, type Level } from "@ojolink/core";

export const CORPUS_ROOT = fileURLToPath(new URL("..", import.meta.url));

export const LEGITIMATE_KINDS = [
  "protected",
  "general",
  "idn",
  "tracker",
  "shortener",
  "hosting",
  "near-neighbour",
  "brand-word",
] as const;
export const OUT_OF_REACH = "out-of-reach";
export const TECHNIQUES: readonly string[] = DEFAULT_SIGNALS.map((signal) => signal.id);
export const MIN_LEGITIMATE = 200;
export const MIN_PHISHING = 50;

export type Label = "legitimate" | "phishing";
export type Source = "real" | "constructed" | "observed";

export interface Sample {
  readonly id: string;
  readonly input: string;
  readonly source: Source;
  readonly collected: string;
  readonly note: string | null;
  readonly expected: Level | null;
  readonly userDomains: readonly string[] | null;
  readonly visibleText: string | null;
  readonly outOfReach: boolean;
  readonly label: Label;
  readonly kind: string;
}

export interface Corpus {
  readonly samples: readonly Sample[];
}

export class CorpusError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`The corpus is not valid:\n- ${problems.join("\n- ")}`);
    this.name = "CorpusError";
    this.problems = problems;
  }
}

const LABELS: readonly Label[] = ["legitimate", "phishing"];
const SOURCES: readonly string[] = ["real", "constructed", "observed"];
const LEVELS: readonly string[] = ["safe", "caution", "danger", "hidden-destination"];
const FIELDS = new Set([
  "id",
  "input",
  "source",
  "collected",
  "note",
  "expected",
  "userDomains",
  "visibleText",
  "outOfReach",
]);
const ID_FORM = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_FORM = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+/u;

function isRealDate(text: string): boolean {
  if (!DATE_FORM.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

function decoded(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text.replace(/%40/gi, "@");
  }
}

/**
 * Finds an email address in a link or a note. The `user@host` part of a link is the
 * credentials technique, not an address, so only an address inside it counts.
 */
export function findEmailAddress(text: string): string | null {
  const authority = /^([a-z][a-z0-9+.-]*:)?\/\/([^/?#]*)/i.exec(text);
  const parts: string[] = [];
  if (authority) {
    const at = authority[2]?.lastIndexOf("@") ?? -1;
    if (at > 0) parts.push(authority[2]?.slice(0, at) ?? "");
    parts.push(text.slice(authority[0].length));
  } else {
    parts.push(text);
  }
  for (const part of parts) {
    const found = EMAIL.exec(part) ?? EMAIL.exec(decoded(part));
    if (found) return found[0];
  }
  return null;
}

function readSample(
  raw: unknown,
  label: Label,
  kind: string,
  where: string,
  problems: string[],
): Sample | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    problems.push(`${where}: a sample must be an object`);
    return null;
  }
  const record = raw as Record<string, unknown>;
  const name = typeof record.id === "string" && record.id !== "" ? `"${record.id}"` : where;
  const before = problems.length;
  const fail = (message: string) => problems.push(`${name} (${where}): ${message}`);

  if (typeof record.id !== "string" || !ID_FORM.test(record.id)) {
    fail("needs an id of lowercase letters, digits and hyphens");
  }
  if (typeof record.input !== "string" || record.input.trim() === "") fail("needs an input");
  if (typeof record.source !== "string" || !SOURCES.includes(record.source)) {
    fail(`needs a source of ${SOURCES.join(", ")}`);
  }
  if (typeof record.collected !== "string" || !isRealDate(record.collected)) {
    fail("needs a collected date written as YYYY-MM-DD");
  }
  if (record.note !== undefined && typeof record.note !== "string") fail("note must be text");
  if (record.visibleText !== undefined && typeof record.visibleText !== "string") {
    fail("visibleText must be text");
  }
  if (
    record.expected !== undefined &&
    (typeof record.expected !== "string" || !LEVELS.includes(record.expected))
  ) {
    fail(`expected must be one of ${LEVELS.join(", ")}`);
  }
  if (
    record.userDomains !== undefined &&
    !(
      Array.isArray(record.userDomains) &&
      record.userDomains.every((domain) => typeof domain === "string")
    )
  ) {
    fail("userDomains must be a list of domains");
  }
  if (record.outOfReach !== undefined && typeof record.outOfReach !== "boolean") {
    fail("outOfReach must be true or false");
  }
  if (record.outOfReach === true && label !== "phishing") {
    fail("only a phishing sample can be out of reach");
  }
  for (const field of Object.keys(record)) {
    if (!FIELDS.has(field)) fail(`unknown field "${field}"`);
  }
  for (const field of ["input", "note", "visibleText"] as const) {
    const value = record[field];
    const address = typeof value === "string" ? findEmailAddress(value) : null;
    if (address) fail(`${field} contains an email address; remove personal data`);
  }
  if (problems.length > before) return null;

  return {
    id: record.id as string,
    input: record.input as string,
    source: record.source as Source,
    collected: record.collected as string,
    note: (record.note as string | undefined) ?? null,
    expected: (record.expected as Level | undefined) ?? null,
    userDomains: (record.userDomains as string[] | undefined) ?? null,
    visibleText: (record.visibleText as string | undefined) ?? null,
    outOfReach: kind === OUT_OF_REACH || record.outOfReach === true,
    label,
    kind,
  };
}

function describeEntries(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const ids = content.map((entry: unknown, index) =>
    typeof entry === "object" &&
    entry !== null &&
    typeof (entry as { id?: unknown }).id === "string"
      ? `"${(entry as { id: string }).id}"`
      : `#${index + 1}`,
  );
  return ids.length > 0 ? `: ${ids.join(", ")}` : "";
}

function parse(path: string, where: string, problems: string[]): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    problems.push(`${where}: is not valid JSON (${(error as Error).message})`);
    return undefined;
  }
}

/** Reads every sample under `samples/`. The label and the kind come from the folder and the file name. */
export function loadCorpus(root: string = CORPUS_ROOT): Corpus {
  const problems: string[] = [];
  const samples: Sample[] = [];
  const samplesDir = join(root, "samples");
  if (!existsSync(samplesDir)) throw new CorpusError([`${samplesDir} does not exist`]);

  for (const entry of readdirSync(samplesDir, { withFileTypes: true })) {
    const isLabel = (LABELS as readonly string[]).includes(entry.name);
    if (entry.isDirectory() && isLabel) continue;
    if (entry.isDirectory()) {
      for (const file of readdirSync(join(samplesDir, entry.name))) {
        const where = `samples/${entry.name}/${file}`;
        const content = parse(join(samplesDir, entry.name, file), where, problems);
        problems.push(
          `${where}: samples have no label; "${entry.name}" is not legitimate or phishing${describeEntries(content)}`,
        );
      }
    } else {
      const where = `samples/${entry.name}`;
      const content = parse(join(samplesDir, entry.name), where, problems);
      problems.push(
        `${where}: samples have no label; move the file into legitimate/ or phishing/${describeEntries(content)}`,
      );
    }
  }

  for (const label of LABELS) {
    const dir = join(samplesDir, label);
    if (!existsSync(dir)) continue;
    const kinds: readonly string[] =
      label === "legitimate" ? LEGITIMATE_KINDS : [...TECHNIQUES, OUT_OF_REACH];
    for (const file of readdirSync(dir).sort()) {
      const where = `samples/${label}/${file}`;
      const content = parse(join(dir, file), where, problems);
      if (content === undefined) continue;
      const kind = file.replace(/\.json$/, "");
      if (!file.endsWith(".json") || !kinds.includes(kind)) {
        problems.push(
          `${where}: samples have no category; "${kind}" is not one of ${kinds.join(", ")}${describeEntries(content)}`,
        );
        continue;
      }
      if (!Array.isArray(content)) {
        problems.push(`${where}: must hold a list of samples`);
        continue;
      }
      content.forEach((raw: unknown, index) => {
        const sample = readSample(raw, label, kind, `${where} #${index + 1}`, problems);
        if (sample) samples.push(sample);
      });
    }
  }

  const seen = new Set<string>();
  for (const sample of samples) {
    if (seen.has(sample.id)) problems.push(`"${sample.id}": the id is repeated`);
    seen.add(sample.id);
  }

  if (problems.length > 0) throw new CorpusError(problems);
  samples.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { samples };
}

/** Lists what the corpus lacks: kinds with no samples and sizes under the minimum. */
export function checkCoverage(corpus: Corpus): string[] {
  const problems: string[] = [];
  const count = (label: Label, kind: string) =>
    corpus.samples.filter((sample) => sample.label === label && sample.kind === kind).length;

  for (const kind of LEGITIMATE_KINDS) {
    if (count("legitimate", kind) === 0) problems.push(`No legitimate sample of kind "${kind}"`);
  }
  for (const technique of TECHNIQUES) {
    if (count("phishing", technique) === 0) {
      problems.push(`No phishing sample for the technique "${technique}"`);
    }
  }

  const legitimate = corpus.samples.filter((sample) => sample.label === "legitimate").length;
  const phishing = corpus.samples.filter(
    (sample) => sample.label === "phishing" && !sample.outOfReach,
  ).length;
  if (legitimate < MIN_LEGITIMATE) {
    problems.push(
      `The corpus holds ${legitimate} legitimate samples: ${MIN_LEGITIMATE - legitimate} more are needed to reach ${MIN_LEGITIMATE}`,
    );
  }
  if (phishing < MIN_PHISHING) {
    problems.push(
      `The corpus holds ${phishing} phishing samples: ${MIN_PHISHING - phishing} more are needed to reach ${MIN_PHISHING}`,
    );
  }
  return problems;
}
