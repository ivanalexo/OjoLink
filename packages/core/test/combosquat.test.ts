import { describe, expect, it } from "vitest";
import { analyze, createDefaultEngine, describeResult } from "../src/index.js";
import { LURE_WORDS, PROTECTED_PACKS, type ProtectedPack } from "../src/data/index.js";
import { normalizeUrl } from "../src/normalize.js";
import { createCombosquatSignal, type CombosquatDetails } from "../src/signals/combosquat.js";
import { buildProtectedIndex } from "../src/signals/protected-index.js";

const PACKS: ProtectedPack[] = [
  {
    country: "bo",
    suffixes: [{ suffix: "gob.bo", name: "Estado", lookalikes: [] }],
    entries: [{ domain: "bcp.com.bo", name: "BCP", category: "bank" }],
  },
  {
    country: "global",
    suffixes: [],
    entries: [
      { domain: "amazon.com", name: "Amazon", category: "shopping", common: true },
      { domain: "apple.com", name: "Apple", category: "mail", common: true },
      { domain: "dhl.com", name: "DHL", category: "shipping" },
      { domain: "disney.com", name: "Disney+", category: "streaming" },
      {
        domain: "disneyplus.com",
        name: "Disney+",
        category: "streaming",
        names: ["disneyplus", "disney"],
      },
      { domain: "google.com", name: "Google", category: "mail" },
      { domain: "netflix.com", name: "Netflix", category: "streaming" },
      { domain: "paypal.com", name: "PayPal", category: "payments" },
      { domain: "target.com", name: "Target", category: "shopping", common: true },
      { domain: "ups.com", name: "UPS", category: "shipping" },
      { domain: "x.com", name: "X (Twitter)", category: "social", names: [] },
    ],
  },
];

const signal = createCombosquatSignal(PACKS, LURE_WORDS);

function hit(link: string, using = signal) {
  const normalized = normalizeUrl(link);
  if (!normalized.ok) throw new Error(`not a link: ${link}`);
  return using.evaluate(normalized.url, {});
}

const detailsOf = (link: string) => hit(link)?.details as CombosquatDetails | undefined;

describe("names that find a brand", () => {
  const index = buildProtectedIndex(PACKS, ["miempresa.com.bo", "abc.bo", "mi-tienda.com"]);

  it("uses the domain's own name by default", () => {
    expect(index.byName.get("paypal")).toMatchObject({
      entry: { domain: "paypal.com", entity: "PayPal" },
      common: false,
      short: false,
    });
  });

  it("uses declared names, and the first entry that claims one", () => {
    expect(index.byName.get("disneyplus")?.entry.domain).toBe("disneyplus.com");
    expect(index.byName.get("disney")?.entry.domain).toBe("disney.com");
  });

  it("marks common and short names", () => {
    expect(index.byName.get("apple")).toMatchObject({ common: true, short: false });
    expect(index.byName.get("ups")).toMatchObject({ common: false, short: true });
    expect(index.byName.get("bcp")?.short).toBe(true);
  });

  it("gives no name to an entry that opts out, or to a name under three letters", () => {
    expect(index.byName.has("x")).toBe(false);
    expect([...index.byName.keys()].every((name) => name.length >= 3)).toBe(true);
  });

  it("counts the user's domains, except a name it cannot match as a word", () => {
    expect(index.byName.get("miempresa")?.entry.domain).toBe("miempresa.com.bo");
    expect(index.byName.get("abc")?.short).toBe(true);
    expect(index.byName.has("mi-tienda")).toBe(false);
  });
});

describe("brand name as a word in someone else's domain", () => {
  it.each([
    ["https://netflix-pago.com/", "Netflix", "netflix.com", "netflix"],
    ["https://seguridad-paypal.net/", "PayPal", "paypal.com", "paypal"],
    ["https://www.netflix-pago.com/entrar", "Netflix", "netflix.com", "netflix"],
    ["https://mi-cuenta-disney-latam.com/", "Disney+", "disney.com", "disney"],
  ])("triggers for %s", (link, entity, imitated, word) => {
    expect(hit(link)).not.toBeNull();
    expect(detailsOf(link)).toMatchObject({ entity, imitated, word, inSubdomain: false });
    expect(hit(link)?.params).toMatchObject({ entity, imitated });
  });

  it.each([
    "https://amazon.es/",
    "https://google.com.bo/",
    "https://paypal.net/",
    "https://www.paypal.co.uk/x",
  ])("does not trigger for the name alone under another ending: %s", (link) => {
    expect(hit(link)).toBeNull();
  });

  it.each([
    "https://amazonas-tours.com/",
    "https://applebees.com/",
    "https://netflixers.org/",
    "https://googleplex-fans.com/",
  ])("does not trigger for a name inside a longer word: %s", (link) => {
    expect(hit(link)).toBeNull();
  });
});

describe("brand joined to a lure word", () => {
  it.each([
    ["https://paypalseguridad.com/", "PayPal", ["seguridad"]],
    ["https://verificarnetflix.com/", "Netflix", ["verificar"]],
    ["https://www.netflixsoporte.net/", "Netflix", ["soporte"]],
  ])("triggers for %s", (link, entity, words) => {
    expect(hit(link)?.variant).toBe("lure");
    expect(detailsOf(link)).toMatchObject({ entity, words });
  });

  it.each(["https://netflixparty.com/", "https://paypalooza.com/", "https://googleando.com/"])(
    "does not trigger when the name is joined to anything else: %s",
    (link) => {
      expect(hit(link)).toBeNull();
    },
  );
});

describe("variants", () => {
  it("is stronger with a lure word, and reports the word as shown to users", () => {
    const lure = hit("https://paypal-seguridad.net/");
    expect(lure?.variant).toBe("lure");
    expect((lure?.details as CombosquatDetails).words).toEqual(["seguridad"]);
    expect(lure?.params?.words).toBe("«seguridad»");
  });

  it("reports the brand alone next to a neutral word", () => {
    const alone = hit("https://netflix-codes.com/");
    expect(alone?.variant).toBe("brand");
    expect((alone?.details as CombosquatDetails).words).toEqual([]);
  });

  it("tolerates a lure word one letter off", () => {
    expect(hit("https://paypal-segurldad.net/")?.variant).toBe("lure");
  });

  it("does not count another brand's name as a lure word", () => {
    expect(hit("https://netflix-google.com/")?.variant).toBe("brand");
  });

  it("finds a lure word in a subdomain of the same host", () => {
    expect(hit("https://verificar.netflix-latam.com/")?.variant).toBe("lure");
  });
});

describe("brands that are common words or short names", () => {
  it.each([
    "https://apple-farm.com/",
    "https://target-practice.org/",
    "https://amazon-rainforest-trips.com/",
    "https://ups-store-locator.com/",
    "https://dhl-tracking-info.net/",
  ])("does not trigger without a lure word: %s", (link) => {
    expect(hit(link)).toBeNull();
  });

  it.each([
    ["https://apple-verificar.com/", "apple.com"],
    ["https://amazon-cuenta-bloqueada.com/", "amazon.com"],
    ["https://ups-seguridad.com/", "ups.com"],
    ["https://bcp-verificar.com/", "bcp.com.bo"],
  ])("triggers with a lure word: %s", (link, imitated) => {
    expect(hit(link)?.variant).toBe("lure");
    expect(detailsOf(link)?.imitated).toBe(imitated);
  });

  it.each(["https://upsseguridad.com/", "https://appleverificar.com/", "https://dhlsoporte.net/"])(
    "never matches such a name joined to a lure word: %s",
    (link) => {
      expect(hit(link)).toBeNull();
    },
  );
});

describe("brand name in a subdomain", () => {
  it("triggers with a lure word in the host", () => {
    const link = "https://paypal.cuenta-verificar.xyz/";
    expect(hit(link)?.variant).toBe("lure");
    expect(detailsOf(link)).toMatchObject({ imitated: "paypal.com", inSubdomain: true });
  });

  it.each([
    "https://apple.stackexchange.com/",
    "https://netflix.fandom.com/",
    "https://paypal.example.org/",
  ])("does not trigger on an ordinary site: %s", (link) => {
    expect(hit(link)).toBeNull();
  });

  it("prefers the brand in the registrable name over one in a subdomain", () => {
    expect(detailsOf("https://paypal.netflix-pago.com/")?.entity).toBe("Netflix");
  });
});

describe("legitimate hosts", () => {
  it.each([
    "https://netflix.com/",
    "https://help.netflix.com/es",
    "https://disneyplus.com/",
    "https://www.disney.com/",
    "https://netflix-ayuda.gob.bo/",
    "http://192.168.1.10/netflix-pago",
    "https://localhost/netflix-pago",
    "https://example.org/ofertas/netflix-pago",
    "https://example.org/?marca=paypal-seguridad",
  ])("does not trigger for %s", (link) => {
    expect(hit(link)).toBeNull();
  });

  it("leaves a page on a hosting service to the hosting signal", () => {
    const result = analyze("https://netflix-pago.vercel.app/");
    expect(result.analyzed && result.signals.map((item) => item.id)).toEqual(["hosting"]);
  });

  it("stays silent when the subdomain signal reports the brand", () => {
    const result = analyze("https://paypal.com.verifica.net/");
    expect(result.analyzed && result.signals.map((item) => item.id)).toEqual(["subdomain"]);
  });

  it("stays silent when the typosquat signal reports the brand", () => {
    const others = [
      {
        id: "typosquat",
        kind: "risk" as const,
        evaluate: () => ({ details: { entity: "Netflix" } }),
      },
    ];
    const guarded = createCombosquatSignal(PACKS, LURE_WORDS, undefined, { others });
    expect(hit("https://netflix-pago.com/", guarded)).toBeNull();
    expect(hit("https://paypal-pago.com/", guarded)).not.toBeNull();
  });
});

describe("domains added by the user", () => {
  const own = createCombosquatSignal(PACKS, LURE_WORDS, ["miempresa.com.bo", "abc.bo"]);

  it("counts a user domain as a brand", () => {
    expect(hit("https://miempresa-pagos.com/", own)?.details).toMatchObject({
      imitated: "miempresa.com.bo",
    });
    expect(hit("https://miempresa-pagos.com/")).toBeNull();
  });

  it("applies the short-name rule to it", () => {
    expect(hit("https://abc-tienda.com/", own)).toBeNull();
    expect(hit("https://abc-verificar.com/", own)?.variant).toBe("lure");
  });

  it("works through the default engine", () => {
    const engine = createDefaultEngine({ userDomains: ["miempresa.com.bo"] });
    const result = engine.analyze("https://miempresa-pagos.com/");
    expect(result.analyzed && result.signals.map((item) => item.id)).toEqual(["combosquat"]);
  });
});

describe("one brand is reported", () => {
  it("reports the longest name when several match", () => {
    expect(detailsOf("https://paypal-netflix-pago.com/")?.entity).toBe("Netflix");
    expect(detailsOf("https://disney-disneyplus-ya.com/")?.word).toBe("disneyplus");
  });
});

describe("default engine and texts", () => {
  it("ships the signal with the real packs", () => {
    expect(PROTECTED_PACKS.map((pack) => pack.country)).toContain("global");
    const result = analyze("https://netflix-cuenta.com/");
    expect(result.analyzed && result.signals[0]).toMatchObject({
      id: "combosquat",
      variant: "lure",
    });
  });

  it("names the brand's address in the lure-word variant and advises against opening", () => {
    const description = describeResult(analyze("https://paypal-seguridad.net/"));
    expect(description.analyzed && description.warning).toMatchObject({
      title: "Este enlace usa el nombre de PayPal, pero no es de paypal.com",
    });
    const warning = description.analyzed ? description.warning : null;
    expect(warning?.explanation).toContain("paypal-seguridad.net");
    expect(warning?.explanation).toContain("«seguridad»");
    expect(warning?.advice).toContain("no abrirlo");
  });

  it("says it may be another site in the brand-alone variant", () => {
    const description = describeResult(analyze("https://netflix-codes.com/"));
    const warning = description.analyzed ? description.warning : null;
    expect(description.analyzed && description.level).toBe("caution");
    expect(warning?.explanation).toContain("Puede ser otro sitio que usa ese nombre");
    expect(warning?.advice).toContain("netflix.com");
  });

  it("gives the host, the word, and the count in the technical text", () => {
    const result = analyze("https://paypal-seguridad.net/");
    const technical = result.analyzed ? result.signals[0]?.technical : "";
    expect(technical).toContain("paypal-seguridad.net");
    expect(technical).toContain("paypal");
    expect(technical).toContain("1");
  });
});
