export type Level = "safe" | "caution" | "danger" | "hidden-destination";

export const MAX_SCORE = 100;

export function computeScore(weights: readonly number[]): number {
  const sum = weights.reduce((total, weight) => total + weight, 0);
  return Math.min(sum, MAX_SCORE);
}

/** Danger outranks a hidden destination, which outranks caution and safe. */
export function computeLevel(
  score: number,
  hiddenDestination: boolean,
  thresholds: { readonly caution: number; readonly danger: number },
): Level {
  if (score >= thresholds.danger) return "danger";
  if (hiddenDestination) return "hidden-destination";
  if (score >= thresholds.caution) return "caution";
  return "safe";
}
