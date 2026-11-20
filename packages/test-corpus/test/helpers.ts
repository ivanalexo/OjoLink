import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Level } from "@ojolink/core";
import type { Evaluation, Outcome } from "../src/evaluate.ts";
import { CorpusError, loadCorpus, type Label, type Sample } from "../src/load.ts";

export type RawSample = Record<string, unknown>;

export function raw(id: string, input: string, extra: RawSample = {}): RawSample {
  return { id, input, source: "constructed", collected: "2026-11-20", ...extra };
}

/** Writes a corpus folder from a map of relative path to content. */
export function folder(files: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), "ojolink-corpus-"));
  mkdirSync(join(root, "samples"), { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, typeof content === "string" ? content : JSON.stringify(content));
  }
  return root;
}

export function problemsOf(files: Record<string, unknown>): string[] {
  try {
    loadCorpus(folder(files));
  } catch (error) {
    if (error instanceof CorpusError) return [...error.problems];
    throw error;
  }
  return [];
}

export function sample(
  label: Label,
  kind: string,
  id: string,
  extra: Partial<Sample> = {},
): Sample {
  return {
    id,
    input: "https://example.com/",
    source: "constructed",
    collected: "2026-11-20",
    note: null,
    expected: null,
    userDomains: null,
    visibleText: null,
    outOfReach: false,
    label,
    kind,
    ...extra,
  };
}

const OUTCOMES: Record<string, Outcome> = { ok: "correct", fp: "false-positive", miss: "miss" };

/** An evaluation with a given level, for testing the targets without running the engine. */
export function measured(
  label: Label,
  kind: string,
  id: string,
  level: Level,
  outcome: keyof typeof OUTCOMES,
  signals: string[] = [],
): Evaluation {
  return {
    sample: sample(label, kind, id),
    level,
    score: level === "danger" ? 80 : level === "caution" ? 50 : 0,
    signals,
    outcome: OUTCOMES[outcome] ?? "correct",
    countsTowardCaution: label === "legitimate" && kind !== "hosting" && kind !== "near-neighbour",
  };
}
