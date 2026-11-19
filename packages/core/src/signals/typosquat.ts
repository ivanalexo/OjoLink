import type { ProtectedPack } from "../data/index.js";
import { editDistance } from "./distance.js";
import { buildProtectedIndex, type ProtectedDomain } from "./protected-index.js";
import { skeleton } from "./skeleton.js";
import type { Signal } from "./types.js";

export type TyposquatKind = "changed" | "extra" | "missing" | "swapped" | "two" | "ending";

export type TyposquatDetails = {
  readonly imitated: string;
  readonly entity: string;
  readonly written: string;
  readonly kind: TyposquatKind;
  readonly edits: number;
};

const MIN_NAME_LENGTH = 5;
const TWO_EDITS_MIN_LENGTH = 10;

interface Target {
  readonly entry: ProtectedDomain;
  readonly middle: string;
  readonly allowedNameEdits: number;
}

interface Slip {
  readonly kind: TyposquatKind;
  readonly writtenChar: string;
  readonly expectedChar: string;
}

interface Match extends Slip {
  readonly target: Target;
  readonly written: string;
  readonly writtenMiddle: string;
  readonly edits: number;
}

function groupKey(labelCount: number, topLevel: string): string {
  return `${labelCount}:${topLevel}`;
}

/** Names what one edit changed: a different letter, an extra one, a missing one, or a swap. */
function describeSlip(written: string, expected: string): Slip {
  const w = Array.from(written);
  const e = Array.from(expected);
  let i = 0;
  while (i < w.length && i < e.length && w[i] === e[i]) i++;

  if (w.length > e.length) return { kind: "extra", writtenChar: w[i] ?? "", expectedChar: "" };
  if (w.length < e.length) return { kind: "missing", writtenChar: "", expectedChar: e[i] ?? "" };
  if (w[i] === e[i + 1] && w[i + 1] === e[i]) {
    return {
      kind: "swapped",
      writtenChar: `${w[i] ?? ""}${w[i + 1] ?? ""}`,
      expectedChar: `${e[i] ?? ""}${e[i + 1] ?? ""}`,
    };
  }
  return { kind: "changed", writtenChar: w[i] ?? "", expectedChar: e[i] ?? "" };
}

/** Builds the signal for domains one slip of the keyboard away from a protected domain. */
export function createTyposquatSignal(packs: readonly ProtectedPack[]): Signal {
  const index = buildProtectedIndex(packs);
  const groups = new Map<string, Target[]>();
  const labelCounts = new Set<number>();

  for (const entry of index.entries) {
    const labels = entry.domain.split(".");
    const nameLength = Array.from(entry.label).length;
    const key = groupKey(labels.length, labels.at(-1) ?? "");
    labelCounts.add(labels.length);
    groups.set(key, [
      ...(groups.get(key) ?? []),
      {
        entry,
        middle: labels.slice(1, -1).join("."),
        allowedNameEdits:
          nameLength >= TWO_EDITS_MIN_LENGTH ? 2 : nameLength >= MIN_NAME_LENGTH ? 1 : 0,
      },
    ]);
  }

  function compare(tail: readonly string[], target: Target): Match | null {
    const written = tail.join(".");
    const name = tail[0] ?? "";
    const writtenMiddle = tail.slice(1, -1).join(".");
    let edits: number;
    let slip: Slip;

    if (writtenMiddle === target.middle) {
      if (target.allowedNameEdits === 0) return null;
      edits = editDistance(name, target.entry.label, target.allowedNameEdits);
      if (edits === 0 || edits > target.allowedNameEdits) return null;
      slip =
        edits === 1
          ? describeSlip(name, target.entry.label)
          : { kind: "two", writtenChar: "", expectedChar: "" };
    } else {
      const endingSlip =
        name === target.entry.label &&
        target.middle !== "" &&
        editDistance(writtenMiddle, target.middle, 1) === 1;
      if (!endingSlip) return null;
      edits = 1;
      slip = { kind: "ending", writtenChar: "", expectedChar: "" };
    }

    if (skeleton(written) === skeleton(target.entry.domain)) return null;
    return { ...slip, target, written, writtenMiddle, edits };
  }

  return {
    id: "typosquat",
    kind: "risk",
    variants: ["changed", "extra", "missing", "swapped", "two", "ending"],
    evaluate(url) {
      const realDomain = url.registrableDomain;
      const suffix = url.publicSuffix;
      if (url.isIp || realDomain === null || suffix === null) return null;
      if (index.domains.has(realDomain)) return null;
      if (index.suffixes.some((group) => group.suffix === suffix)) return null;

      const topLevel = url.labels.at(-1) ?? "";
      let best: Match | null = null;
      for (const count of labelCounts) {
        if (url.labels.length < count) continue;
        const tail = url.labels.slice(-count);
        for (const target of groups.get(groupKey(count, topLevel)) ?? []) {
          const match = compare(tail, target);
          if (match && (best === null || match.edits < best.edits)) best = match;
        }
      }
      if (!best) return null;

      const { entry, middle } = best.target;
      const details: TyposquatDetails = {
        imitated: entry.domain,
        entity: entry.entity,
        written: best.written,
        kind: best.kind,
        edits: best.edits,
      };
      return {
        variant: best.kind,
        params: {
          imitated: entry.domain,
          entity: entry.entity,
          written: best.written,
          realDomain,
          writtenChar: best.writtenChar,
          expectedChar: best.expectedChar,
          writtenEnding: `${best.writtenMiddle}.${topLevel}`,
          expectedEnding: `${middle}.${topLevel}`,
          edits: best.edits,
        },
        details,
      };
    },
  };
}
