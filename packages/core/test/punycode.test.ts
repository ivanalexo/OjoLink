import { describe, expect, it } from "vitest";
import { decodeLabel, decodePunycode } from "../src/punycode.js";

describe("decodePunycode", () => {
  it.each([
    ["egbpdaj6bu4bxfgehfvwxn", "ليهمابتكلموشعربي؟"],
    ["ihqwcrb4cv8a8dqg056pqjye", "他们为什么不说中文"],
    ["3B-ww4c5e180e575a65lsy2b", "3年B組金八先生"],
    ["-> $1.00 <--", "-> $1.00 <-"],
    ["mnchen-3ya", "münchen"],
    ["yuria-rta", "yuriña"],
  ])("decodes %s", (encoded, expected) => {
    expect(decodePunycode(encoded)).toBe(expected);
  });

  it.each(["abc-!!!", "a-é", "99999999999999999999"])("rejects malformed %s", (encoded) => {
    expect(decodePunycode(encoded)).toBeNull();
  });
});

describe("decodeLabel", () => {
  it("decodes a punycode label", () => {
    expect(decodeLabel("xn--yuria-rta")).toBe("yuriña");
  });

  it("accepts an uppercase prefix", () => {
    expect(decodeLabel("XN--yuria-rta")).toBe("yuriña");
  });

  it("leaves plain labels unchanged", () => {
    expect(decodeLabel("impuestos")).toBe("impuestos");
  });

  it("leaves malformed punycode labels unchanged", () => {
    expect(decodeLabel("xn--abc-!!!")).toBe("xn--abc-!!!");
    expect(decodeLabel("xn--")).toBe("xn--");
  });
});
