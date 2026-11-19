import { describe, expect, it } from "vitest";
import * as core from "../src/index.js";

describe("public entry point", () => {
  it("exposes the engine version", () => {
    expect(core.VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("exposes normalization and unwrapping", () => {
    expect(core.normalizeUrl("https://bcp.com.bo/").ok).toBe(true);
    expect(core.unwrapUrl("https://bcp.com.bo/").wrappers).toEqual([]);
  });
});
