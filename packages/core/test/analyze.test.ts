import { describe, expect, it } from "vitest";
import {
  analyze,
  createEngine,
  type AnalysisResult,
  type Catalogs,
  type Signal,
  type SignalHit,
  type SignalMessage,
  type Verdict,
} from "../src/index.js";
import { es } from "../src/i18n/es.js";

const thresholds = { caution: 30, danger: 70 };
const LINK = "https://example.net/";

function risk(id: string, hit: SignalHit | null = {}): Signal {
  return { id, kind: "risk", evaluate: () => hit };
}

function hidden(id = "shortener"): Signal {
  return { id, kind: "hidden-destination", evaluate: () => ({}) };
}

function message(text: string): SignalMessage {
  return {
    tooltip: `Motivo ${text}`,
    title: `Titulo ${text}`,
    explanation: `Explicacion ${text}`,
    advice: `Consejo ${text}`,
    technical: `Detalle ${text}`,
  };
}

function messagesFor(...keys: string[]): Catalogs {
  const signals = Object.fromEntries(keys.map((key) => [key, message(key)]));
  return { es: { levels: es.levels, signals } };
}

function engine(signals: Signal[], weights: Record<string, number> = {}) {
  const keys = signals.flatMap((signal) =>
    signal.variants ? signal.variants.map((variant) => `${signal.id}/${variant}`) : [signal.id],
  );
  return createEngine({
    signals,
    calibration: { thresholds, weights },
    messages: messagesFor(...keys),
  });
}

function verdict(result: AnalysisResult): Verdict {
  if (!result.analyzed) throw new Error(`expected a verdict, got ${result.reason}`);
  return result;
}

describe("analysis result", () => {
  it("is safe with score 0 when nothing triggers", () => {
    const result = verdict(engine([risk("a", null)], { a: 50 }).analyze(LINK));
    expect(result.level).toBe("safe");
    expect(result.score).toBe(0);
    expect(result.signals).toEqual([]);
    expect(result.notEvaluated).toEqual([]);
    expect(result.url.host).toBe("example.net");
    expect(result.levelLabel).toBe(es.levels.safe.label);
    expect(result.levelDescription).toBe(es.levels.safe.description);
  });

  it("evaluates signals against the destination of a wrapped link", () => {
    const seen: string[] = [];
    const spy: Signal = {
      id: "spy",
      kind: "risk",
      evaluate: (url) => {
        seen.push(url.host);
        return null;
      },
    };
    const result = verdict(
      engine([spy], { spy: 10 }).analyze(
        "https://nam02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fbcp.com.bo%2Flogin",
      ),
    );
    expect(seen).toEqual(["bcp.com.bo"]);
    expect(result.url.host).toBe("bcp.com.bo");
    expect(result.url.wrappers).toEqual(["outlook-safelinks"]);
  });
});

describe("links that cannot be analyzed", () => {
  it.each([
    ["mailto:soporte@bcp.com.bo", "unsupported-scheme"],
    ["", "empty"],
    ["hola, ¿cómo estás?", "not-a-link"],
  ])("reports %j as not analyzed", (input, reason) => {
    const result = engine([risk("a")], { a: 90 }).analyze(input);
    expect(result).toEqual({ analyzed: false, reason });
    expect("level" in result).toBe(false);
  });

  it("does not throw for input that is not a string", () => {
    const result = engine([]).analyze(undefined as unknown as string);
    expect(result).toEqual({ analyzed: false, reason: "not-a-link" });
  });
});

describe("score and levels", () => {
  it("adds the weights of triggered risk signals", () => {
    const result = verdict(engine([risk("a"), risk("b")], { a: 30, b: 25 }).analyze(LINK));
    expect(result.score).toBe(55);
    expect(result.level).toBe("caution");
  });

  it("caps the score at 100", () => {
    const result = verdict(engine([risk("a"), risk("b")], { a: 80, b: 70 }).analyze(LINK));
    expect(result.score).toBe(100);
    expect(result.level).toBe("danger");
  });

  it("stays safe below the caution threshold but lists the signals", () => {
    const result = verdict(engine([risk("a")], { a: 29 }).analyze(LINK));
    expect(result.level).toBe("safe");
    expect(result.signals.map((signal) => signal.id)).toEqual(["a"]);
  });

  it.each([
    [30, "caution"],
    [69, "caution"],
    [70, "danger"],
  ] as const)("maps a single weight of %i to %s", (weight, level) => {
    expect(verdict(engine([risk("a")], { a: weight }).analyze(LINK)).level).toBe(level);
  });
});

describe("hidden destination", () => {
  it("is the level when only a concealing signal triggers", () => {
    const result = verdict(engine([hidden()]).analyze(LINK));
    expect(result.level).toBe("hidden-destination");
    expect(result.score).toBe(0);
    expect(result.signals[0]).toMatchObject({ id: "shortener", weight: 0 });
    expect(result.levelLabel).toBe("Destino oculto");
  });

  it("outranks a caution-level score and lists every signal", () => {
    const result = verdict(engine([hidden(), risk("a")], { a: 40 }).analyze(LINK));
    expect(result.level).toBe("hidden-destination");
    expect(result.score).toBe(40);
    expect(result.signals.map((signal) => signal.id)).toEqual(["a", "shortener"]);
  });

  it("gives way to a danger-level score", () => {
    const result = verdict(engine([hidden(), risk("a")], { a: 70 }).analyze(LINK));
    expect(result.level).toBe("danger");
  });
});

describe("explainable signals", () => {
  it("puts the main reason first", () => {
    const result = verdict(
      engine([risk("low"), risk("high")], { low: 25, high: 60 }).analyze(LINK),
    );
    expect(result.signals.map((signal) => signal.id)).toEqual(["high", "low"]);
  });

  it("keeps registry order for equal weights", () => {
    const signals = [risk("c"), risk("a"), risk("b")];
    const weights = { a: 20, b: 20, c: 20 };
    const first = verdict(engine(signals, weights).analyze(LINK));
    const second = verdict(engine(signals, weights).analyze(LINK));
    expect(first.signals.map((signal) => signal.id)).toEqual(["c", "a", "b"]);
    expect(second.signals).toEqual(first.signals);
  });

  it("renders the hit params into every text and passes details through", () => {
    const characters = [{ char: "b", script: "Latin" }];
    const homograph = risk("homograph", {
      params: { imitated: "bcp.com.bo", count: 2 },
      details: { characters },
    });
    const result = verdict(
      createEngine({
        signals: [homograph],
        calibration: { thresholds, weights: { homograph: 90 } },
        messages: {
          es: {
            levels: es.levels,
            signals: {
              homograph: {
                tooltip: "Imita a {imitated}",
                title: "Este enlace imita a {imitated}",
                explanation:
                  "Se ve como {imitated}, pero {count} de sus letras son de otro alfabeto.",
                advice: "Escribe {imitated} tú mismo.",
                technical: "{count} caracteres confundibles con {imitated}",
              },
            },
          },
        },
      }).analyze(LINK),
    );
    expect(result.signals[0]).toEqual({
      id: "homograph",
      variant: null,
      kind: "risk",
      weight: 90,
      tooltip: "Imita a bcp.com.bo",
      title: "Este enlace imita a bcp.com.bo",
      explanation: "Se ve como bcp.com.bo, pero 2 de sus letras son de otro alfabeto.",
      advice: "Escribe bcp.com.bo tú mismo.",
      technical: "2 caracteres confundibles con bcp.com.bo",
      details: { characters },
    });
  });

  it("gives every signal an empty details object by default", () => {
    const result = verdict(engine([risk("a")], { a: 40 }).analyze(LINK));
    expect(result.signals[0]?.details).toEqual({});
  });

  it("uses the weight and message of the reported variant", () => {
    const typosquat: Signal = {
      id: "typosquat",
      kind: "risk",
      variants: ["distance-1", "distance-2"],
      evaluate: () => ({ variant: "distance-2" }),
    };
    const result = verdict(
      engine([typosquat], { "typosquat/distance-1": 60, "typosquat/distance-2": 30 }).analyze(LINK),
    );
    expect(result.signals[0]).toMatchObject({
      variant: "distance-2",
      weight: 30,
      tooltip: "Motivo typosquat/distance-2",
      title: "Titulo typosquat/distance-2",
    });
  });
});

describe("engine creation", () => {
  it("fails when a risk signal has no weight", () => {
    expect(() =>
      createEngine({
        signals: [risk("a")],
        calibration: { thresholds, weights: {} },
        messages: messagesFor("a"),
      }),
    ).toThrow(/Missing weight/);
  });

  it("fails when a signal has no Spanish message", () => {
    expect(() =>
      createEngine({ signals: [risk("a")], calibration: { thresholds, weights: { a: 10 } } }),
    ).toThrow(/Missing Spanish message/);
  });

  it("fails when a message text is blank", () => {
    expect(() =>
      createEngine({
        signals: [hidden()],
        messages: {
          es: { levels: es.levels, signals: { shortener: { ...message("x"), advice: " " } } },
        },
      }),
    ).toThrow(/Missing Spanish message/);
  });

  it("fails on duplicate signal ids", () => {
    expect(() => engine([risk("a"), risk("a")], { a: 10 })).toThrow(/Duplicate/);
  });
});

describe("context and language", () => {
  const reader: Signal = {
    id: "reader",
    kind: "risk",
    evaluate: (_url, context) =>
      context.visibleText === undefined ? null : { params: { text: context.visibleText } },
  };
  const readerEngine = createEngine({
    signals: [reader],
    calibration: { thresholds, weights: { reader: 40 } },
    messages: {
      es: {
        levels: es.levels,
        signals: { reader: { ...message("t"), tooltip: "Texto {text}", technical: "t" } },
      },
      en: {
        signals: { reader: { tooltip: "Text {text}" } },
        levels: { caution: { label: "Caution" } },
      },
    },
  });

  it("works without a context", () => {
    const result = verdict(readerEngine.analyze(LINK));
    expect(result.signals).toEqual([]);
    expect(verdict(readerEngine.analyze(LINK, { context: {} }))).toEqual(result);
  });

  it("passes the context to signals", () => {
    const result = verdict(readerEngine.analyze(LINK, { context: { visibleText: "bcp.com.bo" } }));
    expect(result.signals[0]?.tooltip).toBe("Texto bcp.com.bo");
  });

  it("gives signals a context they cannot modify", () => {
    const writer: Signal = {
      id: "writer",
      kind: "risk",
      evaluate: (_url, context) => {
        (context as { visibleText?: string }).visibleText = "changed";
        return null;
      },
    };
    const result = verdict(engine([writer, reader], { writer: 10, reader: 10 }).analyze(LINK));
    expect(result.notEvaluated).toEqual(["writer"]);
    expect(result.signals).toEqual([]);
  });

  it("uses the requested language with Spanish fallback", () => {
    const options = { context: { visibleText: "x" }, locale: "en" };
    const result = verdict(readerEngine.analyze(LINK, options));
    expect(result.signals[0]?.tooltip).toBe("Text x");
    expect(result.signals[0]?.title).toBe("Titulo t");
    expect(result.signals[0]?.technical).toBe("t");
    expect(result.levelLabel).toBe("Caution");
    expect(result.levelDescription).toBe(es.levels.caution.description);
  });

  it("uses Spanish for an unknown language", () => {
    const result = verdict(
      readerEngine.analyze(LINK, { context: { visibleText: "x" }, locale: "qu" }),
    );
    expect(result.signals[0]?.tooltip).toBe("Texto x");
  });
});

describe("translated terms", () => {
  it("renders a term in every text of a signal", () => {
    const termEngine = createEngine({
      signals: [risk("mix", { params: { script: "Cyrillic" } })],
      calibration: { thresholds, weights: { mix: 40 } },
      messages: {
        es: {
          levels: es.levels,
          signals: {
            mix: {
              tooltip: "a {script|scriptOne}",
              title: "b {script|scriptOne}",
              explanation: "c {script|scriptOne}",
              advice: "d {script|scriptOne}",
              technical: "e {script|scriptOne} {script}",
            },
          },
          terms: { scriptOne: { Cyrillic: "cirílica" } },
        },
        en: { terms: { scriptOne: { Cyrillic: "Cyrillic letter" } } },
      },
    });

    expect(verdict(termEngine.analyze(LINK)).signals[0]).toMatchObject({
      tooltip: "a cirílica",
      title: "b cirílica",
      explanation: "c cirílica",
      advice: "d cirílica",
      technical: "e cirílica Cyrillic",
    });
    expect(verdict(termEngine.analyze(LINK, { locale: "en" })).signals[0]?.tooltip).toBe(
      "a Cyrillic letter",
    );
  });
});

describe("failure isolation", () => {
  const broken: Signal = {
    id: "broken",
    kind: "risk",
    evaluate: () => {
      throw new Error("boom");
    },
  };

  it("keeps evaluating when a signal throws", () => {
    const result = verdict(engine([broken, risk("a")], { broken: 90, a: 40 }).analyze(LINK));
    expect(result.signals.map((signal) => signal.id)).toEqual(["a"]);
    expect(result.score).toBe(40);
    expect(result.notEvaluated).toEqual(["broken"]);
  });

  it("treats an undeclared variant as not evaluated", () => {
    const stray = risk("stray", { variant: "unknown" });
    const result = verdict(engine([stray], { stray: 50 }).analyze(LINK));
    expect(result.signals).toEqual([]);
    expect(result.notEvaluated).toEqual(["stray"]);
  });
});

describe("default engine", () => {
  it("reports a valid link as safe while no signals are registered", () => {
    const result = verdict(analyze("https://bcp.com.bo/"));
    expect(result).toMatchObject({ level: "safe", score: 0, signals: [], notEvaluated: [] });
  });

  it("does not analyze invalid input", () => {
    expect(analyze("javascript:alert(1)")).toEqual({
      analyzed: false,
      reason: "unsupported-scheme",
    });
  });
});

describe("determinism", () => {
  const inputs = [
    "https://bcp.com.bo/",
    "bcp.com.bo",
    "https://google.com@evil.io/",
    "http://0x7f.1/",
    "https://xn--abc-!!!.com/",
    "https://www.google.com/url?q=javascript:alert(1)",
    "https://a\u200Bb.com/",
    "https://exa mple.com/",
    "%%%",
    "://",
    "\u202Ehttps://bcp.com.bo",
    "\u0000\u0007https://bcp.com.bo",
    "x".repeat(5000),
    "",
  ];
  const sample = engine([risk("a"), hidden()], { a: 35 });
  const options = { context: { visibleText: "bcp.com.bo" } };

  it.each(inputs)("never throws and is repeatable for %j", (input) => {
    const first = sample.analyze(input, options);
    expect(sample.analyze(input, options)).toEqual(first);
  });
});
