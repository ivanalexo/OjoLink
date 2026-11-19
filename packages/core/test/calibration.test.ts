import { describe, expect, it } from "vitest";
import { DEFAULT_CALIBRATION, validateCalibration, type Calibration } from "../src/calibration.js";
import type { Signal } from "../src/signals/types.js";

const typosquat: Signal = {
  id: "typosquat",
  kind: "risk",
  variants: ["distance-1", "distance-2"],
  evaluate: () => null,
};
const shortener: Signal = { id: "shortener", kind: "hidden-destination", evaluate: () => null };

const valid: Calibration = {
  thresholds: { caution: 30, danger: 70 },
  weights: { "typosquat/distance-1": 60, "typosquat/distance-2": 30 },
};

describe("validateCalibration", () => {
  it("accepts a complete table", () => {
    expect(() => validateCalibration(valid, [typosquat, shortener])).not.toThrow();
  });

  it("accepts the default calibration with no signals", () => {
    expect(() => validateCalibration(DEFAULT_CALIBRATION, [])).not.toThrow();
  });

  it("does not require a weight for hidden-destination signals", () => {
    expect(() => validateCalibration({ ...valid, weights: {} }, [shortener])).not.toThrow();
  });

  it.each([0, -5, 12.5, Number.NaN])("rejects the weight %s", (weight) => {
    const calibration = { ...valid, weights: { ...valid.weights, "typosquat/distance-1": weight } };
    expect(() => validateCalibration(calibration, [typosquat])).toThrow(/positive integer/);
  });

  it.each([
    { caution: 70, danger: 30 },
    { caution: 50, danger: 50 },
  ])("rejects thresholds that are not ascending: %o", (thresholds) => {
    expect(() => validateCalibration({ ...valid, thresholds }, [])).toThrow(/lower than/);
  });

  it.each([
    { caution: 0, danger: 70 },
    { caution: 30, danger: 101 },
    { caution: 30.5, danger: 70 },
  ])("rejects thresholds out of range: %o", (thresholds) => {
    expect(() => validateCalibration({ ...valid, thresholds }, [])).toThrow(/Thresholds/);
  });

  it("rejects a risk signal with a missing weight", () => {
    const calibration = { ...valid, weights: { "typosquat/distance-1": 60 } };
    expect(() => validateCalibration(calibration, [typosquat])).toThrow(/typosquat\/distance-2/);
  });
});
