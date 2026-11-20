import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyze, describeResult, type Engine, type Level } from "@ojolink/core";
import { CORPUS_ROOT } from "./load.ts";

export interface FixedCase {
  readonly id: string;
  readonly row: string;
  readonly input: string;
  readonly visibleText?: string;
  readonly expectedLevel: Level;
  readonly expectedSignal: string | null;
  readonly expectedTitle: string | null;
  readonly pending?: { readonly change: string; readonly reason: string };
}

export interface CaseResult {
  readonly case: FixedCase;
  readonly level: Level | "not-analyzed";
  readonly signal: string | null;
  readonly title: string | null;
  readonly matches: boolean;
}

export function loadCases(root: string = CORPUS_ROOT): FixedCase[] {
  const path = join(root, "cases", "textos-por-caso.json");
  return JSON.parse(readFileSync(path, "utf8")) as FixedCase[];
}

export function runCase(fixed: FixedCase, engine: Engine = { analyze }): CaseResult {
  const result = engine.analyze(
    fixed.input,
    fixed.visibleText === undefined ? {} : { context: { visibleText: fixed.visibleText } },
  );
  const description = describeResult(result);
  const level = result.analyzed ? result.level : "not-analyzed";
  const signal = result.analyzed ? (result.signals[0]?.id ?? null) : null;
  const title =
    description.analyzed && description.warning
      ? description.warning.title
      : result.analyzed
        ? (result.signals[0]?.title ?? null)
        : null;
  return {
    case: fixed,
    level,
    signal,
    title,
    matches:
      level === fixed.expectedLevel &&
      signal === fixed.expectedSignal &&
      title === fixed.expectedTitle,
  };
}

/** An active case must match. A pending case that starts to match fails until its mark is removed. */
export function checkCases(results: readonly CaseResult[]): string[] {
  const failures: string[] = [];
  for (const result of results) {
    const { id, pending, expectedLevel, expectedSignal, expectedTitle } = result.case;
    if (pending && result.matches) {
      failures.push(`Fixed case "${id}" now passes: remove its pending mark (${pending.change})`);
    } else if (!pending && !result.matches) {
      failures.push(
        `Fixed case "${id}" expected ${expectedLevel}, ${expectedSignal ?? "no signal"}, "${expectedTitle ?? ""}" and got ${result.level}, ${result.signal ?? "no signal"}, "${result.title ?? ""}"`,
      );
    }
  }
  return failures;
}
