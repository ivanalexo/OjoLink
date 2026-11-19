import { describe, expect, it } from "vitest";
import { es } from "../src/i18n/es.js";
import {
  fillTemplate,
  resolveLevelMessage,
  resolveSignalMessage,
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
  ];

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
