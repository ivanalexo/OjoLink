import type { AnalysisResult, TriggeredSignal, Verdict } from "./analyze.js";
import {
  DEFAULT_CATALOGS,
  DEFAULT_LOCALE,
  resolveLabels,
  resolveReason,
  resolveTerm,
  type PresentationLabels,
} from "./i18n/index.js";
import type { NormalizedUrl, NormalizeFailureReason } from "./normalize.js";
import { rawAuthority } from "./raw.js";
import type { Level } from "./score.js";
import type { HomographDetails } from "./signals/homograph.js";
import type { MixedScriptDetails } from "./signals/mixed-script.js";

export interface ComparisonUnit {
  readonly char: string;
  readonly alphabet: string;
  readonly marked: boolean;
}

export interface Comparison {
  readonly units: readonly ComparisonUnit[];
  readonly rest: string;
}

export interface WarningParts {
  readonly title: string;
  readonly explanation: string;
  readonly advice: string;
  readonly comparison: Comparison | null;
}

export interface TechnicalSignal {
  readonly id: string;
  readonly text: string;
  readonly weight: number;
}

export interface TechnicalDetail {
  readonly signals: readonly TechnicalSignal[];
  readonly score: number;
  readonly notEvaluated: readonly string[];
}

export interface VerdictDescription {
  readonly analyzed: true;
  readonly level: Level;
  readonly levelLabel: string;
  readonly levelDescription: string;
  readonly warning: WarningParts | null;
  readonly realAddress: string | null;
  readonly technical: TechnicalDetail;
  readonly labels: PresentationLabels;
}

export interface NotAnalyzedDescription {
  readonly analyzed: false;
  readonly reason: NormalizeFailureReason;
  readonly message: string;
}

export type ResultDescription = VerdictDescription | NotAnalyzedDescription;

export interface DescribeOptions {
  readonly locale?: string;
}

function alphabetName(script: string | null, locale: string): string {
  return script === null ? "" : resolveTerm(DEFAULT_CATALOGS, locale, "scriptOne", script);
}

function compareLookalike(signal: TriggeredSignal, url: NormalizedUrl, locale: string): Comparison {
  const { characters } = signal.details as HomographDetails;
  const written = characters.map((character) => character.char).join("");
  const domain = url.registrableDomain ?? url.host;
  return {
    units: characters.map((character) => ({
      char: character.char,
      alphabet: alphabetName(character.script, locale),
      marked: character.substituted,
    })),
    rest: domain.startsWith(written) ? domain.slice(written.length) : "",
  };
}

function compareMixed(
  signal: TriggeredSignal,
  url: NormalizedUrl,
  locale: string,
): Comparison | null {
  const { labels } = signal.details as MixedScriptDetails;
  const registrableLabel = url.labels[url.subdomainLabels.length];
  const label = labels.find((candidate) => candidate.label === registrableLabel) ?? labels[0];
  if (!label) return null;
  const start = url.host.indexOf(label.label);
  return {
    units: label.characters.map((character) => ({
      char: character.char,
      alphabet: alphabetName(character.script, locale),
      marked: character.foreign,
    })),
    rest: start === -1 ? "" : url.host.slice(start + label.label.length),
  };
}

function buildComparison(
  signal: TriggeredSignal,
  url: NormalizedUrl,
  locale: string,
): Comparison | null {
  if (signal.id === "homograph") return compareLookalike(signal, url, locale);
  if (signal.id === "mixed-script") return compareMixed(signal, url, locale);
  return null;
}

/** The host the browser opens, when it is not what the link shows. */
function realAddressOf(url: NormalizedUrl): string | null {
  const written = rawAuthority(url.input).host.replace(/\.$/, "").toLowerCase();
  return written === url.asciiHost ? null : url.asciiHost;
}

function describeVerdict(verdict: Verdict, locale: string): VerdictDescription {
  const [main] = verdict.signals;
  return {
    analyzed: true,
    level: verdict.level,
    levelLabel: verdict.levelLabel,
    levelDescription: verdict.levelDescription,
    warning: main
      ? {
          title: main.title,
          explanation: main.explanation,
          advice: main.advice,
          comparison: buildComparison(main, verdict.url, locale),
        }
      : null,
    realAddress: realAddressOf(verdict.url),
    technical: {
      signals: verdict.signals.map(({ id, technical, weight }) => ({
        id,
        text: technical,
        weight,
      })),
      score: verdict.score,
      notEvaluated: verdict.notEvaluated,
    },
    labels: resolveLabels(DEFAULT_CATALOGS, locale),
  };
}

/** Turns an analysis result into the parts of a warning, in the order every client shows them. */
export function describeResult(
  result: AnalysisResult,
  options: DescribeOptions = {},
): ResultDescription {
  const locale = options.locale ?? DEFAULT_LOCALE;
  if (result.analyzed) return describeVerdict(result, locale);
  return {
    analyzed: false,
    reason: result.reason,
    message: resolveReason(DEFAULT_CATALOGS, locale, result.reason),
  };
}
