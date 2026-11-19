import { describe, expect, it } from "vitest";
import { PROTECTED_PACKS, type ProtectedPack } from "../src/data/index.js";
import { buildProtectedIndex, labelOf } from "../src/signals/protected-index.js";
import { skeleton } from "../src/signals/skeleton.js";

const index = buildProtectedIndex(PROTECTED_PACKS);
const find = (domain: string) => index.entries.find((entry) => entry.domain === domain);

describe("labelOf", () => {
  it.each([
    ["bcp.com.bo", "com.bo", "bcp"],
    ["bisa.com", "com", "bisa"],
    ["gestora.bo", "bo", "gestora"],
    ["localhost", "", "localhost"],
  ])("splits %s", (domain, suffix, label) => {
    expect(labelOf(domain, suffix)).toBe(label);
  });
});

describe("buildProtectedIndex", () => {
  it("stores the name part and the suffix of each domain", () => {
    expect(find("bcp.com.bo")).toEqual({
      domain: "bcp.com.bo",
      entity: "BCP",
      category: "bank",
      label: "bcp",
      suffix: "com.bo",
    });
    expect(find("bisa.com")).toMatchObject({ label: "bisa", suffix: "com" });
    expect(find("gestora.bo")).toMatchObject({ label: "gestora", suffix: "bo" });
    expect(find("asfi.gob.bo")).toMatchObject({ label: "asfi", suffix: "gob.bo" });
  });

  it("finds an entry by the skeleton of its domain or of its name", () => {
    expect(index.byDomainSkeleton.get(skeleton("bcp.com.bo"))?.domain).toBe("bcp.com.bo");
    expect(index.byLabelSkeleton.get(skeleton("bancoso1"))?.domain).toBe("bancosol.com.bo");
    expect(index.byLabelSkeleton.get(skeleton("brnsc"))?.domain).toBe("bmsc.com.bo");
  });

  it("knows which domains are protected", () => {
    expect(index.domains.has("bcp.com.bo")).toBe(true);
    expect(index.domains.has("bcp.net")).toBe(false);
  });

  it("has no skeleton collision among the shipped packs", () => {
    expect(index.byDomainSkeleton.size).toBe(index.entries.length);
    expect(index.byLabelSkeleton.size).toBe(index.entries.length);
  });

  it("keeps the first entry on a collision", () => {
    const packs: ProtectedPack[] = [
      {
        country: "aa",
        suffixes: [],
        entries: [
          { domain: "banco.com", name: "First", category: "bank" },
          { domain: "banc0.com", name: "Second", category: "bank" },
          { domain: "banco.com", name: "Repeated", category: "bank" },
        ],
      },
    ];
    const collided = buildProtectedIndex(packs);
    expect(collided.entries.map((entry) => entry.entity)).toEqual(["First", "Second"]);
    expect(collided.byDomainSkeleton.get(skeleton("banco.com"))?.entity).toBe("First");
    expect(collided.domains.has("banc0.com")).toBe(true);
  });

  it("builds an empty index without packs", () => {
    expect(buildProtectedIndex([]).entries).toEqual([]);
  });
});
