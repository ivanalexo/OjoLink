import { describe, expect, it } from "vitest";
import {
  checkCoverage,
  findEmailAddress,
  LEGITIMATE_KINDS,
  loadCorpus,
  TECHNIQUES,
  type Corpus,
} from "../src/load.ts";
import { folder, problemsOf, raw, sample } from "./helpers.ts";

const GOOGLE_REDIRECT =
  "http://www.google.com/url?q=http%3A%2F%2Fasistenciatecnicaserviciosmensajeria.zya.me%2F&sa=D&sntz=1&usg=AOvVaw152VXhZrFqUA-a_cU2CXQG";

describe("loading samples", () => {
  it("takes the label and the kind from the folder and the file name", () => {
    const corpus = loadCorpus(
      folder({
        "samples/legitimate/tracker.json": [
          raw("boletin", "https://example.us12.list-manage.com/track/click?u=1&id=2"),
        ],
        "samples/phishing/subdomain.json": [
          raw("falso", "https://bcp.com.bo.example.net/", { source: "real", note: "De un SMS." }),
        ],
        "samples/phishing/out-of-reach.json": [raw("nuevo", "https://example.org/banca")],
      }),
    );
    expect(
      corpus.samples.map(({ id, label, kind, outOfReach }) => [id, label, kind, outOfReach]),
    ).toEqual([
      ["boletin", "legitimate", "tracker", false],
      ["falso", "phishing", "subdomain", false],
      ["nuevo", "phishing", "out-of-reach", true],
    ]);
    expect(corpus.samples[1]).toMatchObject({ source: "real", note: "De un SMS." });
  });

  it("reads the optional fields", () => {
    const corpus = loadCorpus(
      folder({
        "samples/phishing/homograph.json": [
          raw("uno", "https://example.com/", {
            expected: "danger",
            userDomains: ["apple.com"],
            visibleText: "apple.com",
            outOfReach: true,
          }),
        ],
      }),
    );
    expect(corpus.samples[0]).toMatchObject({
      expected: "danger",
      userDomains: ["apple.com"],
      visibleText: "apple.com",
      outOfReach: true,
    });
  });

  it.each([
    ["a missing input", { id: "malo", source: "real", collected: "2026-11-20" }, "needs an input"],
    ["an unknown source", raw("malo", "https://a.bo/", { source: "rumor" }), "needs a source"],
    ["a missing date", { id: "malo", input: "https://a.bo/", source: "real" }, "collected date"],
    [
      "a date that does not exist",
      raw("malo", "https://a.bo/", { collected: "2026-02-31" }),
      "collected date",
    ],
    ["a bad level", raw("malo", "https://a.bo/", { expected: "red" }), "expected must be"],
    [
      "an unknown field",
      raw("malo", "https://a.bo/", { label: "phishing" }),
      'unknown field "label"',
    ],
    [
      "user domains that are not a list",
      raw("malo", "https://a.bo/", { userDomains: "a.bo" }),
      "userDomains",
    ],
  ])("rejects %s and names the sample", (_name, entry, message) => {
    const problems = problemsOf({ "samples/phishing/subdomain.json": [entry] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"malo"');
    expect(problems[0]).toContain(message);
  });

  it("rejects a repeated id", () => {
    const problems = problemsOf({
      "samples/phishing/subdomain.json": [raw("igual", "https://a.example.net/")],
      "samples/legitimate/general.json": [raw("igual", "https://example.com/")],
    });
    expect(problems).toEqual(['"igual": the id is repeated']);
  });

  it("rejects an out-of-reach mark on a legitimate sample", () => {
    const problems = problemsOf({
      "samples/legitimate/general.json": [
        raw("malo", "https://example.com/", { outOfReach: true }),
      ],
    });
    expect(problems[0]).toContain("only a phishing sample can be out of reach");
  });

  it("fails on a sample without a label and names it", () => {
    expect(
      problemsOf({ "samples/sueltas.json": [raw("sin-etiqueta", "https://example.com/")] }),
    ).toEqual([expect.stringMatching(/no label.*"sin-etiqueta"/)]);
    expect(
      problemsOf({ "samples/dudosas/general.json": [raw("dudosa", "https://example.com/")] }),
    ).toEqual([expect.stringMatching(/no label.*"dudosa"/)]);
  });

  it("fails on a sample without a category and names it", () => {
    const problems = problemsOf({
      "samples/legitimate/varios.json": [raw("sin-categoria", "https://example.com/")],
    });
    expect(problems).toEqual([expect.stringMatching(/no category.*"sin-categoria"/)]);
  });

  it("lists every problem at once", () => {
    const problems = problemsOf({
      "samples/phishing/subdomain.json": [
        raw("uno", ""),
        raw("dos", "https://a.bo/", { source: "x" }),
      ],
    });
    expect(problems).toHaveLength(2);
  });
});

describe("personal data", () => {
  it.each([
    ["the input", { input: "https://example.net/baja?correo=juan.perez@example.com" }],
    [
      "an encoded address in the input",
      { input: "https://example.net/baja?e=juan.perez%40example.com" },
    ],
    ["the note", { note: "Recibido por juan.perez@example.com el lunes." }],
    ["the link text", { visibleText: "Escribe a juan.perez@example.com" }],
  ])("fails on an email address in %s and names the sample", (_name, extra) => {
    const problems = problemsOf({
      "samples/phishing/subdomain.json": [raw("con-correo", "https://example.net/", extra)],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/"con-correo".*email address/);
  });

  it("accepts the real Google redirect with its usg parameter", () => {
    const corpus = loadCorpus(
      folder({
        "samples/phishing/hosting.json": [raw("real", GOOGLE_REDIRECT, { source: "real" })],
      }),
    );
    expect(corpus.samples).toHaveLength(1);
  });

  it("does not take the credentials technique for an address", () => {
    expect(findEmailAddress("https://bcp.com.bo@example.net/")).toBeNull();
    expect(findEmailAddress("https://admin:1234@example.com/panel")).toBeNull();
    expect(findEmailAddress("https://example.net/perfil/@juan")).toBeNull();
  });

  it("finds an address written before the @ of a link", () => {
    expect(findEmailAddress("https://ana@example.com@example.net/")).toBe("ana@example.com");
  });
});

describe("coverage and size", () => {
  function corpusOf(legitimate: number, phishing: number, skip: string[] = []): Corpus {
    const kinds = LEGITIMATE_KINDS.filter((kind) => !skip.includes(kind));
    const techniques = TECHNIQUES.filter((technique) => !skip.includes(technique));
    return {
      samples: [
        ...Array.from({ length: legitimate }, (_, index) =>
          sample("legitimate", kinds[index % kinds.length] ?? "general", `l${index}`),
        ),
        ...Array.from({ length: phishing }, (_, index) =>
          sample("phishing", techniques[index % techniques.length] ?? "subdomain", `p${index}`),
        ),
      ],
    };
  }

  it("passes with every kind and enough samples", () => {
    expect(checkCoverage(corpusOf(200, 50))).toEqual([]);
  });

  it("names a legitimate kind with no samples", () => {
    expect(checkCoverage(corpusOf(200, 50, ["idn"]))).toEqual([
      'No legitimate sample of kind "idn"',
    ]);
  });

  it("names a technique with no phishing samples", () => {
    expect(checkCoverage(corpusOf(200, 50, ["typosquat"]))).toEqual([
      'No phishing sample for the technique "typosquat"',
    ]);
  });

  it("reports how many legitimate samples are missing", () => {
    expect(checkCoverage(corpusOf(188, 50))).toEqual([
      "The corpus holds 188 legitimate samples: 12 more are needed to reach 200",
    ]);
  });

  it("reports how many phishing samples are missing, not counting out-of-reach ones", () => {
    const corpus = corpusOf(200, 50);
    const samples = corpus.samples.map((item) =>
      item.id === "p0" || item.id === "p1" ? { ...item, outOfReach: true } : item,
    );
    expect(checkCoverage({ samples })).toEqual([
      "The corpus holds 48 phishing samples: 2 more are needed to reach 50",
    ]);
  });
});
