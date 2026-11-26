import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyze } from "@ojolink/core";
import { describe, expect, it } from "vitest";
import {
  buildManifest,
  EXCLUDED_PERMISSIONS,
  extensionPagesPolicy,
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

/** The resolver this package was built with, read back from what it declares. */
const builtResolver =
  (manifest.host_permissions ?? [])
    .filter((host) => !DEFAULT_PATTERNS.includes(host as (typeof DEFAULT_PATTERNS)[number]))
    .map((host) => host.replace(/\/\*$/, ""))[0] ?? null;

function files(directory: string, extensions: readonly string[]): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext)))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** What the permission check finds wrong in a manifest. */
function permissionProblems(candidate: Manifest, resolver = builtResolver): string[] {
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
    if (!REQUIRED_HOSTS.includes(host) && host !== `${resolver}/*`)
      problems.push(`required host "${host}" is not a default site`);
  }
  for (const host of hosts) {
    if (!host.startsWith("https://") && host !== `${resolver}/*`)
      problems.push(`host "${host}" is not https`);
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
    expect([...(manifest.host_permissions ?? [])].sort()).toEqual(
      [...buildManifest(builtResolver).host_permissions].sort(),
    );
    expect(manifest.host_permissions?.length).toBe(
      DEFAULT_PATTERNS.length + (builtResolver ? 1 : 0),
    );
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
    const policy = extensionPagesPolicy(builtResolver);
    expect(manifest.content_security_policy?.extension_pages).toBe(policy);
    expect(policy.split("connect-src")[0]).not.toMatch(/https?:|unsafe|\*/);
    expect(extensionPagesPolicy(null)).toBe(
      "script-src 'self'; object-src 'none'; connect-src 'none'",
    );
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

describe("what the manifest declares, with and without a resolver", () => {
  const without = buildManifest(null);
  const withOne = buildManifest("https://resolver.example");

  it("adds one host and one connection source for a resolver, and nothing else", () => {
    expect(withOne.host_permissions).toEqual([
      ...without.host_permissions,
      "https://resolver.example/*",
    ]);
    expect(withOne.content_security_policy.extension_pages).toBe(
      "script-src 'self'; object-src 'none'; connect-src 'self' https://resolver.example",
    );
    expect(without.content_security_policy.extension_pages).toBe(
      "script-src 'self'; object-src 'none'; connect-src 'none'",
    );
    expect({ ...withOne, host_permissions: [], content_security_policy: null }).toEqual({
      ...without,
      host_permissions: [],
      content_security_policy: null,
    });
  });

  it("keeps the same two capabilities either way", () => {
    expect([...without.permissions].sort()).toEqual(["scripting", "storage"]);
    expect(withOne.permissions).toEqual(without.permissions);
    expect(without.host_permissions).toEqual([...DEFAULT_PATTERNS]);
  });
});

describe("one request, in one place", () => {
  const request = /\bfetch\s*\(/;
  const forbidden =
    /XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|\bimport\s*\(\s*["'`]https?:|document\.cookie/;
  const ONLY = join(root, "src", "reveal.ts");
  const sources = [
    ...files(join(root, "src"), [".ts"]),
    ...files(join(root, "entrypoints"), [".ts", ".html"]),
  ];
  const problems = (file: string, text: string): string[] => [
    ...(request.test(text) && file !== ONLY ? ["makes a request outside reveal.ts"] : []),
    ...(forbidden.test(text) ? ["uses a request API other than the one allowed"] : []),
  ];

  it("has source files to check", () => {
    expect(sources.length).toBeGreaterThanOrEqual(20);
    expect(sources).toContain(ONLY);
  });

  it.each(sources)("%s makes no request of its own and loads no remote script", (file) => {
    expect(problems(file, readFileSync(file, "utf8"))).toEqual([]);
  });

  it("the resolver call is the only request, and it is where it should be", () => {
    expect(readFileSync(ONLY, "utf8")).toMatch(request);
    expect(sources.filter((file) => request.test(readFileSync(file, "utf8")))).toEqual([ONLY]);
  });

  it("the check catches a request anywhere else", () => {
    const elsewhere = join(root, "src", "page.ts");
    expect(problems(elsewhere, 'const answer = await fetch("https://example.org/");')).toEqual([
      "makes a request outside reveal.ts",
    ]);
    expect(problems(ONLY, 'navigator.sendBeacon("https://example.org/")')).toHaveLength(1);
    expect(problems(ONLY, 'import("https://example.org/x.js")')).toHaveLength(1);
  });

  /** Hosts named in the built files, apart from the allowed ones. */
  function outsideHosts(texts: readonly string[], resolver: string | null): string[] {
    // Namespaces, and links in console messages of the build tool and the engine's data sources.
    const allowed = new Set([
      "www.w3.org",
      "mail.google.com",
      "outlook.office.com",
      "outlook.live.com",
      ...(resolver === null ? [] : [new URL(resolver).hostname]),
    ]);
    const hosts = new Set<string>();
    for (const text of texts) {
      for (const match of text.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
        hosts.add((match[1] ?? "").toLowerCase());
      }
    }
    return [...hosts].filter((host) => !allowed.has(host));
  }

  it("references no address outside the default sites and the resolver in the built files", () => {
    const built = files(output, [".js", ".html", ".css", ".json"]).map((file) =>
      readFileSync(file, "utf8"),
    );
    expect(outsideHosts(built, builtResolver)).toEqual([]);
  });

  it("the check catches an extra host", () => {
    const text = 'x("https://resolver.example/resolve"); y("https://collector.example/");';
    expect(outsideHosts([text], "https://resolver.example")).toEqual(["collector.example"]);
    expect(outsideHosts([text], null)).toEqual(["resolver.example", "collector.example"]);
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
