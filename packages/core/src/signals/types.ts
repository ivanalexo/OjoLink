import type { NormalizedUrl } from "../normalize.js";

export type SignalKind = "risk" | "hidden-destination";

export interface AnalysisContext {
  readonly visibleText?: string;
}

export type SignalParams = Readonly<Record<string, string | number>>;

export interface SignalHit {
  readonly variant?: string;
  readonly params?: SignalParams;
}

export interface Signal {
  readonly id: string;
  readonly kind: SignalKind;
  readonly variants?: readonly string[];
  evaluate(url: NormalizedUrl, context: AnalysisContext): SignalHit | null;
}

export function signalKey(id: string, variant?: string): string {
  return variant === undefined ? id : `${id}/${variant}`;
}

/** Every weight and message key a signal can produce. */
export function signalKeys(signal: Signal): string[] {
  return signal.variants && signal.variants.length > 0
    ? signal.variants.map((variant) => signalKey(signal.id, variant))
    : [signal.id];
}
