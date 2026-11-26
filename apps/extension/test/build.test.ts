import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyze } from "@ojolink/core";
import { describe, expect, it } from "vitest";
import {
  EXCLUDED_PERMISSIONS,
  EXTENSION_PAGES_POLICY,
  OPTIONAL_HOSTS,
  PERMISSION_REASONS,
  REQUIRED_HOSTS,
} from "../src/permissions.ts";
import { PAGE_SCRIPT } from "../src/registration.ts";
import { DEFAULT_PATTERNS } from "../src/sites.ts";

const root = process.cwd();
const output = join(root, ".output", "chrome-mv3");

interface Manifest {
  manifest_version: number;
  name: string;
  description: string;
  version: string;
  permissions?: string[];
  host_permissions?: string[];
  optional_permissions?: string[];
  optional_host_permissions?: string[];
  content_security_policy?: { extension_pages?: string };
  minimum_chrome_version?: string;
  background?: { service_worker?: string };
  options_ui?: { page?: string };
  icons?: Record<string, string>;
  content_scripts?: { matches: string[]; js: string[]; run_at?: string }[];
}

const manifest = JSON.parse(readFileSync(join(output, "manifest.json"), "utf8")) as Manifest;

function files(directory: string, extensions: readonly string[]): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext)))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** What the permission check finds wrong in a manifest. */
function permissionProblems(candidate: Manifest): string[] {
  const problems: string[] = [];
  const declared = [...(candidate.permissions ?? []), ...(candidate.optional_permissions ?? [])];
  const hosts = [
    ...(candidate.host_permissions ?? []),
    ...(candidate.optional_host_permissions ?? []),
  ];
  for (const permission of declared) {
    if (!Object.hasOwn(PERMISSION_REASONS, permission)) {
      problems.push(`permission "${permission}" has no recorded reason`);
    }
  }
  for (const permission of Object.keys(PERMISSION_REASONS)) {
    if (!declared.includes(permission))
      problems.push(`reason for "${permission}" has no permission`);
  }
  for (const permission of [...declared, ...hosts]) {
    if (EXCLUDED_PERMISSIONS.includes(permission)) problems.push(`"${permission}" is excluded`);
  }
  for (const host of candidate.host_permissions ?? []) {
    if (!REQUIRED_HOSTS.includes(host))
      problems.push(`required host "${host}" is not a default site`);
  }
  for (const host of hosts) {
    if (!host.startsWith("https://")) problems.push(`host "${host}" is not https`);
  }
  return problems;
}

describe("built manifest", () => {
  it("is a Manifest V3 extension with a Spanish name and description", () => {
    const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      version: string;
    };
    expect(manifest).toMatchObject({
      manifest_version: 3,
      name: "OjoLink",
      version,
      minimum_chrome_version: "116",
    });
    expect(manifest.description).toMatch(/enlaces/);
  });

  it("requires the three webmail sites and nothing else", () => {
    expect([...(manifest.host_permissions ?? [])].sort()).toEqual([...DEFAULT_PATTERNS].sort());
    expect(manifest.optional_host_permissions).toEqual([...OPTIONAL_HOSTS]);
    expect(manifest.optional_permissions ?? []).toEqual([]);
  });

  it("runs its page script on those three sites only", () => {
    expect(manifest.content_scripts).toHaveLength(1);
    const [script] = manifest.content_scripts ?? [];
    expect([...(script?.matches ?? [])].sort()).toEqual([...DEFAULT_PATTERNS].sort());
    expect(script?.js).toEqual([PAGE_SCRIPT]);
    expect(existsSync(join(output, PAGE_SCRIPT))).toBe(true);
  });

  it("starts the page script before any script of the page, to see clicks first", () => {
    expect(manifest.content_scripts?.[0]?.run_at).toBe("document_start");
    expect(readFileSync(join(output, PAGE_SCRIPT), "utf8")).toContain("ojolink-warning");
  });

  it("declares only capabilities that have a recorded reason", () => {
    expect(permissionProblems(manifest)).toEqual([]);
    expect([...(manifest.permissions ?? [])].sort()).toEqual(["scripting", "storage"]);
    for (const reason of Object.values(PERMISSION_REASONS))
      expect(reason.length).toBeGreaterThan(20);
  });

  it.each([
    [
      "a permission with no reason",
      { permissions: ["storage", "scripting", "alarms"] },
      /alarms.*no recorded reason/,
    ],
    ["a reason with no permission", { permissions: ["storage"] }, /reason for "scripting"/],
    [
      "an excluded permission",
      { permissions: ["storage", "scripting", "tabs"] },
      /"tabs" is excluded/,
    ],
    ["access to browsing history", { optional_permissions: ["history"] }, /"history" is excluded/],
    [
      "the all-sites pattern",
      { optional_host_permissions: ["<all_urls>"] },
      /"<all_urls>" is excluded/,
    ],
    [
      "a fourth required site",
      { host_permissions: [...DEFAULT_PATTERNS, "https://mail.yahoo.com/*"] },
      /mail\.yahoo\.com.*not a default site/,
    ],
    ["a site that is not https", { optional_host_permissions: ["http://*/*"] }, /not https/],
  ])("the permission check fails on %s", (_name, change, message) => {
    expect(permissionProblems({ ...manifest, ...change }).join("\n")).toMatch(message);
  });

  it("allows no script from outside the package", () => {
    expect(manifest.content_security_policy?.extension_pages).toBe(EXTENSION_PAGES_POLICY);
    expect(EXTENSION_PAGES_POLICY).not.toMatch(/https?:|unsafe|\*/);
    const page = readFileSync(join(output, manifest.options_ui?.page ?? ""), "utf8");
    expect(page).not.toMatch(/(?:src|href)="(?:https?:)?\/\//);
    expect(page).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>\s*\S/);
  });

  it("ships the service worker, the options page, and icons of the declared sizes", () => {
    expect(existsSync(join(output, manifest.background?.service_worker ?? "missing"))).toBe(true);
    expect(existsSync(join(output, manifest.options_ui?.page ?? "missing"))).toBe(true);
    expect(Object.keys(manifest.icons ?? {})).toEqual(["16", "32", "48", "128"]);
    for (const [size, path] of Object.entries(manifest.icons ?? {})) {
      const png = readFileSync(join(output, path));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], path).toEqual([
        Number(size),
        Number(size),
      ]);
    }
  });
});

describe("no network", () => {
  const forbidden =
    /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|\bimport\s*\(\s*["'`]https?:|document\.cookie/;
  const sources = [
    ...files(join(root, "src"), [".ts"]),
    ...files(join(root, "entrypoints"), [".ts", ".html"]),
  ];

  it("has source files to check", () => {
    expect(sources.length).toBeGreaterThanOrEqual(14);
  });

  it.each(sources)("%s makes no request and loads no remote script", (file) => {
    expect(readFileSync(file, "utf8")).not.toMatch(forbidden);
  });

  it("the check catches a request", () => {
    expect('const answer = await fetch("https://example.org/");').toMatch(forbidden);
    expect('import("https://example.org/x.js")').toMatch(forbidden);
  });

  it("references no address outside the default sites in the built files", () => {
    // Namespaces, and links in console messages of the build tool and the engine's data sources.
    const allowed = new Set([
      "www.w3.org",
      "mail.google.com",
      "outlook.office.com",
      "outlook.live.com",
    ]);
    const hosts = new Set<string>();
    for (const file of files(output, [".js", ".html", ".css", ".json"])) {
      for (const match of readFileSync(file, "utf8").matchAll(
        /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi,
      )) {
        hosts.add((match[1] ?? "").toLowerCase());
      }
    }
    expect([...hosts].filter((host) => !allowed.has(host))).toEqual([]);
  });
});

describe("the engine inside the extension", () => {
  it("is bundled into the page script, with its data and its texts", () => {
    const script = readFileSync(join(output, PAGE_SCRIPT), "utf8");
    expect(script).toContain("bcp.com.bo");
    expect(script).toContain("Destino oculto");
    expect(script).toContain("ojolink-mark");
    expect(script.length).toBeGreaterThan(100_000);
  });

  it("judges a link as the web app does", () => {
    const result = analyze("https://bcp.com.bo.verifica.net/");
    expect(result.analyzed && result.level).toBe("danger");
  });

  it("writes nothing to the console", () => {
    for (const file of files(join(root, "src"), [".ts"]).concat(
      files(join(root, "entrypoints"), [".ts"]),
    )) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/console\.\w+\(/);
    }
  });
});
