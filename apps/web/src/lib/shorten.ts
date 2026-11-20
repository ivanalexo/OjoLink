const MAX_LENGTH = 72;
const TAIL_LENGTH = 16;

/** Shortens a long link in the middle for display, keeping its start, where the host is. */
export function shortenLink(link: string, maxLength: number = MAX_LENGTH): string {
  const characters = Array.from(link);
  if (characters.length <= maxLength) return link;
  const head = characters.slice(0, maxLength - TAIL_LENGTH - 1).join("");
  const tail = characters.slice(-TAIL_LENGTH).join("");
  return `${head}…${tail}`;
}
