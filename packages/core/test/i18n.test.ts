import { describe, expect, it } from "vitest";
import { es } from "../src/i18n/es.js";
import {
  fillTemplate,
  resolveLevelMessage,
  resolveSignalMessage,
  resolveTerm,
  type Catalogs,
} from "../src/i18n/index.js";

const ALLOWED_UPPERCASE = new Set(["URL", "IP", "IDN", "SMS", "BCP", "PWA"]);
const FORBIDDEN_IN_SAFE = ["seguro", "verificado", "confiable"];

function toneViolations(text: string): string[] {
  const violations: string[] = [];
  if (/[!¡]/.test(text)) violations.push("exclamation mark");
  for (const word of text.match(/\p{L}+/gu) ?? []) {
    if (word.length >= 2 && word === word.toUpperCase() && !ALLOWED_UPPERCASE.has(word)) {
      violations.push(`all-capital word "${word}"`);
    }
  }
  return violations;
}

const catalogs: Catalogs = {
  es: {
    levels: es.levels,
    signals: {
      homograph: {
        tooltip: "Imita a {imitated}",
        title: "Este enlace imita a {imitated}",
        explanation: "Se ve como {imitated}.",
        advice: "Escribe {imitated} tú mismo.",
        technical: "Skeleton igual a {imitated}",
      },
    },
  },
  en: {
    levels: { danger: { label: "Danger" } },
    signals: { homograph: { tooltip: "Imitates {imitated}" } },
  },
};

describe("fillTemplate", () => {
  it("fills placeholders from params", () => {
    expect(
      fillTemplate("Imita a {imitated} con {count} letras", { imitated: "bcp.com.bo", count: 2 }),
    ).toBe("Imita a bcp.com.bo con 2 letras");
  });

  it("leaves an unknown placeholder visible", () => {
    expect(fillTemplate("Imita a {imitated}", {})).toBe("Imita a {imitated}");
    expect(fillTemplate("Imita a {imitated}")).toBe("Imita a {imitated}");
  });

  it("does not read inherited properties", () => {
    expect(fillTemplate("{toString}", {})).toBe("{toString}");
  });
});

describe("translated terms", () => {
  const withTerms: Catalogs = {
    es: {
      levels: es.levels,
      signals: {},
      terms: {
        scriptOne: { Cyrillic: "cirílica", Greek: "griega", other: "de otro alfabeto" },
        plain: { Cyrillic: "cirílico" },
      },
    },
    en: { terms: { scriptOne: { Cyrillic: "Cyrillic letter", other: "from another alphabet" } } },
    fr: {},
  };
  const term = (locale: string) => (group: string, value: string) =>
    resolveTerm(withTerms, locale, group, value);

  it("replaces a value with its term", () => {
    expect(fillTemplate("Es {script|scriptOne}", { script: "Cyrillic" }, term("es"))).toBe(
      "Es cirílica",
    );
  });

  it("uses the group's other entry for an unknown value", () => {
    expect(resolveTerm(withTerms, "es", "scriptOne", "Other")).toBe("de otro alfabeto");
    expect(resolveTerm(withTerms, "es", "scriptOne", "constructor")).toBe("de otro alfabeto");
  });

  it("keeps the raw value when the group is missing or has no other entry", () => {
    expect(resolveTerm(withTerms, "es", "missing", "Cyrillic")).toBe("Cyrillic");
    expect(resolveTerm(withTerms, "es", "plain", "Greek")).toBe("Greek");
    expect(resolveTerm(withTerms, "es", "constructor", "x")).toBe("x");
  });

  it("prefers the requested language, including its other entry", () => {
    expect(resolveTerm(withTerms, "en", "scriptOne", "Cyrillic")).toBe("Cyrillic letter");
    expect(resolveTerm(withTerms, "en", "scriptOne", "Greek")).toBe("from another alphabet");
  });

  it("falls back to Spanish for a language without the term", () => {
    expect(resolveTerm(withTerms, "fr", "scriptOne", "Greek")).toBe("griega");
    expect(resolveTerm(withTerms, "en", "plain", "Cyrillic")).toBe("cirílico");
    expect(resolveTerm(withTerms, "qu", "scriptOne", "Cyrillic")).toBe("cirílica");
  });

  it("leaves plain placeholders and missing params unchanged", () => {
    expect(fillTemplate("{script} {count}", { script: "Cyrillic", count: 2 }, term("es"))).toBe(
      "Cyrillic 2",
    );
    expect(fillTemplate("{script|scriptOne}", {}, term("es"))).toBe("{script|scriptOne}");
    expect(fillTemplate("{script|scriptOne}", { script: "Cyrillic" })).toBe("Cyrillic");
  });
});

describe("message resolution", () => {
  it("uses Spanish for the default language", () => {
    expect(resolveSignalMessage(catalogs, "es", "homograph")?.tooltip).toBe("Imita a {imitated}");
  });

  it("uses the requested language when it has the text", () => {
    expect(resolveSignalMessage(catalogs, "en", "homograph")?.tooltip).toBe("Imitates {imitated}");
    expect(resolveLevelMessage(catalogs, "en", "danger").label).toBe("Danger");
  });

  it("falls back to Spanish for a missing text", () => {
    expect(resolveSignalMessage(catalogs, "en", "homograph")?.technical).toBe(
      "Skeleton igual a {imitated}",
    );
    expect(resolveLevelMessage(catalogs, "en", "danger").description).toBe(
      es.levels.danger.description,
    );
    expect(resolveLevelMessage(catalogs, "en", "safe")).toEqual(es.levels.safe);
  });

  it("falls back to Spanish for an unknown language", () => {
    expect(resolveSignalMessage(catalogs, "qu", "homograph")?.tooltip).toBe("Imita a {imitated}");
    expect(resolveLevelMessage(catalogs, "constructor", "safe")).toEqual(es.levels.safe);
  });

  it("falls back text by text", () => {
    expect(resolveSignalMessage(catalogs, "en", "homograph")).toEqual({
      tooltip: "Imitates {imitated}",
      title: "Este enlace imita a {imitated}",
      explanation: "Se ve como {imitated}.",
      advice: "Escribe {imitated} tú mismo.",
      technical: "Skeleton igual a {imitated}",
    });
  });

  it("returns null for an unknown signal key", () => {
    expect(resolveSignalMessage(catalogs, "es", "unknown")).toBeNull();
    expect(resolveSignalMessage(catalogs, "es", "constructor")).toBeNull();
  });
});

describe("Spanish catalog tone", () => {
  const strings = [
    ...Object.values(es.levels).flatMap((level) => [level.label, level.description]),
    ...Object.values(es.signals).flatMap((signal) => Object.values(signal)),
    ...Object.values(es.terms ?? {}).flatMap((group) => Object.values(group)),
    ...Object.values(es.reasons ?? {}),
    ...Object.values(es.labels ?? {}),
  ];

  it("only references term groups that exist, each with an other entry", () => {
    const templates = Object.values(es.signals).flatMap((signal) => Object.values(signal));
    const groups = templates.flatMap((text) =>
      [...text.matchAll(/\{\w+\|(\w+)\}/g)].map((match) => match[1]),
    );
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(es.terms?.[group ?? ""]).toHaveProperty("other");
    }
  });

  it.each(strings)("follows the tone rules: %s", (text) => {
    expect(toneViolations(text)).toEqual([]);
  });

  it("detects violations", () => {
    expect(toneViolations("¡Cuidado!")).toContain("exclamation mark");
    expect(toneViolations("Este enlace es PELIGROSO")).toContain('all-capital word "PELIGROSO"');
    expect(toneViolations("La URL usa una IP")).toEqual([]);
  });

  it("describes the safe level as no warning signs found", () => {
    const text = `${es.levels.safe.label} ${es.levels.safe.description}`.toLowerCase();
    expect(text).toContain("señales de alerta");
    for (const word of FORBIDDEN_IN_SAFE) expect(text).not.toContain(word);
  });

  it("has a label and a description for every level", () => {
    for (const level of Object.values(es.levels)) {
      expect(level.label.trim()).not.toBe("");
      expect(level.description.trim()).not.toBe("");
    }
  });
});
