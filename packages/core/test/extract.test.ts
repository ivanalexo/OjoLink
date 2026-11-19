import { describe, expect, it } from "vitest";
import { extractUrls, normalizeUrl } from "../src/index.js";

const cp = (...values: number[]) => String.fromCodePoint(...values);
const FAKE_BCP = `b${cp(0x0441, 0x0440)}.com.bo`;
const ZWSP = cp(0x200b);
const ENYE = cp(0x00f1);

describe("links with a scheme", () => {
  it("finds a link inside a sentence", () => {
    const text = "Tu cuenta fue bloqueada. Verifícala aquí: https://bcp.com.bo/validar hoy mismo";
    expect(extractUrls(text)).toEqual(["https://bcp.com.bo/validar"]);
  });

  it("returns several links in order", () => {
    const text =
      "Primero http://a.example.com/1 luego https://b.example.com/2 y https://c.example.com/3";
    expect(extractUrls(text)).toEqual([
      "http://a.example.com/1",
      "https://b.example.com/2",
      "https://c.example.com/3",
    ]);
  });

  it("keeps the query and the fragment", () => {
    const link = "https://example.net/a?x=1&y=2#seccion";
    expect(extractUrls(`mira ${link} por favor`)).toEqual([link]);
  });

  it("separates links glued by punctuation", () => {
    expect(extractUrls("https://a.example.com/1,https://b.example.com/2")).toEqual([
      "https://a.example.com/1",
      "https://b.example.com/2",
    ]);
  });

  it("keeps a link carried inside another link's query", () => {
    const wrapped = "https://www.google.com/url?q=https://example.net/a&sa=D";
    expect(extractUrls(`abre ${wrapped}`)).toEqual([wrapped]);
  });

  it("drops text glued in front of the scheme", () => {
    expect(extractUrls("enlace:https://bcp.com.bo/x")).toEqual(["https://bcp.com.bo/x"]);
    expect(extractUrls("[texto](https://bcp.com.bo/x)")).toEqual(["https://bcp.com.bo/x"]);
  });

  it("accepts an uppercase scheme", () => {
    expect(extractUrls("HTTPS://BCP.com.bo/Login")).toEqual(["HTTPS://BCP.com.bo/Login"]);
  });

  it.each(["mailto:soporte@bcp.com.bo", "ftp://example.net/archivo", "javascript:alert(1)"])(
    "does not return %s",
    (text) => {
      expect(extractUrls(`mira ${text} ahora`)).toEqual([]);
    },
  );
});

describe("links without a scheme", () => {
  it.each([
    ["a bare domain with a path", "entra a bcp.com.bo/login para continuar", "bcp.com.bo/login"],
    ["a domain starting with www", "visita www.bancosol.com.bo hoy", "www.bancosol.com.bo"],
    ["a domain with ñ", `trámite en vuce.yuri${ENYE}a.gob.bo`, `vuce.yuri${ENYE}a.gob.bo`],
    ["a short link", "pago pendiente bit.ly/3xYz", "bit.ly/3xYz"],
    ["a domain in uppercase", "ENTRA A BCP.COM.BO", "BCP.COM.BO"],
    ["a domain after an opening mark", "¿conoces bcp.com.bo?", "bcp.com.bo"],
  ])("finds %s", (_name, text, expected) => {
    expect(extractUrls(text)).toEqual([expected]);
  });

  it.each([
    ["a file name", "te mando factura.pdf y informe.docx"],
    ["a missing space after a period", "Gracias.Saludos"],
    ["two sentences run together with a real top-level domain", "Así termina.Es todo"],
    ["an abbreviation", "Sr. Pérez, pag. 3"],
    ["an ellipsis", "espera... ya casi"],
  ])("returns nothing for %s", (_name, text) => {
    expect(extractUrls(text)).toEqual([]);
  });
});

describe("internationalized and lookalike domains", () => {
  it("returns a lookalike host unchanged", () => {
    const link = `https://${FAKE_BCP}/validar`;
    const [found] = extractUrls(`Verifica tu cuenta: ${link}`);
    expect(found).toBe(link);
    expect(Array.from(found ?? "").some((char) => char === cp(0x0441))).toBe(true);
  });

  it("returns a scheme-less lookalike host", () => {
    expect(extractUrls(`entra a ${FAKE_BCP}/validar`)).toEqual([`${FAKE_BCP}/validar`]);
  });

  it("keeps an invisible character inside a host", () => {
    const link = `https://bcp${ZWSP}.com.bo/`;
    expect(extractUrls(`mira ${link}`)).toEqual([link]);
  });

  it("returns a punycode host", () => {
    expect(extractUrls("mira xn--b-5tbc.com.bo/validar")).toEqual(["xn--b-5tbc.com.bo/validar"]);
  });
});

describe("surrounding punctuation", () => {
  it.each([
    [
      "a period at the end of a sentence",
      "Visita https://bcp.com.bo/login.",
      "https://bcp.com.bo/login",
    ],
    ["a comma", "https://bcp.com.bo/login, por favor", "https://bcp.com.bo/login"],
    ["a question mark", "¿Es https://bcp.com.bo/login?", "https://bcp.com.bo/login"],
    ["parentheses", "(ver https://example.net/ayuda)", "https://example.net/ayuda"],
    ["a parenthesis and a period", "(ver https://example.net/ayuda).", "https://example.net/ayuda"],
    ["angle brackets", "<https://example.net/a>", "https://example.net/a"],
    ["angular quotation marks", "«https://example.net/a»", "https://example.net/a"],
    ["double quotation marks", 'dijo "https://example.net/a" ayer', "https://example.net/a"],
    ["emphasis marks", "*https://example.net/a*", "https://example.net/a"],
    ["a bare domain and a period", "Entra a bcp.com.bo.", "bcp.com.bo"],
  ])("removes %s", (_name, text, expected) => {
    expect(extractUrls(text)).toEqual([expected]);
  });

  it("keeps parentheses that belong to the link", () => {
    const link = "https://es.wikipedia.org/wiki/Sucre_(Bolivia)";
    expect(extractUrls(`Lee ${link}.`)).toEqual([link]);
    expect(extractUrls(`(${link})`)).toEqual([link]);
  });

  it("keeps a trailing slash", () => {
    expect(extractUrls("mira https://bcp.com.bo/ ya")).toEqual(["https://bcp.com.bo/"]);
  });
});

describe("email addresses", () => {
  it("returns nothing for an address in a sentence", () => {
    expect(extractUrls("Escríbenos a soporte@bcp.com.bo si tienes dudas")).toEqual([]);
    expect(extractUrls("Contacto: <soporte@bcp.com.bo>.")).toEqual([]);
  });

  it("returns only the link next to an address", () => {
    const text = "De: avisos@seguridad-bcp.net — entra a https://bcp.com.bo/validar";
    expect(extractUrls(text)).toEqual(["https://bcp.com.bo/validar"]);
  });

  it("returns a link that carries a user name", () => {
    expect(extractUrls("abre https://google.com@evil.io/ ya")).toEqual([
      "https://google.com@evil.io/",
    ]);
  });
});

describe("numbers", () => {
  it.each([
    "Pagaste Bs 1.250,50 con la versión 2.4.1",
    "El 12.05.2026 a las 10.30",
    "IP del router: 192.168.1.1",
    "código 3232235786",
  ])("returns nothing for %s", (text) => {
    expect(extractUrls(text)).toEqual([]);
  });

  it("returns a numeric address written with a scheme", () => {
    expect(extractUrls("entra a http://203.0.113.45/login ya")).toEqual([
      "http://203.0.113.45/login",
    ]);
  });
});

describe("duplicates", () => {
  it("returns a repeated link once, as first written", () => {
    const text = "https://bcp.com.bo/ y otra vez https://bcp.com.bo/ y HTTPS://BCP.com.bo";
    expect(extractUrls(text)).toEqual(["https://bcp.com.bo/"]);
  });

  it("treats a scheme-less link and its https form as the same", () => {
    expect(extractUrls("bcp.com.bo/login o https://bcp.com.bo/login")).toEqual([
      "bcp.com.bo/login",
    ]);
  });

  it("keeps different paths apart", () => {
    expect(extractUrls("https://bcp.com.bo/a https://bcp.com.bo/b")).toEqual([
      "https://bcp.com.bo/a",
      "https://bcp.com.bo/b",
    ]);
  });
});

describe("robustness", () => {
  it.each(["Hola, ¿cómo estás?", "", "   \n\t  ", "....", "@@@", "://"])(
    "returns an empty list for %j",
    (text) => {
      expect(extractUrls(text)).toEqual([]);
    },
  );

  it("returns an empty list for input that is not a string", () => {
    expect(extractUrls(undefined as unknown as string)).toEqual([]);
    expect(extractUrls(42 as unknown as string)).toEqual([]);
  });

  it("handles a very long text quickly", () => {
    const text = `${"palabra otra.cosa más texto, ".repeat(20000)} https://bcp.com.bo/final`;
    const started = Date.now();
    const result = extractUrls(text);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(result).toEqual(["https://bcp.com.bo/final"]);
    expect(text.length).toBeGreaterThan(300000);
  });

  const messy = [
    `(${FAKE_BCP}), "https://a.example.com/x?y=(1)". <b.example.com>; c.example.com/!`,
    "https://https://a.example.com https://",
    `a${ZWSP}b.com https://x${cp(0x202e)}y.example.com/z`,
    "soporte@bcp.com.bo,https://bcp.com.bo/a;bit.ly/x|www.example.net.",
    "http://[::1]/x http://3232235786/ 1.2.3.4 1.2.3",
    "[[[((({{{ ...,,,;;; )))]]]}}}",
  ];

  it.each(messy)("returns only links that normalize, repeatably, for %j", (text) => {
    const first = extractUrls(text);
    expect(extractUrls(text)).toEqual(first);
    for (const link of first) expect(normalizeUrl(link).ok).toBe(true);
    expect(new Set(first).size).toBe(first.length);
  });
});
