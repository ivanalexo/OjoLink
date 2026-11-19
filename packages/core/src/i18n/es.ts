import type { Level } from "../score.js";

export interface LevelMessage {
  readonly label: string;
  readonly description: string;
}

export const SIGNAL_TEXTS = ["tooltip", "title", "explanation", "advice", "technical"] as const;

export type SignalText = (typeof SIGNAL_TEXTS)[number];

export type SignalMessage = Readonly<Record<SignalText, string>>;

export type Terms = Readonly<Record<string, Readonly<Record<string, string>>>>;

export interface Messages {
  readonly levels: Readonly<Record<Level, LevelMessage>>;
  readonly signals: Readonly<Record<string, SignalMessage>>;
  readonly terms?: Terms;
}

const MIXED_SCRIPT_TITLE = "Este enlace mezcla alfabetos";
const MIXED_SCRIPT_ADVICE =
  "Si esperabas un enlace de un sitio que conoces, escribe su dirección tú mismo en el navegador.";
const MIXED_SCRIPT_CONSEQUENCE =
  "A simple vista se ven iguales, pero para tu navegador es otro sitio.";

export const es: Messages = {
  levels: {
    safe: {
      label: "Sin señales de alerta",
      description:
        "No encontramos señales de alerta en este enlace. Eso no garantiza que el sitio sea legítimo.",
    },
    caution: {
      label: "Precaución",
      description: "Este enlace tiene algo inusual. Revísalo antes de abrirlo.",
    },
    danger: {
      label: "Peligro",
      description: "Este enlace tiene señales claras de suplantación. Te recomendamos no abrirlo.",
    },
    "hidden-destination": {
      label: "Destino oculto",
      description: "No se sabe a dónde lleva este enlace.",
    },
  },
  signals: {
    "mixed-script/one": {
      tooltip:
        "Mezcla alfabetos: 1 de sus letras es {foreignScript|scriptOne}, aunque parece {ownScript|scriptOne}.",
      title: MIXED_SCRIPT_TITLE,
      explanation: `En «{label}», 1 de las letras es {foreignScript|scriptOne} y el resto del nombre usa letras {ownScript|scriptMany}. ${MIXED_SCRIPT_CONSEQUENCE}`,
      advice: MIXED_SCRIPT_ADVICE,
      technical: "Letra ajena: {codePoints}. Dirección real: {asciiHost}.",
    },
    "mixed-script/many": {
      tooltip:
        "Mezcla alfabetos: {count} de sus letras son {foreignScript|scriptMany}, aunque parecen {ownScript|scriptMany}.",
      title: MIXED_SCRIPT_TITLE,
      explanation: `En «{label}», {count} de las letras son {foreignScript|scriptMany} y el resto del nombre usa letras {ownScript|scriptMany}. ${MIXED_SCRIPT_CONSEQUENCE}`,
      advice: MIXED_SCRIPT_ADVICE,
      technical: "Letras ajenas: {codePoints}. Dirección real: {asciiHost}.",
    },
    "mixed-script/several": {
      tooltip: "Mezcla letras de varios alfabetos en un mismo nombre.",
      title: MIXED_SCRIPT_TITLE,
      explanation: `En «{label}», {count} de las letras son de alfabetos distintos al resto del nombre, que usa letras {ownScript|scriptMany}. ${MIXED_SCRIPT_CONSEQUENCE}`,
      advice: MIXED_SCRIPT_ADVICE,
      technical: "Letras ajenas: {codePoints}. Dirección real: {asciiHost}.",
    },
  },
  terms: {
    scriptOne: {
      Latin: "latina",
      Cyrillic: "cirílica",
      Greek: "griega",
      Armenian: "armenia",
      Hebrew: "hebrea",
      Arabic: "árabe",
      Han: "china",
      Hiragana: "japonesa",
      Katakana: "japonesa",
      Hangul: "coreana",
      Bopomofo: "china",
      Thai: "tailandesa",
      Devanagari: "devanagari",
      Georgian: "georgiana",
      Bengali: "bengalí",
      Tamil: "tamil",
      other: "de otro alfabeto",
    },
    scriptMany: {
      Latin: "latinas",
      Cyrillic: "cirílicas",
      Greek: "griegas",
      Armenian: "armenias",
      Hebrew: "hebreas",
      Arabic: "árabes",
      Han: "chinas",
      Hiragana: "japonesas",
      Katakana: "japonesas",
      Hangul: "coreanas",
      Bopomofo: "chinas",
      Thai: "tailandesas",
      Devanagari: "devanagari",
      Georgian: "georgianas",
      Bengali: "bengalíes",
      Tamil: "tamiles",
      other: "de otro alfabeto",
    },
  },
};
