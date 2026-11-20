import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { parseConfusables, renderConfusables } from "./confusables.ts";
import { buildHosting, renderHosting, type CuratedHosting } from "./hosting.ts";
import { buildProtected, renderProtected, type CuratedPack, type SourceFile } from "./protected.ts";
import { buildShorteners, renderShorteners, type CuratedShorteners } from "./shorteners.ts";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const SOURCES_DIR = join(PACKAGE_ROOT, "sources");
export const OUTPUT_DIR = join(PACKAGE_ROOT, "..", "..", "packages", "core", "src", "data");

export interface Sources {
  readonly confusables: string;
  readonly protected: readonly SourceFile<CuratedPack>[];
  readonly shorteners: SourceFile<CuratedShorteners>;
  readonly hosting: SourceFile<CuratedHosting>;
}

export interface BuildResult {
  readonly files: Readonly<Record<string, string>>;
  readonly summary: readonly string[];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function loadSources(sourcesDir: string = SOURCES_DIR): Sources {
  const protectedDir = join(sourcesDir, "protected");
  const files = readdirSync(protectedDir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  return {
    confusables: readFileSync(join(sourcesDir, "unicode", "confusables.txt"), "utf8"),
    protected: files.map((file) => ({
      file: `protected/${file}`,
      content: readJson<CuratedPack>(join(protectedDir, file)),
    })),
    shorteners: {
      file: "shorteners.json",
      content: readJson<CuratedShorteners>(join(sourcesDir, "shorteners.json")),
    },
    hosting: {
      file: "hosting.json",
      content: readJson<CuratedHosting>(join(sourcesDir, "hosting.json")),
    },
  };
}

function size(content: string): string {
  const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
  return `${kb(Buffer.byteLength(content))}, ${kb(gzipSync(content).length)} gzip`;
}

/** Turns the sources into the content of every generated module, without touching the disk. */
export function build(sources: Sources): BuildResult {
  const confusables = parseConfusables(sources.confusables);
  const protectedDomains = buildProtected(sources.protected);
  const shorteners = buildShorteners(sources.shorteners);
  const hosting = buildHosting(sources.hosting);

  const files = {
    "confusables.ts": renderConfusables(confusables),
    "protected-domains.ts": renderProtected(protectedDomains),
    "shorteners.ts": renderShorteners(shorteners, sources.shorteners.content.updated),
    "hosting.ts": renderHosting(hosting, sources.hosting.content.updated),
  };

  const summary = [
    `confusables.ts: ${confusables.mappings.size} mappings from Unicode ${confusables.version} (${size(files["confusables.ts"])})`,
    ...protectedDomains.packs.map(
      (pack) =>
        `protected-domains.ts: pack "${pack.country}" with ${pack.entries.length} domains and ${pack.suffixes.length} suffixes`,
    ),
    `protected-domains.ts: ${size(files["protected-domains.ts"])}`,
    `shorteners.ts: ${shorteners.length} hosts (${size(files["shorteners.ts"])})`,
    `hosting.ts: ${hosting.services.length} services and ${hosting.lureWords.length} lure words (${size(files["hosting.ts"])})`,
    ...protectedDomains.leftOut.map((entry) => `left out (unconfirmed): ${entry}`),
  ];
  return { files, summary };
}
