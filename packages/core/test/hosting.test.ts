import { describe, expect, it } from "vitest";
import {
  analyze,
  createHostingSignal,
  describeResult,
  findLureWords,
  normalizeUrl,
  type HostingDetails,
  type Verdict,
} from "../src/index.js";
import { HOSTING_SERVICES, LURE_WORDS } from "../src/data/index.js";

const hosting = createHostingSignal(HOSTING_SERVICES, LURE_WORDS);

const FIRST_SAMPLE = "https://sites.google.com/view/serivciosbandejamensajeriaen/";
const SECOND_SAMPLE =
  "http://www.google.com/url?q=http%3A%2F%2Fasistenciatecnicaserviciosmensajeria.zya.me%2F&sa=D&sntz=1&usg=AOvVaw152VXhZrFqUA-a_cU2CXQG";

function normalized(link: string) {
  const result = normalizeUrl(link);
  if (!result.ok) throw new Error(`could not normalize ${link}: ${result.reason}`);
  return result.url;
}

function page(link: string) {
  return hosting.match(normalized(link));
}

function hit(link: string) {
  return hosting.evaluate(normalized(link), {});
}

function verdict(link: string): Verdict {
  const result = analyze(link);
  if (!result.analyzed) throw new Error(`expected a verdict for ${link}`);
  return result;
}

function words(name: string) {
  return findLureWords(name, LURE_WORDS).map((word) => word.shown);
}

describe("service lookup", () => {
  it("finds a page on a service that gives each user a path", () => {
    const found = page("https://sites.google.com/view/mi-proyecto/");
    expect(found?.service.name).toBe("Google Sites");
    expect(found?.publisherName).toBe("mi-proyecto");
  });

  it("finds a page on a service that gives each user a subdomain", () => {
    const found = page("http://ejemplo.zya.me/");
    expect(found?.service.host).toBe("zya.me");
    expect(found?.publisherName).toBe("ejemplo");
  });

  it("takes every label in front of the service as the publisher's name", () => {
    expect(page("https://blog.ejemplo.github.io/")?.publisherName).toBe("blog.ejemplo");
  });

  it("looks at the final destination of a redirect", () => {
    const found = page(SECOND_SAMPLE);
    expect(found?.service.host).toBe("zya.me");
    expect(found?.publisherName).toBe("asistenciatecnicaserviciosmensajeria");
  });

  it("finds forms by their path", () => {
    expect(page("https://docs.google.com/forms/d/e/abc/viewform")?.service.name).toBe(
      "Formularios de Google",
    );
    expect(page("https://forms.gle/AbCdEf123")?.publisherName).toBe("AbCdEf123");
  });

  it.each([
    "https://sites.google.com/",
    "https://sites.google.com/new",
    "https://zya.me/",
    "https://www.weebly.com/",
    "https://docs.google.com/",
    "https://docs.google.com/document/d/1abc/edit",
    "https://notgithub.io/pagina",
    "https://zya.me.example.net/",
    "https://www.bcp.com.bo/soporte/seguridad",
  ])("does not match %s", (link) => {
    expect(page(link)).toBeNull();
    expect(hit(link)).toBeNull();
  });
});

describe("findLureWords", () => {
  it("finds the words run together in the first name of the real sample", () => {
    expect(words("serivciosbandejamensajeriaen")).toEqual(["servicios", "bandeja", "mensajería"]);
  });

  it("finds the words run together in the second name of the real sample", () => {
    expect(words("asistenciatecnicaserviciosmensajeria")).toEqual([
      "asistencia",
      "técnica",
      "servicios",
      "mensajería",
    ]);
  });

  it("counts a long word with two letters swapped", () => {
    expect(words("serivcios")).toEqual(["servicios"]);
  });

  it("counts a long word with a letter missing or added", () => {
    expect(words("mensajeri")).toEqual(["mensajería"]);
    expect(words("asisstencia")).toEqual(["asistencia"]);
  });

  it("does not count the same letters twice", () => {
    expect(words("servicios-servicio")).toEqual(["servicios"]);
    expect(words("verificacion")).toEqual(["verificación"]);
  });

  it("does not count a short word that is only close", () => {
    expect(words("segura")).toEqual([]);
    expect(words("soportar")).toEqual([]);
  });

  it("ignores case, accents, and separators", () => {
    expect(words("Verificación_de-CUENTA")).toEqual(["verificación", "cuenta"]);
  });

  it("returns nothing for an empty name or a name without lure words", () => {
    expect(words("")).toEqual([]);
    expect(words("recetas-de-la-abuela")).toEqual([]);
  });
});

describe("hosting signal", () => {
  it("reports a page without lure words as plain", () => {
    const result = hit("https://ejemplo.github.io/recetas/");
    expect(result?.variant).toBe("plain");
    expect(result?.details).toEqual({
      service: "GitHub Pages",
      host: "github.io",
      publisherName: "ejemplo",
      words: [],
    });
  });

  it("reports one lure word", () => {
    const result = hit("https://soporte-ejemplo.github.io/");
    expect(result?.variant).toBe("one-word");
    expect((result?.details as HostingDetails).words).toEqual(["soporte"]);
  });

  it("reports two lure words without a brand name apart", () => {
    const result = hit("https://login-password-demo.netlify.app/");
    expect(result?.variant).toBe("two-words");
    expect((result?.details as HostingDetails).words).toEqual(["login", "password"]);
  });

  it("reports two lure words when one is a brand name", () => {
    expect(hit("https://paypal-login.pages.dev/")?.variant).toBe("words");
  });

  it("reports three or more lure words", () => {
    const result = hit(FIRST_SAMPLE);
    expect(result?.variant).toBe("words");
    expect(result?.details).toEqual({
      service: "Google Sites",
      host: "sites.google.com",
      publisherName: "serivciosbandejamensajeriaen",
      words: ["servicios", "bandeja", "mensajería"],
    });
  });

  it("does not count words in deeper path segments", () => {
    expect(hit("https://ejemplo.github.io/docs/account/password/")?.variant).toBe("plain");
    expect(hit("https://sites.google.com/view/primaria5b/login/password")?.variant).toBe("plain");
  });

  it("works with its own lists", () => {
    const own = createHostingSignal(
      [{ name: "Ejemplo", host: "paginas.example", assignment: "subdomain", prefix: null }],
      [{ match: "premio", shown: "premio", brand: false }],
    );
    expect(own.evaluate(normalized("https://premio.paginas.example/"), {})?.variant).toBe(
      "one-word",
    );
    expect(own.evaluate(normalized("https://ejemplo.github.io/"), {})).toBeNull();
  });
});

describe("default analysis", () => {
  it("puts both links of the real sample at danger", () => {
    const first = verdict(FIRST_SAMPLE);
    expect(first.level).toBe("danger");
    expect(first.signals[0]?.id).toBe("hosting");
    expect((first.signals[0]?.details as HostingDetails).service).toBe("Google Sites");

    const second = verdict(SECOND_SAMPLE);
    expect(second.level).toBe("danger");
    expect((second.signals[0]?.details as HostingDetails).words).toEqual([
      "asistencia",
      "técnica",
      "servicios",
      "mensajería",
    ]);
  });

  it("keeps a page with no lure word or one lure word at caution", () => {
    expect(verdict("https://ejemplo.github.io/recetas/").level).toBe("caution");
    expect(verdict("https://soporte-ejemplo.github.io/").level).toBe("caution");
  });

  it.each([
    "https://microsoft.github.io/vscode/",
    "https://elbancodelibros.blogspot.com/",
    "https://pineapplestudio.wixsite.com/home",
    "https://seguros-lapaz.wixsite.com/inicio",
    "https://react-login-form.vercel.app/",
    "https://password-generator.pages.dev/",
    "https://tienda-accesorios.webflow.io/",
    "https://sites.google.com/view/soportetecnicocolegio",
    "https://facturacion-electronica-curso.blogspot.com/",
    "https://login-password-demo.netlify.app/",
    "https://soporte-usuarios-biblioteca.blogspot.com/",
    "https://sites.google.com/view/correo-usuarios-colegio",
    "https://banco-de-seguros-curso.wordpress.com/",
    "https://account-billing-api.herokuapp.com/",
  ])("keeps the ordinary page %s at caution", (link) => {
    expect(verdict(link).level).toBe("caution");
  });

  it("leaves the services' own pages and unrelated sites without the signal", () => {
    for (const link of [
      "https://sites.google.com/",
      "https://www.wordpress.com/pricing/",
      "https://github.io/",
      "https://www.bcp.com.bo/soporte/seguridad",
    ]) {
      expect(verdict(link).signals.some((signal) => signal.id === "hosting")).toBe(false);
    }
  });
});

describe("warning texts", () => {
  function warning(link: string) {
    const view = describeResult(analyze(link));
    if (!view.analyzed || !view.warning) throw new Error(`expected a warning for ${link}`);
    return view;
  }

  it("names the service and says anyone can publish there", () => {
    const view = warning("https://ejemplo.github.io/recetas/");
    expect(view.warning?.explanation).toContain("GitHub Pages");
    expect(view.warning?.explanation).toContain("cualquier persona puede publicar");
    expect(view.warning?.explanation).toContain("No es el sitio oficial de ninguna empresa");
  });

  it("quotes the words found", () => {
    const view = warning(FIRST_SAMPLE);
    expect(view.level).toBe("danger");
    expect(view.warning?.explanation).toContain("Google Sites");
    expect(view.warning?.explanation).toContain("«servicios», «bandeja», «mensajería»");
    expect(view.warning?.advice).toContain("no piden verificar una cuenta");
  });

  it("informs without accusing and fills every placeholder", () => {
    for (const link of [
      "https://ejemplo.github.io/recetas/",
      "https://soporte-ejemplo.github.io/",
      "https://login-password-demo.netlify.app/",
      FIRST_SAMPLE,
    ]) {
      const view = warning(link);
      const text = [
        view.warning?.title,
        view.warning?.explanation,
        view.warning?.advice,
        view.technical,
      ].join(" ");
      expect(text).not.toMatch(/[{}]/);
      expect(text).not.toMatch(/fraud|estafa|falsa|falso|malicios/i);
    }
  });
});
