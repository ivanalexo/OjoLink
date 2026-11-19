import { MAX_SCORE } from "./score.js";
import { signalKeys, type Signal } from "./signals/types.js";

export interface Thresholds {
  readonly caution: number;
  readonly danger: number;
}

export interface Calibration {
  readonly thresholds: Thresholds;
  readonly weights: Readonly<Record<string, number>>;
}

/** Provisional values. The test-corpus-calibration change replaces them with measured ones. */
export const DEFAULT_CALIBRATION: Calibration = {
  thresholds: { caution: 30, danger: 70 },
  weights: {
    "mixed-script/one": 80,
    "mixed-script/many": 80,
    "mixed-script/several": 80,
  },
};

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** Throws when thresholds or weights are invalid, or when a risk signal has no weight. */
export function validateCalibration(calibration: Calibration, signals: readonly Signal[]): void {
  const { caution, danger } = calibration.thresholds;
  if (!isPositiveInteger(caution) || !isPositiveInteger(danger) || danger > MAX_SCORE) {
    throw new Error(`Thresholds must be integers between 1 and ${MAX_SCORE}`);
  }
  if (caution >= danger) {
    throw new Error("The caution threshold must be lower than the danger threshold");
  }

  for (const [key, weight] of Object.entries(calibration.weights)) {
    if (!isPositiveInteger(weight)) {
      throw new Error(`Weight for "${key}" must be a positive integer`);
    }
  }

  for (const signal of signals) {
    if (signal.kind !== "risk") continue;
    for (const key of signalKeys(signal)) {
      if (!Object.hasOwn(calibration.weights, key)) {
        throw new Error(`Missing weight for "${key}"`);
      }
    }
  }
}
