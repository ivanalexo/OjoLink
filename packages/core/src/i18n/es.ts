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

const INVISIBLE_TITLE = "Este enlace tiene caracteres que no se ven";
const INVISIBLE_HOST_ADVICE =
  "Revisa que {openedHost} sea el sitio que esperabas antes de abrirlo.";
const INVISIBLE_OTHER_ADVICE = "Ábrelo solo si conoces {openedHost} y esperabas este enlace.";
const INVISIBLE_PURPOSE = "Se usa para que el enlace pase filtros o parezca distinto de lo que es.";
const WRITTEN_AND_OPENED = "Escrito: {written}. Sitio que abre el navegador: {realHost}.";

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
    "invisible-characters/host-one": {
      tooltip: "Tiene 1 carácter invisible en el nombre del sitio; en realidad abre {openedHost}.",
      title: INVISIBLE_TITLE,
      explanation: `El nombre del sitio incluye 1 carácter invisible. Tu navegador lo descarta y abre {openedHost}. ${INVISIBLE_PURPOSE}`,
      advice: INVISIBLE_HOST_ADVICE,
      technical: "Carácter invisible: {codePoints}. Sitio que abre el navegador: {openedHost}.",
    },
    "invisible-characters/host-many": {
      tooltip:
        "Tiene {count} caracteres invisibles en el nombre del sitio; en realidad abre {openedHost}.",
      title: INVISIBLE_TITLE,
      explanation: `El nombre del sitio incluye {count} caracteres invisibles. Tu navegador los descarta y abre {openedHost}. ${INVISIBLE_PURPOSE}`,
      advice: INVISIBLE_HOST_ADVICE,
      technical: "Caracteres invisibles: {codePoints}. Sitio que abre el navegador: {openedHost}.",
    },
    "invisible-characters/text-one": {
      tooltip: "El texto del enlace tiene 1 carácter oculto que cambia cómo se lee.",
      title: INVISIBLE_TITLE,
      explanation:
        "El texto que ves incluye 1 carácter oculto que puede invertir o alterar lo que se lee. El sitio que se abre es {openedHost}.",
      advice: INVISIBLE_OTHER_ADVICE,
      technical:
        "Carácter oculto en el texto: {codePoints}. Sitio que abre el navegador: {openedHost}.",
    },
    "invisible-characters/text-many": {
      tooltip: "El texto del enlace tiene {count} caracteres ocultos que cambian cómo se lee.",
      title: INVISIBLE_TITLE,
      explanation:
        "El texto que ves incluye {count} caracteres ocultos que pueden invertir o alterar lo que se lee. El sitio que se abre es {openedHost}.",
      advice: INVISIBLE_OTHER_ADVICE,
      technical:
        "Caracteres ocultos en el texto: {codePoints}. Sitio que abre el navegador: {openedHost}.",
    },
    "invisible-characters/link-one": {
      tooltip: "Tiene 1 carácter invisible en la dirección.",
      title: INVISIBLE_TITLE,
      explanation:
        "La dirección incluye 1 carácter que no se ve o que cambia el sentido en que se lee el texto. Puede hacer que el enlace se lea distinto de lo que es. El sitio que se abre es {openedHost}.",
      advice: INVISIBLE_OTHER_ADVICE,
      technical: "Carácter invisible: {codePoints}. Sitio que abre el navegador: {openedHost}.",
    },
    "invisible-characters/link-many": {
      tooltip: "Tiene {count} caracteres invisibles en la dirección.",
      title: INVISIBLE_TITLE,
      explanation:
        "La dirección incluye {count} caracteres que no se ven o que cambian el sentido en que se lee el texto. Pueden hacer que el enlace se lea distinto de lo que es. El sitio que se abre es {openedHost}.",
      advice: INVISIBLE_OTHER_ADVICE,
      technical: "Caracteres invisibles: {codePoints}. Sitio que abre el navegador: {openedHost}.",
    },
    "credentials/decoy": {
      tooltip: "No lleva a {decoy}: el sitio real es {realHost}.",
      title: "Este enlace no es de {decoy}",
      explanation:
        "El sitio real es {realHost}. «{decoy}» es solo un texto puesto antes de la arroba para que parezca otro sitio.",
      advice: "Si quieres entrar a {decoy}, escribe su dirección tú mismo en el navegador.",
      technical: WRITTEN_AND_OPENED,
    },
    "credentials/plain": {
      tooltip: "Incluye un usuario antes de la arroba; el sitio real es {realHost}.",
      title: "Este enlace lleva datos de acceso incluidos",
      explanation:
        "El enlace trae un nombre de usuario antes de la arroba. El sitio que se abre es {realHost}. Es una forma poco común de escribir un enlace y se usa para confundir.",
      advice: "Ábrelo solo si conoces {realHost} y esperabas este enlace.",
      technical: WRITTEN_AND_OPENED,
    },
    "ip-host/encoded": {
      tooltip: "Oculta una dirección numérica: en realidad lleva a {realHost}.",
      title: "Este enlace oculta a dónde lleva",
      explanation:
        "En lugar de un nombre de sitio usa un número, «{written}», que tu navegador convierte en la dirección {realHost}. Los sitios legítimos no escriben así sus enlaces.",
      advice: "No lo abras si no sabes con certeza qué equipo es {realHost}.",
      technical: WRITTEN_AND_OPENED,
    },
    "ip-host/public": {
      tooltip: "Lleva a una dirección numérica, {realHost}, y no a un sitio con nombre.",
      title: "Este enlace usa una dirección numérica",
      explanation:
        "El enlace apunta a {realHost}, un número en lugar de un nombre. Los bancos y servicios conocidos usan siempre su nombre de dominio.",
      advice: "Ábrelo solo si esperabas un enlace a ese equipo.",
      technical: WRITTEN_AND_OPENED,
    },
    "encoded-host": {
      tooltip: "Usa códigos con % en el nombre del sitio; en realidad es {realHost}.",
      title: "Este enlace disfraza el nombre del sitio",
      explanation:
        "El nombre del sitio está escrito con códigos, «{written}», que tu navegador convierte en {realHost}. Un sitio legítimo no necesita escribirlo así.",
      advice: "Revisa que {realHost} sea el sitio que esperabas antes de abrirlo.",
      technical: WRITTEN_AND_OPENED,
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
