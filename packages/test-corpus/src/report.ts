import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CALIBRATION, PROTECTED_PACKS, type ProtectedPack } from "@ojolink/core";
import {
  checkBaseline,
  checkProtectedPages,
  compareWithBaseline,
  loadBaseline,
  type BaselineComparison,
} from "./baseline.ts";
import { checkCases, loadCases, runCase, type CaseResult } from "./cases.ts";
import {
  checkTargets,
  evaluateCorpus,
  formatRate,
  loadExceptions,
  MAX_CAUTION_RATE,
  MIN_DETECTION_RATE,
  type CheckResult,
  type Evaluation,
  type Exception,
} from "./evaluate.ts";
import {
  checkCoverage,
  CORPUS_ROOT,
  LEGITIMATE_KINDS,
  loadCorpus,
  MIN_LEGITIMATE,
  MIN_PHISHING,
  OUT_OF_REACH,
  TECHNIQUES,
  type Corpus,
} from "./load.ts";

export const REPORT_FILE = "report.md";

export interface CalibrationReasons {
  readonly thresholds: Readonly<Record<string, string>>;
  readonly weights: Readonly<Record<string, string>>;
}

export interface Measurement {
  readonly corpus: Corpus;
  readonly evaluations: readonly Evaluation[];
  readonly exceptions: readonly Exception[];
  readonly check: CheckResult;
  readonly cases: readonly CaseResult[];
  readonly reasons: CalibrationReasons;
  readonly baseline: BaselineComparison;
  readonly failures: readonly string[];
}

export function loadReasons(root: string = CORPUS_ROOT): CalibrationReasons {
  return JSON.parse(readFileSync(join(root, "calibration.json"), "utf8")) as CalibrationReasons;
}

/** Lists the weights and thresholds that have no recorded reason, and the reasons with no value. */
export function checkReasons(reasons: CalibrationReasons): string[] {
  const problems: string[] = [];
  const compare = (name: string, actual: readonly string[], recorded: Record<string, string>) => {
    for (const key of actual) {
      if (!Object.hasOwn(recorded, key) || (recorded[key] ?? "").trim() === "") {
        problems.push(`calibration.json has no reason for the ${name} "${key}"`);
      }
    }
    for (const key of Object.keys(recorded)) {
      if (!actual.includes(key)) {
        problems.push(`calibration.json explains a ${name} the engine does not have: "${key}"`);
      }
    }
  };
  compare("weight", Object.keys(DEFAULT_CALIBRATION.weights), { ...reasons.weights });
  compare("threshold", Object.keys(DEFAULT_CALIBRATION.thresholds), { ...reasons.thresholds });
  return problems;
}

/** Runs everything the calibration check asserts over the corpus on disk. */
export function measure(
  root: string = CORPUS_ROOT,
  packs: readonly ProtectedPack[] = PROTECTED_PACKS,
): Measurement {
  const corpus = loadCorpus(root);
  const evaluations = evaluateCorpus(corpus);
  const exceptions = loadExceptions(root);
  const baseline = compareWithBaseline(evaluations, loadBaseline(root));
  const raised = new Set(baseline.raised.map((change) => change.evaluation.sample.id));
  const check = checkTargets(evaluations, exceptions, raised);
  const excepted = new Set(exceptions.map((exception) => exception.id));
  const cases = loadCases(root).map((fixed) => runCase(fixed));
  const reasons = loadReasons(root);
  const failures = [
    ...checkCoverage(corpus),
    ...checkProtectedPages(corpus, packs),
    ...check.failures,
    ...checkBaseline(baseline, excepted),
    ...checkCases(cases),
    ...checkReasons(reasons),
  ];
  return { corpus, evaluations, exceptions, check, cases, reasons, baseline, failures };
}

function table(header: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  const cell = (value: string | number) => String(value).replaceAll("|", "\\|");
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ].join("\n");
}

function shown(input: string): string {
  const escaped = Array.from(input)
    .map((char) => {
      const point = char.codePointAt(0) ?? 0;
      return point > 0x7e || point < 0x20
        ? `\\u{${point.toString(16).toUpperCase().padStart(4, "0")}}`
        : char;
    })
    .join("");
  return `\`${escaped.replaceAll("`", "'")}\``;
}

function sampleRow(evaluation: Evaluation): (string | number)[] {
  return [
    evaluation.sample.id,
    evaluation.sample.kind,
    evaluation.sample.source,
    evaluation.level,
    evaluation.score,
    evaluation.signals.join(", ") || "none",
    shown(evaluation.sample.input),
  ];
}

const SAMPLE_HEADER = ["Sample", "Kind", "Source", "Level", "Score", "Signals", "Input"];

function signalIds(evaluation: Evaluation): string[] {
  return evaluation.signals.map((key) => key.split("/")[0] ?? key);
}

export function renderReport(measurement: Measurement): string {
  const { evaluations, exceptions, check, cases, reasons, baseline } = measurement;
  const { rates } = check;
  const legitimate = evaluations.filter((item) => item.sample.label === "legitimate");
  const phishing = evaluations.filter((item) => item.sample.label === "phishing");
  const covered = phishing.filter((item) => !item.sample.outOfReach);
  const detected = (item: Evaluation) => item.level !== "safe" && item.level !== "not-analyzed";
  const mark = (ok: boolean) => (ok ? "met" : "FAILED");
  const out: string[] = [];

  out.push("# Calibration report", "");
  out.push(
    "Generated by `pnpm --filter @ojolink/test-corpus report`. Do not edit by hand.",
    "",
    "Most phishing samples in this corpus were built by hand to show one technique each. The detection rate is a regression guard: it shows that a change did not break a signal. It is not an estimate of how much real phishing the engine detects.",
    "",
  );

  out.push("## Targets", "");
  out.push(
    table(
      ["Target", "Measured", "Limit", "Result"],
      [
        [
          "Legitimate samples at danger",
          `${rates.legitimateAtDanger} of ${rates.legitimate} (${check.accepted.filter((item) => item.level === "danger" && item.sample.label === "legitimate").length} accepted as exceptions)`,
          "0 outside exceptions",
          mark(
            !check.failures.some((failure) => failure.startsWith("Legitimate sample at danger")),
          ),
        ],
        [
          "Legitimate samples at caution, not counting hosting pages and near-neighbour names",
          `${formatRate(rates.cautionRate)} (${rates.cautionMarked} of ${rates.cautionCounted})`,
          `at most ${formatRate(MAX_CAUTION_RATE)}`,
          mark(rates.cautionRate <= MAX_CAUTION_RATE),
        ],
        [
          "Real pages of protected domains at safe",
          `${rates.protectedSafe} of ${rates.protectedTotal}`,
          "all",
          mark(rates.protectedSafe === rates.protectedTotal),
        ],
        [
          "Covered phishing samples with a level other than safe",
          `${formatRate(rates.detectionRate)} (${rates.phishingDetected} of ${rates.phishingCovered})`,
          `at least ${formatRate(MIN_DETECTION_RATE)}`,
          mark(rates.detectionRate >= MIN_DETECTION_RATE),
        ],
      ],
    ),
    "",
  );
  out.push(
    measurement.failures.length === 0
      ? "Every check passes."
      : `Failed checks:\n\n${measurement.failures.map((failure) => `- ${failure}`).join("\n")}`,
    "",
  );

  out.push("## Corpus", "");
  const levelCount = (items: readonly Evaluation[], level: string) =>
    items.filter((item) => item.level === level).length;
  const kindRows = [
    ...LEGITIMATE_KINDS.map((kind) => ["legitimate", kind] as const),
    ...[...TECHNIQUES, OUT_OF_REACH].map((kind) => ["phishing", kind] as const),
  ].map(([label, kind]) => {
    const items = evaluations.filter(
      (item) => item.sample.label === label && item.sample.kind === kind,
    );
    return [
      label,
      kind,
      items.length,
      levelCount(items, "safe"),
      levelCount(items, "hidden-destination"),
      levelCount(items, "caution"),
      levelCount(items, "danger"),
    ];
  });
  out.push(
    table(
      ["Label", "Kind", "Samples", "Safe", "Hidden destination", "Caution", "Danger"],
      kindRows,
    ),
    "",
  );
  out.push(
    `Legitimate: ${legitimate.length} (minimum ${MIN_LEGITIMATE}). Phishing the engine covers: ${covered.length} (minimum ${MIN_PHISHING}). Out of reach: ${rates.outOfReach}.`,
    "",
  );

  out.push("## Real and constructed samples", "");
  out.push(
    table(
      ["Source", "Covered phishing samples", "Detected", "Missed"],
      (["real", "constructed"] as const).map((source) => {
        const items = covered.filter((item) => item.sample.source === source);
        const found = items.filter(detected).length;
        return [source, items.length, found, items.length - found];
      }),
    ),
    "",
  );

  out.push("## Signals", "");
  out.push(
    "Legitimate samples marked: legitimate samples where the signal triggered. Missed: phishing samples filed under the signal's technique that got the safe level.",
    "",
  );
  out.push(
    table(
      [
        "Signal",
        "Legitimate samples marked",
        "Of them, wrong results",
        "Phishing samples of its technique",
        "Missed",
      ],
      TECHNIQUES.map((id) => {
        const marked = legitimate.filter((item) => signalIds(item).includes(id));
        const own = covered.filter((item) => item.sample.kind === id);
        return [
          id,
          marked.length,
          marked.filter((item) => item.outcome === "false-positive").length,
          own.length,
          own.filter((item) => !detected(item)).length,
        ];
      }),
    ),
    "",
  );

  out.push("## Weights and thresholds", "");
  out.push(
    table(
      [
        "Value",
        "Now",
        "Phishing samples that trigger it",
        "Legitimate samples that trigger it",
        "Reason",
      ],
      [
        ...Object.entries(DEFAULT_CALIBRATION.thresholds).map(([name, value]) => [
          `threshold: ${name}`,
          value,
          "",
          "",
          reasons.thresholds[name] ?? "",
        ]),
        ...Object.entries(DEFAULT_CALIBRATION.weights).map(([key, weight]) => [
          key,
          weight,
          phishing.filter((item) => item.signals.includes(key)).length,
          legitimate.filter((item) => item.signals.includes(key)).length,
          reasons.weights[key] ?? "",
        ]),
      ],
    ),
    "",
  );

  const wrong = evaluations.filter(
    (item) => item.outcome === "false-positive" || item.outcome === "miss",
  );
  out.push("## Wrong results", "");
  out.push(
    wrong.length === 0
      ? "None."
      : table(
          [...SAMPLE_HEADER, "Outcome"],
          wrong.map((item) => [...sampleRow(item), item.outcome]),
        ),
    "",
  );

  out.push("## Accepted exceptions", "");
  out.push(
    exceptions.length === 0
      ? "None."
      : table(
          ["Sample", "Level", "Signals", "Reason"],
          exceptions.map((exception) => {
            const item = evaluations.find((entry) => entry.sample.id === exception.id);
            return [
              exception.id,
              item?.level ?? "not in the corpus",
              item?.signals.join(", ") ?? "",
              exception.reason,
            ];
          }),
        ),
    "",
  );

  out.push("## Changes since the baseline", "");
  out.push(
    "`baseline.json` records the level of every legitimate sample at the last accepted calibration. A sample that rises fails the check until it is resolved by a data change, a weight change, or a recorded exception.",
    "",
  );
  const changes = [...baseline.raised, ...baseline.lowered];
  out.push(
    changes.length === 0
      ? `No legitimate sample changed level (${baseline.compared} compared).`
      : table(
          ["Sample", "Kind", "Before", "Now", "Signals", "Input"],
          changes.map((change) => [
            change.evaluation.sample.id,
            change.evaluation.sample.kind,
            change.before,
            change.evaluation.level,
            change.evaluation.signals.join(", ") || "none",
            shown(change.evaluation.sample.input),
          ]),
        ),
    "",
  );

  const markedLegitimate = legitimate.filter((item) => item.signals.length > 0);
  out.push("## Legitimate samples marked by a signal", "");
  out.push(
    "Includes the kinds where the mark is the designed result: hidden destination for trackers and shorteners, caution for hosting pages and near-neighbour names.",
    "",
  );
  out.push(
    markedLegitimate.length === 0 ? "None." : table(SAMPLE_HEADER, markedLegitimate.map(sampleRow)),
    "",
  );

  out.push("## Fixed cases", "");
  out.push(
    table(
      ["Case", "Input", "Expected", "Got", "State"],
      cases.map((result) => [
        result.case.row,
        shown(result.case.input),
        `${result.case.expectedLevel}, ${result.case.expectedSignal ?? "no signal"}`,
        `${result.level}, ${result.signal ?? "no signal"}`,
        result.case.pending
          ? `pending on ${result.case.pending.change}: ${result.case.pending.reason}`
          : result.matches
            ? "passes"
            : "FAILS",
      ]),
    ),
    "",
  );

  const outOfReach = phishing.filter((item) => item.sample.outOfReach);
  out.push("## Out of reach", "");
  out.push(
    "Phishing that no local signal can detect. Kept to show the limit of the engine; not part of the detection rate.",
    "",
  );
  out.push(outOfReach.length === 0 ? "None." : table(SAMPLE_HEADER, outOfReach.map(sampleRow)), "");

  return out.join("\n");
}
