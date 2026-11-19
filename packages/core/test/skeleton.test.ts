import { describe, expect, it } from "vitest";
import { skeleton } from "../src/signals/skeleton.js";

const cp = (...values: number[]) => String.fromCodePoint(...values);
const CYRILLIC_BCP = `b${cp(0x0441, 0x0440)}`;
const CYRILLIC_APPLE = cp(0x0430, 0x0440, 0x0440, 0x04cf, 0x0435);
const ENYE = cp(0x00f1);

describe("skeleton", () => {
  it.each([
    ["letters of another alphabet", CYRILLIC_BCP, "bcp"],
    ["a whole name in another alphabet", CYRILLIC_APPLE, "apple"],
    ["the digit one for the letter l", "bancoso1", "bancosol"],
    ["the digit zero for the letter o", "banc0sol", "bancosol"],
    ["rn for m", "brnsc", "bmsc"],
    ["a Greek omicron", `g${cp(0x03bf)}ogle`, "google"],
    ["uppercase", "BCP", "bcp"],
  ])("matches %s", (_name, written, real) => {
    expect(skeleton(written)).toBe(skeleton(real));
  });

  it.each([
    ["an extra letter", "bcpp", "bcp"],
    ["a different letter", "bcq", "bcp"],
    ["a letter with a diacritic", `yuri${ENYE}a`, "yurina"],
    ["swapped letters", "bpc", "bcp"],
  ])("does not match %s", (_name, written, real) => {
    expect(skeleton(written)).not.toBe(skeleton(real));
  });

  it("leaves a name without lookalike characters readable", () => {
    expect(skeleton("bcp")).toBe("bcp");
    expect(skeleton("bcp.co.bo")).toBe("bcp.co.bo");
  });

  it("gives the same result for composed and decomposed forms", () => {
    expect(skeleton(ENYE)).toBe(skeleton(`n${cp(0x0303)}`));
  });

  it("is stable when applied twice", () => {
    for (const text of [CYRILLIC_BCP, "banc0sol", "brnsc", CYRILLIC_APPLE]) {
      expect(skeleton(skeleton(text))).toBe(skeleton(text));
    }
  });
});
