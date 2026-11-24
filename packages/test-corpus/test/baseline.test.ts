import type { ProtectedPack } from "@ojolink/core";
import { describe, expect, it } from "vitest";
import {
  buildBaseline,
  checkBaseline,
  checkProtectedPages,
  compareWithBaseline,
  loadBaseline,
  renderBaseline,
} from "../src/baseline.ts";
import { loadCases, runCase } from "../src/cases.ts";
import { checkTargets, evaluateSample } from "../src/evaluate.ts";
import {
  checkCoverage,
  LEGITIMATE_KINDS,
  loadCorpus,
  TECHNIQUES,
  type Corpus,
} from "../src/load.ts";
import { measure, renderReport } from "../src/report.ts";
import { folder, measured, raw, sample } from "./helpers.ts";

const safe = measured("legitimate", "general", "normal", "safe", "ok");
const risen = measured("legitimate", "near-neighbour", "vecino", "caution", "ok", [
  "typosquat/changed",
]);
const fresh = measured("legitimate", "general", "nueva", "caution", "fp", ["ip-host/public"]);
const phishing = measured("phishing", "subdomain", "falso", "danger", "ok", ["subdomain/domain"]);

describe("baseline of legitimate samples", () => {
  it("records the level of every legitimate sample, in a stable order, and no phishing", () => {
    const baseline = buildBaseline([risen, phishing, safe]);
    expect(Object.entries(baseline)).toEqual([
      ["normal", "safe"],
      ["vecino", "caution"],
    ]);
    expect(renderBaseline(baseline)).toBe(`${JSON.stringify(baseline, null, 2)}\n`);
  });

  it("names a sample that rose, with its old and new level", () => {
    const comparison = compareWithBaseline([safe, risen], { normal: "safe", vecino: "safe" });
    expect(comparison.compared).toBe(2);
    expect(comparison.raised.map((change) => [change.evaluation.sample.id, change.before])).toEqual(
      [["vecino", "safe"]],
    );
    expect(checkBaseline(comparison, new Set())).toEqual([
      expect.stringMatching(
        /^Legitimate sample rose from safe since the baseline: "vecino".*got caution.*typosquat\/changed/,
      ),
    ]);
  });

  it("passes a risen sample that an exception covers", () => {
    const comparison = compareWithBaseline([safe, risen], { normal: "safe", vecino: "safe" });
    expect(checkBaseline(comparison, new Set(["vecino"]))).toEqual([]);
    const check = checkTargets(
      [safe, risen],
      [{ id: "vecino", reason: "Accepted." }],
      new Set(["vecino"]),
    );
    expect(check.failures).toEqual([]);
    expect(checkTargets([safe, risen], [{ id: "vecino", reason: "Accepted." }]).failures).toEqual([
      expect.stringContaining('Exception "vecino" no longer applies'),
    ]);
  });

  it("does not compare a new sample that has no baseline", () => {
    const comparison = compareWithBaseline([safe, fresh], { normal: "safe" });
    expect(comparison).toMatchObject({ compared: 1, raised: [], lowered: [] });
    expect(checkBaseline(comparison, new Set())).toEqual([]);
  });

  it("reports a sample that went down without failing", () => {
    const comparison = compareWithBaseline([safe], { normal: "caution" });
    expect(comparison.lowered).toHaveLength(1);
    expect(checkBaseline(comparison, new Set())).toEqual([]);
  });

  it("treats hidden destination as lower than caution and higher than safe", () => {
    const hidden = measured("legitimate", "shortener", "corto", "hidden-destination", "ok");
    expect(compareWithBaseline([hidden], { corto: "safe" }).raised).toHaveLength(1);
    expect(compareWithBaseline([hidden], { corto: "caution" }).lowered).toHaveLength(1);
  });

  it("fails on a baseline entry that is no longer a legitimate sample", () => {
    const comparison = compareWithBaseline([safe], { normal: "safe", borrada: "safe" });
    expect(checkBaseline(comparison, new Set())).toEqual([
      'baseline.json names "borrada", which is not a legitimate sample; rewrite it',
    ]);
  });

  it("compares nothing when there is no baseline file", () => {
    expect(loadBaseline(folder({}))).toBeNull();
    expect(compareWithBaseline([risen], null)).toEqual({
      compared: 0,
      raised: [],
      lowered: [],
      gone: [],
    });
  });

  it("says in the report that nothing changed, or lists each change", () => {
    const measurement = measure();
    expect(renderReport(measurement)).toContain(
      `No legitimate sample changed level (${measurement.baseline.compared} compared).`,
    );
    const [first] = measurement.evaluations.filter(
      (item) => item.sample.label === "legitimate" && item.level === "caution",
    );
    if (!first) throw new Error("no caution sample to use");
    const changed = renderReport({
      ...measurement,
      baseline: { ...measurement.baseline, raised: [{ evaluation: first, before: "safe" }] },
    });
    expect(changed).toMatch(new RegExp(`\\| ${first.sample.id} \\| .+ \\| safe \\| caution \\|`));
  });
});

describe("real pages of protected domains", () => {
  const packs: ProtectedPack[] = [
    {
      country: "bo",
      suffixes: [],
      entries: [{ domain: "bcp.com.bo", name: "BCP", category: "bank" }],
    },
    {
      country: "global",
      suffixes: [],
      entries: [
        { domain: "paypal.com", name: "PayPal", category: "payments" },
        { domain: "live.com", name: "Microsoft", category: "mail" },
      ],
    },
  ];
  const page = (id: string, input: string) => sample("legitimate", "protected", id, { input });
  const corpus = (...samples: Corpus["samples"][number][]): Corpus => ({ samples });

  it("asks for three pages of a country domain and one of a global domain", () => {
    const full = corpus(
      page("a", "https://www.bcp.com.bo/"),
      page("b", "https://www.bcp.com.bo/personas"),
      page("c", "https://bcp.com.bo/empresas"),
      page("d", "https://www.paypal.com/bo/home"),
      page("e", "https://login.live.com/"),
    );
    expect(checkProtectedPages(full, packs)).toEqual([]);
  });

  it("names a country domain with two pages and a global domain with none", () => {
    const short = corpus(
      page("a", "https://www.bcp.com.bo/"),
      page("b", "https://www.bcp.com.bo/personas"),
      page("d", "https://www.paypal.com/"),
      sample("legitimate", "general", "x", { input: "https://live.com/" }),
      page("y", "https://notlive.com/"),
    );
    expect(checkProtectedPages(short, packs)).toEqual([
      'The protected domain "bcp.com.bo" of the bo pack has 2 real pages in the corpus; it needs 3',
      'The protected domain "live.com" of the global pack has 0 real pages in the corpus; it needs 1',
    ]);
  });
});

describe("names that contain a brand", () => {
  it("is a kind the corpus must cover", () => {
    expect(LEGITIMATE_KINDS).toContain("brand-word");
    const samples = [
      ...LEGITIMATE_KINDS.filter((kind) => kind !== "brand-word").flatMap((kind) =>
        Array.from({ length: 40 }, (_, index) => sample("legitimate", kind, `${kind}-${index}`)),
      ),
      ...TECHNIQUES.flatMap((technique) =>
        Array.from({ length: 6 }, (_, index) =>
          sample("phishing", technique, `${technique}-${index}`),
        ),
      ),
    ];
    expect(checkCoverage({ samples })).toEqual(['No legitimate sample of kind "brand-word"']);
  });

  it.each([
    ["https://www.applebees.com/", "safe", "correct"],
    ["https://www.netflix-codes.com/", "caution", "correct"],
    ["https://paypal-seguridad.net/", "danger", "false-positive"],
  ])("accepts safe and caution but not danger: %s gets %s", (input, level, outcome) => {
    const result = evaluateSample(sample("legitimate", "brand-word", "uno", { input }));
    expect(result).toMatchObject({ level, outcome, countsTowardCaution: false });
  });

  it("is loaded from its own file", () => {
    const root = folder({
      "samples/legitimate/brand-word.json": [raw("granja", "https://apple-farm.example/")],
    });
    expect(loadCorpus(root).samples[0]).toMatchObject({ kind: "brand-word" });
  });
});

describe("fixed cases that waited for the global pack", () => {
  const cases = loadCases().map((fixed) => runCase(fixed));
  const byId = (id: string) => cases.find((result) => result.case.id === id);

  it("all-Cyrillic lookalike of apple.com: danger, says it imitates apple.com", () => {
    expect(byId("todo-cirilico")).toMatchObject({
      level: "danger",
      signal: "homograph",
      title: "Este enlace imita a apple.com",
      matches: true,
    });
    expect(byId("todo-cirilico")?.case.pending).toBeUndefined();
  });

  it("micros0ft.com: danger, says it imitates microsoft.com", () => {
    expect(byId("typosquatting")).toMatchObject({
      level: "danger",
      signal: "homograph",
      title: "Este enlace imita a microsoft.com",
      matches: true,
    });
    expect(byId("typosquatting")?.case.pending).toBeUndefined();
  });
});
