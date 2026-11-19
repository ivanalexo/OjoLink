import { describe, expect, it } from "vitest";
import { analyzeLabel, classifyCharacter } from "../src/signals/scripts.js";

describe("classifyCharacter", () => {
  it.each([
    ["a", "Latin"],
    ["Z", "Latin"],
    ["ñ", "Latin"],
    ["ü", "Latin"],
    ["\u0430", "Cyrillic"],
    ["\u04CF", "Cyrillic"],
    ["\u03BF", "Greek"],
    ["日", "Han"],
    ["の", "Hiragana"],
    ["テ", "Katakana"],
    ["한", "Hangul"],
    ["ሀ", "Other"],
  ])("classifies %s as %s", (char, script) => {
    expect(classifyCharacter(char)).toBe(script);
  });

  it.each(["0", "9", "-", "́", "ー"])("gives no script to %j", (char) => {
    expect(classifyCharacter(char)).toBeNull();
  });
});

describe("analyzeLabel", () => {
  it.each([
    ["bcp", "Latin"],
    ["yuriña", "Latin"],
    ["banco-24", "Latin"],
    ["\u0430\u0440\u0440\u04CF\u0435", "Cyrillic"],
    ["\u043F\u043E\u0447\u0442\u0430", "Cyrillic"],
  ])("treats %s as a single-script label", (label, script) => {
    const result = analyzeLabel(label);
    expect(result.mixed).toBe(false);
    expect(result.ownScript).toBe(script);
  });

  it("has no script for a label of digits", () => {
    expect(analyzeLabel("2024")).toMatchObject({ mixed: false, ownScript: null, scripts: [] });
  });

  it.each([
    ["Han, Hiragana, and Katakana", "日本語のテスト"],
    ["Latin with Han and Katakana", "abc日本テ"],
    ["Latin with Han", "abc日本"],
    ["Han with Bopomofo", "中文ㄅ"],
    ["Han with Hangul", "한国"],
    ["Latin with Hangul", "abc한"],
  ])("allows %s", (_name, label) => {
    expect(analyzeLabel(label).mixed).toBe(false);
  });

  it.each([
    ["Latin with Cyrillic", "p\u0430ypal"],
    ["Latin with Greek", "g\u03BFogle"],
    ["Cyrillic with Greek", "\u0430\u03BF"],
    ["Cyrillic in a Japanese label", "日本の\u0430"],
    ["Hiragana with Hangul", "の한"],
    ["Latin with an unlisted script", "abሀ"],
  ])("flags %s", (_name, label) => {
    expect(analyzeLabel(label).mixed).toBe(true);
  });

  it("takes Latin as the label's own script whenever it is present", () => {
    expect(analyzeLabel("p\u0430ypal").ownScript).toBe("Latin");
    expect(analyzeLabel("b\u0441\u0440").ownScript).toBe("Latin");
    expect(analyzeLabel("\u0430\u0440\u0440le1").ownScript).toBe("Latin");
    expect(analyzeLabel("\u0431a").ownScript).toBe("Latin");
  });

  it("takes the majority script when there is no Latin", () => {
    expect(analyzeLabel("\u0431\u0432\u03BF").ownScript).toBe("Cyrillic");
    expect(analyzeLabel("\u03BF\u03B2\u0431").ownScript).toBe("Greek");
  });

  it("resolves a tie without Latin in favor of the first script", () => {
    expect(analyzeLabel("\u0431\u03BF").ownScript).toBe("Cyrillic");
    expect(analyzeLabel("\u03BF\u0431").ownScript).toBe("Greek");
  });

  it("reports each character with its code point", () => {
    expect(analyzeLabel("b\u0441-1").characters).toEqual([
      { char: "b", codePoint: "U+0062", script: "Latin" },
      { char: "\u0441", codePoint: "U+0441", script: "Cyrillic" },
      { char: "-", codePoint: "U+002D", script: null },
      { char: "1", codePoint: "U+0031", script: null },
    ]);
  });

  it("keeps characters outside the basic plane whole", () => {
    const [character] = analyzeLabel("\u{20000}").characters;
    expect(character).toEqual({ char: "\u{20000}", codePoint: "U+20000", script: "Han" });
  });
});
