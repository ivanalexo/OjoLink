import { describe, expect, it } from "vitest";
import { computeLevel, computeScore } from "../src/score.js";

const thresholds = { caution: 30, danger: 70 };

describe("computeScore", () => {
  it("is zero without signals", () => {
    expect(computeScore([])).toBe(0);
  });

  it("adds the weights", () => {
    expect(computeScore([30, 25])).toBe(55);
  });

  it("is capped at 100", () => {
    expect(computeScore([80, 70])).toBe(100);
  });
});

describe("computeLevel", () => {
  it.each([
    [0, "safe"],
    [29, "safe"],
    [30, "caution"],
    [69, "caution"],
    [70, "danger"],
    [100, "danger"],
  ] as const)("maps a score of %i to %s", (score, level) => {
    expect(computeLevel(score, false, thresholds)).toBe(level);
  });

  it.each([
    [0, "hidden-destination"],
    [29, "hidden-destination"],
    [45, "hidden-destination"],
    [70, "danger"],
  ] as const)("maps a concealed destination with a score of %i to %s", (score, level) => {
    expect(computeLevel(score, true, thresholds)).toBe(level);
  });
});
