import { describe, expect, it } from "vitest";
import {
  analyze,
  normalizeUrl,
  type AnalysisContext,
  type InvisibleCharactersDetails,
  type TriggeredSignal,
} from "../src/index.js";
import { invisibleCharacters } from "../src/signals/invisible.js";

const cp = (...values: number[]) => String.fromCodePoint(...values);
const ZWSP = cp(0x200b);
const ZWNJ = cp(0x200c);
const ZWJ = cp(0x200d);
const SOFT_HYPHEN = cp(0x00ad);
const LRM = cp(0x200e);
const RLO = cp(0x202e);
const PERSIAN_SENTENCE = `${cp(0x0645, 0x06cc)}${ZWNJ}${cp(0x062e, 0x0648)} ${cp(0x0627, 0x0645)}.`;

function hit(link: string, context: AnalysisContext = {}) {
  const result = normalizeUrl(link);
  if (!result.ok) throw new Error(`could not normalize: ${result.reason}`);
  return invisibleCharacters.evaluate(result.url, context);
}

function details(link: string, context: AnalysisContext = {}): InvisibleCharactersDetails {
  return hit(link, context)?.details as InvisibleCharactersDetails;
}

function signal(link: string, context: AnalysisContext = {}): TriggeredSignal {
  const result = analyze(link, { context });
  const found = result.analyzed
    ? result.signals.find((entry) => entry.id === "invisible-characters")
    : undefined;
  if (!found) throw new Error("invisible-characters did not trigger");
  return found;
}

describe("invisible characters in the host", () => {
  it("triggers for a zero-width space inside a domain", () => {
    expect(hit(`https://bcp${ZWSP}.com.bo/`)).toMatchObject({
      variant: "host-one",
      params: { count: 1, codePoints: "U+200B", openedHost: "bcp.com.bo" },
    });
  });

  it("triggers for a soft hyphen", () => {
    expect(hit(`https://bc${SOFT_HYPHEN}p.com.bo/`)).toMatchObject({
      variant: "host-one",
      params: { codePoints: "U+00AD" },
    });
  });

  it("triggers for the destination of a wrapped link", () => {
    const destination = `https://bcp${ZWSP}.com.bo/login`;
    const wrapped = `https://nam02.safelinks.protection.outlook.com/?url=${encodeURIComponent(destination)}`;
    expect(hit(wrapped)).toMatchObject({ variant: "host-one" });
  });

  it("is not analyzed when the browser rejects the host", () => {
    for (const joiner of [ZWJ, ZWNJ]) {
      expect(analyze(`https://bc${joiner}p.com.bo/`)).toEqual({
        analyzed: false,
        reason: "not-a-link",
      });
    }
  });

  it("does not trigger for a clean link", () => {
    expect(hit("https://bcp.com.bo/login")).toBeNull();
    expect(hit("https://vuce.yuriña.gob.bo/")).toBeNull();
  });

  it("lists two characters in the host", () => {
    const link = `https://b${ZWSP}c${SOFT_HYPHEN}p.com.bo/`;
    expect(hit(link)).toMatchObject({ variant: "host-many", params: { count: 2 } });
    expect(details(link).characters).toEqual([
      { codePoint: "U+200B", kind: "invisible", location: "host" },
      { codePoint: "U+00AD", kind: "invisible", location: "host" },
    ]);
  });
});

describe("characters elsewhere in the link", () => {
  it("triggers for a direction override in the path", () => {
    const link = `https://example.com/doc${RLO}fdp.exe`;
    expect(hit(link)).toMatchObject({ variant: "link-one", params: { codePoints: "U+202E" } });
    expect(details(link).characters).toEqual([
      { codePoint: "U+202E", kind: "direction", location: "link" },
    ]);
  });

  it("triggers for a direction mark in the path", () => {
    expect(hit(`https://example.com/a${LRM}b`)).toMatchObject({ variant: "link-one" });
  });

  it("reports the host case when both host and path have characters", () => {
    const link = `https://bcp${ZWSP}.com.bo/a${RLO}b${ZWSP}`;
    const result = hit(link);
    expect(result).toMatchObject({ variant: "host-one", params: { count: 1 } });
    expect(details(link).characters.map((character) => character.location)).toEqual([
      "host",
      "link",
      "link",
    ]);
  });
});

describe("visible text", () => {
  const link = "https://example.com/";

  it("triggers for reversed text", () => {
    const result = hit(link, { visibleText: `factura${RLO}fdp.exe` });
    expect(result).toMatchObject({ variant: "text-one", params: { codePoints: "U+202E" } });
  });

  it("triggers for a reversed word inside a sentence", () => {
    expect(hit(link, { visibleText: `Abre el archivo ${RLO}fdp.exe ahora` })).toMatchObject({
      variant: "text-one",
    });
  });

  it("triggers for domain-like text with a zero-width character", () => {
    const result = hit(link, { visibleText: `bcp${ZWSP}.com.bo` });
    expect(result).toMatchObject({ variant: "text-one", params: { codePoints: "U+200B" } });
  });

  it("does not trigger for a Persian sentence with a zero-width non-joiner", () => {
    expect(hit(link, { visibleText: PERSIAN_SENTENCE })).toBeNull();
  });

  it("does not trigger for direction marks, even in domain-like text", () => {
    expect(hit(link, { visibleText: `Hola ${LRM}mundo` })).toBeNull();
    expect(hit(link, { visibleText: `bcp.com.bo${LRM}` })).toBeNull();
  });

  it("examines only the link when there is no context", () => {
    expect(hit(link)).toBeNull();
    expect(hit(link, {})).toBeNull();
  });

  it("ranks the visible text above the rest of the link", () => {
    const result = hit(`https://example.com/a${LRM}b`, { visibleText: `x${RLO}y` });
    expect(result?.variant).toBe("text-one");
  });
});

describe("default engine", () => {
  it("reports danger for an invisible character in the host", () => {
    const result = analyze(`https://bcp${ZWSP}.com.bo/`);
    expect(result.analyzed && result.level).toBe("danger");
    expect(result.analyzed && result.notEvaluated).toEqual([]);
  });

  it("uses the singular and names the host the browser opens", () => {
    const { tooltip, explanation, technical } = signal(`https://bcp${ZWSP}.com.bo/`);
    expect(tooltip).toBe(
      "Tiene 1 carácter invisible en el nombre del sitio; en realidad abre bcp.com.bo.",
    );
    expect(explanation).toContain("Tu navegador lo descarta y abre bcp.com.bo");
    expect(technical).toContain("U+200B");
  });

  it("uses the plural for two characters", () => {
    const { tooltip, technical } = signal(`https://b${ZWSP}c${SOFT_HYPHEN}p.com.bo/`);
    expect(tooltip).toContain("2 caracteres invisibles");
    expect(technical).toContain("U+200B U+00AD");
  });

  it("reports caution for a character in the path only", () => {
    const result = analyze(`https://example.com/doc${RLO}fdp.exe`);
    expect(result.analyzed && result.level).toBe("caution");
  });

  it("reports danger for reversed visible text", () => {
    const result = analyze("https://example.com/", { context: { visibleText: `a${RLO}b` } });
    expect(result.analyzed && result.level).toBe("danger");
  });

  it("leaves no placeholder unfilled in any variant", () => {
    const cases: [string, AnalysisContext][] = [
      [`https://bcp${ZWSP}.com.bo/`, {}],
      [`https://b${ZWSP}c${SOFT_HYPHEN}p.com.bo/`, {}],
      [`https://example.com/a${RLO}b`, {}],
      [`https://example.com/a${RLO}b${ZWSP}`, {}],
      ["https://example.com/", { visibleText: `a${RLO}b` }],
      ["https://example.com/", { visibleText: `a${RLO}b${RLO}` }],
    ];
    for (const [link, context] of cases) {
      const { tooltip, title, explanation, advice, technical } = signal(link, context);
      for (const text of [tooltip, title, explanation, advice, technical]) {
        expect(text).not.toMatch(/[{}|]/);
      }
    }
  });
});
