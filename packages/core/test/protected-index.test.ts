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
    for (const entry of index.entries) {
      expect(index.byLabelSkeleton.get(skeleton(entry.label))?.entity, entry.domain).toBe(
        entry.entity,
      );
    }
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

  it("lists protected suffixes with their group name", () => {
    expect(index.suffixes).toEqual([
      {
        suffix: "gob.bo",
        name: "Estado Plurinacional de Bolivia",
        labels: ["gob", "bo"],
        skeleton: skeleton("gob.bo"),
        lookalikes: ["gov.bo"],
      },
    ]);
  });

  it("reuses the index for the same packs array and rebuilds for another", () => {
    expect(buildProtectedIndex(PROTECTED_PACKS)).toBe(index);
    expect(buildProtectedIndex([...PROTECTED_PACKS])).not.toBe(index);
    expect(buildProtectedIndex([...PROTECTED_PACKS])).toEqual(index);
  });

  it("builds an empty index without packs", () => {
    expect(buildProtectedIndex([]).entries).toEqual([]);
  });
});

describe("user domains in the index", () => {
  const userDomains = ["miempresa.com.bo", "bcp.com.bo", "bcp.bo"];
  const own = buildProtectedIndex(PROTECTED_PACKS, userDomains);

  it("adds each user domain with itself as the entity", () => {
    expect(own.domains.has("miempresa.com.bo")).toBe(true);
    expect(own.entries.find((entry) => entry.domain === "miempresa.com.bo")).toEqual({
      domain: "miempresa.com.bo",
      entity: "miempresa.com.bo",
      category: "user",
      label: "miempresa",
      suffix: "com.bo",
    });
    expect(own.byDomainSkeleton.get(skeleton("miempresa.com.bo"))?.category).toBe("user");
    expect(own.byLabelSkeleton.get(skeleton("miempresa"))?.domain).toBe("miempresa.com.bo");
  });

  it("puts user domains after the embedded ones and keeps the embedded entry on a collision", () => {
    expect(own.entries.slice(0, index.entries.length)).toEqual(index.entries);
    expect(own.entries.filter((entry) => entry.domain === "bcp.com.bo")).toHaveLength(1);
    expect(own.byDomainSkeleton.get(skeleton("bcp.com.bo"))?.entity).toBe("BCP");
    expect(own.byLabelSkeleton.get(skeleton("bcp"))?.domain).toBe("bcp.com.bo");
    expect(own.domains.has("bcp.bo")).toBe(true);
  });

  it("reuses the index for the same arrays and leaves the embedded one untouched", () => {
    expect(buildProtectedIndex(PROTECTED_PACKS, userDomains)).toBe(own);
    expect(buildProtectedIndex(PROTECTED_PACKS)).toBe(index);
    expect(index.domains.has("miempresa.com.bo")).toBe(false);
  });
});
