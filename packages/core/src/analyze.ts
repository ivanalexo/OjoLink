import { DEFAULT_CALIBRATION, validateCalibration, type Calibration } from "./calibration.js";
import {
  DEFAULT_CATALOGS,
  DEFAULT_LOCALE,
  fillTemplate,
  resolveLevelMessage,
  resolveSignalMessage,
  SIGNAL_TEXTS,
  type Catalogs,
} from "./i18n/index.js";
import { normalizeUrl, type NormalizedUrl, type NormalizeFailureReason } from "./normalize.js";
import { computeLevel, computeScore, type Level } from "./score.js";
import { DEFAULT_SIGNALS } from "./signals/index.js";
import {
  signalKey,
  signalKeys,
  type AnalysisContext,
  type Signal,
  type SignalDetails,
  type SignalKind,
} from "./signals/types.js";

export interface TriggeredSignal {
  readonly id: string;
  readonly variant: string | null;
  readonly kind: SignalKind;
  readonly weight: number;
  readonly tooltip: string;
  readonly title: string;
  readonly explanation: string;
  readonly advice: string;
  readonly technical: string;
  readonly details: SignalDetails;
}

export interface Verdict {
  readonly analyzed: true;
  readonly level: Level;
  readonly levelLabel: string;
  readonly levelDescription: string;
  readonly score: number;
  readonly signals: readonly TriggeredSignal[];
  readonly notEvaluated: readonly string[];
  readonly url: NormalizedUrl;
}

export interface NotAnalyzed {
  readonly analyzed: false;
  readonly reason: NormalizeFailureReason;
}

export type AnalysisResult = Verdict | NotAnalyzed;

export interface AnalyzeOptions {
  readonly context?: AnalysisContext;
  readonly locale?: string;
}

export interface EngineConfig {
  readonly signals: readonly Signal[];
  readonly calibration?: Calibration;
  readonly messages?: Catalogs;
}

export interface Engine {
  analyze(input: string, options?: AnalyzeOptions): AnalysisResult;
}

const EMPTY_CONTEXT: AnalysisContext = Object.freeze({});
const EMPTY_DETAILS: SignalDetails = Object.freeze({});

function validateSignals(signals: readonly Signal[], messages: Catalogs): void {
  const seen = new Set<string>();
  for (const signal of signals) {
    if (seen.has(signal.id)) throw new Error(`Duplicate signal id "${signal.id}"`);
    seen.add(signal.id);
    for (const key of signalKeys(signal)) {
      const message = resolveSignalMessage(messages, DEFAULT_LOCALE, key);
      if (!message || SIGNAL_TEXTS.some((text) => (message[text] ?? "").trim() === "")) {
        throw new Error(`Missing Spanish message for "${key}"`);
      }
    }
  }
}

/** Builds an analysis engine. Throws when a signal lacks a weight or a Spanish message. */
export function createEngine(config: EngineConfig): Engine {
  const signals = [...config.signals];
  const calibration = config.calibration ?? DEFAULT_CALIBRATION;
  const messages = config.messages ?? DEFAULT_CATALOGS;
  validateCalibration(calibration, signals);
  validateSignals(signals, messages);

  function evaluate(
    signal: Signal,
    url: NormalizedUrl,
    context: AnalysisContext,
    locale: string,
  ): TriggeredSignal | null {
    const hit = signal.evaluate(url, context);
    if (!hit) return null;

    const key = signalKey(signal.id, hit.variant);
    const message = resolveSignalMessage(messages, locale, key);
    const weight = signal.kind === "risk" ? calibration.weights[key] : 0;
    if (!message || weight === undefined) throw new Error(`Unknown signal key "${key}"`);

    return {
      id: signal.id,
      variant: hit.variant ?? null,
      kind: signal.kind,
      weight,
      tooltip: fillTemplate(message.tooltip, hit.params),
      title: fillTemplate(message.title, hit.params),
      explanation: fillTemplate(message.explanation, hit.params),
      advice: fillTemplate(message.advice, hit.params),
      technical: fillTemplate(message.technical, hit.params),
      details: hit.details ?? EMPTY_DETAILS,
    };
  }

  return {
    analyze(input, options = {}) {
      const normalized =
        typeof input === "string"
          ? normalizeUrl(input)
          : ({ ok: false, reason: "not-a-link" } as const);
      if (!normalized.ok) return { analyzed: false, reason: normalized.reason };

      const context = options.context ?? EMPTY_CONTEXT;
      const locale = options.locale ?? DEFAULT_LOCALE;
      const triggered: TriggeredSignal[] = [];
      const notEvaluated: string[] = [];

      for (const signal of signals) {
        try {
          const result = evaluate(signal, normalized.url, context, locale);
          if (result) triggered.push(result);
        } catch {
          notEvaluated.push(signal.id);
        }
      }

      const order = new Map(signals.map((signal, index) => [signal.id, index]));
      triggered.sort(
        (a, b) => b.weight - a.weight || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
      );

      const score = computeScore(triggered.map((signal) => signal.weight));
      const hidden = triggered.some((signal) => signal.kind === "hidden-destination");
      const level = computeLevel(score, hidden, calibration.thresholds);
      const levelMessage = resolveLevelMessage(messages, locale, level);

      return {
        analyzed: true,
        level,
        levelLabel: levelMessage.label,
        levelDescription: levelMessage.description,
        score,
        signals: triggered,
        notEvaluated,
        url: normalized.url,
      };
    },
  };
}

const defaultEngine = createEngine({ signals: DEFAULT_SIGNALS });

/** Analyzes a link with the built-in signals. Synchronous, local, and never throws. */
export function analyze(input: string, options?: AnalyzeOptions): AnalysisResult {
  return defaultEngine.analyze(input, options);
}
