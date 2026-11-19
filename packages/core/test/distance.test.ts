import { describe, expect, it } from "vitest";
import { editDistance } from "../src/signals/distance.js";

describe("editDistance", () => {
  it.each([
    ["equal strings", "gob", "gob", 0],
    ["one substitution", "gov", "gob", 1],
    ["one insertion", "gob", "goob", 1],
    ["one deletion", "bancosol", "bancsol", 1],
    ["one adjacent swap", "ganadero", "gandaero", 1],
    ["two substitutions", "com", "gob", 2],
    ["a swap and a substitution", "abcd", "bacx", 2],
    ["an empty string", "", "abc", 3],
    ["two empty strings", "", "", 0],
    ["completely different strings", "abc", "xyz", 3],
  ])("counts %s", (_name, a, b, expected) => {
    expect(editDistance(a, b)).toBe(expected);
    expect(editDistance(b, a)).toBe(expected);
  });

  it("stops at the bound", () => {
    expect(editDistance("abc", "xyz", 1)).toBe(2);
    expect(editDistance("a", "abcdef", 2)).toBe(3);
    expect(editDistance("gov", "gob", 1)).toBe(1);
    expect(editDistance("gob", "gob", 0)).toBe(0);
    expect(editDistance("gov", "gob", 0)).toBe(1);
  });

  it("counts characters outside the basic plane as one", () => {
    expect(editDistance("a\u{20000}b", "ab")).toBe(1);
  });
});
