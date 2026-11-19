import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { SOURCES_DIR } from "./build.ts";
import { parseConfusables } from "./confusables.ts";

const BASE = "https://www.unicode.org/Public";

const version = process.argv[2];
if (!version || !/^(latest|\d+\.\d+\.\d+)$/.test(version)) {
  console.error("Usage: pnpm --filter @ojolink/build-data refresh:unicode <version|latest>");
  process.exit(1);
}

const candidates = [
  `${BASE}/security/${version}/confusables.txt`,
  `${BASE}/${version}/security/confusables.txt`,
];

async function download(): Promise<string> {
  for (const url of candidates) {
    const response = await fetch(url);
    if (response.ok) return response.text();
  }
  throw new Error(`confusables.txt not found for Unicode ${version}`);
}

const text = await download();
const parsed = parseConfusables(text);
writeFileSync(join(SOURCES_DIR, "unicode", "confusables.txt"), text);
console.log(`Pinned confusables.txt for Unicode ${parsed.version}. Run "generate" next.`);
