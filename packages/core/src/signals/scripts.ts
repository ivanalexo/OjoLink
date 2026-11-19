export const OTHER_SCRIPT = "Other";

const SCRIPT_NAMES = [
  "Latin",
  "Cyrillic",
  "Greek",
  "Armenian",
  "Hebrew",
  "Arabic",
  "Han",
  "Hiragana",
  "Katakana",
  "Hangul",
  "Bopomofo",
  "Thai",
  "Devanagari",
  "Georgian",
  "Bengali",
  "Tamil",
] as const;

const SCRIPT_TESTS = SCRIPT_NAMES.map(
  (name) => [name, new RegExp(`^\\p{Script=${name}}$`, "u")] as const,
);
const NEUTRAL = /^[\p{Script=Common}\p{Script=Inherited}]$/u;
const ASCII_LETTER = /^[a-z]$/i;

const COMPATIBLE_GROUPS: readonly ReadonlySet<string>[] = [
  new Set(["Han", "Hiragana", "Katakana"]),
  new Set(["Han", "Bopomofo"]),
  new Set(["Han", "Hangul"]),
];

export interface ClassifiedCharacter {
  readonly char: string;
  readonly codePoint: string;
  readonly script: string | null;
}

export interface LabelScripts {
  readonly characters: readonly ClassifiedCharacter[];
  readonly scripts: readonly string[];
  readonly ownScript: string | null;
  readonly mixed: boolean;
}

/** Returns the script of a character, or null for digits, hyphens, and other shared characters. */
export function classifyCharacter(char: string): string | null {
  if (char.length === 1 && char.charCodeAt(0) < 0x80) {
    return ASCII_LETTER.test(char) ? "Latin" : null;
  }
  if (NEUTRAL.test(char)) return null;
  for (const [name, test] of SCRIPT_TESTS) {
    if (test.test(char)) return name;
  }
  return OTHER_SCRIPT;
}

function formatCodePoint(char: string): string {
  const value = char.codePointAt(0) ?? 0;
  return `U+${value.toString(16).toUpperCase().padStart(4, "0")}`;
}

/** Scripts that ordinary Japanese, Chinese, and Korean writing combines are not a mix. */
function isMixed(scripts: readonly string[]): boolean {
  if (scripts.length < 2) return false;
  const withoutLatin = scripts.filter((script) => script !== "Latin");
  return !COMPATIBLE_GROUPS.some((group) => withoutLatin.every((script) => group.has(script)));
}

/** Latin when present, because the names being imitated are Latin; otherwise the majority. */
function pickOwnScript(counts: ReadonlyMap<string, number>): string | null {
  if (counts.has("Latin")) return "Latin";
  let best: string | null = null;
  let bestCount = 0;
  for (const [script, count] of counts) {
    if (count > bestCount) {
      best = script;
      bestCount = count;
    }
  }
  return best;
}

/** Classifies every character of a label and decides whether it mixes alphabets. */
export function analyzeLabel(label: string): LabelScripts {
  const counts = new Map<string, number>();
  const characters = Array.from(label, (char): ClassifiedCharacter => {
    const script = classifyCharacter(char);
    if (script !== null) counts.set(script, (counts.get(script) ?? 0) + 1);
    return { char, codePoint: formatCodePoint(char), script };
  });
  const scripts = [...counts.keys()];
  return { characters, scripts, ownScript: pickOwnScript(counts), mixed: isMixed(scripts) };
}
