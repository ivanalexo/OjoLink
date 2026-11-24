import { analyze, describeResult, type VerdictDescription } from "@ojolink/core";
import type { CheckedLink } from "./check";
import type { FailureReason, Reveal, RevealOutcome } from "./reveal";
import { shortenLink } from "./shorten";

export const AUTOMATIC_LIMIT = 5;

export type RevealState =
  | { readonly kind: "waiting"; readonly deep: boolean }
  | { readonly kind: "manual" }
  | {
      readonly kind: "revealed";
      readonly destination: string;
      readonly display: string;
      readonly description: VerdictDescription;
    }
  | { readonly kind: "failed"; readonly reason: FailureReason; readonly deepOffered: boolean };

export type RevealStates = readonly (RevealState | null)[];

export interface Reveals {
  readonly states: RevealStates;
  /** Asks again for the short link of one result, deep or not. */
  request(index: number, deep: boolean): Promise<void>;
  /** Makes every answer still on its way be ignored. */
  cancel(): void;
}

/** Analyzes a revealed destination on the device. An unknown destination is never promoted. */
export function settle(outcome: RevealOutcome): RevealState {
  if (outcome.kind === "failed") return outcome;
  const description = describeResult(analyze(outcome.destination));
  if (!description.analyzed || description.level === "hidden-destination") {
    return { kind: "failed", reason: "unresolved", deepOffered: false };
  }
  return {
    kind: "revealed",
    destination: outcome.destination,
    display: shortenLink(outcome.destination),
    description,
  };
}

/**
 * Reveals the short links of one analysis: the first few by itself, the rest on request,
 * one request for each distinct short link.
 */
export function startReveals(
  items: readonly CheckedLink[],
  reveal: Reveal | null,
  onChange: (states: RevealStates, changed: RevealState | null) => void,
): Reveals {
  const states: (RevealState | null)[] = items.map(() => null);
  let cancelled = false;
  const distinct = [...new Set(items.flatMap((item) => item.shortLink ?? []))];

  const set = (shortLink: string, state: RevealState): void => {
    items.forEach((item, index) => {
      if (item.shortLink === shortLink) states[index] = state;
    });
  };

  const ask = async (shortLink: string, deep: boolean): Promise<void> => {
    if (!reveal || cancelled) return;
    set(shortLink, { kind: "waiting", deep });
    onChange([...states], null);
    const state = settle(await reveal(shortLink, { deep }));
    if (cancelled) return;
    set(shortLink, state);
    onChange([...states], state);
  };

  if (reveal) {
    for (const shortLink of distinct.slice(AUTOMATIC_LIMIT)) set(shortLink, { kind: "manual" });
    for (const shortLink of distinct.slice(0, AUTOMATIC_LIMIT)) void ask(shortLink, false);
  }

  return {
    get states() {
      return [...states];
    },
    request: (index, deep) => {
      const shortLink = items[index]?.shortLink;
      return shortLink ? ask(shortLink, deep) : Promise.resolve();
    },
    cancel: () => {
      cancelled = true;
    },
  };
}
