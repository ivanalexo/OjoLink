import { describe, expect, it } from "vitest";
import {
  analyze,
  createHomographSignal,
  normalizeUrl,
  type HomographDetails,
  type ProtectedPack,
  type Signal,
  type TriggeredSignal,
  type Verdict,
} from "../src/index.js";
import { PROTECTED_PACKS } from "../src/data/index.js";

const cp = (...values: number[]) => String.fromCodePoint(...values);
const CYR_C = cp(0x0441);
const CYR_P = cp(0x0440);
const FAKE_BCP = `b${CYR_C}${CYR_P}`;
const FAKE_APPLE = cp(0x0430, 0x0440, 0x0440, 0x04cf, 0x0435);
const POCHTA = cp(0x043f, 0x043e, 0x0447, 0x0442, 0x0430);
const ENYE = cp(0x00f1);

const homograph = createHomographSignal(PROTECTED_PACKS);
const GLOBAL_PACK: ProtectedPack = {
  country: "zz",
  suffixes: [],
  entries: [{ domain: "apple.com", name: "Apple", category: "bank" }],
};
const withApple = createHomographSignal([...PROTECTED_PACKS, GLOBAL_PACK]);

function hit(link: string, signal: Signal = homograph) {
  const result = normalizeUrl(link);
  if (!result.ok) throw new Error(`could not normalize ${link}: ${result.reason}`);
  return signal.evaluate(result.url, {});
}

function details(link: string, signal: Signal = homograph): HomographDetails {
  return hit(link, signal)?.details as HomographDetails;
}

function verdict(link: string): Verdict {
  const result = analyze(link);
  if (!result.analyzed) throw new Error(`expected a verdict for ${link}`);
  return result;
}

function first(link: string): TriggeredSignal {
  const [signal] = verdict(link).signals;
  if (!signal) throw new Error(`no signal for ${link}`);
  return signal;
}

describe("lookalike of a protected domain", () => {
  it("names the imitated domain and its entity", () => {
    expect(hit(`https://${FAKE_BCP}.com.bo/validar`)).toMatchObject({
      variant: "letters-many",
      params: {
        imitated: "bcp.com.bo",
        entity: "BCP",
        count: 2,
        foreignScript: "Cyrillic",
        codePoints: "U+0441 U+0440",
        asciiDomain: "xn--b-5tbc.com.bo",
      },
    });
  });

  it("gives the same result for punycode input", () => {
    expect(hit("https://xn--b-5tbc.com.bo/")).toEqual(hit(`https://${FAKE_BCP}.com.bo/`));
  });

  it("triggers on a subdomain of the lookalike", () => {
    expect(hit(`https://login.${FAKE_BCP}.com.bo/`)?.params).toMatchObject({
      imitated: "bcp.com.bo",
      asciiDomain: "xn--b-5tbc.com.bo",
    });
  });

  it("triggers for the destination of a wrapped link", () => {
    const destination = `https://${FAKE_BCP}.com.bo/`;
    const wrapped = `https://nam02.safelinks.protection.outlook.com/?url=${encodeURIComponent(destination)}`;
    expect(hit(wrapped)?.params).toMatchObject({ imitated: "bcp.com.bo" });
  });

  it("detects a name written entirely in another alphabet", () => {
    expect(hit(`https://${FAKE_APPLE}.com/id`, withApple)).toMatchObject({
      variant: "whole-script",
      params: { imitated: "apple.com", entity: "Apple", foreignScript: "Cyrillic", count: 5 },
    });
    expect(hit(`https://${FAKE_APPLE}.com/id`)).toBeNull();
  });
});

describe("lookalikes made of ordinary characters", () => {
  it.each([
    ["the digit one for l", "bancoso1.com.bo", "bancosol.com.bo", "1", "l"],
    ["the digit zero for o", "banc0sol.com.bo", "bancosol.com.bo", "0", "o"],
    ["rn for m", "brnsc.com.bo", "bmsc.com.bo", "rn", "m"],
  ])("triggers for %s", (_name, host, imitated, written, readsAs) => {
    expect(hit(`https://${host}/`)).toMatchObject({
      variant: "lookalike",
      params: { imitated, written, readsAs, count: 0 },
    });
  });
});

describe("same name under another ending", () => {
  it("triggers for a lookalike written with another alphabet", () => {
    expect(hit(`https://${FAKE_BCP}.net/`)).toMatchObject({
      variant: "letters-many",
      params: { imitated: "bcp.com.bo", asciiDomain: "xn--b-5tbc.net" },
    });
  });

  it.each(["bcp.net", "bc0.net", "bancoso1.com", "bnb.com"])(
    "does not trigger for the ordinary name %s",
    (host) => {
      expect(hit(`https://${host}/`)).toBeNull();
    },
  );
});

describe("legitimate domains", () => {
  it.each([
    ["the protected domain", "bcp.com.bo"],
    ["a subdomain of a protected domain", "www.bcp.com.bo"],
    ["a deeper subdomain", "siat.impuestos.gob.bo"],
    ["an internationalized domain that imitates nothing", `vuce.yuri${ENYE}a.gob.bo`],
    ["a Cyrillic domain that imitates nothing", `${POCHTA}.com`],
    ["a visible extra letter", "bcpp.com.bo"],
    ["an unrelated domain", "example.com"],
    ["a single-label host", "localhost"],
  ])("does not trigger for %s", (_name, host) => {
    expect(hit(`http://${host}/`)).toBeNull();
  });

  it("does not trigger for an IP address host", () => {
    expect(hit("http://203.0.113.45/")).toBeNull();
  });

  it("does not trigger without protected domains", () => {
    expect(hit(`https://${FAKE_BCP}.com.bo/`, createHomographSignal([]))).toBeNull();
  });
});

describe("kind of imitation", () => {
  it("reports one substituted letter", () => {
    expect(hit(`https://b${CYR_C}p.com.bo/`)).toMatchObject({
      variant: "letters-one",
      params: { count: 1, foreignScript: "Cyrillic" },
    });
  });

  it("treats a Latin lookalike letter as ordinary characters", () => {
    const dotlessI = cp(0x0131);
    expect(hit(`https://b${dotlessI}sa.com/`)).toMatchObject({
      variant: "lookalike",
      params: { imitated: "bisa.com", readsAs: "i" },
    });
  });
});

describe("letter-by-letter comparison", () => {
  it("lists each character with what it reads as", () => {
    expect(details(`https://${FAKE_BCP}.com.bo/`)).toEqual({
      imitated: "bcp.com.bo",
      entity: "BCP",
      characters: [
        { char: "b", codePoint: "U+0062", script: "Latin", substituted: false, readsAs: "b" },
        { char: CYR_C, codePoint: "U+0441", script: "Cyrillic", substituted: true, readsAs: "c" },
        { char: CYR_P, codePoint: "U+0440", script: "Cyrillic", substituted: true, readsAs: "p" },
      ],
    });
  });

  it("groups two characters that read as one", () => {
    const characters = details("https://brnsc.com.bo/").characters;
    expect(characters.map((character) => [character.char, character.readsAs])).toEqual([
      ["b", "b"],
      ["r", "m"],
      ["n", "m"],
      ["s", "s"],
      ["c", "c"],
    ]);
    expect(characters.map((character) => character.substituted)).toEqual([
      false,
      true,
      true,
      false,
      false,
    ]);
  });

  it("groups one character that reads as two", () => {
    const pack: ProtectedPack = {
      country: "zz",
      suffixes: [],
      entries: [{ domain: "corner.com", name: "Corner", category: "bank" }],
    };
    const characters = details("https://comer.com/", createHomographSignal([pack])).characters;
    expect(characters.find((character) => character.char === "m")).toMatchObject({
      substituted: true,
      readsAs: "rn",
    });
    expect(characters.map((character) => character.char).join("")).toBe("comer");
  });

  it("describes every letter of a whole-alphabet imitation", () => {
    const characters = details(`https://${FAKE_APPLE}.com/`, withApple).characters;
    expect(characters.map((character) => character.readsAs).join("")).toBe("apple");
    expect(characters.every((character) => character.substituted)).toBe(true);
  });
});

describe("default engine", () => {
  const link = `https://${FAKE_BCP}.com.bo/validar`;

  it("leads the warning ahead of the mixed-alphabet signal", () => {
    const result = verdict(link);
    expect(result.signals.map((signal) => signal.id)).toEqual(["homograph", "mixed-script"]);
    expect(result.level).toBe("danger");
    expect(result.score).toBe(100);
    expect(result.notEvaluated).toEqual([]);
  });

  it("names the imitated domain, the entity, and the real address", () => {
    const { tooltip, title, explanation, advice, technical } = first(link);
    expect(title).toBe("Este enlace imita a bcp.com.bo");
    expect(tooltip).toBe(
      "Imita a bcp.com.bo: 2 de sus letras son cirílicas y se ven iguales a las latinas.",
    );
    expect(explanation).toContain("Se ve como bcp.com.bo, pero 2 de sus letras son cirílicas");
    expect(advice).toBe(
      "Si esperabas un mensaje de BCP, escribe bcp.com.bo tú mismo o abre su app.",
    );
    expect(technical).toContain("xn--b-5tbc.com.bo");
    expect(technical).toContain("U+0441 U+0440");
  });

  it("uses the singular for one substituted letter", () => {
    expect(first(`https://b${CYR_C}p.com.bo/`).tooltip).toContain("1 de sus letras es cirílica");
  });

  it("explains an imitation made of ordinary characters", () => {
    const signal = first("https://bancoso1.com.bo/");
    expect(signal.id).toBe("homograph");
    expect(signal.tooltip).toBe("Imita a bancosol.com.bo: usa «1» en lugar de «l».");
    expect(verdict("https://bancoso1.com.bo/")).toMatchObject({ level: "danger", score: 90 });
  });

  it("leaves no placeholder unfilled in any variant", () => {
    const links = [
      `https://b${CYR_C}p.com.bo/`,
      link,
      "https://bancoso1.com.bo/",
      "https://brnsc.com.bo/",
      `https://${FAKE_BCP}.net/`,
    ];
    for (const item of links) {
      const { tooltip, title, explanation, advice, technical } = first(item);
      for (const text of [tooltip, title, explanation, advice, technical]) {
        expect(text).not.toMatch(/[{}|]/);
      }
    }
  });

  it.each(["https://bcp.com.bo/", "https://www.bcp.com.bo/", `https://vuce.yuri${ENYE}a.gob.bo/`])(
    "finds no signals for %s",
    (item) => {
      expect(verdict(item)).toMatchObject({ level: "safe", signals: [] });
    },
  );
});

describe("user domains", () => {
  const own = createHomographSignal(PROTECTED_PACKS, ["miempresa.com.bo"]);
  const fake = `https://mi${cp(0x0435)}mpresa.com.bo/`;

  it("names the user domain a lookalike imitates", () => {
    expect(details(fake, own)).toMatchObject({ imitated: "miempresa.com.bo" });
    expect(hit(fake)).toBeNull();
  });

  it("does not trigger on the user domain itself", () => {
    expect(hit("https://miempresa.com.bo/", own)).toBeNull();
  });
});
