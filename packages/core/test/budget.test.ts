import { describe, expect, it } from "vitest";
import { createDefaultEngine, DEFAULT_SIGNALS } from "../src/index.js";
import {
  BENCHMARK_LINKS,
  BENCHMARK_TEXT_LINKS,
  BENCHMARK_USER_DOMAINS,
} from "./fixtures/benchmark-links.js";

declare const performance: { now(): number };
declare const process: { stdout: { write(text: string): void } };

const report = (message: string) => process.stdout.write(message + String.fromCodePoint(10));

const TIME_LIMIT_MS = 1;
const PREPARATION_LIMIT_MS = 50;
const ROUNDS = 5;
const REPEATS = 200;

const ms = (value: number) => `${value.toFixed(4)} ms`;

type Case = readonly [link: string, visibleText?: string];
const CASES: readonly Case[] = [
  ...BENCHMARK_LINKS.map((link): Case => [link]),
  ...BENCHMARK_TEXT_LINKS,
];
const run = (engine: ReturnType<typeof createDefaultEngine>, [link, visibleText]: Case) =>
  engine.analyze(link, visibleText === undefined ? {} : { context: { visibleText } });

describe("benchmark fixture", () => {
  it("uses the maximum number of user domains", () => {
    const engine = createDefaultEngine({ userDomains: BENCHMARK_USER_DOMAINS });
    expect(engine.userDomains.domains).toHaveLength(100);
  });

  it("has at least 30 links and triggers every signal", () => {
    const engine = createDefaultEngine({ userDomains: BENCHMARK_USER_DOMAINS });
    const triggered = new Set<string>();
    for (const entry of CASES) {
      const result = run(engine, entry);
      expect(result.analyzed, entry[0]).toBe(true);
      if (result.analyzed) for (const signal of result.signals) triggered.add(signal.id);
    }
    expect(BENCHMARK_LINKS.length).toBeGreaterThanOrEqual(30);
    expect([...triggered].sort()).toEqual(DEFAULT_SIGNALS.map((signal) => signal.id).sort());
  });
});

describe("time budget", () => {
  it("prepares the lists in less than 50 ms", () => {
    let best = Infinity;
    for (let round = 0; round < ROUNDS; round++) {
      const start = performance.now();
      const engine = createDefaultEngine({ userDomains: [...BENCHMARK_USER_DOMAINS] });
      engine.analyze("https://example.com/");
      best = Math.min(best, performance.now() - start);
    }
    report(`preparation with 100 user domains: ${ms(best)}`);
    expect(best).toBeLessThan(PREPARATION_LIMIT_MS);
  });

  it("analyzes a link in less than 1 ms on average", () => {
    const engine = createDefaultEngine({ userDomains: BENCHMARK_USER_DOMAINS });
    for (const entry of CASES) for (let i = 0; i < 20; i++) run(engine, entry);

    let bestMean = Infinity;
    let slowest: [number, string][] = [];
    for (let round = 0; round < ROUNDS; round++) {
      const times = CASES.map((entry): [number, string] => {
        const start = performance.now();
        for (let i = 0; i < REPEATS; i++) run(engine, entry);
        return [(performance.now() - start) / REPEATS, entry.join(" | ")];
      });
      const mean = times.reduce((sum, [time]) => sum + time, 0) / times.length;
      if (mean < bestMean) {
        bestMean = mean;
        slowest = times.sort((a, b) => b[0] - a[0]).slice(0, 3);
      }
    }

    const worst = slowest.map(([time, link]) => `${ms(time)} ${link}`).join("\n  ");
    report(`mean per link: ${ms(bestMean)}\nslowest:\n  ${worst}`);
    expect(bestMean, `slowest links:\n  ${worst}`).toBeLessThan(TIME_LIMIT_MS);
  });
});
