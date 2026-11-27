import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyze } from "@ojolink/core";
import { describe, expect, it } from "vitest";
import {
  buildManifest,
  OPTIONAL_HOSTS,
  PERMISSION_REASONS,
  SITE_REASONS,
} from "../src/permissions.ts";
import {
  changelogVersions,
  checkContents,
  checkResolver,
  checkVersion,
  leakedSettings,
  readEnv,
  UNRELEASED,
} from "../src/release-rules.ts";
import { DEFAULT_SITES } from "../src/sites.ts";
import {
  FIELD_LIMIT,
  hostJustification,
  justifications,
  renderPermissions,
  RESOLVER_LABEL,
} from "../src/store.ts";
import { strings } from "../src/strings.ts";

const root = process.cwd();
const repository = join(root, "..", "..");
const store = (name: string) => readFileSync(join(root, "store", name), "utf8");
/**
 * The store material and the release steps are kept out of the public repository. Where they
 * are present, they are checked; where they are not, there is nothing to check.
 */
const hasStoreMaterial = ["listing.es.md", "permisos.es.md", "datos.es.md"].every((name) =>
  existsSync(join(root, "store", name)),
);
const hasReleaseSteps = existsSync(join(root, "PUBLICAR.md"));
const RESOLVER = "https://resolver.example";
// Chrome Web Store's limit for the short description, as of November 2026. Confirm it on the
// store's page when submitting.
const SHORT_DESCRIPTION_LIMIT = 132;

describe("license", () => {
  const license = readFileSync(join(repository, "LICENSE"), "utf8");

  it("is the MIT license with the holder and the year", () => {
    expect(license).toMatch(/^MIT License\n\nCopyright \(c\) 2026 \S.+\n/);
    expect(license).toContain("Permission is hereby granted, free of charge");
    expect(license).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
  });

  it("is declared in every package", () => {
    const packages = [repository];
    for (const group of ["apps", "packages", "tools"]) {
      for (const entry of readdirSync(join(repository, group), { withFileTypes: true })) {
        if (entry.isDirectory()) packages.push(join(repository, group, entry.name));
      }
    }
    expect(packages.length).toBeGreaterThanOrEqual(7);
    for (const folder of packages) {
      const described = JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as {
        license?: string;
      };
      expect(described.license, folder).toBe("MIT");
    }
  });

  it("leaves the notices of third-party data in place", () => {
    const notices = readFileSync(join(repository, "THIRD_PARTY_NOTICES.md"), "utf8");
    expect(notices).toContain("Unicode License");
    expect(notices).toContain("Majestic");
  });
});

describe("one text per permission", () => {
  it.each([
    ["with a resolver", RESOLVER],
    ["without a resolver", null],
  ])("justifies everything the manifest declares, %s", (_name, resolver) => {
    const manifest = buildManifest(resolver);
    const entries = justifications(manifest);
    const declared = [
      ...manifest.permissions,
      ...manifest.host_permissions,
      ...manifest.optional_host_permissions,
    ];
    expect(entries.map((entry) => entry.item)).toEqual(declared);
    for (const entry of entries) {
      expect(entry.text.length, entry.item).toBeGreaterThan(60);
      expect(entry.text, entry.item).toMatch(/\bno\b|\bNo\b|\bsolo\b|\bSolo\b/);
      expect(entry.text).not.toMatch(/\{\w+\}/);
    }
    expect(entries.filter((entry) => entry.kind === "servicio")).toHaveLength(resolver ? 1 : 0);
  });

  it("names each mail site in its own justification", () => {
    const entries = justifications(buildManifest(null)).filter((entry) => entry.kind === "sitio");
    expect(entries.map((entry) => entry.label)).toEqual([...DEFAULT_SITES]);
    for (const entry of entries) expect(entry.text).toContain(entry.label);
  });

  it("says the optional pattern grants nothing by itself and why it exists", () => {
    const [optional] = justifications(buildManifest(null)).filter(
      (entry) => entry.kind === "sitio opcional",
    );
    expect(optional?.item).toBe(OPTIONAL_HOSTS[0]);
    expect(optional?.text).toMatch(/No concede acceso a ningún sitio por sí solo/);
    expect(optional?.text).toMatch(/aviso del propio navegador/);
    expect(optional?.text).toMatch(/otro correo web/);
  });

  it("says the resolver is contacted only to reveal a short link, and names it by role", () => {
    const [resolver] = justifications(buildManifest(RESOLVER)).filter(
      (entry) => entry.kind === "servicio",
    );
    expect(resolver?.label).toBe(RESOLVER_LABEL);
    expect(resolver?.text).toMatch(/Solo se le consulta cuando pides «Revelar destino»/);
    expect(resolver?.text).toMatch(/solo se envía ese enlace corto/);
    expect(renderPermissions(justifications(buildManifest(RESOLVER)))).not.toContain(
      "resolver.example",
    );
  });

  it("fits each field of the store's form, and joins every site into the one host field", () => {
    const entries = justifications(buildManifest(RESOLVER));
    for (const entry of entries.filter((item) => item.kind === "permiso")) {
      expect(entry.text.length, entry.item).toBeLessThanOrEqual(FIELD_LIMIT);
    }
    const hosts = hostJustification(entries);
    expect(hosts.length).toBeLessThanOrEqual(FIELD_LIMIT);
    for (const site of DEFAULT_SITES) expect(hosts).toContain(site);
    expect(hosts).toContain(OPTIONAL_HOSTS[0]);
    expect(hosts).toContain(RESOLVER_LABEL);
    expect(hosts).toMatch(/No concede acceso a ningún sitio por sí solo/);
    expect(hosts).not.toContain("resolver.example");
    expect(renderPermissions(entries)).toContain(hosts);
    expect(hostJustification(justifications(buildManifest(null)))).not.toContain(RESOLVER_LABEL);
  });

  it("refuses a manifest that declares something with no justification", () => {
    const manifest = buildManifest(RESOLVER);
    expect(() =>
      justifications({ ...manifest, permissions: [...manifest.permissions, "alarms"] }),
    ).toThrow(/"alarms" is declared with no published justification/);
    expect(() =>
      justifications({
        ...manifest,
        optional_host_permissions: [...manifest.optional_host_permissions, "http://*/*"],
      }),
    ).toThrow(/http:\/\/\*\/\*/);
    expect(() =>
      justifications({
        ...manifest,
        host_permissions: [...manifest.host_permissions, "https://collector.example/*"],
      }),
    ).toThrow(/collector\.example/);
  });

  it("has no justification left for something the manifest does not declare", () => {
    expect(Object.keys(PERMISSION_REASONS).sort()).toEqual(
      [...buildManifest(RESOLVER).permissions].sort(),
    );
    expect(Object.keys(SITE_REASONS).sort()).toEqual(["mail", "optional", "resolver"]);
  });

  it.skipIf(!hasStoreMaterial)("is the text kept for the stores", () => {
    expect(store("permisos.es.md")).toBe(
      renderPermissions(justifications(buildManifest(RESOLVER))),
    );
  });
});

describe("release rules: version", () => {
  const changelog = `# Cambios\n\n## 0.2.0 — ${UNRELEASED}\n\nAlgo nuevo.\n\n## 0.1.0 — 2026-12-01\n\nPrimera.\n`;

  it("accepts a version marked as not released yet", () => {
    expect(checkVersion("0.2.0", changelog)).toEqual([]);
    expect([...changelogVersions(changelog)]).toEqual([
      ["0.2.0", UNRELEASED],
      ["0.1.0", "2026-12-01"],
    ]);
  });

  it.each([
    ["a suffix", "0.2.0-beta", /three numbers/],
    ["two numbers", "0.2", /three numbers/],
    ["a leading zero", "0.02.0", /three numbers/],
    ["a version already released", "0.1.0", /already released on 2026-12-01/],
    ["a version with no entry", "0.3.0", /no entry for 0\.3\.0/],
  ])("refuses %s", (_name, version, message) => {
    expect(checkVersion(version, changelog).join("\n")).toMatch(message);
  });

  it("refuses an entry that says neither a date nor the marker", () => {
    expect(checkVersion("0.2.0", "## 0.2.0 — pronto\n").join("\n")).toMatch(/sin publicar/);
  });

  it("accepts the version in the package against the real changelog", () => {
    const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      version: string;
    };
    const real = readFileSync(join(root, "CHANGELOG.md"), "utf8");
    const state = changelogVersions(real).get(version);
    expect(state, `CHANGELOG.md needs an entry for ${version}`).toBeDefined();
    if (state === UNRELEASED) expect(checkVersion(version, real)).toEqual([]);
    else expect(state).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("release rules: resolver", () => {
  it("accepts a public https address", () => {
    expect(checkResolver("https://resolver.example")).toEqual([]);
  });

  it.each([
    ["none", undefined, /needs the public resolver/],
    ["an empty value", "  ", /needs the public resolver/],
    ["localhost", "http://localhost:8787", /on this machine/],
    ["the loopback address over https", "https://127.0.0.1:8787", /on this machine/],
    ["plain http", "http://resolver.example", /https/],
    ["credentials", "https://user:secret@resolver.example", /credentials/],
    ["text that is not an address", "resolver", /not an address/],
  ])("refuses %s", (_name, value, message) => {
    expect(checkResolver(value).join("\n")).toMatch(message);
  });
});

describe("release rules: contents", () => {
  const manifest = {
    version: "0.1.0",
    background: { service_worker: "background.js" },
    action: { default_popup: "popup.html" },
    options_ui: { page: "options.html" },
    icons: { 16: "icon/16.png", 48: "icon/48.png" },
    content_scripts: [{ js: ["content-scripts/content.js"] }],
  };
  const good = [
    "manifest.json",
    "background.js",
    "popup.html",
    "options.html",
    "icon/16.png",
    "icon/48.png",
    "content-scripts/content.js",
    "chunks/popup-abc123.js",
    "assets/popup-abc123.css",
    "chunks/",
  ];

  it("accepts what the manifest names and what the build emits", () => {
    expect(checkContents(good, manifest)).toEqual([]);
  });

  it("accepts the files of the built package", () => {
    const output = join(root, ".output", "chrome-mv3");
    const names = readdirSync(output, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile())
      .map((entry) =>
        join(entry.parentPath, entry.name)
          .slice(output.length + 1)
          .replaceAll("\\", "/"),
      );
    const built = JSON.parse(
      readFileSync(join(output, "manifest.json"), "utf8"),
    ) as typeof manifest;
    expect(names.length).toBeGreaterThan(8);
    expect(checkContents(names, built)).toEqual([]);
  });

  it.each([
    ["a source map", "chunks/popup-abc123.js.map", /does not belong/],
    ["a source file", "chunks/popup.ts", /does not belong/],
    ["a settings file", ".env.local", /does not belong/],
    ["a hidden file in a folder", "assets/.DS_Store", /does not belong/],
    ["a document", "README.md", /does not belong/],
    ["the build record", "build-info.json", /beside the package/],
    ["a stray file", "notes.txt", /not named by the manifest/],
    ["a stray script at the top", "extra.js", /not named by the manifest/],
  ])("refuses %s", (_name, extra, message) => {
    expect(checkContents([...good, extra], manifest).join("\n")).toMatch(message);
  });

  it("refuses a package with no manifest at the top, or missing a file it names", () => {
    expect(checkContents(["dist/manifest.json"], manifest).join("\n")).toMatch(/top level/);
    expect(
      checkContents(
        good.filter((name) => name !== "popup.html"),
        manifest,
      ).join("\n"),
    ).toMatch(/"popup.html", which is missing/);
  });
});

describe("release rules: local settings", () => {
  const settings = readEnv(
    [
      "# comment",
      "WXT_RESOLVER_URL=https://resolver.example",
      'WXT_DONATE_URL="https://donar.example/ojolink"',
      "STORE_TOKEN=abcdef123456",
      "EMPTY=",
      "  SPACED = valor-secreto  ",
    ].join("\n"),
  );

  it("reads names and values, skipping comments and empty ones", () => {
    expect([...settings]).toEqual([
      ["WXT_RESOLVER_URL", "https://resolver.example"],
      ["WXT_DONATE_URL", "https://donar.example/ojolink"],
      ["STORE_TOKEN", "abcdef123456"],
      ["SPACED", "valor-secreto"],
    ]);
  });

  it("allows the two public addresses in the package and nothing else", () => {
    const files = [
      { name: "background.js", text: 'fetch("https://resolver.example/resolve")' },
      { name: "popup.html", text: '<a href="https://donar.example/ojolink">' },
    ];
    expect(leakedSettings(files, settings)).toEqual([]);
    expect(
      leakedSettings([...files, { name: "chunks/x.js", text: 'const t="abcdef123456"' }], settings),
    ).toEqual(["STORE_TOKEN appears in chunks/x.js"]);
  });
});

describe.skipIf(!hasStoreMaterial)("store listing", () => {
  const listing = hasStoreMaterial ? store("listing.es.md") : "";
  const section = (title: string) => {
    const start = listing.indexOf(`## ${title}\n`);
    expect(start, title).toBeGreaterThan(-1);
    const rest = listing.slice(start + title.length + 4);
    const end = rest.indexOf("\n## ");
    return (end === -1 ? rest : rest.slice(0, end)).trim();
  };

  it("uses the name and the short description the extension itself declares", () => {
    expect(section("Nombre")).toBe(strings.name);
    expect(section("Descripción corta")).toBe(strings.description);
    expect(strings.description.length).toBeLessThanOrEqual(SHORT_DESCRIPTION_LIMIT);
  });

  it("has every part the stores ask for in writing", () => {
    for (const title of [
      "Descripción larga",
      "Propósito único",
      "Categoría",
      "Idioma",
      "Política de privacidad",
      "Frase sobre el código",
      "Justificación de permisos",
      "Código remoto",
      "Uso de datos",
      "Acceso: instrucciones de prueba",
    ]) {
      expect(section(title).length, title).toBeGreaterThan(5);
    }
    expect(section("Propósito único")).toMatch(/un solo propósito/);
    expect(section("Frase sobre el código")).toMatch(/licencia MIT/);
    expect(section("Política de privacidad")).toMatch(/\/privacidad/);
  });

  it("says what it does and what it does not, without promising safety", () => {
    const long = section("Descripción larga");
    expect(long).toContain("Qué hace:");
    expect(long).toContain("Qué no hace:");
    expect(long).toMatch(/puede haber engaños que no detecte/);
    for (const file of ["listing.es.md", "permisos.es.md", "datos.es.md"]) {
      expect(store(file), file).not.toMatch(
        /\bsegur[oa]s?\b|100 ?%|garantiza|protección (total|completa)|te protege de todo/i,
      );
    }
  });

  it("answers the data-use boxes and gives reviewers a way to test, in two languages", () => {
    const data = section("Uso de datos");
    expect(data).toMatch(/Marca solo esta:\s+- \*\*Contenido de sitios web\.\*\*/);
    for (const box of [
      "Comunicaciones personales",
      "Ubicación",
      "Historial web",
      "Actividad del usuario",
    ]) {
      expect(data, box).toContain(box);
    }
    expect(data.match(/^- No (vendo|uso) /gm)).toHaveLength(3);

    const access = section("Acceso: instrucciones de prueba");
    expect(access).toMatch(/no necesita cuenta/);
    expect(access).toMatch(/needs no account/);
    for (const [address, level] of [
      ["https://paypal.com.verifica-cuenta.net/", "danger"],
      ["https://bit.ly/3xYz", "hidden-destination"],
      ["https://netflix-codes.com/", "caution"],
      ["https://www.wikipedia.org/", "safe"],
    ] as const) {
      expect(access.split(address).length, address).toBe(3);
      const result = analyze(address);
      expect(result.analyzed && result.level, address).toBe(level);
    }
    expect(section("Código remoto")).toMatch(/no usa código remoto/);
  });

  it("names no address of the owner and no real person", () => {
    for (const file of ["listing.es.md", "permisos.es.md", "datos.es.md"]) {
      expect(store(file), file).not.toMatch(/workers\.dev|@[a-z0-9-]+\.[a-z]{2,}/i);
    }
  });
});

describe.skipIf(!hasStoreMaterial)("data-use answers", () => {
  const answers = hasStoreMaterial ? store("datos.es.md") : "";
  const cited = [...answers.matchAll(/^Prueba: `(test\/[a-z.-]+)` › (.+)$/gm)].map((match) => ({
    file: match[1] ?? "",
    title: (match[2] ?? "").trim(),
  }));

  it("covers what the stores ask about", () => {
    for (const topic of [
      /ocurre en su equipo/,
      /Solo un enlace corto/,
      /«Revelar destino»/,
      /dominios que la persona decide proteger/,
      /No se sincronizan/,
      /viene apagado/,
      /no tiene cuentas, no muestra publicidad/,
      /¿Se venden o comparten datos\?/,
      /Todo el código va dentro del paquete/,
    ]) {
      expect(answers).toMatch(topic);
    }
  });

  it("backs every answer with a test that exists", () => {
    const sections = answers.split(/^## /m).slice(1);
    expect(sections.length).toBeGreaterThanOrEqual(7);
    for (const part of sections) expect(part, part.split("\n")[0]).toMatch(/^Prueba: `test\//m);
    expect(cited.length).toBeGreaterThanOrEqual(sections.length);
    for (const { file, title } of cited) {
      expect(existsSync(join(root, file)), file).toBe(true);
      expect(readFileSync(join(root, file), "utf8"), `${file} › ${title}`).toContain(`"${title}"`);
    }
  });
});

describe.skipIf(!hasReleaseSteps)("release steps", () => {
  it("point to files that exist", () => {
    const steps = readFileSync(join(root, "PUBLICAR.md"), "utf8");
    const named = [...steps.matchAll(/`((?:store|scripts)\/[A-Za-z0-9._/-]+|CHANGELOG\.md)`/g)].map(
      (match) => match[1] ?? "",
    );
    expect(new Set(named).size).toBeGreaterThanOrEqual(5);
    for (const file of named) expect(existsSync(join(root, file)), file).toBe(true);
    expect(steps).toMatch(/Chrome Web Store/);
    expect(steps).toMatch(/Edge Add-ons/);
    expect(steps).toMatch(/Solo tú/);
  });
});
