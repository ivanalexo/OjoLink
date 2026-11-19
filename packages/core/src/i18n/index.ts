import type { Level } from "../score.js";
import type { SignalParams } from "../signals/types.js";
import {
  es,
  SIGNAL_TEXTS,
  type LevelMessage,
  type Messages,
  type SignalMessage,
  type SignalText,
  type Terms,
} from "./es.js";

export interface PartialMessages {
  readonly levels?: Readonly<Partial<Record<Level, Partial<LevelMessage>>>>;
  readonly signals?: Readonly<Record<string, Partial<SignalMessage>>>;
  readonly terms?: Terms;
}

export type TermResolver = (group: string, value: string) => string;

const OTHER_TERM = "other";

export type Catalogs = { readonly es: Messages } & Readonly<Record<string, PartialMessages>>;

export const DEFAULT_LOCALE = "es";
export const DEFAULT_CATALOGS: Catalogs = { es };

/**
 * Fills `{name}` placeholders, and `{name|group}` ones with the translated term for the value.
 * Unknown placeholders stay visible so a missing value is noticed.
 */
export function fillTemplate(
  template: string,
  params: SignalParams = {},
  resolveTerm?: TermResolver,
): string {
  return template.replace(
    /\{(\w+)(?:\|(\w+))?\}/g,
    (placeholder, name: string, group: string | undefined) => {
      if (!Object.hasOwn(params, name)) return placeholder;
      const value = String(params[name]);
      return group !== undefined && resolveTerm ? resolveTerm(group, value) : value;
    },
  );
}

function catalogFor(catalogs: Catalogs, locale: string): PartialMessages {
  return Object.hasOwn(catalogs, locale) ? (catalogs[locale] ?? catalogs.es) : catalogs.es;
}

function lookupTerm(catalog: PartialMessages, group: string, value: string): string | undefined {
  const terms = catalog.terms;
  if (!terms || !Object.hasOwn(terms, group)) return undefined;
  const entries = terms[group];
  if (!entries) return undefined;
  if (Object.hasOwn(entries, value)) return entries[value];
  return Object.hasOwn(entries, OTHER_TERM) ? entries[OTHER_TERM] : undefined;
}

/** Translates a neutral value such as a script name, preferring the locale and then Spanish. */
export function resolveTerm(
  catalogs: Catalogs,
  locale: string,
  group: string,
  value: string,
): string {
  return (
    lookupTerm(catalogFor(catalogs, locale), group, value) ??
    lookupTerm(catalogs.es, group, value) ??
    value
  );
}

/** Spanish-first name of an alphabet, as an adjective for a single letter ("cirílica"). */
export function describeScript(script: string, locale: string = DEFAULT_LOCALE): string {
  return resolveTerm(DEFAULT_CATALOGS, locale, "scriptOne", script);
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
export type { LevelMessage, Messages, SignalMessage, SignalText, Terms };
