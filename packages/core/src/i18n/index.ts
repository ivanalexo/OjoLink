import type { Level } from "../score.js";
import type { SignalParams } from "../signals/types.js";
import {
  es,
  SIGNAL_TEXTS,
  type LevelMessage,
  type Messages,
  type SignalMessage,
  type SignalText,
} from "./es.js";

export interface PartialMessages {
  readonly levels?: Readonly<Partial<Record<Level, Partial<LevelMessage>>>>;
  readonly signals?: Readonly<Record<string, Partial<SignalMessage>>>;
}

export type Catalogs = { readonly es: Messages } & Readonly<Record<string, PartialMessages>>;

export const DEFAULT_LOCALE = "es";
export const DEFAULT_CATALOGS: Catalogs = { es };

/** Fills `{name}` placeholders. Unknown placeholders stay visible so a missing value is noticed. */
export function fillTemplate(template: string, params: SignalParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder,
  );
}

function catalogFor(catalogs: Catalogs, locale: string): PartialMessages {
  return Object.hasOwn(catalogs, locale) ? (catalogs[locale] ?? catalogs.es) : catalogs.es;
}

export function resolveLevelMessage(
  catalogs: Catalogs,
  locale: string,
  level: Level,
): LevelMessage {
  const translated = catalogFor(catalogs, locale).levels?.[level];
  const fallback = catalogs.es.levels[level];
  return {
    label: translated?.label ?? fallback.label,
    description: translated?.description ?? fallback.description,
  };
}

/** Returns the message for a signal key, using Spanish for any text the locale lacks. */
export function resolveSignalMessage(
  catalogs: Catalogs,
  locale: string,
  key: string,
): SignalMessage | null {
  const fallback = Object.hasOwn(catalogs.es.signals, key) ? catalogs.es.signals[key] : undefined;
  if (!fallback) return null;
  const signals = catalogFor(catalogs, locale).signals;
  const translated = signals && Object.hasOwn(signals, key) ? signals[key] : undefined;
  const resolved = {} as Record<SignalText, string>;
  for (const text of SIGNAL_TEXTS) resolved[text] = translated?.[text] ?? fallback[text];
  return resolved;
}

export { SIGNAL_TEXTS };
export type { LevelMessage, Messages, SignalMessage, SignalText };
