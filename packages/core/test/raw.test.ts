import { describe, expect, it } from "vitest";
import { rawAuthority } from "../src/raw.js";

describe("rawAuthority", () => {
  it.each([
    ["https://bcp.com.bo/login", null, "bcp.com.bo"],
    ["bcp.com.bo/login", null, "bcp.com.bo"],
    ["https://google.com@evil.io/", "google.com", "evil.io"],
    ["https://user:secret@example.net/a", "user:secret", "example.net"],
    ["https://a@b@evil.io/", "a@b", "evil.io"],
    ["https://bcp.com.bo:8443/x", null, "bcp.com.bo"],
    ["http://[::1]:8080/", null, "[::1]"],
    ["http://[2001:db8::1]/", null, "[2001:db8::1]"],
    ["https://example.net/perfil/@juan", null, "example.net"],
    ["https://example.net\\@evil.io", null, "example.net"],
    ["https://example.net?next=a@b", null, "example.net"],
    ["https://example.net#a@b", null, "example.net"],
    ["http://3232235786/", null, "3232235786"],
    ["https://exa%6dple.com/", null, "exa%6dple.com"],
    ["HTTPS://WWW.BCP.com.bo", null, "WWW.BCP.com.bo"],
    ["  https://bcp.com.bo  ", null, "bcp.com.bo"],
  ])("reads %s", (input, userInfo, host) => {
    expect(rawAuthority(input)).toMatchObject({ userInfo, host });
  });

  it("returns the link without its host as the rest", () => {
    expect(rawAuthority("https://user@evil.io:8080/a?b#c").rest).toBe("https://user@:8080/a?b#c");
    expect(rawAuthority("evil.io/a").rest).toBe("/a");
  });

  it("removes only the host occurrence that follows the user information", () => {
    expect(rawAuthority("https://evil.io@evil.io/evil.io").rest).toBe("https://evil.io@/evil.io");
  });

  it("handles an empty string", () => {
    expect(rawAuthority("")).toEqual({ userInfo: null, host: "", rest: "" });
  });
});
