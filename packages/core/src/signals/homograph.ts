import type { ProtectedPack } from "../data/index.js";
import { buildProtectedIndex, labelOf, type ProtectedDomain } from "./protected-index.js";
import { classifyCharacter } from "./scripts.js";
import { skeleton } from "./skeleton.js";
import type { Signal } from "./types.js";

export type HomographCharacter = {
  readonly char: string;
  readonly codePoint: string;
  readonly script: string | null;
  readonly substituted: boolean;
  readonly readsAs: string;
};

export type HomographDetails = {
  readonly imitated: string;
  readonly entity: string;
  readonly characters: readonly HomographCharacter[];
};

interface Segment {
  readonly written: readonly string[];
  readonly readsAs: string;
}

const NON_ASCII = /[^ -~]/;

function formatCodePoint(char: string): string {
  return `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;
}

/** Pairs each stretch of the written name with the stretch of the real name it reads as. */
function align(written: string, imitated: string): Segment[] {
  const source = Array.from(written);
  const target = Array.from(imitated);
  const segments: Segment[] = [];
  let i = 0;
  let j = 0;

  while (i < source.length || j < target.length) {
    const chars: string[] = [];
    let readsAs = "";
    let left = "";
    let right = "";
    do {
      const takeWritten = i < source.length && (left.length <= right.length || j >= target.length);
      if (takeWritten) {
        const char = source[i++] ?? "";
        chars.push(char);
        left += skeleton(char);
      } else {
        const char = target[j++] ?? "";
        readsAs += char;
        right += skeleton(char);
      }
    } while (left !== right && (i < source.length || j < target.length));
    segments.push({ written: chars, readsAs });
  }
  return segments;
}

function describe(segments: readonly Segment[]): HomographCharacter[] {
  return segments.flatMap((segment) => {
    const substituted = segment.written.join("") !== segment.readsAs;
    return segment.written.map((char) => ({
      char,
      codePoint: formatCodePoint(char),
      script: classifyCharacter(char),
      substituted,
      readsAs: segment.readsAs,
    }));
  });
}

function isForeign(character: HomographCharacter): boolean {
  return character.script !== null && character.script !== "Latin";
}

function pickVariant(written: string, characters: readonly HomographCharacter[]): string {
  const foreign = characters.filter((character) => character.substituted && isForeign(character));
  if (!NON_ASCII.test(written) || foreign.length === 0) return "lookalike";
  if (!characters.some((character) => character.script === "Latin")) return "whole-script";
  return foreign.length === 1 ? "letters-one" : "letters-many";
}

/** Builds the signal that names the protected domain a lookalike domain imitates. */
export function createHomographSignal(packs: readonly ProtectedPack[]): Signal {
  const index = buildProtectedIndex(packs);

  function findImitated(domain: string, label: string, suffix: string): ProtectedDomain | null {
    const sameDomain = index.byDomainSkeleton.get(skeleton(domain));
    if (sameDomain) return sameDomain;
    const sameLabel = index.byLabelSkeleton.get(skeleton(label));
    return sameLabel && sameLabel.suffix !== suffix && NON_ASCII.test(label) ? sameLabel : null;
  }

  return {
    id: "homograph",
    kind: "risk",
    variants: ["letters-one", "letters-many", "whole-script", "lookalike"],
    evaluate(url) {
      const domain = url.registrableDomain;
      const suffix = url.publicSuffix;
      if (url.isIp || domain === null || suffix === null || index.domains.has(domain)) return null;

      const label = labelOf(domain, suffix);
      const imitated = findImitated(domain, label, suffix);
      if (!imitated) return null;

      const sameLabel = skeleton(label) === skeleton(imitated.label);
      const written = sameLabel ? label : domain;
      const segments = align(written, sameLabel ? imitated.label : imitated.domain);
      const characters = describe(segments);
      const substituted = characters.filter((character) => character.substituted);
      const firstSegment = segments.find((segment) => segment.written.join("") !== segment.readsAs);
      const foreign = characters.find(isForeign);
      const details: HomographDetails = {
        imitated: imitated.domain,
        entity: imitated.entity,
        characters,
      };

      return {
        variant: pickVariant(written, characters),
        params: {
          imitated: imitated.domain,
          entity: imitated.entity,
          count: substituted.filter(isForeign).length,
          foreignScript: foreign?.script ?? "",
          written: firstSegment?.written.join("") ?? "",
          readsAs: firstSegment?.readsAs ?? "",
          codePoints: substituted.map((character) => character.codePoint).join(" "),
          asciiDomain: url.asciiHost.split(".").slice(-domain.split(".").length).join("."),
        },
        details,
      };
    },
  };
}
