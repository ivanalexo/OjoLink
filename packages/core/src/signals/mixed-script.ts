import { analyzeLabel } from "./scripts.js";
import type { Signal } from "./types.js";

export type ScriptCharacter = {
  readonly char: string;
  readonly codePoint: string;
  readonly script: string | null;
  readonly foreign: boolean;
};

export type MixedLabel = {
  readonly label: string;
  readonly ownScript: string;
  readonly foreignCount: number;
  readonly characters: readonly ScriptCharacter[];
};

export type MixedScriptDetails = {
  readonly labels: readonly MixedLabel[];
};

const NON_ASCII = /[^ -~]/;

function describeLabel(label: string): MixedLabel | null {
  const analysis = analyzeLabel(label);
  if (!analysis.mixed || analysis.ownScript === null) return null;
  const ownScript = analysis.ownScript;
  const characters = analysis.characters.map((character) => ({
    ...character,
    foreign: character.script !== null && character.script !== ownScript,
  }));
  return {
    label,
    ownScript,
    foreignCount: characters.filter((character) => character.foreign).length,
    characters,
  };
}

/** Triggers when a single host label combines letters from different alphabets. */
export const mixedScript: Signal = {
  id: "mixed-script",
  kind: "risk",
  variants: ["one", "many", "several"],
  evaluate(url) {
    if (url.isIp) return null;

    const registrableIndex = url.registrableDomain === null ? -1 : url.subdomainLabels.length;
    const labels: MixedLabel[] = [];
    let described: MixedLabel | undefined;

    url.labels.forEach((label, index) => {
      if (!NON_ASCII.test(label)) return;
      const mixed = describeLabel(label);
      if (!mixed) return;
      labels.push(mixed);
      if (index === registrableIndex) described = mixed;
    });

    described ??= labels[0];
    if (!described) return null;

    const foreign = described.characters.filter((character) => character.foreign);
    const foreignScripts = new Set(foreign.map((character) => character.script));
    const variant = foreignScripts.size > 1 ? "several" : foreign.length === 1 ? "one" : "many";
    const details: MixedScriptDetails = { labels };

    return {
      variant,
      params: {
        label: described.label,
        count: foreign.length,
        ownScript: described.ownScript,
        foreignScript: foreign[0]?.script ?? "",
        codePoints: foreign.map((character) => character.codePoint).join(" "),
        asciiHost: url.asciiHost,
      },
      details,
    };
  },
};
