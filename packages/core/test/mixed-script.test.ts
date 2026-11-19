import { describe, expect, it } from "vitest";
import {
  analyze,
  describeScript,
  normalizeUrl,
  type MixedScriptDetails,
  type NormalizedUrl,
  type TriggeredSignal,
  type Verdict,
} from "../src/index.js";
import { mixedScript } from "../src/signals/mixed-script.js";

const PAYPAL = "p\u0430ypal.com";
const BCP = "b\u0441\u0440.com.bo";
const CYRILLIC_APPLE = "\u0430\u0440\u0440\u04CF\u0435.com";

function url(host: string): NormalizedUrl {
  const result = normalizeUrl(`https://${host}/`);
  if (!result.ok) throw new Error(`could not normalize ${host}: ${result.reason}`);
  return result.url;
}

function hit(host: string) {
  return mixedScript.evaluate(url(host), {});
}

function details(host: string): MixedScriptDetails {
  return hit(host)?.details as MixedScriptDetails;
}

function verdict(host: string): Verdict {
  const result = analyze(`https://${host}/`);
  if (!result.analyzed) throw new Error(`expected a verdict for ${host}`);
  return result;
}

function signal(host: string): TriggeredSignal {
  const found = verdict(host).signals.find((entry) => entry.id === "mixed-script");
  if (!found) throw new Error(`mixed-script did not trigger for ${host}`);
  return found;
}

describe("mixed alphabets within a label", () => {
  it("triggers for one Cyrillic letter in a Latin label", () => {
    expect(hit(PAYPAL)).toMatchObject({ variant: "one", params: { label: "p\u0430ypal" } });
  });

  it("gives the same result for punycode input", () => {
    const ascii = url(PAYPAL).asciiHost;
    expect(ascii.startsWith("xn--")).toBe(true);
    expect(hit(ascii)).toEqual(hit(PAYPAL));
  });

  it("triggers for a Greek letter in a Latin label", () => {
    expect(hit("g\u03BFogle.com")).toMatchObject({
      variant: "one",
      params: { foreignScript: "Greek", ownScript: "Latin" },
    });
  });

  it("triggers when only a subdomain label is mixed", () => {
    const result = hit(`p\u0430y.example.com`);
    expect(result?.params).toMatchObject({ label: "p\u0430y" });
  });

  it("ignores digits and hyphens", () => {
    expect(hit("banco-24.com")).toBeNull();
    expect(hit("p\u0430y-24.com")).toMatchObject({ params: { count: 1 } });
  });
});

describe("legitimate internationalized domains", () => {
  it.each([
    ["Latin with ñ", "vuce.yuriña.gob.bo"],
    ["an entirely Cyrillic label", CYRILLIC_APPLE],
    ["different alphabets in different labels", "\u043F\u043E\u0447\u0442\u0430.example.com"],
    ["a German umlaut", "münchen.de"],
    ["a plain ASCII host", "bcp.com.bo"],
    ["a Japanese label", "日本語のテスト.jp"],
    ["a Japanese label with Latin letters", "abc日本テ.jp"],
  ])("does not trigger for %s", (_name, host) => {
    expect(hit(host)).toBeNull();
  });

  it("does not trigger for an IP address host", () => {
    expect(hit("192.168.1.10")).toBeNull();
  });

  it("triggers when Cyrillic is added to a Japanese label", () => {
    expect(hit("日本の\u0430.jp")).not.toBeNull();
  });
});

describe("letter-by-letter details", () => {
  it("lists every character of the mixed label", () => {
    expect(details(BCP)).toEqual({
      labels: [
        {
          label: "b\u0441\u0440",
          ownScript: "Latin",
          foreignCount: 2,
          characters: [
            { char: "b", codePoint: "U+0062", script: "Latin", foreign: false },
            { char: "\u0441", codePoint: "U+0441", script: "Cyrillic", foreign: true },
            { char: "\u0440", codePoint: "U+0440", script: "Cyrillic", foreign: true },
          ],
        },
      ],
    });
  });

  it("takes Latin as the label's own alphabet even in the minority", () => {
    const [label] = details("\u0430\u0440\u0440le.com").labels;
    expect(label).toMatchObject({ ownScript: "Latin", foreignCount: 3 });
  });

  it("takes the majority alphabet when there is no Latin", () => {
    const [label] = details("\u0431\u0432\u03BF.com").labels;
    expect(label).toMatchObject({ ownScript: "Cyrillic", foreignCount: 1 });
  });

  it("does not mark digits or hyphens as foreign", () => {
    const [label] = details("p\u0430y-24.com").labels;
    expect(label?.characters.filter((character) => character.foreign)).toHaveLength(1);
  });

  it("includes every mixed label in host order", () => {
    const result = hit(`p\u0430y.${BCP}`);
    const labels = (result?.details as MixedScriptDetails).labels;
    expect(labels.map((label) => label.label)).toEqual(["p\u0430y", "b\u0441\u0440"]);
    expect(result?.params).toMatchObject({ label: "b\u0441\u0440", count: 2 });
  });

  it("describes the first mixed label when the registrable one is clean", () => {
    const result = hit(`p\u0430y.b\u0441\u0440.example.com`);
    expect(result?.params).toMatchObject({ label: "p\u0430y" });
  });
});

describe("variants", () => {
  it.each([
    ["one", PAYPAL],
    ["many", BCP],
    ["several", "a\u0431\u03B2c.com"],
  ])("reports %s", (variant, host) => {
    expect(hit(host)?.variant).toBe(variant);
  });
});

describe("default engine", () => {
  it("reports danger for a mixed label", () => {
    const result = verdict(PAYPAL);
    expect(result.level).toBe("danger");
    expect(result.score).toBe(80);
    expect(result.notEvaluated).toEqual([]);
  });

  it("uses the singular for one foreign letter", () => {
    const { tooltip, explanation } = signal(PAYPAL);
    expect(tooltip).toBe("Mezcla alfabetos: 1 de sus letras es cirílica, aunque parece latina.");
    expect(explanation).toContain("1 de las letras es cirílica");
    expect(explanation).toContain("«p\u0430ypal»");
  });

  it("says how many letters are Cyrillic", () => {
    const { tooltip, explanation } = signal(BCP);
    expect(tooltip).toContain("2 de sus letras son cirílicas");
    expect(explanation).toContain("2 de las letras son cirílicas");
  });

  it("describes an unnamed alphabet as another alphabet", () => {
    const { tooltip } = signal("abሀ.com");
    expect(tooltip).toContain("1 de sus letras es de otro alfabeto");
    expect(tooltip).not.toContain("Other");
  });

  it("lists code points and the punycode host in the technical text", () => {
    const { technical } = signal(BCP);
    expect(technical).toContain("U+0441 U+0440");
    expect(technical).toContain(url(BCP).asciiHost);
  });

  it("does not name another domain", () => {
    const { title, tooltip, advice } = signal(BCP);
    expect(title).toBe("Este enlace mezcla alfabetos");
    for (const text of [title, tooltip, advice]) expect(text).not.toMatch(/bcp|imita/i);
  });

  it("leaves no placeholder unfilled in any variant", () => {
    for (const host of [PAYPAL, BCP, "a\u0431\u03B2c.com"]) {
      const { tooltip, title, explanation, advice, technical } = signal(host);
      for (const text of [tooltip, title, explanation, advice, technical]) {
        expect(text).not.toMatch(/[{}|]/);
      }
    }
  });

  it("carries the details in the verdict", () => {
    const { labels } = signal(BCP).details as MixedScriptDetails;
    expect(labels[0]?.foreignCount).toBe(2);
  });

  it.each(["vuce.yuriña.gob.bo", CYRILLIC_APPLE, "bcp.com.bo"])(
    "finds no signals for %s",
    (host) => {
      expect(verdict(host)).toMatchObject({ level: "safe", signals: [] });
    },
  );

  it("evaluates the destination of a wrapped link", () => {
    const wrapped = `https://www.google.com/url?q=${encodeURIComponent(`https://${PAYPAL}/`)}`;
    const result = analyze(wrapped);
    expect(result.analyzed && result.level).toBe("danger");
  });
});

describe("describeScript", () => {
  it("names an alphabet in Spanish", () => {
    expect(describeScript("Cyrillic")).toBe("cirílica");
    expect(describeScript("Latin")).toBe("latina");
  });

  it("uses the generic wording for an unknown alphabet", () => {
    expect(describeScript("Other")).toBe("de otro alfabeto");
    expect(describeScript("Klingon", "qu")).toBe("de otro alfabeto");
  });
});
