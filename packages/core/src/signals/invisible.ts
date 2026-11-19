import { rawAuthority } from "./raw.js";
import type { Signal } from "./types.js";

export type InvisibleCharacterKind = "invisible" | "direction";
export type InvisibleCharacterLocation = "host" | "link" | "text";

export type InvisibleCharacter = {
  readonly codePoint: string;
  readonly kind: InvisibleCharacterKind;
  readonly location: InvisibleCharacterLocation;
};

export type InvisibleCharactersDetails = {
  readonly characters: readonly InvisibleCharacter[];
};

const INVISIBLE = new Set([0x00ad, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);
const DIRECTION_MARKS = new Set([0x200e, 0x200f]);
const DIRECTION_OVERRIDES = new Set([
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
]);
const ALL = new Set([...INVISIBLE, ...DIRECTION_MARKS, ...DIRECTION_OVERRIDES]);
const SEVERITY: readonly InvisibleCharacterLocation[] = ["host", "text", "link"];

function hasAny(text: string, codePoints: ReadonlySet<number>): boolean {
  for (const char of text) {
    if (codePoints.has(char.codePointAt(0) ?? 0)) return true;
  }
  return false;
}

function find(
  text: string,
  codePoints: ReadonlySet<number>,
  location: InvisibleCharacterLocation,
): InvisibleCharacter[] {
  const found: InvisibleCharacter[] = [];
  for (const char of text) {
    const value = char.codePointAt(0) ?? 0;
    if (!codePoints.has(value)) continue;
    found.push({
      codePoint: `U+${value.toString(16).toUpperCase().padStart(4, "0")}`,
      kind: INVISIBLE.has(value) ? "invisible" : "direction",
      location,
    });
  }
  return found;
}

function looksLikeDomain(text: string): boolean {
  const visible = Array.from(text)
    .filter((char) => !ALL.has(char.codePointAt(0) ?? 0))
    .join("")
    .trim();
  return visible.includes(".") && !/\s/.test(visible);
}

function findInVisibleText(text: string): InvisibleCharacter[] {
  const allowed = looksLikeDomain(text)
    ? new Set([...INVISIBLE, ...DIRECTION_OVERRIDES])
    : DIRECTION_OVERRIDES;
  return find(text, allowed, "text");
}

/** Triggers on characters that cannot be seen or that change the reading direction of a link. */
export const invisibleCharacters: Signal = {
  id: "invisible-characters",
  kind: "risk",
  variants: ["host-one", "host-many", "link-one", "link-many", "text-one", "text-many"],
  evaluate(url, context) {
    const text = context.visibleText ?? "";
    if (!hasAny(url.destination, ALL) && !hasAny(text, ALL)) return null;

    const raw = rawAuthority(url.destination);
    const characters = [
      ...find(raw.host, ALL, "host"),
      ...find(raw.rest, ALL, "link"),
      ...findInVisibleText(text),
    ];
    const location = SEVERITY.find((candidate) =>
      characters.some((character) => character.location === candidate),
    );
    if (!location) return null;

    const reported = characters.filter((character) => character.location === location);
    const details: InvisibleCharactersDetails = { characters };
    return {
      variant: `${location}-${reported.length === 1 ? "one" : "many"}`,
      params: {
        count: reported.length,
        codePoints: reported.map((character) => character.codePoint).join(" "),
        openedHost: url.host,
      },
      details,
    };
  },
};
