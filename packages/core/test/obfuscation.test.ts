import { describe, expect, it } from "vitest";
import { analyze, normalizeUrl, type Signal, type Verdict } from "../src/index.js";
import { credentials, encodedHost, ipHost } from "../src/signals/obfuscation.js";

function hit(signal: Signal, link: string) {
  const result = normalizeUrl(link);
  if (!result.ok) throw new Error(`could not normalize ${link}: ${result.reason}`);
  return signal.evaluate(result.url, {});
}

function verdict(link: string): Verdict {
  const result = analyze(link);
  if (!result.analyzed) throw new Error(`expected a verdict for ${link}`);
  return result;
}

function texts(link: string, id: string): string[] {
  const found = verdict(link).signals.find((entry) => entry.id === id);
  if (!found) throw new Error(`${id} did not trigger for ${link}`);
  return [found.tooltip, found.title, found.explanation, found.advice, found.technical];
}

describe("credentials before the host", () => {
  it("reports a domain before the at sign as a decoy", () => {
    expect(hit(credentials, "https://google.com@evil.io/")).toEqual({
      variant: "decoy",
      params: { decoy: "google.com", realHost: "evil.io", written: "google.com@evil.io" },
    });
  });

  it("reports a plain user name with the lower-weight variant", () => {
    expect(hit(credentials, "https://user:secret@example.net/")).toMatchObject({
      variant: "plain",
      params: { decoy: "user", realHost: "example.net", written: "user@example.net" },
    });
  });

  it("never exposes the password", () => {
    const result = hit(credentials, "https://user:secret@example.net/");
    expect(JSON.stringify(result)).not.toContain("secret");
    for (const text of texts("https://user:secret@example.net/", "credentials")) {
      expect(text).not.toContain("secret");
    }
  });

  it("recognizes a percent-encoded decoy", () => {
    expect(hit(credentials, "https://google%2Ecom@evil.io/")).toMatchObject({
      variant: "decoy",
      params: { decoy: "google.com" },
    });
  });

  it("does not trigger for an email address pasted without a scheme", () => {
    expect(analyze("juan@gmail.com")).toEqual({ analyzed: false, reason: "email-address" });
  });

  it("does not trigger for an at sign later in the link", () => {
    expect(hit(credentials, "https://example.net/perfil/@juan")).toBeNull();
    expect(hit(credentials, "https://example.net/?to=a@b.com")).toBeNull();
  });

  it("does not trigger for an empty user part", () => {
    expect(hit(credentials, "https://@example.net/")).toBeNull();
  });
});

describe("numeric address in a disguised notation", () => {
  it.each([
    ["a single decimal number", "http://3232235786/", "3232235786"],
    ["hexadecimal", "http://0xC0A8010A/", "0xc0a8010a"],
    ["octal parts", "http://0300.0250.01.012/", "0300.0250.01.012"],
    ["fewer than four parts", "http://192.168.266/", "192.168.266"],
    ["a public address as one number", "http://3405803821/", "3405803821"],
  ])("triggers for %s", (_name, link, written) => {
    expect(hit(ipHost, link)).toMatchObject({ variant: "encoded", params: { written } });
  });

  it("shows the address in its usual form", () => {
    expect(hit(ipHost, "http://3232235786/")?.params).toMatchObject({ realHost: "192.168.1.10" });
    expect(texts("http://3232235786/", "ip-host").join(" ")).toContain("192.168.1.10");
  });
});

describe("public numeric address", () => {
  it("triggers for a public IPv4 address", () => {
    expect(hit(ipHost, "http://203.0.113.45/login")).toMatchObject({
      variant: "public",
      params: { realHost: "203.0.113.45" },
    });
  });

  it("triggers for a public IPv6 address", () => {
    expect(hit(ipHost, "http://[2001:4860:4860::8888]/")).toMatchObject({ variant: "public" });
  });

  it("ignores a trailing dot", () => {
    expect(hit(ipHost, "http://203.0.113.45./")).toMatchObject({ variant: "public" });
  });
});

describe("private and local addresses", () => {
  it.each([
    "http://192.168.1.1/",
    "http://10.0.0.1/",
    "http://172.16.0.5/",
    "http://172.31.255.255/",
    "http://127.0.0.1:8080/",
    "http://169.254.1.1/",
    "http://100.64.0.1/",
    "http://[::1]/",
    "http://[fd00::1]/",
    "http://[fe80::1]/",
    "http://localhost:3000/",
  ])("does not trigger for %s", (link) => {
    expect(hit(ipHost, link)).toBeNull();
    expect(verdict(link).signals).toEqual([]);
  });

  it.each(["http://172.32.0.1/", "http://192.169.1.1/", "http://100.128.0.1/", "http://11.0.0.1/"])(
    "treats %s as public",
    (link) => {
      expect(hit(ipHost, link)).toMatchObject({ variant: "public" });
    },
  );
});

describe("percent-encoding in the host", () => {
  it("triggers and shows the decoded host", () => {
    expect(hit(encodedHost, "https://exa%6dple.com/")).toEqual({
      params: { written: "exa%6dple.com", realHost: "example.com" },
    });
  });

  it("does not trigger for encoding in the path only", () => {
    expect(hit(encodedHost, "https://example.com/a%20b?c=%2F")).toBeNull();
  });
});

describe("default engine", () => {
  it("reports danger for a decoy, naming both sites", () => {
    const result = verdict("https://google.com@evil.io/");
    expect(result.level).toBe("danger");
    expect(result.score).toBe(70);
    const [tooltip, title, explanation, , technical] = texts(
      "https://google.com@evil.io/",
      "credentials",
    );
    expect(title).toBe("Este enlace no es de google.com");
    expect(tooltip).toContain("evil.io");
    expect(explanation).toContain("El sitio real es evil.io");
    expect(technical).toContain("google.com@evil.io");
    expect(technical).toContain("evil.io.");
  });

  it("adds a plain user name and a public address", () => {
    const result = verdict("https://user@203.0.113.45/");
    expect(result.signals.map((signal) => signal.id).sort()).toEqual(["credentials", "ip-host"]);
    expect(result.score).toBe(80);
    expect(result.level).toBe("danger");
  });

  it("triggers both signals for a decoy in front of a numeric address", () => {
    const result = verdict("https://bcp.com.bo@203.0.113.45/");
    expect(result.signals.map((signal) => signal.id)).toEqual(["credentials", "ip-host"]);
    expect(result.score).toBe(100);
  });

  it.each([
    ["http://203.0.113.45/login", "caution", 40],
    ["http://3232235786/", "caution", 60],
    ["https://exa%6dple.com/", "caution", 30],
    ["https://user:secret@example.net/", "caution", 40],
  ] as const)("reports %s as %s", (link, level, score) => {
    expect(verdict(link)).toMatchObject({ level, score, notEvaluated: [] });
  });

  it.each(["https://bcp.com.bo/", "https://vuce.yuriña.gob.bo/", "https://example.com/a%20b"])(
    "finds no signals for %s",
    (link) => {
      expect(verdict(link)).toMatchObject({ level: "safe", signals: [] });
    },
  );

  it("leaves no placeholder unfilled in any text", () => {
    const cases: [string, string][] = [
      ["https://google.com@evil.io/", "credentials"],
      ["https://user:secret@example.net/", "credentials"],
      ["http://3232235786/", "ip-host"],
      ["http://203.0.113.45/", "ip-host"],
      ["https://exa%6dple.com/", "encoded-host"],
    ];
    for (const [link, id] of cases) {
      for (const text of texts(link, id)) expect(text).not.toMatch(/[{}|]/);
    }
  });
});
