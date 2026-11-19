import { describe, expect, it } from "vitest";
import {
  buildProtected,
  renderProtected,
  validateProtected,
  type CuratedEntity,
  type CuratedPack,
  type SourceFile,
  type Verification,
} from "../src/protected.ts";

const confirmed: Verification = {
  status: "confirmed",
  source: "https://example.org/",
  checked: "2026-11-19",
};
const unconfirmed: Verification = { status: "unconfirmed", source: "Sin fuente" };

function entity(domain: string, overrides: Partial<CuratedEntity> = {}): CuratedEntity {
  return { domain, name: "Entidad", category: "bank", verification: confirmed, ...overrides };
}

function file(
  country: string,
  entities: CuratedEntity[],
  suffixes = [] as CuratedPack["suffixes"],
) {
  return { file: `protected/${country}.json`, content: { country, suffixes, entities } };
}

const bo = file(
  "bo",
  [
    entity("bcp.com.bo", {
      name: "BCP",
      aliases: [
        { domain: "bancodecredito.com.bo", verification: unconfirmed },
        { domain: "viabcp.com.bo", verification: confirmed },
      ],
    }),
    entity("bnb.com.bo", { name: "BNB" }),
    entity("bdp.com.bo", { name: "BDP", verification: unconfirmed }),
    entity("asfi.gob.bo", { name: "ASFI", category: "government" }),
  ],
  [{ suffix: "gob.bo", name: "Estado" }],
);

describe("validateProtected", () => {
  it("accepts valid files", () => {
    expect(validateProtected([bo])).toEqual([]);
  });

  it.each([
    ["a subdomain", "www.bcp.com.bo", /not a registrable domain/],
    ["an uppercase domain", "BCP.com.bo", /not a lowercase ASCII domain/],
    ["a Unicode domain", "yuriña.gob.bo", /not a lowercase ASCII domain/],
    ["a public suffix", "gob.bo", /not a registrable domain/],
    ["a URL", "https://bcp.com.bo", /not a lowercase ASCII domain/],
  ])("rejects %s", (_name, domain, message) => {
    const errors = validateProtected([file("bo", [entity(domain)])]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(message);
    expect(errors[0]).toContain("protected/bo.json");
    expect(errors[0]).toContain(domain);
  });

  it("rejects a duplicate across two files and names both places", () => {
    const errors = validateProtected([
      file("bo", [entity("bcp.com.bo")]),
      file("pe", [entity("bcp.com.bo")]),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("protected/pe.json");
    expect(errors[0]).toContain("protected/bo.json");
  });

  it("rejects an alias that repeats a domain", () => {
    const errors = validateProtected([
      file("bo", [
        entity("bcp.com.bo"),
        entity("bg.com.bo", { aliases: [{ domain: "bcp.com.bo", verification: confirmed }] }),
      ]),
    ]);
    expect(errors.join("\n")).toMatch(/already listed/);
  });

  it.each([
    ["a name", { name: "" }, /missing name/],
    ["a category", { category: undefined as never }, /category/],
    ["a known category", { category: "wallet" as never }, /category/],
    ["a verification record", { verification: undefined as never }, /verification record/],
    ["a verification source", { verification: { ...confirmed, source: "" } }, /no source/],
    [
      "a checked date when confirmed",
      { verification: { ...confirmed, checked: undefined as never } },
      /checked date/,
    ],
  ])("rejects an entry without %s", (_name, overrides, message) => {
    const errors = validateProtected([file("bo", [entity("bcp.com.bo", overrides)])]);
    expect(errors.join("\n")).toMatch(message);
  });

  it("rejects a suffix that is not a public suffix", () => {
    const errors = validateProtected([file("bo", [], [{ suffix: "bcp.com.bo", name: "x" }])]);
    expect(errors.join("\n")).toMatch(/not a public suffix/);
  });

  it("rejects an invalid or repeated country code", () => {
    expect(validateProtected([file("BOL", [])]).join("\n")).toMatch(/two-letter/);
    expect(validateProtected([file("bo", []), file("bo", [])]).join("\n")).toMatch(
      /already defined/,
    );
  });

  it("validates unconfirmed entries too", () => {
    const errors = validateProtected([
      file("bo", [entity("www.bdp.com.bo", { verification: unconfirmed })]),
    ]);
    expect(errors.join("\n")).toMatch(/not a registrable domain/);
  });
});

describe("buildProtected", () => {
  const result = buildProtected([bo]);
  const [pack] = result.packs;
  const domains = pack?.entries.map((entry) => entry.domain);

  it("ships confirmed entries with name and category", () => {
    expect(pack?.entries).toContainEqual({ domain: "bcp.com.bo", name: "BCP", category: "bank" });
    expect(domains).toContain("bnb.com.bo");
  });

  it("leaves out unconfirmed entries and aliases, and reports them", () => {
    expect(domains).not.toContain("bdp.com.bo");
    expect(domains).not.toContain("bancodecredito.com.bo");
    expect(result.leftOut).toEqual(["bo: bancodecredito.com.bo (BCP)", "bo: bdp.com.bo (BDP)"]);
  });

  it("ships a confirmed alias under the entity's name", () => {
    expect(pack?.entries).toContainEqual({
      domain: "viabcp.com.bo",
      name: "BCP",
      category: "bank",
    });
  });

  it("keeps suffixes apart from domains", () => {
    expect(pack?.suffixes).toEqual([{ suffix: "gob.bo", name: "Estado" }]);
    expect(domains).not.toContain("gob.bo");
  });

  it("sorts entries so the output does not depend on source order", () => {
    expect(domains).toEqual([...(domains ?? [])].sort());
    const reversed: SourceFile<CuratedPack> = {
      ...bo,
      content: { ...bo.content, entities: [...bo.content.entities].reverse() },
    };
    expect(renderProtected(buildProtected([reversed]))).toBe(renderProtected(result));
  });

  it("adds a pack for a new country without changing the others", () => {
    const pe = file("pe", [entity("viabcp.com", { name: "BCP Perú" })]);
    const both = buildProtected([
      pe,
      {
        ...bo,
        content: {
          ...bo.content,
          entities: bo.content.entities
            .filter((e) => e.domain !== "bcp.com.bo")
            .concat(entity("bcp.com.bo", { name: "BCP" })),
        },
      },
    ]);
    expect(both.packs.map((entry) => entry.country)).toEqual(["bo", "pe"]);
    expect(buildProtected([bo, pe]).packs[0]).toEqual(pack);
  });

  it("fails with every problem listed", () => {
    expect(() => buildProtected([file("bo", [entity("www.bcp.com.bo"), entity("X.bo")])])).toThrow(
      /www\.bcp\.com\.bo[\s\S]*X\.bo/,
    );
  });

  it("uses the latest checked date as the data version", () => {
    expect(result.version).toBe("2026-11-19");
    expect(renderProtected(result)).toContain("// Source version: 2026-11-19");
  });
});
