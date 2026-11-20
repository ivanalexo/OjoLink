import { describe, expect, it } from "vitest";
import { CONFUSABLES, CONFUSABLES_UNICODE_VERSION, PROTECTED_PACKS } from "../src/data/index.js";
import { HOSTING_SERVICES, LURE_WORDS, SHORTENERS } from "../src/index.js";

const cp = (value: number) => String.fromCodePoint(value);

describe("confusables", () => {
  it("states the Unicode version it came from", () => {
    expect(CONFUSABLES_UNICODE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it.each([
    [0x0430, "a"],
    [0x0441, "c"],
    [0x0440, "p"],
    [0x04cf, "l"],
    [0x03bf, "o"],
  ])("maps U+%s to its Latin prototype", (codePoint, prototype) => {
    expect(CONFUSABLES[cp(codePoint)]).toBe(prototype);
  });

  it("has no entry for a character with no lookalike", () => {
    expect(Object.hasOwn(CONFUSABLES, "b")).toBe(false);
  });

  it("holds only characters that can appear in a domain", () => {
    for (const source of Object.keys(CONFUSABLES)) {
      expect(source).toBe(source.toLowerCase());
      expect(Array.from(source)).toHaveLength(1);
    }
  });
});

describe("protected domains", () => {
  const bo = PROTECTED_PACKS.find((pack) => pack.country === "bo");
  const domains = bo?.entries.map((entry) => entry.domain) ?? [];

  it("ships the Bolivia pack", () => {
    expect(PROTECTED_PACKS.map((pack) => pack.country)).toEqual(["bo"]);
    expect(domains).toHaveLength(21);
  });

  it("names each entity and its category", () => {
    expect(bo?.entries).toContainEqual({ domain: "bcp.com.bo", name: "BCP", category: "bank" });
    expect(bo?.entries).toContainEqual({
      domain: "asfi.gob.bo",
      name: "ASFI",
      category: "government",
    });
  });

  it.each(["bnb.com.bo", "prodem.bo", "bancofortaleza.com.bo", "bisa.com", "segip.gob.bo"])(
    "includes the confirmed domain %s",
    (domain) => {
      expect(domains).toContain(domain);
    },
  );

  it.each([
    "bdp.com.bo",
    "prodem.com.bo",
    "bancofortaleza.com",
    "bancoganadero.com.bo",
    "bancomercantil.com.bo",
    "bancodecredito.com.bo",
  ])("does not include %s", (domain) => {
    expect(domains).not.toContain(domain);
  });

  it("declares gob.bo as a protected suffix and not as a domain", () => {
    expect(bo?.suffixes.map((entry) => entry.suffix)).toEqual(["gob.bo"]);
    expect(domains).not.toContain("gob.bo");
  });
});

describe("shorteners", () => {
  it.each(["bit.ly", "t.co", "tinyurl.com"])("includes %s as a shortener", (host) => {
    expect(SHORTENERS).toContainEqual({ host, kind: "shortener" });
  });

  it("marks tracking redirects apart", () => {
    expect(SHORTENERS.some((entry) => entry.kind === "tracker")).toBe(true);
  });

  it("has unique lowercase hosts", () => {
    const hosts = SHORTENERS.map((entry) => entry.host);
    expect(new Set(hosts).size).toBe(hosts.length);
    for (const host of hosts) expect(host).toBe(host.toLowerCase());
  });
});

describe("hosting services and lure words", () => {
  it("lists services that give each user a subdomain", () => {
    for (const host of ["github.io", "zya.me"]) {
      expect(HOSTING_SERVICES.find((service) => service.host === host)).toMatchObject({
        assignment: "subdomain",
        prefix: null,
      });
    }
  });

  it("lists Google Sites by its path", () => {
    expect(HOSTING_SERVICES).toContainEqual({
      name: "Google Sites",
      host: "sites.google.com",
      assignment: "path",
      prefix: "/view/",
    });
  });

  it("keeps the accent in the shown form of a lure word", () => {
    expect(LURE_WORDS).toContainEqual({ match: "mensajeria", shown: "mensajería", brand: false });
    expect(LURE_WORDS.find((word) => word.match === "paypal")?.brand).toBe(true);
  });

  it("has unique matching forms of five or more plain letters", () => {
    const forms = LURE_WORDS.map((word) => word.match);
    expect(new Set(forms).size).toBe(forms.length);
    for (const form of forms) expect(form).toMatch(/^[a-z]{5,}$/);
  });
});
