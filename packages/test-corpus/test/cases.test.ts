import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkCases, loadCases, runCase, type FixedCase } from "../src/cases.ts";
import { CORPUS_ROOT } from "../src/load.ts";

const cases = loadCases();
const byId = (id: string) => {
  const found = cases.find((fixed) => fixed.id === id);
  if (!found) throw new Error(`No fixed case "${id}"`);
  return runCase(found);
};

describe("fixed cases of the warning text table", () => {
  it("has one case per row: four active and three pending", () => {
    expect(cases.map((fixed) => fixed.row)).toEqual([
      "Alfabetos mezclados",
      "Todo cirílico",
      "Typosquatting",
      "Subdominio engañoso",
      "Texto distinto del destino",
      "Destino oculto",
      "IDN legítimo",
    ]);
    expect(
      cases.filter((fixed) => fixed.pending).map((fixed) => [fixed.id, fixed.pending?.change]),
    ).toEqual([
      ["todo-cirilico", "protected-domains-global"],
      ["typosquatting", "protected-domains-global"],
      ["texto-distinto-del-destino", "signal-link-text-mismatch"],
    ]);
  });

  it("writes lookalike characters as escapes", () => {
    const text = readFileSync(join(CORPUS_ROOT, "cases", "textos-por-caso.json"), "utf8");
    expect(text).toMatch(/^[\x20-\x7e\n]*$/);
    expect(text).toContain("b\\u0441\\u0440.com.bo");
  });

  it("mixed alphabets: danger, the link imitates bcp.com.bo", () => {
    expect(byId("alfabetos-mezclados")).toMatchObject({
      level: "danger",
      signal: "homograph",
      title: "Este enlace imita a bcp.com.bo",
      matches: true,
    });
  });

  it("deceptive subdomain: danger, the link is not from bcp.com.bo", () => {
    expect(byId("subdominio-enganoso")).toMatchObject({
      level: "danger",
      signal: "subdomain",
      title: "Este enlace no es de bcp.com.bo",
      matches: true,
    });
  });

  it("shortened link: hidden destination", () => {
    expect(byId("destino-oculto")).toMatchObject({
      level: "hidden-destination",
      title: "No se sabe a dónde lleva este enlace",
      matches: true,
    });
  });

  it("legitimate internationalized domain: safe with no signal", () => {
    expect(byId("idn-legitimo")).toMatchObject({ level: "safe", signal: null, matches: true });
  });

  it("every active case passes and every pending case still cannot", () => {
    expect(checkCases(cases.map((fixed) => runCase(fixed)))).toEqual([]);
  });

  it("fails on an active case that does not match", () => {
    const wrong: FixedCase = {
      id: "roto",
      row: "Roto",
      input: "https://www.lostiempos.com/",
      expectedLevel: "danger",
      expectedSignal: "homograph",
      expectedTitle: "Este enlace imita a bcp.com.bo",
    };
    expect(checkCases([runCase(wrong)])).toEqual([
      expect.stringMatching(/^Fixed case "roto" expected danger, homograph.*got safe, no signal/),
    ]);
  });

  it("fails on a pending case that starts passing, until its mark is removed", () => {
    const passing: FixedCase = {
      id: "ya-pasa",
      row: "Ya pasa",
      input: "bit.ly/x",
      expectedLevel: "hidden-destination",
      expectedSignal: "hidden-destination",
      expectedTitle: "No se sabe a dónde lleva este enlace",
      pending: { change: "otro-cambio", reason: "It used to fail." },
    };
    expect(checkCases([runCase(passing)])).toEqual([
      'Fixed case "ya-pasa" now passes: remove its pending mark (otro-cambio)',
    ]);
    expect(checkCases([runCase({ ...passing, expectedLevel: "danger" })])).toEqual([]);
  });
});
