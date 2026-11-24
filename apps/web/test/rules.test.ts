import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function files(directory: string, extensions: readonly string[]): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext)))
    .map((entry) => join(entry.parentPath, entry.name));
}

const sources = files(join(root, "src"), [".ts", ".svelte"]);
const built = files(join(root, "dist"), [".js", ".css", ".html", ".webmanifest"]);

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

function tokens(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((match) => [match[1], match[2]]),
  );
}

describe("contrast", () => {
  const css = readFileSync(join(root, "src", "app.css"), "utf8");
  const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
  const themes = { light: tokens(css.slice(0, darkStart)), dark: tokens(css.slice(darkStart)) };
  const pairs: [string, string][] = [
    ["ink", "bg"],
    ["ink", "surface"],
    ["muted", "bg"],
    ["muted", "surface"],
    ["accent", "bg"],
    ["accent", "surface"],
    ["button-ink", "button-bg"],
    ...["danger", "caution", "hidden", "safe"].flatMap((level): [string, string][] => [
      [`${level}-fg`, `${level}-tint`],
      [`${level}-fg`, "surface"],
    ]),
  ];

  it("defines the same tokens in both themes", () => {
    expect(Object.keys(themes.dark).sort()).toEqual(Object.keys(themes.light).sort());
    expect(Object.keys(themes.light).length).toBeGreaterThanOrEqual(16);
  });

  for (const [theme, values] of Object.entries(themes)) {
    it.each(pairs)(`${theme}: %s on %s meets AA`, (foreground, background) => {
      const ratio = contrast(values[foreground] ?? "", values[background] ?? "");
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("privacy", () => {
  const forbidden =
    /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie/;

  it("has source files to check", () => {
    expect(sources.length).toBeGreaterThan(8);
  });

  const NETWORK_MODULE = join("src", "lib", "reveal.ts");
  const offline = sources.filter((file) => !file.endsWith(NETWORK_MODULE));

  it("lets exactly one source file reach the network", () => {
    expect(sources.length - offline.length).toBe(1);
  });

  it.each(offline)("%s makes no request and stores nothing", (file) => {
    expect(readFileSync(file, "utf8")).not.toMatch(forbidden);
  });

  it("loads nothing from another origin in the page", () => {
    const html = readFileSync(join(root, "index.html"), "utf8");
    expect(html).not.toMatch(/(?:src|href)="(?:https?:)?\/\//);
  });

  it("has a production build to check", () => {
    expect(built.length).toBeGreaterThan(3);
  });

  it("references no third-party address in the built files", () => {
    // Namespaces, and links printed in console messages by Svelte and Workbox. None is requested.
    const allowed = new Set(["www.w3.org", "svelte.dev", "bit.ly"]);
    const hosts = new Set<string>();
    for (const file of built) {
      for (const match of readFileSync(file, "utf8").matchAll(
        /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi,
      )) {
        hosts.add((match[1] ?? "").toLowerCase());
      }
    }
    expect([...hosts].filter((host) => !allowed.has(host))).toEqual([]);
  });

  it("ships the content security policy in the built page only", () => {
    const page = readFileSync(join(root, "dist", "index.html"), "utf8").replaceAll("&#39;", "'");
    expect(page).toContain('http-equiv="Content-Security-Policy"');
    expect(page).toContain("connect-src 'self'");
    expect(page).toContain("script-src 'self'");
    expect(page).not.toContain("unsafe-inline");
    expect(readFileSync(join(root, "index.html"), "utf8")).not.toContain("Content-Security-Policy");
  });

  it("ships a service worker and an installable manifest", () => {
    expect(existsSync(join(root, "dist", "sw.js"))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(root, "dist", "manifest.webmanifest"), "utf8"));
    expect(manifest).toMatchObject({ name: "OjoLink", display: "standalone", lang: "es" });
    expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
  });

  it("registers the share target and answers its route from the device", () => {
    const manifest = JSON.parse(readFileSync(join(root, "dist", "manifest.webmanifest"), "utf8"));
    expect(manifest.share_target).toEqual({
      action: "analizar",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    });
    expect(readFileSync(join(root, "dist", "sw.js"), "utf8")).toMatch(
      /NavigationRoute\([^)]*createHandlerBoundToURL\("index\.html"\)/,
    );
    const page = readFileSync(join(root, "dist", "index.html"), "utf8");
    expect(readFileSync(join(root, "dist", "analizar.html"), "utf8")).toBe(page);
    expect(page).not.toMatch(/(?:src|href)="\/(?!\/)/);
  });
});

describe("texts", () => {
  const components = sources.filter((file) => file.endsWith(".svelte"));

  it.each(components)("%s has no hard-coded sentence in its markup", (file) => {
    let markup = readFileSync(file, "utf8")
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<style[\s\S]*?<\/style>/g, "");
    for (let previous = ""; previous !== markup;) {
      previous = markup;
      markup = markup.replace(/\{[^{}]*\}/g, "");
    }
    const text = markup.replace(/<[^>]*>/g, " ");
    expect(text.match(/\p{L}{3,}/gu) ?? []).toEqual([]);
  });
});
