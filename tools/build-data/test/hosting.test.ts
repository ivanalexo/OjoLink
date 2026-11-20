import { describe, expect, it } from "vitest";
import {
  buildHosting,
  renderHosting,
  validateHosting,
  type CuratedHosting,
  type CuratedLureWord,
  type CuratedService,
} from "../src/hosting.ts";

const SERVICE: CuratedService = {
  name: "GitHub Pages",
  host: "github.io",
  assignment: "subdomain",
};
const SITES: CuratedService = {
  name: "Google Sites",
  host: "sites.google.com",
  assignment: "path",
  prefix: "/view/",
};
const WORD: CuratedLureWord = { match: "mensajeria", shown: "mensajería" };

function source(content: Partial<CuratedHosting> = {}) {
  return {
    file: "hosting.json",
    content: { updated: "2026-11-19", services: [SERVICE, SITES], lureWords: [WORD], ...content },
  };
}

function errors(content: Partial<CuratedHosting>): string {
  return validateHosting(source(content)).join("\n");
}

describe("validateHosting", () => {
  it("accepts subdomain and path services and accented shown forms", () => {
    expect(validateHosting(source())).toEqual([]);
  });

  it.each(["GitHub.io", "github", "https://github.io", "github.io/"])(
    "rejects the host %s naming the entry",
    (host) => {
      const found = errors({ services: [{ ...SERVICE, host }] });
      expect(found).toContain("hosting.json");
      expect(found).toContain(host);
      expect(found).toMatch(/valid lowercase host/);
    },
  );

  it.each([undefined, "view/", "/view"])("rejects a path service with the prefix %s", (prefix) => {
    const service: CuratedService = {
      name: SITES.name,
      host: SITES.host,
      assignment: "path",
      ...(prefix === undefined ? {} : { prefix }),
    };
    expect(errors({ services: [service] })).toMatch(/starts and ends with a slash/);
  });

  it("accepts the root as a prefix", () => {
    expect(errors({ services: [{ ...SITES, host: "forms.gle", prefix: "/" }] })).toBe("");
  });

  it("rejects a prefix on a subdomain service", () => {
    expect(errors({ services: [{ ...SERVICE, prefix: "/view/" }] })).toMatch(/takes no prefix/);
  });

  it("rejects a missing name, an unknown assignment, and a repeated service", () => {
    expect(errors({ services: [{ ...SERVICE, name: " " }] })).toMatch(/missing name/);
    expect(errors({ services: [{ ...SERVICE, assignment: "folder" as never }] })).toMatch(
      /unknown assignment/,
    );
    expect(errors({ services: [SERVICE, SERVICE] })).toMatch(/github\.io.*more than once/);
  });

  it("allows one host with two different prefixes", () => {
    expect(errors({ services: [SITES, { ...SITES, prefix: "/site/" }] })).toBe("");
  });

  it.each(["mensajería", "Mensajeria", "mi cuenta", "pago", "office365"])(
    "rejects the matching form %s naming the word",
    (match) => {
      const found = errors({ lureWords: [{ match, shown: match }] });
      expect(found).toContain(match);
      expect(found).toMatch(/lowercase unaccented letters/);
    },
  );

  it("rejects a missing shown form, a repeated word, and a bad date", () => {
    expect(errors({ lureWords: [{ match: "cuenta", shown: "" }] })).toMatch(/missing shown form/);
    expect(errors({ lureWords: [WORD, WORD] })).toMatch(/mensajeria.*more than once/);
    expect(errors({ updated: "yesterday" })).toMatch(/updated/);
  });
});

describe("buildHosting", () => {
  it("returns services and words in a stable order with an explicit prefix", () => {
    const result = buildHosting(
      source({
        services: [SITES, SERVICE],
        lureWords: [WORD, { match: "cuenta", shown: "cuenta" }],
      }),
    );
    expect(result.services).toEqual([
      { name: "GitHub Pages", host: "github.io", assignment: "subdomain", prefix: null },
      { name: "Google Sites", host: "sites.google.com", assignment: "path", prefix: "/view/" },
    ]);
    expect(result.lureWords).toEqual([
      { match: "cuenta", shown: "cuenta", brand: false },
      { match: "mensajeria", shown: "mensajería", brand: false },
    ]);
  });

  it("keeps the brand mark", () => {
    const result = buildHosting(
      source({ lureWords: [{ match: "paypal", shown: "PayPal", brand: true }] }),
    );
    expect(result.lureWords).toEqual([{ match: "paypal", shown: "PayPal", brand: true }]);
    expect(
      errors({ lureWords: [{ match: "paypal", shown: "PayPal", brand: "yes" as never }] }),
    ).toMatch(/paypal.*true or false/);
  });

  it("throws listing every problem", () => {
    expect(() => buildHosting(source({ services: [{ ...SERVICE, host: "GITHUB.IO" }] }))).toThrow(
      /Invalid hosting data:\n- .*GITHUB\.IO/,
    );
  });
});

describe("renderHosting", () => {
  it("renders both lists with their source and date", () => {
    const text = renderHosting(buildHosting(source()), "2026-11-19");
    expect(text).toContain("tools/build-data/sources/hosting.json");
    expect(text).toContain("2026-11-19");
    expect(text).toContain("export const HOSTING_SERVICES");
    expect(text).toContain("export const LURE_WORDS");
    expect(text).toContain('"shown": "mensajería"');
  });
});
