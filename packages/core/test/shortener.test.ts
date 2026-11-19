import { describe, expect, it } from "vitest";
import {
  analyze,
  createHiddenDestinationSignal,
  matchShortener,
  normalizeUrl,
  SHORTENERS,
  type HiddenDestinationDetails,
  type Shortener,
  type Signal,
  type TriggeredSignal,
  type Verdict,
} from "../src/index.js";

const hidden = createHiddenDestinationSignal(SHORTENERS);

function hit(link: string, signal: Signal = hidden) {
  const result = normalizeUrl(link);
  if (!result.ok) throw new Error(`could not normalize ${link}: ${result.reason}`);
  return signal.evaluate(result.url, {});
}

function verdict(link: string): Verdict {
  const result = analyze(link);
  if (!result.analyzed) throw new Error(`expected a verdict for ${link}`);
  return result;
}

function own(link: string): TriggeredSignal {
  const found = verdict(link).signals.find((signal) => signal.id === "hidden-destination");
  if (!found) throw new Error(`hidden-destination did not trigger for ${link}`);
  return found;
}

describe("matchShortener", () => {
  it.each([
    ["the listed host", "bit.ly", "bit.ly", "shortener"],
    ["a www subdomain", "www.bit.ly", "bit.ly", "shortener"],
    ["a tracker subdomain", "click.list-manage.com", "list-manage.com", "tracker"],
    ["a deeper subdomain", "u123.ct.sendgrid.net", "sendgrid.net", "tracker"],
    ["an uppercase host", "BIT.LY", "bit.ly", "shortener"],
    ["a host with a trailing dot", "bit.ly.", "bit.ly", "shortener"],
  ])("matches %s", (_name, host, service, kind) => {
    expect(matchShortener(host)).toEqual({ host: service, kind });
  });

  it.each(["rabbit.ly", "notbit.ly", "bit.ly.example.net", "ly", "example.net", "localhost", ""])(
    "does not match %j",
    (host) => {
      expect(matchShortener(host)).toBeNull();
    },
  );

  it("uses the list it is given", () => {
    const custom: Shortener[] = [{ host: "go.example", kind: "shortener" }];
    expect(matchShortener("go.example", custom)).toEqual(custom[0]);
    expect(matchShortener("bit.ly", custom)).toBeNull();
    expect(matchShortener("bit.ly", [])).toBeNull();
  });
});

describe("links through a shortener or tracker", () => {
  it("triggers for a short link", () => {
    expect(hit("https://bit.ly/3xYz")).toEqual({
      variant: "shortener",
      params: { service: "bit.ly", link: "https://bit.ly/3xYz" },
      details: { service: "bit.ly", kind: "shortener", link: "https://bit.ly/3xYz" },
    });
  });

  it("triggers for a tracking redirect on a subdomain", () => {
    const link = "https://click.list-manage.com/track/click?u=abc&id=def";
    expect(hit(link)).toMatchObject({
      variant: "tracker",
      details: { service: "list-manage.com", kind: "tracker", link },
    });
  });

  it("triggers when the destination is given only in the query", () => {
    expect(hit("https://tinyurl.com/?id=abc")?.variant).toBe("shortener");
    expect(hit("https://tinyurl.com?id=abc")?.variant).toBe("shortener");
  });

  it("reports the short link, not the wrapper, as the link to resolve", () => {
    const wrapped = `https://nam02.safelinks.protection.outlook.com/?url=${encodeURIComponent("https://bit.ly/3xYz")}&data=x`;
    const details = hit(wrapped)?.details as HiddenDestinationDetails;
    expect(details.link).toBe("https://bit.ly/3xYz");
  });

  it("accepts a custom list", () => {
    const custom = createHiddenDestinationSignal([{ host: "go.example", kind: "tracker" }]);
    expect(hit("https://go.example/abc", custom)?.variant).toBe("tracker");
    expect(hit("https://bit.ly/abc", custom)).toBeNull();
  });

  it("assumes https for a short link pasted without a scheme", () => {
    expect(hit("bit.ly/3xYz")?.params).toMatchObject({ link: "https://bit.ly/3xYz" });
  });
});

describe("other links", () => {
  it.each([
    ["the shortener's home page", "https://bit.ly/"],
    ["the home page without a slash", "https://bit.ly"],
    ["the home page with an empty query", "https://bit.ly/?"],
    ["the home page with only a fragment", "https://bit.ly/#top"],
    ["a host that ends with a listed name", "https://rabbit.ly/abc"],
    ["another host that ends with a listed name", "https://notbit.ly/abc"],
    ["a listed name before an at sign", "https://bit.ly@example.net/abc"],
    ["a listed name in the path", "https://example.net/bit.ly/abc"],
    ["a listed name as a subdomain of another site", "https://bit.ly.example.net/abc"],
    ["an ordinary link", "https://bcp.com.bo/login"],
    ["an IP address host", "http://203.0.113.45/abc"],
  ])("does not trigger for %s", (_name, link) => {
    expect(hit(link)).toBeNull();
  });
});

describe("default engine", () => {
  it("reports the hidden-destination level with score 0", () => {
    expect(verdict("https://bit.ly/3xYz")).toMatchObject({
      level: "hidden-destination",
      levelLabel: "Destino oculto",
      score: 0,
      notEvaluated: [],
    });
  });

  it("says the destination is unknown and names the shortener", () => {
    const { title, tooltip, explanation, advice, technical, weight } = own("https://bit.ly/3xYz");
    expect(weight).toBe(0);
    expect(title).toBe("No se sabe a dónde lleva este enlace");
    expect(tooltip).toBe("No muestra a dónde lleva: usa el acortador bit.ly.");
    expect(explanation).toContain("Usa un acortador, bit.ly, que oculta el destino.");
    expect(advice).toContain("Revela el destino antes de abrirlo.");
    expect(technical).toContain("https://bit.ly/3xYz");
  });

  it("describes a tracking redirect as a mass-mailing link", () => {
    const { explanation } = own("https://click.list-manage.com/track/click?u=abc");
    expect(explanation).toContain("enlace de seguimiento");
    expect(explanation).toContain("list-manage.com");
  });

  it("never calls the link dangerous", () => {
    for (const link of ["https://bit.ly/3xYz", "https://click.list-manage.com/track?u=a"]) {
      const { title, tooltip, explanation, advice, technical } = own(link);
      for (const text of [title, tooltip, explanation, advice, technical]) {
        expect(text.toLowerCase()).not.toMatch(/peligro|fraude|estafa|malicios/);
        expect(text).not.toMatch(/[{}|]/);
      }
    }
  });

  it("gives way to danger and stays in the result", () => {
    const result = verdict("https://google.com@bit.ly/3xYz");
    expect(result.level).toBe("danger");
    expect(result.signals.map((signal) => signal.id)).toEqual([
      "credentials",
      "hidden-destination",
    ]);
  });

  it("outranks a caution-level sign", () => {
    const result = verdict("https://user@bit.ly/3xYz");
    expect(result).toMatchObject({ level: "hidden-destination", score: 40 });
  });

  it.each(["https://bit.ly/", "https://rabbit.ly/abc", "https://bcp.com.bo/login"])(
    "finds no signals for %s",
    (link) => {
      expect(verdict(link)).toMatchObject({ level: "safe", signals: [] });
    },
  );
});
