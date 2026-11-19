import { describe, expect, it } from "vitest";
import { canAppearInDomain, parseConfusables, renderConfusables } from "../src/confusables.ts";

const cp = (...values: number[]) => String.fromCodePoint(...values);

const SAMPLE = [
  "# confusables.txt",
  "# Version: 18.0.0",
  "",
  "0430 ;\t0061 ;\tMA\t# CYRILLIC SMALL LETTER A",
  "04CF ;\t006C ;\tMA\t# CYRILLIC SMALL LETTER PALOCHKA",
  "0410 ;\t0041 ;\tMA\t# CYRILLIC CAPITAL LETTER A",
  "006D ;\t0072 006E ;\tMA\t# m to rn",
  "2028 ;\t0020 ;\tMA\t# LINE SEPARATOR",
  "1D41A ;\t0061 ;\tMA\t# MATHEMATICAL BOLD SMALL A",
  "# total: 6",
].join("\n");

describe("canAppearInDomain", () => {
  it.each([
    ["a lowercase letter", cp(0x0430), true],
    ["a digit", "0", true],
    ["a combining mark", cp(0x0301), true],
    ["an uppercase letter", cp(0x0410), false],
    ["a separator", cp(0x2028), false],
    ["a symbol", cp(0x2665), false],
  ])("is %s -> %s", (_name, character, expected) => {
    expect(canAppearInDomain(character)).toBe(expected);
  });
});

describe("parseConfusables", () => {
  const parsed = parseConfusables(SAMPLE);

  it("reads the Unicode version from the header", () => {
    expect(parsed.version).toBe("18.0.0");
  });

  it("maps a source character to its prototype", () => {
    expect(parsed.mappings.get(cp(0x0430))).toBe("a");
    expect(parsed.mappings.get(cp(0x04cf))).toBe("l");
  });

  it("keeps multi-character prototypes", () => {
    expect(parsed.mappings.get("m")).toBe("rn");
  });

  it("drops characters that cannot appear in a domain", () => {
    expect(parsed.mappings.has(cp(0x0410))).toBe(false);
    expect(parsed.mappings.has(cp(0x2028))).toBe(false);
  });

  it("keeps characters outside the basic plane", () => {
    expect(parsed.mappings.get(cp(0x1d41a))).toBe("a");
  });

  it("ignores a byte order mark and Windows line endings", () => {
    const text = cp(0xfeff) + SAMPLE.replaceAll("\n", "\r\n");
    expect(parseConfusables(text).mappings.size).toBe(parsed.mappings.size);
  });

  it("fails without a version header", () => {
    expect(() => parseConfusables("0430 ; 0061 ; MA")).toThrow(/Version/);
  });

  it("fails when no mapping is found", () => {
    expect(() => parseConfusables("# Version: 18.0.0\n")).toThrow(/no mappings/);
  });
});

describe("renderConfusables", () => {
  it("is ordered by code point and names its source", () => {
    const output = renderConfusables(parseConfusables(SAMPLE));
    expect(output).toContain("// Source version: 18.0.0");
    expect(output).toContain('CONFUSABLES_UNICODE_VERSION = "18.0.0"');
    expect(output.indexOf('"m": "rn"')).toBeLessThan(output.indexOf(`"${cp(0x0430)}": "a"`));
  });
});
