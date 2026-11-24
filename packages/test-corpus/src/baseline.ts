import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProtectedPack } from "@ojolink/core";
import { describeEvaluation, type Evaluation, type MeasuredLevel } from "./evaluate.ts";
import { CORPUS_ROOT, type Corpus } from "./load.ts";

export const BASELINE_FILE = "baseline.json";
export const COUNTRY_PAGES = 3;
export const GLOBAL_PAGES = 1;

export type Baseline = Readonly<Record<string, MeasuredLevel>>;

export interface LevelChange {
  readonly evaluation: Evaluation;
  readonly before: MeasuredLevel;
}

export interface BaselineComparison {
  /** How many legitimate samples had a recorded level to compare with. */
  readonly compared: number;
  readonly raised: readonly LevelChange[];
  readonly lowered: readonly LevelChange[];
  /** Ids the baseline holds that are no longer legitimate samples of the corpus. */
  readonly gone: readonly string[];
}

const SEVERITY: Record<MeasuredLevel, number> = {
  "not-analyzed": 0,
  safe: 0,
  "hidden-destination": 1,
  caution: 2,
  danger: 3,
};

export function loadBaseline(root: string = CORPUS_ROOT): Baseline | null {
  const path = join(root, BASELINE_FILE);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Baseline) : null;
}

/** The level of every legitimate sample, in a stable order, as the baseline file records it. */
export function buildBaseline(evaluations: readonly Evaluation[]): Baseline {
  const legitimate = evaluations
    .filter((item) => item.sample.label === "legitimate")
    .map((item): [string, MeasuredLevel] => [item.sample.id, item.level])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(legitimate);
}

export function renderBaseline(baseline: Baseline): string {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}

/** Finds the legitimate samples whose level moved since the baseline was written. */
export function compareWithBaseline(
  evaluations: readonly Evaluation[],
  baseline: Baseline | null,
): BaselineComparison {
  if (baseline === null) return { compared: 0, raised: [], lowered: [], gone: [] };
  const legitimate = evaluations.filter((item) => item.sample.label === "legitimate");
  const known = legitimate.filter((item) => Object.hasOwn(baseline, item.sample.id));
  const changes = known
    .map((evaluation): LevelChange => ({
      evaluation,
      before: baseline[evaluation.sample.id] ?? "safe",
    }))
    .filter((change) => change.before !== change.evaluation.level);
  const ids = new Set(legitimate.map((item) => item.sample.id));
  return {
    compared: known.length,
    raised: changes.filter((c) => SEVERITY[c.evaluation.level] > SEVERITY[c.before]),
    lowered: changes.filter((c) => SEVERITY[c.evaluation.level] <= SEVERITY[c.before]),
    gone: Object.keys(baseline).filter((id) => !ids.has(id)),
  };
}

/** A sample that rose since the baseline fails the check unless an exception covers it. */
export function checkBaseline(
  comparison: BaselineComparison,
  exceptedIds: ReadonlySet<string>,
): string[] {
  const failures = comparison.raised
    .filter((change) => !exceptedIds.has(change.evaluation.sample.id))
    .map(
      (change) =>
        `Legitimate sample rose from ${change.before} since the baseline: ${describeEvaluation(change.evaluation)}`,
    );
  for (const id of comparison.gone) {
    failures.push(`baseline.json names "${id}", which is not a legitimate sample; rewrite it`);
  }
  return failures;
}

function hostOf(input: string): string {
  try {
    return new URL(input).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Lists the protected domains with too few real pages in the corpus: three for each domain
 * of a country pack, one for each domain of the global pack.
 */
export function checkProtectedPages(corpus: Corpus, packs: readonly ProtectedPack[]): string[] {
  const hosts = corpus.samples
    .filter((sample) => sample.label === "legitimate" && sample.kind === "protected")
    .map((sample) => hostOf(sample.input));
  const problems: string[] = [];
  for (const pack of packs) {
    const needed = pack.country === "global" ? GLOBAL_PAGES : COUNTRY_PAGES;
    for (const { domain } of pack.entries) {
      const pages = hosts.filter((host) => host === domain || host.endsWith(`.${domain}`)).length;
      if (pages < needed) {
        problems.push(
          `The protected domain "${domain}" of the ${pack.country} pack has ${pages} real pages in the corpus; it needs ${needed}`,
        );
      }
    }
  }
  return problems;
}
