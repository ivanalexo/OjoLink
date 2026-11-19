/**
 * Edit distance counting insertions, deletions, substitutions, and swaps of adjacent characters.
 * Returns `max + 1` as soon as the distance is known to exceed `max`.
 */
export function editDistance(a: string, b: string, max: number = Infinity): number {
  const source = Array.from(a);
  const target = Array.from(b);
  if (Math.abs(source.length - target.length) > max) return max + 1;

  let beforePrevious: number[] = [];
  let previous = Array.from({ length: target.length + 1 }, (_, index) => index);

  for (let i = 1; i <= source.length; i++) {
    const current = [i];
    let rowMinimum = i;
    for (let j = 1; j <= target.length; j++) {
      const cost = source[i - 1] === target[j - 1] ? 0 : 1;
      let value = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
      const swapped =
        i > 1 && j > 1 && source[i - 1] === target[j - 2] && source[i - 2] === target[j - 1];
      if (swapped) value = Math.min(value, (beforePrevious[j - 2] ?? 0) + 1);
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > max) return max + 1;
    beforePrevious = previous;
    previous = current;
  }

  const distance = previous[target.length] ?? 0;
  return distance > max ? max + 1 : distance;
}
