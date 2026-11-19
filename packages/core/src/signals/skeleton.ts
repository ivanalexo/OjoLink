import { CONFUSABLES } from "../data/index.js";

/**
 * UTS #39 skeleton with case folding: two texts look alike when their skeletons are equal.
 * Lowercasing is added because the Unicode data links the digit 0 to capital O only.
 */
export function skeleton(text: string): string {
  let mapped = "";
  for (const char of text.normalize("NFD")) {
    mapped += Object.hasOwn(CONFUSABLES, char) ? CONFUSABLES[char] : char;
  }
  return mapped.toLowerCase().normalize("NFD");
}
