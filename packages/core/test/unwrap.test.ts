import { describe, expect, it } from "vitest";
import { unwrapUrl } from "../src/unwrap.js";

const safeLink = (inner: string) =>
  `https://nam02.safelinks.protection.outlook.com/?url=${encodeURIComponent(inner)}&data=abc`;
const googleRedirect = (inner: string) =>
  `https://www.google.com/url?q=${encodeURIComponent(inner)}&sa=D`;

describe("unwrapUrl", () => {
  it("unwraps a regional Outlook Safe Links host", () => {
    expect(unwrapUrl(safeLink("https://bcp.com.bo/login"))).toEqual({
      destination: "https://bcp.com.bo/login",
      wrappers: ["outlook-safelinks"],
      limitReached: false,
    });
  });

  it("unwraps a Google redirect using q or url", () => {
    expect(unwrapUrl("https://www.google.com/url?q=https://example.net/a&sa=D")).toEqual({
      destination: "https://example.net/a",
      wrappers: ["google-redirect"],
      limitReached: false,
    });
    expect(unwrapUrl("https://google.com/url?url=https://example.net/b").destination).toBe(
      "https://example.net/b",
    );
  });

  it("leaves other Google paths untouched", () => {
    const input = "https://www.google.com/search?q=https://example.net";
    expect(unwrapUrl(input)).toEqual({ destination: input, wrappers: [], limitReached: false });
  });

  it("unwraps nested wrappers, outermost first", () => {
    const result = unwrapUrl(safeLink(googleRedirect("https://example.net/")));
    expect(result.destination).toBe("https://example.net/");
    expect(result.wrappers).toEqual(["outlook-safelinks", "google-redirect"]);
  });

  it("leaves a wrapper without a destination in place", () => {
    const input = "https://nam02.safelinks.protection.outlook.com/?data=abc";
    expect(unwrapUrl(input)).toEqual({ destination: input, wrappers: [], limitReached: false });
  });

  it("leaves a wrapper whose destination is not a web link in place", () => {
    const input = safeLink("javascript:alert(1)");
    expect(unwrapUrl(input).wrappers).toEqual([]);
    expect(unwrapUrl(input).destination).toBe(input);
  });

  it("does not unwrap a lookalike wrapper host", () => {
    const input = "https://safelinks.protection.outlook.com.evil.net/?url=https%3A%2F%2Fbcp.com.bo";
    expect(unwrapUrl(input).wrappers).toEqual([]);
  });

  it("stops at five layers and reports the limit", () => {
    let link = "https://example.net/";
    for (let layer = 0; layer < 7; layer++) link = googleRedirect(link);

    const result = unwrapUrl(link);
    expect(result.wrappers).toHaveLength(5);
    expect(result.limitReached).toBe(true);
    expect(new URL(result.destination).hostname).toBe("www.google.com");
  });

  it("does not report the limit for exactly five layers", () => {
    let link = "https://example.net/";
    for (let layer = 0; layer < 5; layer++) link = googleRedirect(link);

    const result = unwrapUrl(link);
    expect(result.destination).toBe("https://example.net/");
    expect(result.limitReached).toBe(false);
  });
});
