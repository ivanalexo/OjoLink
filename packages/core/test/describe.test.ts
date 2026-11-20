import { describe, expect, it } from "vitest";
import {
  analyze,
  describeResult,
  type NotAnalyzedDescription,
  type VerdictDescription,
} from "../src/index.js";

const cp = (...values: number[]) => String.fromCodePoint(...values);
const FAKE_BCP = `b${cp(0x0441, 0x0440)}.com.bo`;
const ZWSP = cp(0x200b);
const ENYE = cp(0x00f1);

function verdict(link: string): VerdictDescription {
  const description = describeResult(analyze(link));
  if (!description.analyzed) throw new Error(`expected a verdict for ${link}`);
  return description;
}

function notAnalyzed(input: string): NotAnalyzedDescription {
  const description = describeResult(analyze(input));
  if (description.analyzed) throw new Error(`expected ${input} not to be analyzed`);
  return description;
}

describe("verdict without signals", () => {
  const description = verdict("https://bcp.com.bo/login");

  it("shows the level and its description, with no warning", () => {
    expect(description.level).toBe("safe");
    expect(description.levelLabel).toBe("Sin señales de alerta");
    expect(description.levelDescription).toContain("no garantiza que el sitio sea legítimo");
    expect(description.warning).toBeNull();
  });

  it("has an empty technical detail", () => {
    expect(description.technical).toEqual({ signals: [], score: 0, notEvaluated: [] });
  });
});

describe("parts of a warning", () => {
  it("takes title, explanation, and advice from the main signal", () => {
    const { warning, level } = verdict(`https://${FAKE_BCP}/validar`);
    expect(level).toBe("danger");
    expect(warning?.title).toBe("Este enlace imita a bcp.com.bo");
    expect(warning?.explanation).toContain("Se ve como bcp.com.bo");
    expect(warning?.advice).toContain("escribe bcp.com.bo tú mismo");
  });

  it("lists every signal in the technical detail, in order", () => {
    const { technical } = verdict(`https://${FAKE_BCP}/validar`);
    expect(technical.signals.map((signal) => [signal.id, signal.weight])).toEqual([
      ["homograph", 90],
      ["mixed-script", 80],
    ]);
    expect(technical.signals[0]?.text).toContain("xn--b-5tbc.com.bo");
    expect(technical.score).toBe(100);
    expect(technical.notEvaluated).toEqual([]);
  });

  it("uses a single signal for a single-signal verdict", () => {
    const { warning, technical } = verdict("https://bit.ly/3xYz");
    expect(warning?.title).toBe("No se sabe a dónde lleva este enlace");
    expect(technical.signals).toHaveLength(1);
  });

  it("carries the shared labels", () => {
    expect(verdict("https://bcp.com.bo/").labels).toEqual({
      comparison: "Letra por letra",
      realAddress: "Dirección real",
      technical: "Ver detalle técnico",
      substituted: "sustituida",
      score: "Puntaje",
      notEvaluated: "Señales que no se pudieron evaluar",
    });
  });
});

describe("letter-by-letter comparison", () => {
  it("labels each letter of a lookalike with its alphabet", () => {
    expect(verdict(`https://${FAKE_BCP}/validar`).warning?.comparison).toEqual({
      units: [
        { char: "b", alphabet: "latina", marked: false },
        { char: cp(0x0441), alphabet: "cirílica", marked: true },
        { char: cp(0x0440), alphabet: "cirílica", marked: true },
      ],
      rest: ".com.bo",
    });
  });

  it("is built from the mixed-alphabet signal when it leads", () => {
    const comparison = verdict(`https://p${cp(0x0430)}ypal.com/`).warning?.comparison;
    expect(comparison?.units.map((unit) => unit.marked)).toEqual([
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(comparison?.units[1]?.alphabet).toBe("cirílica");
    expect(comparison?.rest).toBe(".com");
  });

  it("marks ordinary characters that read alike, with no alphabet for digits", () => {
    const comparison = verdict("https://bancoso1.com.bo/").warning?.comparison;
    expect(comparison?.units.at(-1)).toEqual({ char: "1", alphabet: "", marked: true });
    expect(comparison?.rest).toBe(".com.bo");
  });

  it.each([
    ["a shortener", "https://bit.ly/3xYz"],
    ["a decoy before the at sign", "https://google.com@evil.io/"],
    ["a protected domain in front of another site", "https://bcp.com.bo.verifica.net/"],
    ["a misspelling", "https://prodam.bo/"],
  ])("is absent for %s", (_name, link) => {
    expect(verdict(link).warning?.comparison).toBeNull();
  });
});

describe("real address", () => {
  it.each([
    ["an internationalized lookalike", `https://${FAKE_BCP}/validar`, "xn--b-5tbc.com.bo"],
    [
      "a legitimate internationalized host",
      `https://vuce.yuri${ENYE}a.gob.bo/`,
      "vuce.xn--yuria-rta.gob.bo",
    ],
    ["a disguised numeric address", "http://3232235786/", "192.168.1.10"],
    ["a host with an invisible character", `https://bcp${ZWSP}.com.bo/`, "bcp.com.bo"],
    [
      "a wrapped link",
      "https://nam02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.net%2Fa",
      "example.net",
    ],
  ])("is shown for %s", (_name, link, expected) => {
    expect(verdict(link).realAddress).toBe(expected);
  });

  it.each([
    "https://bcp.com.bo/login",
    "HTTPS://WWW.BCP.com.bo/",
    "bcp.com.bo/login",
    "https://google.com@evil.io/",
    "https://bcp.com.bo:8443/x",
    "https://bcp.com.bo./",
  ])("is absent for the plain host in %s", (link) => {
    expect(verdict(link).realAddress).toBeNull();
  });
});

describe("input that was not analyzed", () => {
  it.each([
    ["juan@gmail.com", "email-address", "Esto es una dirección de correo, no un enlace."],
    ["mailto:soporte@bcp.com.bo", "unsupported-scheme", "Este tipo de enlace no se analiza."],
    ["", "empty", "Pega un enlace o un mensaje para revisarlo."],
    ["Hola, ¿cómo estás?", "not-a-link", "No encontramos ningún enlace en este texto."],
  ])("explains %j in plain words", (input, reason, message) => {
    const description = notAnalyzed(input);
    expect(description.reason).toBe(reason);
    expect(description.message).toContain(message);
    expect("level" in description).toBe(false);
  });
});

describe("language", () => {
  it("falls back to Spanish for an unknown locale", () => {
    const description = describeResult(analyze("juan@gmail.com"), { locale: "qu" });
    expect(description.analyzed).toBe(false);
    expect(!description.analyzed && description.message).toContain("dirección de correo");
  });
});
