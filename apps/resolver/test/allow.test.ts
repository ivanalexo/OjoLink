import { SHORTENERS } from "@ojolink/core";
import { describe, expect, it } from "vitest";
import { contactable, validateRequest } from "../src/allow.ts";

const body = (url: unknown) => JSON.stringify({ url });

describe("which URLs may be contacted", () => {
  it.each([
    "https://bit.ly/3xYz",
    "http://bit.ly/3xYz",
    "https://click.list-manage.com/track/click?u=abc&id=def",
    "https://BIT.LY/abc",
    "https://bit.ly:443/abc",
  ])("allows %s", (url) => {
    expect(contactable(new URL(url))).toBe(true);
  });

  it.each([
    "https://example.org/pagina",
    "https://notbit.ly/abc",
    "https://rabbit.ly/abc",
    "https://bit.ly.example.net/abc",
    "http://127.0.0.1/admin",
    "http://169.254.169.254/",
    "http://[::1]/",
    "https://user@bit.ly/abc",
    "https://user:clave@bit.ly/abc",
    "https://bit.ly:8443/abc",
    "ftp://bit.ly/abc",
    "javascript:alert(1)",
  ])("refuses %s", (url) => {
    expect(contactable(new URL(url))).toBe(false);
  });
});

describe("request validation", () => {
  it("accepts a short link and drops its fragment", () => {
    const result = validateRequest(body("https://bit.ly/3xYz#parte"));
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.url.href).toBe("https://bit.ly/3xYz");
  });

  it.each([
    ["a body that is not JSON", "no es json"],
    ["an empty object", "{}"],
    ["a JSON string", '"https://bit.ly/a"'],
    ["null", "null"],
    ["a url that is not a string", body(42)],
    ["a relative address", body("/abc")],
    ["another scheme", body("ftp://bit.ly/abc")],
    ["a script address", body("javascript:alert(1)")],
    ["credentials on a listed host", body("https://user@bit.ly/abc")],
    ["a port on a listed host", body("https://bit.ly:8443/abc")],
    ["an address over 2048 characters", body(`https://bit.ly/${"a".repeat(2048)}`)],
  ])("rejects %s as invalid", (_name, text) => {
    expect(validateRequest(text)).toEqual({ ok: false, error: "invalid-request" });
  });

  it.each(["https://example.org/pagina", "https://notbit.ly/abc", "http://127.0.0.1/"])(
    "rejects %s as a host outside the list",
    (url) => {
      expect(validateRequest(body(url))).toEqual({ ok: false, error: "host-not-allowed" });
    },
  );

  it("accepts every host on the engine's list", () => {
    expect(SHORTENERS.length).toBeGreaterThan(20);
    for (const { host } of SHORTENERS) {
      expect(validateRequest(body(`https://${host}/abc`)).ok, host).toBe(true);
    }
  });
});
