import { describe, expect, it } from "vitest";
import { findRedirect } from "../src/html.ts";
import { MAX_PAGE_BYTES } from "../src/limits.ts";

describe("redirect written in a page", () => {
  it.each([
    ['<meta http-equiv="refresh" content="0; url=https://example.org/">', "https://example.org/"],
    ['<meta content="0;URL=https://example.org/a" http-equiv="Refresh">', "https://example.org/a"],
    ["<META HTTP-EQUIV='refresh' CONTENT='3; url=/siguiente'>", "/siguiente"],
    ["<meta http-equiv=refresh content=0;url=https://example.org/b>", "https://example.org/b"],
    [
      `<meta http-equiv="refresh" content="0; url='https://example.org/c'" />`,
      "https://example.org/c",
    ],
    [
      '<noscript><meta http-equiv="refresh" content="0;url=https://example.org/?a=1&amp;b=2"></noscript>',
      "https://example.org/?a=1&b=2",
    ],
  ])("reads a meta refresh: %s", (html, target) => {
    expect(findRedirect(`<html><head>${html}</head></html>`)).toBe(target);
  });

  it.each([
    ['window.location.href = "https://example.org/";', "https://example.org/"],
    ["location='https://example.org/a';", "https://example.org/a"],
    ['window.location = "https://example.org/b"\n', "https://example.org/b"],
    ['document.location.href="https://example.org/c";', "https://example.org/c"],
    ['window.location.replace("https://example.org/d");', "https://example.org/d"],
    ["location.assign( 'https://example.org/e' )", "https://example.org/e"],
    [
      'location.href = "https:\\/\\/example.org\\/f?a=1\\u0026b=2";',
      "https://example.org/f?a=1&b=2",
    ],
  ])("reads a location written in a script: %s", (script, target) => {
    expect(findRedirect(`<script>${script}</script>`)).toBe(target);
  });

  it("prefers the meta refresh when both appear", () => {
    const html =
      '<script>location.href = "https://example.org/script";</script>' +
      '<meta http-equiv="refresh" content="0; url=https://example.org/meta">';
    expect(findRedirect(html)).toBe("https://example.org/meta");
  });

  it.each([
    ["a plain page", "<html><body><a href='https://example.org/'>Sigue</a></body></html>"],
    ["a refresh with no target", '<meta http-equiv="refresh" content="30">'],
    ["another meta tag", '<meta name="description" content="url=https://example.org/">'],
    ["a target built by code", '<script>location.href = "https://example.org/" + id;</script>'],
    ["a target from a variable", "<script>window.location = destino;</script>"],
    ["a comparison", '<script>if (location.href == "https://example.org/") run();</script>'],
    ["another property", '<script>geolocation = "https://example.org/";</script>'],
    ["a property of another object", '<script>mapa.location = "https://example.org/";</script>'],
  ])("finds nothing in %s", (_name, html) => {
    expect(findRedirect(html)).toBeNull();
  });

  it.each([
    ["unclosed meta tags", "<meta http-equiv=refresh content="],
    ["unfinished assignments", 'location.href = "'],
    ["unfinished calls", "window.location.replace( "],
    ["entities", "<meta http-equiv='refresh' content='0;url=&amp;&#x26;"],
  ])("stays fast on a page full of %s", (_name, piece) => {
    const html = piece.repeat(Math.ceil(MAX_PAGE_BYTES / piece.length)).slice(0, MAX_PAGE_BYTES);
    const started = performance.now();
    findRedirect(html);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
