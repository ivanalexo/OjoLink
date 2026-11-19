import { describe, expect, it } from "vitest";
import { VERSION } from "../src/index.js";

describe("public entry point", () => {
  it("exposes the engine version", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
