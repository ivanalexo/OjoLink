import { lookup } from "node:dns/promises";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeUrl } from "@ojolink/core";
import { describeRates } from "./evaluate.ts";
import { CORPUS_ROOT, CorpusError, loadCorpus } from "./load.ts";
import { measure, renderReport, REPORT_FILE } from "./report.ts";

function printOutcome(failures: readonly string[], rates: string): void {
  console.log(rates);
  if (failures.length === 0) {
    console.log("\nEvery check passes.");
    return;
  }
  console.error(`\n${failures.length} failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
}

function report(): void {
  const measurement = measure();
  writeFileSync(join(CORPUS_ROOT, REPORT_FILE), renderReport(measurement), "utf8");
  console.log(`Wrote ${REPORT_FILE}\n`);
  printOutcome(measurement.failures, describeRates(measurement.check.rates));
}

function check(): void {
  const measurement = measure();
  printOutcome(measurement.failures, describeRates(measurement.check.rates));
}

/** Uses the network: asks DNS for the domain of every sample taken from the public web. */
async function dns(): Promise<void> {
  const hosts = new Map<string, string[]>();
  for (const sample of loadCorpus().samples) {
    if (sample.source !== "observed") continue;
    const normalized = normalizeUrl(sample.input);
    if (!normalized.ok) continue;
    const host = normalized.url.host;
    hosts.set(host, [...(hosts.get(host) ?? []), sample.id]);
  }

  const pending = [...hosts.keys()].sort();
  const missing: string[] = [];
  const worker = async () => {
    for (let host = pending.shift(); host !== undefined; host = pending.shift()) {
      try {
        await lookup(host);
      } catch {
        missing.push(host);
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));

  console.log(`Checked ${hosts.size} hosts.`);
  if (missing.length === 0) {
    console.log("All of them exist.");
    return;
  }
  for (const host of missing.sort()) {
    console.error(`Not found: ${host} (${(hosts.get(host) ?? []).join(", ")})`);
  }
  process.exitCode = 1;
}

const commands: Record<string, () => void | Promise<void>> = { report, check, dns };
const command = commands[process.argv[2] ?? ""];

try {
  if (!command) throw new Error(`Usage: node src/cli.ts ${Object.keys(commands).join("|")}`);
  await command();
} catch (error) {
  console.error(error instanceof CorpusError ? error.message : error);
  process.exitCode = 1;
}
