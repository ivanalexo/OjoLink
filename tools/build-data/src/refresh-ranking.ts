import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SOURCES_DIR } from "./build.ts";
import {
  applyRanks,
  GLOBAL_PACK,
  rankedDomains,
  rankingProblem,
  type CuratedPack,
} from "./protected.ts";

export const RANKING = "majestic-million";
const SOURCE = "https://downloads.majestic.com/majestic_million.csv";
const RANK_COLUMN = "GlobalRank";
const DOMAIN_COLUMN = "Domain";

/** Reads the ranks of the wanted domains from the ranking's lines, one line at a time. */
export function createRankReader(wanted: ReadonlySet<string>) {
  const ranks = new Map<string, number>();
  let rankAt = -1;
  let domainAt = -1;
  return {
    ranks,
    line(text: string): void {
      const cells = text.trim().split(",");
      if (rankAt < 0) {
        rankAt = cells.indexOf(RANK_COLUMN);
        domainAt = cells.indexOf(DOMAIN_COLUMN);
        if (rankAt < 0 || domainAt < 0) throw new Error("The ranking file has an unknown header.");
        return;
      }
      const domain = cells[domainAt];
      const rank = Number(cells[rankAt]);
      if (domain && wanted.has(domain) && Number.isInteger(rank) && !ranks.has(domain)) {
        ranks.set(domain, rank);
      }
    },
  };
}

async function readRanks(wanted: ReadonlySet<string>): Promise<Map<string, number>> {
  const response = await fetch(SOURCE, { headers: { "User-Agent": "data-refresh" } });
  if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status}`);
  const reader = createRankReader(wanted);
  const decoder = new TextDecoder();
  let rest = "";
  for await (const chunk of response.body) {
    const lines = (rest + decoder.decode(chunk, { stream: true })).split("\n");
    rest = lines.pop() ?? "";
    for (const line of lines) reader.line(line);
  }
  if (rest.trim() !== "") reader.line(rest);
  return reader.ranks;
}

async function main(): Promise<void> {
  const path = join(SOURCES_DIR, "protected", `${GLOBAL_PACK}.json`);
  const pack = JSON.parse(readFileSync(path, "utf8")) as CuratedPack;
  const wanted = new Set(rankedDomains(pack));
  const ranks = await readRanks(wanted);
  const updated = applyRanks(pack, ranks, RANKING, new Date().toISOString().slice(0, 10));
  writeFileSync(path, `${JSON.stringify(updated, null, 2)}\n`);

  const problems = updated.entities
    .flatMap((entity) => [entity, ...(entity.aliases ?? [])])
    .map((item) => ({ item, problem: rankingProblem(item.verification) }))
    .filter(({ problem }) => problem !== null);
  console.log(`Checked ${wanted.size} domains against ${RANKING}: ${ranks.size} found.`);
  for (const { item, problem } of problems) console.log(`  left out: ${item.domain} (${problem})`);
  console.log('Run "generate" next.');
}

if (process.argv[1]?.endsWith("refresh-ranking.ts")) await main();
