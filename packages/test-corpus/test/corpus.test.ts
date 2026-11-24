import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createEngine, DEFAULT_CALIBRATION, DEFAULT_SIGNALS, PROTECTED_PACKS } from "@ojolink/core";
import { describe, expect, it } from "vitest";
import { checkProtectedPages, loadBaseline } from "../src/baseline.ts";
import { checkTargets, describeRates, evaluateCorpus } from "../src/evaluate.ts";
import { checkCoverage, CORPUS_ROOT, findEmailAddress, LEGITIMATE_KINDS } from "../src/load.ts";
import { checkReasons, measure, renderReport, REPORT_FILE } from "../src/report.ts";

const measurement = measure();
const { corpus, evaluations, reasons } = measurement;
const of = (label: string, kind?: string) =>
  evaluations.filter(
    (item) => item.sample.label === label && (kind === undefined || item.sample.kind === kind),
  );
const byId = (id: string) => {
  const found = evaluations.find((item) => item.sample.id === id);
  if (!found) throw new Error(`No sample "${id}"`);
  return found;
};
const normalize = (text: string) => text.replaceAll("\r\n", "\n");

describe("the corpus", () => {
  it("covers every kind and reaches its minimum size", () => {
    expect(checkCoverage(corpus)).toEqual([]);
    expect(of("legitimate").length).toBeGreaterThanOrEqual(200);
    expect(of("phishing").filter((item) => !item.sample.outOfReach).length).toBeGreaterThanOrEqual(
      50,
    );
  });

  it("has enough samples of each legitimate kind", () => {
    expect(of("legitimate", "general").length).toBeGreaterThanOrEqual(100);
    for (const kind of LEGITIMATE_KINDS) {
      expect(of("legitimate", kind).length, kind).toBeGreaterThanOrEqual(10);
    }
  });

  it("holds legitimate domains with ñ and accented vowels", () => {
    const inputs = of("legitimate", "idn").map((item) => item.sample.input);
    expect(inputs.some((input) => input.includes("ñ"))).toBe(true);
    expect(inputs.some((input) => /[áéíóúü]/.test(input))).toBe(true);
  });

  it("holds a legitimate newsletter link that goes through a tracking redirect", () => {
    expect(byId("tracker-mailchimp")).toMatchObject({
      sample: { label: "legitimate", kind: "tracker" },
      level: "hidden-destination",
    });
  });

  it("holds the two links of the phishing email of 19 November 2026, with no recipient data", () => {
    const real = of("phishing").filter((item) => item.sample.source === "real");
    expect(real.map((item) => item.sample.id)).toEqual([
      "hosting-real-2026-11-19-google-sites",
      "hosting-real-2026-11-19-zya-redirect",
    ]);
    for (const item of real) {
      expect(item.sample).toMatchObject({ collected: "2026-11-19", kind: "hosting" });
      expect(item.level).toBe("danger");
      expect(findEmailAddress(item.sample.input)).toBeNull();
      expect(findEmailAddress(item.sample.note ?? "")).toBeNull();
    }
    expect(real[0]?.sample.input).toContain("sites.google.com/view/");
    expect(real[1]?.sample.input).toContain("zya.me");
  });

  it("holds real pages of every protected domain, all safe", () => {
    const domains = PROTECTED_PACKS.flatMap((pack) => pack.entries.map((entry) => entry.domain));
    expect(domains.length).toBeGreaterThan(300);
    expect(checkProtectedPages(measurement.corpus, PROTECTED_PACKS)).toEqual([]);
    const pages = of("legitimate", "protected");
    expect(pages.length).toBeGreaterThanOrEqual(domains.length);
    expect(pages.filter((item) => item.level !== "safe")).toEqual([]);
  });

  it("holds real names that contain a brand, and none reaches danger", () => {
    const names = of("legitimate", "brand-word");
    expect(names.length).toBeGreaterThanOrEqual(30);
    expect(names.filter((item) => item.level === "danger")).toEqual([]);
  });

  it("has a baseline for every legitimate sample, with nothing risen since", () => {
    const baseline = loadBaseline();
    const legitimate = measurement.evaluations.filter((item) => item.sample.label === "legitimate");
    expect(Object.keys(baseline ?? {}).sort()).toEqual(
      legitimate.map((item) => item.sample.id).sort(),
    );
    expect(measurement.baseline.raised).toEqual([]);
  });

  it("holds real names close to a protected domain, and none reaches danger", () => {
    const inputs = of("legitimate", "near-neighbour").map((item) => item.sample.input);
    for (const name of ["banco.com.bo", "gestor.bo", "gestoria.bo", "bancofin.com.bo"]) {
      expect(inputs, name).toContain(`https://${name}/`);
    }
    expect(byId("near-neighbour-banco-com-bo").level).toBe("caution");
    expect(of("legitimate", "near-neighbour").filter((item) => item.level === "danger")).toEqual(
      [],
    );
  });

  it("has at least two phishing samples for every weight of the default calibration", () => {
    for (const key of Object.keys(DEFAULT_CALIBRATION.weights)) {
      const samples = of("phishing").filter((item) => item.signals.includes(key));
      expect(samples.length, key).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps phishing no local signal can detect, apart from the detection rate", () => {
    const far = of("phishing").filter((item) => item.sample.outOfReach);
    expect(far.length).toBeGreaterThan(0);
    expect(far.every((item) => item.outcome === "out-of-reach")).toBe(true);
    expect(measurement.check.rates.outOfReach).toBe(far.length);
    expect(measurement.check.rates.phishingCovered).toBe(of("phishing").length - far.length);
  });
});

describe("the default weights and thresholds", () => {
  it("meet every accuracy target", () => {
    process.stdout.write(`\n${describeRates(measurement.check.rates)}\n`);
    expect(measurement.failures).toEqual([]);
  });

  it("fail the check when a weight is raised and a legitimate sample reaches danger", () => {
    const raised = createEngine({
      signals: DEFAULT_SIGNALS,
      calibration: {
        ...DEFAULT_CALIBRATION,
        weights: { ...DEFAULT_CALIBRATION.weights, "typosquat/missing": 90 },
      },
    });
    const result = checkTargets(evaluateCorpus(corpus, raised), measurement.exceptions);
    expect(result.ok).toBe(false);
    expect(result.failures).toContainEqual(
      expect.stringMatching(
        /^Legitimate sample at danger: "near-neighbour-banco-com-bo".*typosquat\/missing/,
      ),
    );
  });

  it("have a recorded reason each, and no reason is left for a value that is gone", () => {
    expect(checkReasons(reasons)).toEqual([]);
    expect(Object.keys(reasons.weights).sort()).toEqual(
      Object.keys(DEFAULT_CALIBRATION.weights).sort(),
    );
    expect(Object.keys(reasons.thresholds).sort()).toEqual(["caution", "danger"]);
    expect(reasons.weights["typosquat/changed"]).toMatch(/Measured: \d+ phishing samples/);
  });

  it("fail the check when a reason is removed or explains an unknown weight", () => {
    const { "encoded-host": _removed, ...rest } = reasons.weights;
    void _removed;
    expect(checkReasons({ ...reasons, weights: rest })).toEqual([
      'calibration.json has no reason for the weight "encoded-host"',
    ]);
    expect(
      checkReasons({ ...reasons, weights: { ...reasons.weights, "old/gone": "Why." } }),
    ).toEqual(['calibration.json explains a weight the engine does not have: "old/gone"']);
    expect(
      checkReasons({ ...reasons, thresholds: { caution: reasons.thresholds.caution ?? "" } }),
    ).toEqual(['calibration.json has no reason for the threshold "danger"']);
  });
});

describe("the report", () => {
  const report = renderReport(measurement);
  const path = join(CORPUS_ROOT, REPORT_FILE);

  it("is up to date with the corpus and the engine", () => {
    const onDisk = existsSync(path) ? normalize(readFileSync(path, "utf8")) : "";
    const stale = onDisk !== normalize(report);
    expect(
      stale
        ? `${REPORT_FILE} is stale: run "pnpm --filter @ojolink/test-corpus report"`
        : "up to date",
    ).toBe("up to date");
  });

  it("is the same on every run", () => {
    expect(renderReport(measure())).toBe(report);
  });

  it("changes when a sample changes, so an edit without regenerating is caught", () => {
    const edited = evaluations.map((item) =>
      item.sample.id === "general-www-google-com"
        ? { ...item, sample: { ...item.sample, kind: "hosting" } }
        : item,
    );
    expect(renderReport({ ...measurement, evaluations: edited })).not.toBe(report);
  });

  it("counts a legitimate sample under the signal that marked it and lists it with its level", () => {
    expect(report).toMatch(/\| typosquat \| 34 \| 0 \| \d+ \| 0 \|/);
    expect(report).toMatch(
      /\| near-neighbour-banco-com-bo \| near-neighbour \| constructed \| caution \| 60 \| typosquat\/missing \|/,
    );
  });

  it("lists a phishing sample that got the safe level as a miss under its technique", () => {
    const missed = evaluations.map((item) =>
      item.sample.id === "typosquat-two-bancoecofuturo"
        ? { ...item, level: "safe" as const, score: 0, signals: [], outcome: "miss" as const }
        : item,
    );
    const changed = renderReport({ ...measurement, evaluations: missed });
    expect(changed).toMatch(/\| typosquat \| 34 \| 0 \| \d+ \| 1 \|/);
    expect(changed).toMatch(
      /\| typosquat-two-bancoecofuturo \| typosquat \| constructed \| safe \| 0 \| none \|.*\| miss \|/,
    );
  });

  it("shows detected samples apart for real messages and for samples built by hand", () => {
    expect(report).toMatch(/\| real \| 2 \| 2 \| 0 \|/);
    expect(report).toMatch(/\| constructed \| \d+ \| \d+ \| 0 \|/);
  });

  it("says the detection rate is a regression guard", () => {
    expect(report).toContain("The detection rate is a regression guard");
  });

  it("lists exceptions with their reasons, pending cases, and out-of-reach samples", () => {
    expect(report).toMatch(
      /\| hosting-page-office-update-notes-pages-dev \| danger \| hosting\/words \| .+ \|/,
    );
    expect(report).not.toContain("pending on protected-domains-global");
    expect(report).toMatch(/\| Todo cirílico \| .+ \| passes \|/);
    expect(report).toMatch(/\| Typosquatting \| .+ \| passes \|/);
    expect(report).toMatch(/pending on signal-link-text-mismatch/);
    expect(report).toMatch(/\| out-of-reach-ordinary-domain-login \| out-of-reach \|/);
  });

  it("gives the reason beside every weight and threshold", () => {
    for (const [key, weight] of Object.entries(DEFAULT_CALIBRATION.weights)) {
      expect(report, key).toContain(`| ${key} | ${weight} |`);
    }
    expect(report).toContain("| threshold: danger | 70 |");
    expect(report).toContain(reasons.weights["hosting/words"]);
  });

  it("reports hosting pages at caution under their kind", () => {
    expect(report).toMatch(/\| legitimate \| hosting \| \d+ \| \d+ \| 0 \| \d+ \| 2 \|/);
  });
});
