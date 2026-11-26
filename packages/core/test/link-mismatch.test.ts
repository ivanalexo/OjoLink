import { describe, expect, it } from "vitest";
import { analyze, createDefaultEngine, describeResult } from "../src/index.js";
import { buildProtectedIndex, ownerOf } from "../src/signals/protected-index.js";
import { PROTECTED_PACKS } from "../src/data/index.js";
import type { LinkMismatchDetails } from "../src/signals/link-mismatch.js";

declare const performance: { now(): number };

const STARTING_LINK = "https://proteccion-de-usuario.jimdosite.com/";
const STARTING_TEXT = "https://Outlook.com/verificar-identidad";
const ELSEWHERE = "https://cuenta-segura.net/";
const safeLink = (carried: string) =>
  `https://nam02.safelinks.protection.outlook.com/?url=${encodeURIComponent(carried)}&data=x`;

function check(
  link: string,
  visibleText?: string,
  engine: { analyze: typeof analyze } = { analyze },
) {
  const result = engine.analyze(
    link,
    visibleText === undefined ? {} : { context: { visibleText } },
  );
  if (!result.analyzed) throw new Error(`not analyzed: ${link}`);
  const hit = result.signals.find((signal) => signal.id === "link-text-mismatch") ?? null;
  return { result, hit, details: (hit?.details ?? null) as LinkMismatchDetails | null };
}

describe("owner of a domain", () => {
  const index = buildProtectedIndex(PROTECTED_PACKS);

  it("finds the same entity for a domain and for a host under it", () => {
    const owner = ownerOf(index, "live.com");
    expect(owner).not.toBeNull();
    expect(ownerOf(index, "login.live.com")?.entity).toBe(owner?.entity);
    expect(ownerOf(index, "LOGIN.Live.com.")?.entity).toBe(owner?.entity);
  });

  it("finds nothing for a domain nobody protected owns", () => {
    expect(ownerOf(index, "cuenta-segura.net")).toBeNull();
    expect(ownerOf(index, "live.com.cuenta-segura.net")).toBeNull();
    expect(ownerOf(index, "com")).toBeNull();
  });

  it("gives a user domain its own entity", () => {
    const withUser = buildProtectedIndex(PROTECTED_PACKS, ["miempresa.com.bo"]);
    expect(ownerOf(withUser, "pagos.miempresa.com.bo")).toMatchObject({
      domain: "miempresa.com.bo",
      category: "user",
    });
  });
});

describe("text that shows one domain on a link to another", () => {
  it("triggers for the message that started this signal, at danger", () => {
    const { result, details } = check(STARTING_LINK, STARTING_TEXT);
    expect(details).toMatchObject({ shown: "outlook.com", real: "jimdosite.com" });
    expect(details?.entity).toBe(
      ownerOf(buildProtectedIndex(PROTECTED_PACKS), "outlook.com")?.entity,
    );
    expect(result.level).toBe("danger");
    expect(result.signals.map((signal) => signal.id)).toContain("hosting");
  });

  it.each([
    ["a bare domain", "www.bcp.com.bo", "https://cuenta-segura.net/bcp"],
    ["a domain inside a sentence", "Ingresa a bcp.com.bo para continuar", ELSEWHERE],
    ["a domain in capitals", "WWW.BCP.COM.BO", ELSEWHERE],
    ["a domain followed by a period", "Entra en bcp.com.bo.", ELSEWHERE],
  ])("triggers for %s", (_name, text, link) => {
    expect(check(link, text).details).toMatchObject({
      shown: "bcp.com.bo",
      real: "cuenta-segura.net",
    });
  });

  it.each([
    [
      "the same site in another letter case",
      "Outlook.com/verificar",
      "https://www.outlook.com/owa/",
    ],
    ["a subdomain of the same site", "bcp.com.bo", "https://banca.bcp.com.bo/login"],
    ["the same site with www in the text", "www.lostiempos.com", "https://lostiempos.com/nota"],
    ["the exact address", "https://www.lostiempos.com/nota", "https://www.lostiempos.com/nota"],
  ])("stays silent for %s", (_name, text, link) => {
    expect(check(link, text).hit).toBeNull();
  });
});

describe("only text that reads as a web address counts", () => {
  it.each([
    ["a button label", "Verificar mi cuenta"],
    ["a brand name without a domain", "Ir a Outlook"],
    ["an email address", "soporte@empresa.com"],
    ["a file name", "informe.pdf"],
    ["a version number", "v2.5.1"],
    ["a missing space after a period", "Gracias.Saludos"],
    ["a sentence that ends in a period", "Haz clic aquí."],
    ["an amount", "Bs. 1.250,50"],
    ["an empty text", ""],
    ["spaces", "   "],
  ])("stays silent for %s", (_name, text) => {
    expect(check(STARTING_LINK, text).hit).toBeNull();
  });

  it("stays silent with no context", () => {
    expect(check(STARTING_LINK).hit).toBeNull();
    expect(analyze(STARTING_LINK, { context: {} })).toEqual(analyze(STARTING_LINK));
  });

  it.each(["manual.zip", "notas.md", "video.mov", "instalar.sh"])(
    "takes %s for a file name",
    (text) => {
      expect(check(ELSEWHERE, text).hit).toBeNull();
    },
  );

  it.each([
    ["https://manual.zip", "manual.zip"],
    ["manual.zip/descarga", "manual.zip"],
    ["www.manual.zip", "manual.zip"],
  ])("takes %s for an address", (text, shown) => {
    expect(check(ELSEWHERE, text).details?.shown).toBe(shown);
  });
});

describe("several addresses in the text", () => {
  it("stays silent when one of them is the destination", () => {
    expect(check("https://www.viabcp.com/", "bcp.com.bo o viabcp.com").hit).toBeNull();
  });

  it("reports the first when none is", () => {
    expect(check(ELSEWHERE, "bcp.com.bo o viabcp.com").details?.shown).toBe("bcp.com.bo");
  });
});

describe("destinations that cannot be read, and wrappers", () => {
  it.each([
    ["a tracking redirect", "www.tienda.com", "https://click.list-manage.com/track/click?u=1&id=2"],
    ["a short link", "bcp.com.bo", "https://bit.ly/3xYz"],
  ])("stays silent through %s, and the result is a hidden destination", (_name, text, link) => {
    const { result, hit } = check(link, text);
    expect(hit).toBeNull();
    expect(result.level).toBe("hidden-destination");
  });

  it("compares with the destination a wrapper carries", () => {
    const { result, details } = check(safeLink(ELSEWHERE), "bcp.com.bo");
    expect(details).toMatchObject({ shown: "bcp.com.bo", real: "cuenta-segura.net" });
    expect(result.level).toBe("danger");
  });

  it("stays silent when the wrapper carries the site the text shows", () => {
    expect(check(safeLink("https://www.lostiempos.com/nota"), "www.lostiempos.com").hit).toBeNull();
  });

  it("stays silent when the text shows a shortener", () => {
    expect(check("https://www.lostiempos.com/nota", "bit.ly/nota-de-hoy").hit).toBeNull();
  });
});

describe("domains of the same organization", () => {
  it.each([
    ["outlook.com", "https://login.live.com/"],
    ["youtu.be/abc", "https://www.youtube.com/watch?v=abc"],
    ["hotmail.com", "https://outlook.com/owa/"],
  ])("stays silent for %s on %s", (text, link) => {
    expect(check(link, text).hit).toBeNull();
  });

  it("triggers between two different organizations", () => {
    expect(check("https://www.netflix.com/", "paypal.com").details).toMatchObject({
      shown: "paypal.com",
      real: "netflix.com",
    });
  });
});

describe("level and variant", () => {
  it("reaches danger alone when the text shows a protected domain", () => {
    const { result, hit } = check(ELSEWHERE, "paypal.com/acceso");
    expect(hit?.variant).toBe("brand");
    expect(result.signals).toHaveLength(1);
    expect(result.level).toBe("danger");
  });

  it("gives caution alone when the text shows any other domain", () => {
    const { result, hit, details } = check("https://otra-tienda.net/", "www.mi-tienda-local.com");
    expect(hit?.variant).toBe("other");
    expect(details).toEqual({
      shown: "mi-tienda-local.com",
      real: "otra-tienda.net",
      entity: null,
    });
    expect(result.signals).toHaveLength(1);
    expect(result.level).toBe("caution");
  });

  it("treats a domain the user protects as protected", () => {
    const engine = createDefaultEngine({ userDomains: ["miempresa.com.bo"] });
    const text = "miempresa.com.bo/pagos";
    expect(check("https://pagos-seguros.net/", text).hit?.variant).toBe("other");
    const { result, hit, details } = check("https://pagos-seguros.net/", text, engine);
    expect(hit?.variant).toBe("brand");
    expect(details?.entity).toBe("miempresa.com.bo");
    expect(result.level).toBe("danger");
  });

  it("adds to another risk signal", () => {
    const alone = check("https://otra-tienda.net/", "www.mi-tienda-local.com").result;
    const hosted = check("https://tienda.jimdosite.com/", "www.mi-tienda-local.com").result;
    expect(hosted.signals.map((signal) => signal.id).sort()).toEqual([
      "hosting",
      "link-text-mismatch",
    ]);
    expect(hosted.score).toBeGreaterThan(alone.score);
  });
});

describe("texts", () => {
  it("names both domains in one line for a mark", () => {
    const { hit } = check(STARTING_LINK, STARTING_TEXT);
    expect(hit?.tooltip).toBe("Dice outlook.com, pero lleva a jimdosite.com.");
  });

  it("explains the difference and tells the person to write the address", () => {
    const description = describeResult(check(ELSEWHERE, "paypal.com").result);
    if (!description.analyzed || !description.warning) throw new Error("no warning");
    const { title, explanation, advice } = description.warning;
    expect(title).toBe("Este enlace no va a donde dice");
    expect(explanation).toContain("paypal.com");
    expect(explanation).toContain("cuenta-segura.net");
    expect(advice).toContain("escribe");
    expect(advice).toContain("paypal.com");
    expect(`${title} ${explanation} ${advice}`).not.toMatch(/fraude|estafa|falso|robar/i);
  });

  it("leaves no placeholder unresolved in either variant", () => {
    for (const [link, text] of [
      [ELSEWHERE, "paypal.com"],
      ["https://otra-tienda.net/", "www.mi-tienda-local.com"],
    ] as const) {
      const { hit } = check(link, text);
      expect(JSON.stringify(hit)).not.toMatch(/\{\w+\}/);
    }
  });
});

describe("hostile text", () => {
  it("grows no faster than the text on very long texts", () => {
    // Relative, so the check does not depend on the speed of the machine running it: twice
    // the text may cost about twice the time, never several times more.
    const filler = (words: number) =>
      `bcp.com.bo ${"palabra ".repeat(words)} ${"x.y ".repeat(words / 2)}`;
    const [long, longer] = [filler(6000), filler(12000)];
    const best = (text: string) => {
      let fastest = Infinity;
      for (let round = 0; round < 7; round++) {
        const start = performance.now();
        for (let i = 0; i < 20; i++) check(ELSEWHERE, text);
        fastest = Math.min(fastest, performance.now() - start);
      }
      return fastest;
    };
    best(long);
    best(longer);
    expect(best(longer)).toBeLessThan(best(long) * 3 + 2);
  });

  it("looks only at the start of a very long text", () => {
    expect(check(ELSEWHERE, `${"palabra ".repeat(200)} bcp.com.bo`).hit).toBeNull();
  });

  it("does not let invisible or direction characters disguise a domain", () => {
    const { details, result } = check(ELSEWHERE, "bcp​.com‮.bo");
    expect(details?.shown).toBe("bcp.com.bo");
    expect(result.signals.map((signal) => signal.id)).toContain("invisible-characters");
  });

  it.each([
    ["look-alike letters", "раураl.com"],
    ["markup", "<a href='https://bcp.com.bo'>bcp.com.bo</a>"],
    ["control characters", "bcp\u0000.com\u0007.bo"],
    ["only dots", "....."],
    ["a lone surrogate", "bcp.com.bo\uD800"],
  ])("does not throw on %s", (_name, text) => {
    expect(() => check(ELSEWHERE, text)).not.toThrow();
  });

  it("compares a text address with a destination that is an IP address", () => {
    const { details } = check("http://203.0.113.7/login", "bcp.com.bo");
    expect(details).toMatchObject({ shown: "bcp.com.bo", real: "203.0.113.7" });
  });

  it("gives equal results for equal inputs, and never changes the normalized link", () => {
    const first = check(STARTING_LINK, STARTING_TEXT).result;
    expect(check(STARTING_LINK, STARTING_TEXT).result).toEqual(first);
    expect(first.url).toEqual(check(STARTING_LINK).result.url);
  });
});

describe("Jimdo as a hosting service", () => {
  it.each(["jimdosite.com", "jimdofree.com"])("reports a page published on %s", (host) => {
    const { result } = check(`https://taller-de-ceramica.${host}/`);
    expect(result.signals.map((signal) => `${signal.id}/${signal.variant}`)).toEqual([
      "hosting/plain",
    ]);
  });

  it("says nothing about the service's own pages", () => {
    expect(check("https://www.jimdosite.com/").result.signals).toEqual([]);
    expect(check("https://jimdosite.com/").result.signals).toEqual([]);
  });
});
