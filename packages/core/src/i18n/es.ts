import type { NormalizeFailureReason } from "../normalize.js";
import type { Level } from "../score.js";

export interface LevelMessage {
  readonly label: string;
  readonly description: string;
}

export const SIGNAL_TEXTS = ["tooltip", "title", "explanation", "advice", "technical"] as const;

export type SignalText = (typeof SIGNAL_TEXTS)[number];

export type SignalMessage = Readonly<Record<SignalText, string>>;

export type Terms = Readonly<Record<string, Readonly<Record<string, string>>>>;

export const PRESENTATION_LABELS = [
  "comparison",
  "realAddress",
  "technical",
  "substituted",
  "score",
  "notEvaluated",
] as const;

export type PresentationLabels = Readonly<Record<(typeof PRESENTATION_LABELS)[number], string>>;

export type ReasonMessages = Readonly<Record<NormalizeFailureReason, string>>;

export const REVEAL_TEXTS = [
  "waiting",
  "waitingDeep",
  "manual",
  "revealButton",
  "retryButton",
  "deepButton",
  "leadsTo",
  "viaShortener",
  "safeDestination",
  "failedTitle",
  "failedUnresolved",
  "failedOffline",
  "failedLimited",
  "failedDeepUnavailable",
  "failedError",
  "failedAdvice",
  "sentNotice",
  "policyLink",
  "announceRevealed",
  "announceFailed",
] as const;

export type RevealTexts = Readonly<Record<(typeof REVEAL_TEXTS)[number], string>>;

export interface Messages {
  readonly levels: Readonly<Record<Level, LevelMessage>>;
  readonly signals: Readonly<Record<string, SignalMessage>>;
  readonly terms?: Terms;
  readonly reasons?: ReasonMessages;
  readonly labels?: PresentationLabels;
  readonly reveal?: RevealTexts;
}

const HOMOGRAPH_TITLE = "Este enlace imita a {imitated}";
const HOMOGRAPH_ADVICE =
  "Si esperabas un mensaje de {entity}, escribe {imitated} tú mismo o abre su app.";
const HOMOGRAPH_CONSEQUENCE = "Para tu navegador es otro sitio, registrado por otra persona.";

const SUBDOMAIN_SUFFIX_TITLE = "Este enlace no termina en {shown}";
const SUBDOMAIN_SUFFIX_ADVICE =
  "Si buscas un sitio oficial, comprueba que la dirección termine en {shown}.";
const SUBDOMAIN_OFFICIAL = "Los sitios oficiales ({entity}) terminan en {shown}.";

const HIDDEN_TITLE = "No se sabe a dónde lleva este enlace";
const HIDDEN_ADVICE =
  "Revela el destino antes de abrirlo. Si no esperabas este mensaje, no lo abras.";

const TYPOSQUAT_TITLE = "Este enlace se parece a {imitated}";
const TYPOSQUAT_ADVICE =
  "Si querías entrar al sitio de {entity}, escribe {imitated} tú mismo en el navegador.";
const TYPOSQUAT_DOUBT = "Puede ser otro sitio que aprovecha el parecido.";
const TYPOSQUAT_TECHNICAL =
  "Escrito: {written}. Se parece a: {imitated}. Diferencias: {edits}. Sitio real: {realDomain}.";

const HOSTING_TITLE = "Esta página está en un servicio donde cualquiera puede publicar";
const HOSTING_FACT =
  "Esta página está alojada en {service}, un servicio donde cualquier persona puede publicar. No es el sitio oficial de ninguna empresa.";
const HOSTING_ADVICE =
  "Las empresas no piden verificar una cuenta desde una página así. Si el mensaje dice venir de una empresa, entra a su sitio escribiendo la dirección tú mismo.";
const HOSTING_TECHNICAL =
  "Servicio: {service} ({host}). Nombre elegido por quien publica: {publisherName}. Palabras encontradas: {count}.";

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
    "homograph/letters-one": {
      tooltip:
        "Imita a {imitated}: 1 de sus letras es {foreignScript|scriptOne} y se ve igual a una latina.",
      title: HOMOGRAPH_TITLE,
      explanation: `Se ve como {imitated}, pero 1 de sus letras es {foreignScript|scriptOne}. ${HOMOGRAPH_CONSEQUENCE}`,
      advice: HOMOGRAPH_ADVICE,
      technical:
        "Dirección real: {asciiDomain}. Imita a {imitated}. Letra sustituida: {codePoints}.",
    },
    "homograph/letters-many": {
      tooltip:
        "Imita a {imitated}: {count} de sus letras son {foreignScript|scriptMany} y se ven iguales a las latinas.",
      title: HOMOGRAPH_TITLE,
      explanation: `Se ve como {imitated}, pero {count} de sus letras son {foreignScript|scriptMany}. ${HOMOGRAPH_CONSEQUENCE}`,
      advice: HOMOGRAPH_ADVICE,
      technical:
        "Dirección real: {asciiDomain}. Imita a {imitated}. Letras sustituidas: {codePoints}.",
    },
    "homograph/whole-script": {
      tooltip: "Imita a {imitated}: todas sus letras son {foreignScript|scriptMany}.",
      title: HOMOGRAPH_TITLE,
      explanation:
        "No mezcla alfabetos: todas sus letras son {foreignScript|scriptMany}, pero juntas se ven idénticas a {imitated}. Es un dominio distinto.",
      advice: HOMOGRAPH_ADVICE,
      technical:
        "Dirección real: {asciiDomain}. Imita a {imitated}. Letras sustituidas: {codePoints}.",
    },
    "homograph/lookalike": {
      tooltip: "Imita a {imitated}: usa «{written}» en lugar de «{readsAs}».",
      title: HOMOGRAPH_TITLE,
      explanation: `Se ve como {imitated}, pero usa «{written}» en lugar de «{readsAs}». ${HOMOGRAPH_CONSEQUENCE}`,
      advice: HOMOGRAPH_ADVICE,
      technical:
        "Dirección real: {asciiDomain}. Imita a {imitated}. Caracteres sustituidos: {codePoints}.",
    },
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
    "hidden-destination/shortener": {
      tooltip: "No muestra a dónde lleva: usa el acortador {service}.",
      title: HIDDEN_TITLE,
      explanation:
        "Usa un acortador, {service}, que oculta el destino. Hasta revelarlo no se puede saber a qué sitio lleva.",
      advice: HIDDEN_ADVICE,
      technical: "Servicio: {service} (acortador). Enlace a resolver: {link}.",
    },
    "hidden-destination/tracker": {
      tooltip: "No muestra a dónde lleva: es un enlace de seguimiento de {service}.",
      title: HIDDEN_TITLE,
      explanation:
        "Es un enlace de seguimiento, de los que usan los envíos masivos de correo. Pasa por {service} antes de llegar a su destino, que no se muestra.",
      advice: HIDDEN_ADVICE,
      technical: "Servicio: {service} (seguimiento). Enlace a resolver: {link}.",
    },
    "typosquat/changed": {
      tooltip: "Se parece a {imitated}: tiene «{writtenChar}» en lugar de «{expectedChar}».",
      title: TYPOSQUAT_TITLE,
      explanation: `El nombre es casi igual al de {imitated}, pero tiene «{writtenChar}» donde va «{expectedChar}». ${TYPOSQUAT_DOUBT}`,
      advice: TYPOSQUAT_ADVICE,
      technical: TYPOSQUAT_TECHNICAL,
    },
    "typosquat/extra": {
      tooltip: "Se parece a {imitated}: le sobra una «{writtenChar}».",
      title: TYPOSQUAT_TITLE,
      explanation: `El nombre tiene una letra más que {imitated}: le sobra una «{writtenChar}». ${TYPOSQUAT_DOUBT}`,
      advice: TYPOSQUAT_ADVICE,
      technical: TYPOSQUAT_TECHNICAL,
    },
    "typosquat/missing": {
      tooltip: "Se parece a {imitated}: le falta la «{expectedChar}».",
      title: TYPOSQUAT_TITLE,
      explanation: `El nombre tiene una letra menos que {imitated}: le falta la «{expectedChar}». ${TYPOSQUAT_DOUBT}`,
      advice: TYPOSQUAT_ADVICE,
      technical: TYPOSQUAT_TECHNICAL,
    },
    "typosquat/swapped": {
      tooltip: "Se parece a {imitated}: tiene «{writtenChar}» donde va «{expectedChar}».",
      title: TYPOSQUAT_TITLE,
      explanation: `El nombre es casi igual al de {imitated}, pero tiene dos letras cambiadas de lugar: «{writtenChar}» donde va «{expectedChar}». ${TYPOSQUAT_DOUBT}`,
      advice: TYPOSQUAT_ADVICE,
      technical: TYPOSQUAT_TECHNICAL,
    },
    "typosquat/two": {
      tooltip: "Se parece a {imitated}: difiere en 2 letras.",
      title: TYPOSQUAT_TITLE,
      explanation: `El nombre es casi igual al de {imitated}: solo difiere en 2 letras. ${TYPOSQUAT_DOUBT}`,
      advice: TYPOSQUAT_ADVICE,
      technical: TYPOSQUAT_TECHNICAL,
    },
    "typosquat/ending": {
      tooltip: "Se parece a {imitated}: termina en {writtenEnding} en lugar de {expectedEnding}.",
      title: TYPOSQUAT_TITLE,
      explanation:
        "El nombre es el mismo, pero la dirección termina en {writtenEnding} y no en {expectedEnding}. El sitio real es {realDomain}.",
      advice: TYPOSQUAT_ADVICE,
      technical: TYPOSQUAT_TECHNICAL,
    },
    "hosting/plain": {
      tooltip: "Está en {service}, un servicio donde cualquiera puede publicar una página.",
      title: HOSTING_TITLE,
      explanation: HOSTING_FACT,
      advice: HOSTING_ADVICE,
      technical: HOSTING_TECHNICAL,
    },
    "hosting/one-word": {
      tooltip: "Está en {service}, donde cualquiera puede publicar, y su dirección usa {words}.",
      title: HOSTING_TITLE,
      explanation: `${HOSTING_FACT} Su dirección usa la palabra {words}, común en mensajes que se hacen pasar por un servicio.`,
      advice: HOSTING_ADVICE,
      technical: HOSTING_TECHNICAL,
    },
    "hosting/two-words": {
      tooltip: "Está en {service}, donde cualquiera puede publicar, y su dirección usa {words}.",
      title: HOSTING_TITLE,
      explanation: `${HOSTING_FACT} Su dirección usa las palabras {words}, comunes en mensajes que se hacen pasar por un servicio.`,
      advice: HOSTING_ADVICE,
      technical: HOSTING_TECHNICAL,
    },
    "hosting/words": {
      tooltip: "Está en {service}, donde cualquiera puede publicar, y su dirección usa {words}.",
      title: HOSTING_TITLE,
      explanation: `${HOSTING_FACT} Su dirección usa las palabras {words}, comunes en mensajes que se hacen pasar por un servicio.`,
      advice: HOSTING_ADVICE,
      technical: HOSTING_TECHNICAL,
    },
    "subdomain/domain": {
      tooltip: "No es de {shown}: el sitio real es {realDomain}.",
      title: "Este enlace no es de {shown}",
      explanation:
        "El sitio real es {realDomain}. «{shown}» es solo una parte del nombre, puesta para que parezca el sitio de {entity}.",
      advice: "Si esperabas un mensaje de {entity}, escribe {shown} tú mismo o abre su app.",
      technical:
        "Dirección completa: {asciiHost}. Sitio real: {realDomain}. Nombre mostrado: {shown}.",
    },
    "subdomain/suffix": {
      tooltip: "No termina en {shown}: el sitio real es {realDomain}.",
      title: SUBDOMAIN_SUFFIX_TITLE,
      explanation: `El sitio real es {realDomain}. «{shown}» aparece dentro del nombre, pero no es su terminación. ${SUBDOMAIN_OFFICIAL}`,
      advice: SUBDOMAIN_SUFFIX_ADVICE,
      technical:
        "Dirección completa: {asciiHost}. Sitio real: {realDomain}. Terminación mostrada: {shown}.",
    },
    "subdomain/suffix-lookalike": {
      tooltip: "Termina en {written}, que se parece a {shown} pero no es lo mismo.",
      title: SUBDOMAIN_SUFFIX_TITLE,
      explanation: `La dirección termina en {written}, que se parece a {shown}. ${SUBDOMAIN_OFFICIAL}`,
      advice: SUBDOMAIN_SUFFIX_ADVICE,
      technical:
        "Dirección completa: {asciiHost}. Terminación escrita: {written}. Terminación protegida: {shown}.",
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
  reasons: {
    empty: "Pega un enlace o un mensaje para revisarlo.",
    "not-a-link": "No encontramos ningún enlace en este texto.",
    "unsupported-scheme":
      "Este tipo de enlace no se analiza. Solo se revisan enlaces web, los que empiezan con http o https.",
    "email-address": "Esto es una dirección de correo, no un enlace.",
  },
  labels: {
    comparison: "Letra por letra",
    realAddress: "Dirección real",
    technical: "Ver detalle técnico",
    substituted: "sustituida",
    score: "Puntaje",
    notEvaluated: "Señales que no se pudieron evaluar",
  },
  reveal: {
    waiting: "Revelando el destino…",
    waitingDeep: "Analizando a fondo. Puede tardar unos segundos.",
    manual: "Este mensaje tiene muchos enlaces cortos. Revela este cuando quieras.",
    revealButton: "Revelar destino",
    retryButton: "Reintentar",
    deepButton: "Análisis profundo",
    leadsTo: "Lleva a",
    viaShortener:
      "Este enlace pasa por un acortador. El resultado es el de la dirección a la que lleva.",
    safeDestination: "No se encontraron señales de alerta en la dirección a la que lleva.",
    failedTitle: "No se pudo revelar el destino",
    failedUnresolved: "El acortador no dejó ver a dónde lleva este enlace.",
    failedOffline: "Sin conexión no se puede revelar el destino.",
    failedLimited: "Se hicieron muchas consultas seguidas. Intenta de nuevo en un momento.",
    failedDeepUnavailable: "El análisis profundo no está disponible ahora. Intenta más tarde.",
    failedError: "El servicio que revela destinos no respondió.",
    failedAdvice:
      "Mientras no se sepa a dónde lleva, trátalo con cuidado. Si no esperabas este mensaje, no lo abras.",
    sentNotice: "Para revelar el destino, el enlace corto se envió al servicio de OjoLink.",
    policyLink: "Política de privacidad",
    announceRevealed: "Destino revelado: {level}.",
    announceFailed: "No se pudo revelar el destino de un enlace.",
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
