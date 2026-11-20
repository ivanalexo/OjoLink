import { describe, expect, it } from "vitest";
import {
  analyze,
  checkUserDomain,
  createDefaultEngine,
  createDefaultSignals,
  DEFAULT_SIGNALS,
  describeResult,
  prepareUserDomains,
  USER_DOMAIN_LIMIT,
  type AnalysisResult,
  type Verdict,
} from "../src/index.js";

const cp = (...points: number[]) => String.fromCodePoint(...points);
const CYRILLIC_E = cp(0x0435);

const engine = createDefaultEngine({ userDomains: ["miempresa.com.bo"] });

function verdict(result: AnalysisResult): Verdict {
  if (!result.analyzed) throw new Error("expected a verdict");
  return result;
}

describe("checkUserDomain", () => {
  it.each([
    ["https://www.MiEmpresa.com.bo/login", "miempresa.com.bo"],
    ["www.miempresa.com.bo", "miempresa.com.bo"],
    ["  miempresa.bo  ", "miempresa.bo"],
    ["portal.interno.miempresa.bo:8080/acceso?x=1", "miempresa.bo"],
    ["miblog.github.io", "miblog.github.io"],
  ])("reduces %s to %s", (entry, domain) => {
    expect(checkUserDomain(entry)).toEqual({ ok: true, domain });
  });

  it("gives the same domain for both written forms of an internationalized domain", () => {
    const written = checkUserDomain(`yuri${cp(0xf1)}a.gob.bo`);
    const encoded = checkUserDomain("xn--yuria-rta.gob.bo");
    expect(written.ok).toBe(true);
    expect(encoded).toEqual(written);
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["juan@miempresa.com.bo", "email-address"],
    ["192.168.1.10", "ip-address"],
    ["http://[::1]/", "ip-address"],
    ["com.bo", "public-suffix"],
    ["github.io", "public-suffix"],
    ["no es un dominio", "not-a-domain"],
    ["localhost", "not-a-domain"],
    ["intranet.local", "not-a-domain"],
    ["https://www.google.com/url?q=https%3A%2F%2Fmiempresa.com.bo%2F", "not-a-domain"],
  ])("rejects %j as %s", (entry, reason) => {
    expect(checkUserDomain(entry)).toEqual({ ok: false, reason });
  });

  it.each([undefined, null, 42, {}, ["miempresa.bo"]])("rejects the non-string %j", (entry) => {
    expect(checkUserDomain(entry)).toEqual({ ok: false, reason: "not-a-domain" });
  });
});

describe("prepareUserDomains", () => {
  it("keeps the good entries when one is bad", () => {
    const report = prepareUserDomains(["miempresa.com.bo", "no es un dominio", "micooperativa.bo"]);
    expect(report.domains).toEqual(["miempresa.com.bo", "micooperativa.bo"]);
    expect(report.entries).toEqual([
      { input: "miempresa.com.bo", accepted: true, domain: "miempresa.com.bo" },
      { input: "no es un dominio", accepted: false, reason: "not-a-domain" },
      { input: "micooperativa.bo", accepted: true, domain: "micooperativa.bo" },
    ]);
  });

  it("reports a domain of an embedded list as already protected", () => {
    const report = prepareUserDomains(["https://www.bcp.com.bo/"]);
    expect(report.domains).toEqual([]);
    expect(report.entries[0]).toMatchObject({ accepted: false, reason: "already-protected" });
  });

  it("protects a domain once and reports the second entry as repeated", () => {
    const report = prepareUserDomains(["miempresa.com.bo", "https://WWW.miempresa.com.bo/x"]);
    expect(report.domains).toEqual(["miempresa.com.bo"]);
    expect(report.entries[1]).toMatchObject({ accepted: false, reason: "repeated" });
  });

  it("accepts the first hundred and rejects the next for the limit", () => {
    const entries = Array.from({ length: USER_DOMAIN_LIMIT + 1 }, (_, i) => `empresa${i}.com.bo`);
    const report = prepareUserDomains(entries);
    expect(USER_DOMAIN_LIMIT).toBe(100);
    expect(report.domains).toHaveLength(100);
    expect(report.domains).toEqual(entries.slice(0, 100));
    expect(report.entries[100]).toMatchObject({ accepted: false, reason: "limit-reached" });
  });

  it.each([undefined, null, "miempresa.bo", 7, {}])("never throws for the input %j", (input) => {
    expect(prepareUserDomains(input)).toEqual({ domains: [], entries: [] });
  });

  it("never throws for entries of any type", () => {
    const report = prepareUserDomains([null, 3, {}, "miempresa.bo"]);
    expect(report.domains).toEqual(["miempresa.bo"]);
    expect(report.entries.filter((entry) => !entry.accepted)).toHaveLength(3);
  });
});

describe("default signals", () => {
  it("keeps the ids and the order of the built-in signals", () => {
    const ids = (signals: readonly { id: string }[]) => signals.map((signal) => signal.id);
    expect(ids(createDefaultSignals())).toEqual(ids(DEFAULT_SIGNALS));
    expect(ids(createDefaultSignals(["miempresa.com.bo"]))).toEqual(ids(DEFAULT_SIGNALS));
  });
});

describe("engine with user domains", () => {
  it("exposes the validation report", () => {
    const built = createDefaultEngine({ userDomains: ["miempresa.com.bo", "com.bo"] });
    expect(built.userDomains.domains).toEqual(["miempresa.com.bo"]);
    expect(built.userDomains.entries[1]).toMatchObject({ reason: "public-suffix" });
  });

  it("warns about a deceptive subdomain of a user domain", () => {
    const result = verdict(engine.analyze("https://miempresa.com.bo.verifica.net/"));
    expect(result.level).toBe("danger");
    expect(result.signals[0]?.id).toBe("subdomain");
    expect(result.signals[0]?.title).toBe("Este enlace no es de miempresa.com.bo");
  });

  it("warns about a misspelling of a user domain", () => {
    const result = verdict(engine.analyze("https://miempreza.com.bo/"));
    expect(result.signals[0]?.id).toBe("typosquat");
    expect(result.signals[0]?.title).toContain("miempresa.com.bo");
  });

  it("warns about lookalike characters of a user domain", () => {
    const result = verdict(engine.analyze(`https://mi${CYRILLIC_E}mpresa.com.bo/`));
    expect(result.level).toBe("danger");
    expect(result.signals.map((signal) => signal.id)).toContain("homograph");
    expect(describeResult(result)).toMatchObject({
      warning: { title: "Este enlace imita a miempresa.com.bo" },
    });
  });

  it("keeps protecting the embedded domains", () => {
    const result = verdict(engine.analyze("https://bcp.com.bo.verifica.net/"));
    expect(result.level).toBe("danger");
    expect(result.signals[0]?.title).toBe("Este enlace no es de bcp.com.bo");
  });

  it.each(["https://miempresa.com.bo/", "https://portal.miempresa.com.bo/acceso"])(
    "treats %s as the user's own site",
    (link) => {
      const result = verdict(engine.analyze(link));
      expect(result.level).toBe("safe");
      expect(result.signals).toEqual([]);
    },
  );

  it("stops reporting a real domain close to an embedded one once the user adds it", () => {
    const link = "https://banco.com.bo/";
    expect(verdict(analyze(link)).signals.map((signal) => signal.id)).toContain("typosquat");
    const own = createDefaultEngine({ userDomains: ["banco.com.bo"] });
    expect(verdict(own.analyze(link)).signals).toEqual([]);
  });

  it("leaves the module-level analysis without the list", () => {
    for (const link of ["https://miempresa.com.bo.verifica.net/", "https://miempreza.com.bo/"]) {
      const ids = verdict(analyze(link)).signals.map((signal) => signal.id);
      expect(ids).not.toContain("subdomain");
      expect(ids).not.toContain("typosquat");
    }
  });

  it("gives the same results as before when no user domains are provided", () => {
    const plain = createDefaultEngine();
    const empty = createDefaultEngine({ userDomains: [] });
    for (const link of [
      "https://www.bcp.com.bo/personas",
      "https://bcp.com.bo.verifica.net/",
      "https://banco.com.bo/",
      "https://bit.ly/x",
      "https://sites.google.com/view/serivciosbandejamensajeriaen/",
      "https://example.com/",
      "no es un enlace",
    ]) {
      expect(plain.analyze(link)).toEqual(analyze(link));
      expect(empty.analyze(link)).toEqual(analyze(link));
    }
  });

  it("fills every text that names the entity with the user's domain", () => {
    for (const link of [
      "https://miempresa.com.bo.verifica.net/",
      "https://miempreza.com.bo/",
      `https://mi${CYRILLIC_E}mpresa.com.bo/`,
    ]) {
      const signals = verdict(engine.analyze(link)).signals.filter((signal) =>
        ["homograph", "subdomain", "typosquat"].includes(signal.id),
      );
      expect(signals.length).toBeGreaterThan(0);
      for (const signal of signals) {
        const text = [
          signal.tooltip,
          signal.title,
          signal.explanation,
          signal.advice,
          signal.technical,
        ].join(" ");
        expect(text).not.toMatch(/[{}]|undefined/);
        expect(text).toContain("miempresa.com.bo");
      }
    }
  });
});
