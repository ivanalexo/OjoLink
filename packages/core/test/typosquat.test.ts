import { describe, expect, it } from "vitest";
import {
  analyze,
  createTyposquatSignal,
  normalizeUrl,
  type ProtectedPack,
  type Signal,
  type TriggeredSignal,
  type TyposquatDetails,
  type Verdict,
} from "../src/index.js";
import { PROTECTED_PACKS } from "../src/data/index.js";

const typosquat = createTyposquatSignal(PROTECTED_PACKS);

function pack(...domains: string[]): ProtectedPack[] {
  return [
    {
      country: "zz",
      suffixes: [],
      entries: domains.map((domain) => ({ domain, name: domain, category: "bank" as const })),
    },
  ];
}

function hit(host: string, signal: Signal = typosquat) {
  const result = normalizeUrl(`https://${host}/`);
  if (!result.ok) throw new Error(`could not normalize ${host}: ${result.reason}`);
  return signal.evaluate(result.url, {});
}

function details(host: string, signal: Signal = typosquat): TyposquatDetails {
  return hit(host, signal)?.details as TyposquatDetails;
}

function verdict(host: string): Verdict {
  const result = analyze(`https://${host}/`);
  if (!result.analyzed) throw new Error(`expected a verdict for ${host}`);
  return result;
}

function own(host: string): TriggeredSignal {
  const found = verdict(host).signals.find((signal) => signal.id === "typosquat");
  if (!found) throw new Error(`typosquat did not trigger for ${host}`);
  return found;
}

describe("misspelling of a protected name", () => {
  it.each([
    ["an extra letter", "bancosoll.com.bo", "bancosol.com.bo", "BancoSol", "extra"],
    ["a missing letter", "bancofe.com.bo", "bancofie.com.bo", "Banco FIE", "missing"],
    ["a changed letter", "prodam.bo", "prodem.bo", "Banco Prodem", "changed"],
    ["two swapped letters", "bancounoin.com.bo", "bancounion.com.bo", "Banco Unión", "swapped"],
  ])("triggers for %s", (_name, host, imitated, entity, kind) => {
    expect(details(host)).toEqual({ imitated, entity, written: host, kind, edits: 1 });
  });

  it("triggers on a subdomain of the misspelled domain", () => {
    expect(details("www.bancosoll.com.bo")).toMatchObject({
      imitated: "bancosol.com.bo",
      written: "bancosoll.com.bo",
    });
  });

  it("reports the site that really owns the link", () => {
    expect(hit("bancosoll.com.bo")?.params).toMatchObject({ realDomain: "bancosoll.com.bo" });
  });
});

describe("two slips in a long name", () => {
  it("triggers for a name of ten or more characters", () => {
    expect(details("bancoecofturro.com.bo")).toMatchObject({
      imitated: "bancoecofuturo.com.bo",
      kind: "two",
      edits: 2,
    });
  });

  it.each(["bancosur.com.bo", "bancofxa.com.bo", "prodxn.bo"])(
    "does not trigger for two edits in the shorter name %s",
    (host) => {
      expect(hit(host)).toBeNull();
    },
  );

  it("does not trigger for three edits in a long name", () => {
    expect(hit("bancoecofxyzro.com.bo")).toBeNull();
  });
});

describe("short names", () => {
  it.each([
    ["an unrelated brand one letter away", "visa.com"],
    ["a short name of the same country", "bna.com.bo"],
    ["another short name", "bcq.com.bo"],
    ["a four-letter name", "asfx.gob.bo"],
    ["a two-letter name", "bh.com.bo"],
  ])("does not trigger for %s", (_name, host) => {
    expect(hit(host)).toBeNull();
  });
});

describe("misspelled ending under the exact name", () => {
  it("triggers and names the real site", () => {
    expect(hit("bcp.con.bo")).toMatchObject({
      variant: "ending",
      params: {
        imitated: "bcp.com.bo",
        realDomain: "con.bo",
        writtenEnding: "con.bo",
        expectedEnding: "com.bo",
      },
    });
  });

  it.each(["bcp.org.bo", "bcp.net.bo", "bcp.edu.bo"])(
    "does not trigger for the different ending %s",
    (host) => {
      expect(hit(host)).toBeNull();
    },
  );

  it("does not combine a slip in the name with a slip in the ending", () => {
    expect(hit("bancosoll.con.bo")).toBeNull();
  });
});

describe("top-level domain", () => {
  it.each(["bcp.com.co", "bg.com.co", "bancounion.com.pe", "bancosoll.com.ar", "prodam.com"])(
    "does not trigger for %s",
    (host) => {
      expect(hit(host)).toBeNull();
    },
  );
});

describe("legitimate hosts", () => {
  it.each([
    ["a protected domain", "bancosol.com.bo"],
    ["a subdomain of a protected domain", "www.bancosol.com.bo"],
    ["a site under a protected suffix", "aduanas.gob.bo"],
    ["a lookalike with the digit one", "bancoso1.com.bo"],
    ["a lookalike with the digit zero", "banc0sol.com.bo"],
    ["an unrelated domain", "example.com"],
    ["a single-label host", "localhost"],
  ])("does not trigger for %s", (_name, host) => {
    expect(hit(host)).toBeNull();
  });

  it("does not trigger for an IP address host", () => {
    expect(hit("203.0.113.45")).toBeNull();
  });

  it("does not trigger without protected data", () => {
    expect(hit("bancosoll.com.bo", createTyposquatSignal([]))).toBeNull();
  });
});

describe("closest match", () => {
  it("prefers fewer edits over pack order", () => {
    const signal = createTyposquatSignal(pack("abcdefghijkl.com", "abcdefghijmn.com"));
    expect(details("abcdefghijmx.com", signal)).toMatchObject({
      imitated: "abcdefghijmn.com",
      edits: 1,
    });
  });

  it("keeps the first entry on a tie", () => {
    const signal = createTyposquatSignal(pack("bancoalfa.com", "bancoalfas.com"));
    expect(details("bancoalfaz.com", signal)).toMatchObject({ imitated: "bancoalfa.com" });
  });
});

describe("describing the slip", () => {
  it.each([
    ["a changed first letter", "xrodem.bo", "changed", "x", "p"],
    ["a changed last letter", "prodex.bo", "changed", "x", "m"],
    ["an extra first letter", "xprodem.bo", "extra", "x", ""],
    ["an extra last letter", "prodemx.bo", "extra", "x", ""],
    ["a missing first letter", "rodem.bo", "missing", "", "p"],
    ["a missing last letter", "prode.bo", "missing", "", "m"],
    ["a doubled letter", "proddem.bo", "extra", "d", ""],
    ["a swap at the start", "rpodem.bo", "swapped", "rp", "pr"],
    ["a swap at the end", "prodme.bo", "swapped", "me", "em"],
  ])("names the letters of %s", (_name, host, kind, writtenChar, expectedChar) => {
    expect(hit(host)).toMatchObject({
      variant: kind,
      params: { imitated: "prodem.bo", writtenChar, expectedChar },
    });
  });
});

describe("default engine", () => {
  it("reports caution and describes a changed letter", () => {
    expect(verdict("prodam.bo")).toMatchObject({ level: "caution", score: 60, notEvaluated: [] });
    const { tooltip, title, advice, technical } = own("prodam.bo");
    expect(title).toBe("Este enlace se parece a prodem.bo");
    expect(tooltip).toBe("Se parece a prodem.bo: tiene «a» en lugar de «e».");
    expect(advice).toContain("Banco Prodem");
    expect(technical).toContain("prodam.bo");
    expect(technical).toContain("Diferencias: 1.");
  });

  it("says the name has one letter more", () => {
    expect(verdict("bancosoll.com.bo")).toMatchObject({ level: "caution", score: 60 });
    expect(own("bancosoll.com.bo").explanation).toContain(
      "El nombre tiene una letra más que bancosol.com.bo",
    );
  });

  it("reports caution with the lower weight for two edits", () => {
    expect(verdict("bancoecofturro.com.bo")).toMatchObject({ level: "caution", score: 40 });
  });

  it("names the real site for a misspelled ending", () => {
    const { tooltip, explanation } = own("bcp.con.bo");
    expect(tooltip).toBe("Se parece a bcp.com.bo: termina en con.bo en lugar de com.bo.");
    expect(explanation).toContain("El sitio real es con.bo.");
  });

  it("reaches danger together with the declared imitation of the state suffix", () => {
    const result = verdict("impuestos.gov.bo");
    expect(result.level).toBe("danger");
    expect(result.score).toBe(100);
    expect(result.signals.map((signal) => signal.id)).toEqual(["typosquat", "subdomain"]);
    expect(result.signals[0]?.title).toBe("Este enlace se parece a impuestos.gob.bo");
  });

  it("leaves a lookalike to the lookalike signal", () => {
    expect(verdict("bancoso1.com.bo").signals.map((signal) => signal.id)).toEqual(["homograph"]);
  });

  it("never says that the link imitates, and fills every placeholder", () => {
    const hosts = [
      "prodam.bo",
      "bancosoll.com.bo",
      "bancofe.com.bo",
      "bancounoin.com.bo",
      "bancoecofturro.com.bo",
      "bcp.con.bo",
    ];
    for (const host of hosts) {
      const { tooltip, title, explanation, advice, technical } = own(host);
      for (const text of [tooltip, title, explanation, advice, technical]) {
        expect(text.toLowerCase()).not.toContain("imita");
        expect(text).not.toMatch(/[{}|]/);
      }
    }
  });

  it.each([
    "visa.com",
    "aduanas.gob.bo",
    "bna.com.bo",
    "bcp.com.co",
    "bcp.org.bo",
    "bancosol.com.bo",
  ])("finds no signals for %s", (host) => {
    expect(verdict(host)).toMatchObject({ level: "safe", signals: [] });
  });
});

describe("user domains", () => {
  const own = createTyposquatSignal(PROTECTED_PACKS, ["miempresa.com.bo"]);

  it("finds a misspelling of a user domain", () => {
    expect(details("miempreza.com.bo", own)).toMatchObject({ imitated: "miempresa.com.bo" });
    expect(hit("miempreza.com.bo")).toBeNull();
  });

  it("does not trigger on the user domain itself", () => {
    expect(hit("miempresa.com.bo", own)).toBeNull();
  });
});
