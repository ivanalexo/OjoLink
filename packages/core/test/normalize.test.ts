import { describe, expect, it } from "vitest";
import { normalizeUrl, type NormalizedUrl } from "../src/index.js";

function ok(input: string): NormalizedUrl {
  const result = normalizeUrl(input);
  if (!result.ok) throw new Error(`expected ${input} to normalize, got ${result.reason}`);
  return result.url;
}

function reason(input: string): string {
  const result = normalizeUrl(input);
  return result.ok ? "ok" : result.reason;
}

const CYRILLIC_APPLE = "аррӏе.com";

describe("normalized form", () => {
  it("lowercases the host and keeps the original input", () => {
    const input = "HTTPS://WWW.BCP.com.bo/Login?x=1";
    const url = ok(input);
    expect(url.host).toBe("www.bcp.com.bo");
    expect(url.asciiHost).toBe("www.bcp.com.bo");
    expect(url.labels).toEqual(["www", "bcp", "com", "bo"]);
    expect(url.input).toBe(input);
    expect(url.scheme).toBe("https");
    expect(url.schemeAssumed).toBe(false);
  });

  it("ignores surrounding whitespace", () => {
    const padded = ok("  https://bcp.com.bo/login \n");
    const plain = ok("https://bcp.com.bo/login");
    expect({ ...padded, input: "" }).toEqual({ ...plain, input: "" });
  });

  it("removes a trailing dot from the host", () => {
    const url = ok("https://bcp.com.bo./login");
    expect(url.host).toBe("bcp.com.bo");
    expect(url.registrableDomain).toBe("bcp.com.bo");
    expect(url.href).toBe("https://bcp.com.bo/login");
  });
});

describe("Unicode and punycode hosts", () => {
  it("decodes punycode input", () => {
    const url = ok("https://vuce.xn--yuria-rta.gob.bo/");
    expect(url.host).toBe("vuce.yuriña.gob.bo");
    expect(url.asciiHost).toBe("vuce.xn--yuria-rta.gob.bo");
  });

  it("gives the same hosts for Unicode input", () => {
    const fromUnicode = ok("https://vuce.yuriña.gob.bo/");
    const fromPunycode = ok("https://vuce.xn--yuria-rta.gob.bo/");
    expect(fromUnicode.host).toBe(fromPunycode.host);
    expect(fromUnicode.asciiHost).toBe(fromPunycode.asciiHost);
    expect(fromUnicode.registrableDomain).toBe("yuriña.gob.bo");
  });

  it("keeps non-Latin characters in the Unicode host", () => {
    const url = ok(`https://${CYRILLIC_APPLE}/`);
    expect(url.host).toBe(CYRILLIC_APPLE);
    expect(url.asciiHost.startsWith("xn--")).toBe(true);
  });
});

describe("registrable domain", () => {
  it("handles a multi-label public suffix", () => {
    const url = ok("https://siat.impuestos.gob.bo/");
    expect(url.publicSuffix).toBe("gob.bo");
    expect(url.registrableDomain).toBe("impuestos.gob.bo");
    expect(url.subdomainLabels).toEqual(["siat"]);
    expect(url.suffixKnown).toBe(true);
  });

  it("finds the real owner when a protected name is a subdomain", () => {
    const url = ok("https://login.microsoft.com.example.net/");
    expect(url.registrableDomain).toBe("example.net");
    expect(url.subdomainLabels).toEqual(["login", "microsoft", "com"]);
  });

  it("reports no registrable domain when the host is a public suffix", () => {
    const url = ok("https://gob.bo/");
    expect(url.publicSuffix).toBe("gob.bo");
    expect(url.registrableDomain).toBeNull();
    expect(url.subdomainLabels).toEqual([]);
  });

  it("treats hosting-platform subdomains as separate owners", () => {
    expect(ok("https://evil.github.io/").registrableDomain).toBe("evil.github.io");
  });

  it("falls back to the last label for an unknown suffix", () => {
    const url = ok("https://servidor.intranet/");
    expect(url.publicSuffix).toBe("intranet");
    expect(url.registrableDomain).toBe("servidor.intranet");
    expect(url.suffixKnown).toBe(false);
  });

  it("normalizes a single-label host without a registrable domain", () => {
    const url = ok("http://localhost:3000/");
    expect(url.host).toBe("localhost");
    expect(url.registrableDomain).toBeNull();
    expect(url.scheme).toBe("http");
  });
});

describe("IP address hosts", () => {
  it("marks an IPv4 host", () => {
    const url = ok("http://192.168.1.10/login");
    expect(url.isIp).toBe(true);
    expect(url.registrableDomain).toBeNull();
    expect(url.publicSuffix).toBeNull();
  });

  it("recognizes a decimal IPv4 and keeps the notation visible", () => {
    const input = "http://3232235786/";
    const url = ok(input);
    expect(url.isIp).toBe(true);
    expect(url.asciiHost).toBe("192.168.1.10");
    expect(url.input).toBe(input);
    expect(url.destination).toBe(input);
  });

  it("marks an IPv6 host", () => {
    expect(ok("http://[::1]/").isIp).toBe(true);
  });
});

describe("links without a scheme", () => {
  it("assumes https for a bare domain", () => {
    const url = ok("bcp.com.bo/login");
    expect(url.host).toBe("bcp.com.bo");
    expect(url.scheme).toBe("https");
    expect(url.schemeAssumed).toBe(true);
    expect(url.destination).toBe("bcp.com.bo/login");
  });

  it("does not mistake a port for a scheme", () => {
    const url = ok("bcp.com.bo:8080/x");
    expect(url.host).toBe("bcp.com.bo");
    expect(url.schemeAssumed).toBe(true);
  });

  it("accepts a bare IP address", () => {
    expect(ok("192.168.1.10/login").isIp).toBe(true);
  });

  it("rejects bare words and unknown suffixes", () => {
    expect(reason("hola")).toBe("not-a-link");
    expect(reason("servidor.intranet")).toBe("not-a-link");
  });
});

describe("invalid input", () => {
  it.each(["", "   ", "\n\t"])("reports empty input for %j", (input) => {
    expect(reason(input)).toBe("empty");
  });

  it.each(["mailto:soporte@bcp.com.bo", "javascript:alert(1)", "tel:+59170000000", "ftp://x.com/"])(
    "reports an unsupported scheme for %s",
    (input) => {
      expect(reason(input)).toBe("unsupported-scheme");
    },
  );

  it.each(["hola, ¿cómo estás?", "Nota: revisa tu cuenta", "https://", "https://./"])(
    "reports text that is not a link for %s",
    (input) => {
      expect(reason(input)).toBe("not-a-link");
    },
  );
});

describe("wrapped links", () => {
  it("normalizes the destination of an Outlook Safe Link", () => {
    const input =
      "https://nam02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fbcp.com.bo%2Flogin&data=abc";
    const url = ok(input);
    expect(url.host).toBe("bcp.com.bo");
    expect(url.wrappers).toEqual(["outlook-safelinks"]);
    expect(url.destination).toBe("https://bcp.com.bo/login");
    expect(url.input).toBe(input);
  });

  it("normalizes the destination of a Google redirect", () => {
    const url = ok("https://www.google.com/url?q=https://example.net/a&sa=D");
    expect(url.host).toBe("example.net");
    expect(url.wrappers).toEqual(["google-redirect"]);
  });

  it("does not unwrap a lookalike wrapper host", () => {
    const url = ok(
      "https://safelinks.protection.outlook.com.evil.net/?url=https%3A%2F%2Fbcp.com.bo",
    );
    expect(url.registrableDomain).toBe("evil.net");
    expect(url.wrappers).toEqual([]);
  });

  it("normalizes a wrapper without a destination as itself", () => {
    const url = ok("https://nam02.safelinks.protection.outlook.com/?data=abc");
    expect(url.host).toBe("nam02.safelinks.protection.outlook.com");
    expect(url.wrappers).toEqual([]);
  });

  it("reports when the layer limit is reached", () => {
    let link = "https://example.net/";
    for (let layer = 0; layer < 7; layer++) {
      link = `https://www.google.com/url?q=${encodeURIComponent(link)}`;
    }
    const url = ok(link);
    expect(url.wrappers).toHaveLength(5);
    expect(url.wrapperLimitReached).toBe(true);
  });
});

describe("determinism", () => {
  const inputs = [
    "https://bcp.com.bo/",
    "bcp.com.bo",
    `https://${CYRILLIC_APPLE}/`,
    "https://google.com@evil.io/",
    "http://0x7f.1/",
    "https://xn--abc-!!!.com/",
    "https://www.google.com/url?q=javascript:alert(1)",
    "https://a​b.com/",
    "https://exa mple.com/",
    "%%%",
    "://",
    "‮https://bcp.com.bo",
    "x".repeat(5000),
    "",
  ];

  it.each(inputs)("never throws and is repeatable for %j", (input) => {
    const first = normalizeUrl(input);
    expect(normalizeUrl(input)).toEqual(first);
  });
});
