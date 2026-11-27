import { describe, expect, it } from "vitest";
import {
  analyze,
  createSubdomainSignal,
  normalizeUrl,
  type Signal,
  type SubdomainDetails,
  type TriggeredSignal,
  type Verdict,
} from "../src/index.js";
import { PROTECTED_PACKS } from "../src/data/index.js";

const cp = (...values: number[]) => String.fromCodePoint(...values);
const FAKE_BCP = `b${cp(0x0441, 0x0440)}`;
const STATE = "Estado Plurinacional de Bolivia";

const subdomain = createSubdomainSignal(PROTECTED_PACKS);

function hit(host: string, signal: Signal = subdomain) {
  const result = normalizeUrl(`https://${host}/`);
  if (!result.ok) throw new Error(`could not normalize ${host}: ${result.reason}`);
  return signal.evaluate(result.url, {});
}

function details(host: string): SubdomainDetails {
  return hit(host)?.details as SubdomainDetails;
}

function verdict(host: string): Verdict {
  const result = analyze(`https://${host}/`);
  if (!result.analyzed) throw new Error(`expected a verdict for ${host}`);
  return result;
}

function first(host: string): TriggeredSignal {
  const [signal] = verdict(host).signals;
  if (!signal) throw new Error(`no signal for ${host}`);
  return signal;
}

describe("protected domain in front of another site", () => {
  it.each([
    ["as subdomains", "bcp.com.bo.verifica.net", "verifica.net"],
    ["with more labels before it", "login.bcp.com.bo.verifica.net", "verifica.net"],
    ["joined by a hyphen", "bcp.com.bo-verifica.net", "bo-verifica.net"],
    ["written with hyphens", "bcp-com-bo.net", "bcp-com-bo.net"],
    ["hyphenated with extra words", "seguro-bcp-com-bo.verifica.net", "verifica.net"],
    ["hyphenated inside a longer name", "mi-bcp-com-bo-login.net", "mi-bcp-com-bo-login.net"],
    ["as a lookalike", `${FAKE_BCP}.com.bo.verifica.net`, "verifica.net"],
  ])("triggers %s", (_name, host, realDomain) => {
    expect(details(host)).toEqual({
      case: "domain",
      shown: "bcp.com.bo",
      entity: "BCP",
      realDomain,
    });
  });

  it("triggers for a two-label protected domain", () => {
    expect(details("pagos.bisa.com.verifica.net")).toMatchObject({
      shown: "bisa.com",
      entity: "Banco BISA",
    });
    expect(details("gestora-bo.com")).toMatchObject({ shown: "gestora.bo" });
  });

  it("triggers for the destination of a wrapped link", () => {
    const destination = "https://bcp.com.bo.verifica.net/login";
    const wrapped = `https://www.google.com/url?q=${encodeURIComponent(destination)}`;
    const result = normalizeUrl(wrapped);
    expect(result.ok && subdomain.evaluate(result.url, {})?.variant).toBe("domain");
  });

  it("passes the full host and the real site to the texts", () => {
    expect(hit("bcp.com.bo.verifica.net")?.params).toEqual({
      shown: "bcp.com.bo",
      entity: "BCP",
      realDomain: "verifica.net",
      written: "bcp.com.bo",
      asciiHost: "bcp.com.bo.verifica.net",
    });
  });
});

describe("legitimate hosts", () => {
  it.each([
    ["the protected domain", "bcp.com.bo"],
    ["a subdomain of a protected domain", "www.bcp.com.bo"],
    ["a deeper subdomain", "siat.impuestos.gob.bo"],
    ["the same name under another ending", "bisa.com.bo"],
    ["a name that ends with a protected name", "mi-bisa.com"],
    ["a protected name alone as a subdomain", "bcp.example.org"],
    ["a lookalike that is the registrable domain itself", `${FAKE_BCP}.com.bo`],
    ["an unrelated host", "www.example.com"],
    ["a single-label host", "localhost"],
    ["a site really under the protected suffix", "segip.gob.bo"],
  ])("does not trigger for %s", (_name, host) => {
    expect(hit(host)).toBeNull();
  });

  it("does not trigger for an IP address host", () => {
    expect(hit("203.0.113.45")).toBeNull();
  });

  it("does not trigger without protected data", () => {
    expect(hit("bcp.com.bo.verifica.net", createSubdomainSignal([]))).toBeNull();
    expect(hit("impuestos.gov.bo", createSubdomainSignal([]))).toBeNull();
  });
});

describe("protected suffix inside another site's name", () => {
  it.each([
    ["followed by another site", "tramites.gob.bo.algo.net", "algo.net"],
    ["written with a hyphen", "gob-bo.com", "gob-bo.com"],
    ["hyphenated after a word", "tramites-gob-bo.com", "tramites-gob-bo.com"],
    ["at the start of the host", "gob.bo.algo.net", "algo.net"],
  ])("triggers %s", (_name, host, realDomain) => {
    expect(details(host)).toEqual({ case: "suffix", shown: "gob.bo", entity: STATE, realDomain });
  });
});

describe("known imitation of a protected suffix", () => {
  it("triggers for a host under a declared imitation", () => {
    expect(hit("impuestos.gov.bo")).toMatchObject({
      variant: "suffix-lookalike",
      params: { shown: "gob.bo", written: "gov.bo", realDomain: "gov.bo", entity: STATE },
    });
  });

  it.each(["gov.bo", "www.tramites.gov.bo", `impuestos.g${cp(0x043e)}v.bo`])(
    "triggers for %s",
    (host) => {
      expect(hit(host)?.variant).toBe("suffix-lookalike");
    },
  );

  it.each([
    ["a short domain one letter away", "www.gol.bo"],
    ["another short domain one letter away", "bob.bo"],
    ["a shorter domain", "go.bo"],
    ["an undeclared near-miss", "tramites.gab.bo"],
    ["another country's government suffix", "presidencia.gob.do"],
    ["another country's suffix", "www.gob.pe"],
    ["an unrelated suffix of the same country", "bcp.com.bo"],
    ["the imitation's letters in another country", "www.gov.co"],
    ["a name that merely ends like the imitation", "migov.bo"],
  ])("does not trigger for %s", (_name, host) => {
    expect(hit(host)).toBeNull();
  });
});

describe("one report per link", () => {
  it("prefers a protected domain over its suffix", () => {
    expect(details("asfi.gob.bo.verifica.net")).toMatchObject({
      case: "domain",
      shown: "asfi.gob.bo",
    });
    expect(details("impuestos-gob-bo.com")).toMatchObject({
      case: "domain",
      shown: "impuestos.gob.bo",
    });
  });
});

describe("default engine", () => {
  it("reports danger and names the real site", () => {
    const host = "bcp.com.bo.verifica.net";
    expect(verdict(host)).toMatchObject({ level: "danger", score: 80, notEvaluated: [] });
    const { id, tooltip, title, explanation, advice, technical } = first(host);
    expect(id).toBe("subdomain");
    expect(title).toBe("Este enlace no es de bcp.com.bo");
    expect(tooltip).toBe("No es de bcp.com.bo: el sitio real es verifica.net.");
    expect(explanation).toContain("El sitio real es verifica.net.");
    expect(advice).toContain("BCP");
    expect(technical).toContain("bcp.com.bo.verifica.net");
  });

  it("reports caution for a known imitation of the state suffix", () => {
    expect(verdict("tramites.gov.bo")).toMatchObject({ level: "caution", score: 50 });
    const { tooltip, explanation } = first("tramites.gov.bo");
    expect(tooltip).toBe("Termina en gov.bo, que se parece a gob.bo pero no es lo mismo.");
    expect(explanation).toContain(`Los sitios oficiales (${STATE}) terminan en gob.bo.`);
  });

  it("reports caution for an embedded suffix and names the real site", () => {
    const host = "tramites.gob.bo.algo.net";
    expect(verdict(host)).toMatchObject({ level: "caution", score: 50 });
    const { title, explanation } = first(host);
    expect(title).toBe("Este enlace no termina en gob.bo");
    expect(explanation).toContain("El sitio real es algo.net.");
    expect(explanation).toContain(`Los sitios oficiales (${STATE}) terminan en gob.bo.`);
  });

  it("leads ahead of the mixed-alphabet signal for an embedded lookalike", () => {
    const result = verdict(`${FAKE_BCP}.com.bo.verifica.net`);
    expect(result.signals.map((signal) => signal.id)).toEqual(["subdomain", "mixed-script"]);
    expect(result.signals[0]?.title).toBe("Este enlace no es de bcp.com.bo");
  });

  it("leaves no placeholder unfilled in any variant", () => {
    for (const host of ["bcp.com.bo.verifica.net", "tramites.gob.bo.algo.net", "tramites.gov.bo"]) {
      const { tooltip, title, explanation, advice, technical } = first(host);
      for (const text of [tooltip, title, explanation, advice, technical]) {
        expect(text).not.toMatch(/[{}|]/);
      }
    }
  });

  it.each([
    "bcp.com.bo",
    "www.bcp.com.bo",
    "segip.gob.bo",
    "bisa.com.bo",
    "presidencia.gob.do",
    "www.gol.bo",
    "job.bo",
  ])("finds no signals for %s", (host) => {
    expect(verdict(host)).toMatchObject({ level: "safe", signals: [] });
  });
});

describe("user domains", () => {
  const own = createSubdomainSignal(PROTECTED_PACKS, ["miempresa.com.bo"]);

  it("finds a user domain shown inside another site's address", () => {
    expect(hit("miempresa.com.bo.verifica.net", own)?.details).toMatchObject({
      case: "domain",
      shown: "miempresa.com.bo",
      entity: "miempresa.com.bo",
      realDomain: "verifica.net",
    });
    expect(hit("miempresa.com.bo.verifica.net")).toBeNull();
  });

  it("does not trigger on subdomains of the user domain", () => {
    expect(hit("portal.miempresa.com.bo", own)).toBeNull();
  });
});

describe("protected domains that have a hyphen of their own", () => {
  it.each([
    ["t-mobile.com.cuenta-segura.net", "t-mobile.com"],
    ["deutsche-bank.de.verifica.net", "deutsche-bank.de"],
    ["acceso.deutsche-bank.de.verifica.net", "deutsche-bank.de"],
    ["seguro-t-mobile.com.verifica.net", "t-mobile.com"],
    ["t-mobile-com.verifica.net", "t-mobile.com"],
    ["deutsche.bank.de.verifica.net", "deutsche-bank.de"],
  ])("finds the protected domain inside %s", (host, shown) => {
    expect(details(host)).toMatchObject({ case: "domain", shown });
    expect(verdict(host).level).toBe("danger");
  });

  it("does the same for a domain the person protects", () => {
    const own = createSubdomainSignal(PROTECTED_PACKS, ["mibanco-ejemplo.com.bo"]);
    const found = hit("mibanco-ejemplo.com.bo.verifica-cuenta.net", own);
    expect(found?.details).toMatchObject({ case: "domain", shown: "mibanco-ejemplo.com.bo" });
    expect(hit("mibanco-ejemplo.com.bo.verifica-cuenta.net")).toBeNull();
  });

  it.each([
    "t-mobile.com",
    "www.t-mobile.com",
    "deutsche-bank.de",
    "mobile.com.verifica.net",
    "bank.de.verifica.net",
    "t-shirt.com.verifica.net",
  ])("stays silent for %s", (host) => {
    expect(hit(host)).toBeNull();
  });

  it("still finds the domains that have no hyphen, as before", () => {
    expect(details("bcp.com.bo.verifica.net")).toMatchObject({
      case: "domain",
      shown: "bcp.com.bo",
    });
    expect(details("bcp-com-bo.verifica.net")).toMatchObject({
      case: "domain",
      shown: "bcp.com.bo",
    });
  });
});
