import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyze, createDefaultEngine, type Engine, type Level } from "@ojolink/core";
import { CORPUS_ROOT, type Corpus, type Sample } from "./load.ts";

export const MAX_CAUTION_RATE = 0.05;
export const MIN_DETECTION_RATE = 0.9;

/** Kinds where caution is the designed result; they stay out of the caution rate. */
const CAUTION_BY_DESIGN: readonly string[] = ["hosting", "near-neighbour", "brand-word"];
const HIDDEN_BY_DESIGN: readonly string[] = ["tracker", "shortener"];

export type Outcome = "correct" | "false-positive" | "miss" | "out-of-reach";
export type MeasuredLevel = Level | "not-analyzed";

export interface Evaluation {
  readonly sample: Sample;
  readonly level: MeasuredLevel;
  readonly score: number;
  readonly signals: readonly string[];
  readonly outcome: Outcome;
  readonly countsTowardCaution: boolean;
}

export interface Exception {
  readonly id: string;
  readonly reason: string;
}

export interface Rates {
  readonly legitimate: number;
  readonly legitimateAtDanger: number;
  readonly cautionCounted: number;
  readonly cautionMarked: number;
  readonly cautionRate: number;
  readonly protectedTotal: number;
  readonly protectedSafe: number;
  readonly phishingCovered: number;
  readonly phishingDetected: number;
  readonly detectionRate: number;
  readonly outOfReach: number;
}

export interface CheckResult {
  readonly ok: boolean;
  readonly failures: readonly string[];
  readonly rates: Rates;
  readonly accepted: readonly Evaluation[];
}

const DEFAULT_ENGINE: Engine = { analyze };

function correctLevels(sample: Sample): readonly MeasuredLevel[] | null {
  if (sample.expected) return [sample.expected];
  if (sample.label === "phishing") {
    return sample.outOfReach ? null : ["caution", "danger", "hidden-destination"];
  }
  if (CAUTION_BY_DESIGN.includes(sample.kind)) return ["safe", "caution"];
  if (HIDDEN_BY_DESIGN.includes(sample.kind)) return ["safe", "hidden-destination"];
  return ["safe"];
}

function classify(sample: Sample, level: MeasuredLevel): Outcome {
  const correct = correctLevels(sample);
  if (correct === null) return "out-of-reach";
  if (correct.includes(level)) return "correct";
  return sample.label === "phishing" ? "miss" : "false-positive";
}

/** Runs the engine over one sample, with the sample's own list of user domains when it has one. */
export function evaluateSample(sample: Sample, engine: Engine = DEFAULT_ENGINE): Evaluation {
  const used = sample.userDomains
    ? createDefaultEngine({ userDomains: sample.userDomains })
    : engine;
  const result = used.analyze(
    sample.input,
    sample.visibleText === null ? {} : { context: { visibleText: sample.visibleText } },
  );
  const level: MeasuredLevel = result.analyzed ? result.level : "not-analyzed";
  return {
    sample,
    level,
    score: result.analyzed ? result.score : 0,
    signals: result.analyzed
      ? result.signals.map((signal) =>
          signal.variant === null ? signal.id : `${signal.id}/${signal.variant}`,
        )
      : [],
    outcome: classify(sample, level),
    countsTowardCaution: sample.label === "legitimate" && !CAUTION_BY_DESIGN.includes(sample.kind),
  };
}

export function evaluateCorpus(corpus: Corpus, engine: Engine = DEFAULT_ENGINE): Evaluation[] {
  return corpus.samples.map((sample) => evaluateSample(sample, engine));
}

export function loadExceptions(root: string = CORPUS_ROOT): Exception[] {
  const path = join(root, "exceptions.json");
  if (!existsSync(path)) return [];
  const content = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!Array.isArray(content)) throw new Error("exceptions.json must hold a list");
  return content.map((entry: unknown) => {
    const { id, reason } = (entry ?? {}) as { id?: unknown; reason?: unknown };
    if (typeof id !== "string" || typeof reason !== "string" || reason.trim() === "") {
      throw new Error("Every exception needs an id and a reason");
    }
    return { id, reason };
  });
}

export function describeEvaluation(evaluation: Evaluation): string {
  const signals = evaluation.signals.length > 0 ? evaluation.signals.join(", ") : "no signals";
  return `"${evaluation.sample.id}" (${evaluation.sample.label}, ${evaluation.sample.kind}) got ${evaluation.level}, score ${evaluation.score}: ${signals}`;
}

function ratio(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function measureRates(evaluations: readonly Evaluation[]): Rates {
  const legitimate = evaluations.filter((item) => item.sample.label === "legitimate");
  const counted = legitimate.filter((item) => item.countsTowardCaution);
  const marked = counted.filter((item) => item.level === "caution");
  const protectedPages = legitimate.filter((item) => item.sample.kind === "protected");
  const phishing = evaluations.filter((item) => item.sample.label === "phishing");
  const covered = phishing.filter((item) => !item.sample.outOfReach);
  const detected = covered.filter((item) => item.level !== "safe" && item.level !== "not-analyzed");
  return {
    legitimate: legitimate.length,
    legitimateAtDanger: legitimate.filter((item) => item.level === "danger").length,
    cautionCounted: counted.length,
    cautionMarked: marked.length,
    cautionRate: ratio(marked.length, counted.length),
    protectedTotal: protectedPages.length,
    protectedSafe: protectedPages.filter((item) => item.level === "safe").length,
    phishingCovered: covered.length,
    phishingDetected: detected.length,
    detectionRate: covered.length === 0 ? 1 : ratio(detected.length, covered.length),
    outOfReach: phishing.length - covered.length,
  };
}

/** Checks the accuracy targets. A wrong result passes only as a recorded exception. */
export function checkTargets(
  evaluations: readonly Evaluation[],
  exceptions: readonly Exception[] = [],
  raisedIds: ReadonlySet<string> = new Set(),
): CheckResult {
  const failures: string[] = [];
  const rates = measureRates(evaluations);
  const byId = new Map(evaluations.map((item) => [item.sample.id, item]));
  const excepted = new Set<string>();
  const accepted: Evaluation[] = [];

  for (const exception of exceptions) {
    const evaluation = byId.get(exception.id);
    if (!evaluation) {
      failures.push(`Exception "${exception.id}" names a sample that is not in the corpus`);
    } else if (evaluation.sample.kind === "protected" && evaluation.sample.label === "legitimate") {
      failures.push(
        `Exception "${exception.id}" is not allowed: a real page of a protected domain must be safe`,
      );
    } else if (
      (evaluation.outcome === "correct" || evaluation.outcome === "out-of-reach") &&
      !raisedIds.has(exception.id)
    ) {
      failures.push(
        `Exception "${exception.id}" no longer applies: the sample now gets ${evaluation.level}; remove it`,
      );
    } else {
      excepted.add(exception.id);
      accepted.push(evaluation);
    }
  }

  for (const evaluation of evaluations) {
    const { sample, level } = evaluation;
    if (sample.label !== "legitimate") continue;
    if (sample.kind === "protected" && level !== "safe") {
      failures.push(`Protected page not safe: ${describeEvaluation(evaluation)}`);
    } else if (level === "danger" && !excepted.has(sample.id)) {
      failures.push(`Legitimate sample at danger: ${describeEvaluation(evaluation)}`);
    }
  }

  for (const evaluation of evaluations) {
    const wrong = evaluation.outcome === "false-positive" || evaluation.outcome === "miss";
    if (!wrong || excepted.has(evaluation.sample.id)) continue;
    if (evaluation.sample.label === "legitimate") {
      if (evaluation.sample.kind === "protected" || evaluation.level === "danger") continue;
      failures.push(`Wrong result with no exception: ${describeEvaluation(evaluation)}`);
    } else {
      failures.push(`Phishing sample not detected: ${describeEvaluation(evaluation)}`);
    }
  }

  if (rates.cautionRate > MAX_CAUTION_RATE) {
    const names = evaluations
      .filter((item) => item.countsTowardCaution && item.level === "caution")
      .map((item) => `"${item.sample.id}" (${item.signals.join(", ")})`);
    failures.push(
      `Caution rate ${formatRate(rates.cautionRate)} is over ${formatRate(MAX_CAUTION_RATE)}: ${rates.cautionMarked} of ${rates.cautionCounted} legitimate samples: ${names.join("; ")}`,
    );
  }
  if (rates.detectionRate < MIN_DETECTION_RATE) {
    const names = evaluations
      .filter(
        (item) =>
          item.sample.label === "phishing" && !item.sample.outOfReach && item.level === "safe",
      )
      .map((item) => `"${item.sample.id}"`);
    failures.push(
      `Detection rate ${formatRate(rates.detectionRate)} is under ${formatRate(MIN_DETECTION_RATE)}: ${rates.phishingDetected} of ${rates.phishingCovered} covered phishing samples; missed: ${names.join(", ")}`,
    );
  }

  return { ok: failures.length === 0, failures, rates, accepted };
}

export function describeRates(rates: Rates): string {
  return [
    `Legitimate samples at danger: ${rates.legitimateAtDanger} of ${rates.legitimate}`,
    `Caution rate: ${formatRate(rates.cautionRate)} (${rates.cautionMarked} of ${rates.cautionCounted}), limit ${formatRate(MAX_CAUTION_RATE)}`,
    `Protected pages at safe: ${rates.protectedSafe} of ${rates.protectedTotal}`,
    `Detection rate: ${formatRate(rates.detectionRate)} (${rates.phishingDetected} of ${rates.phishingCovered}), minimum ${formatRate(MIN_DETECTION_RATE)}`,
    `Out of reach: ${rates.outOfReach}`,
  ].join("\n");
}
