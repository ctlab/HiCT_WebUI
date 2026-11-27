/** Use stored levels from the finest through the current view, in ascending order. */
export function defaultSequenceResolutions(
  available: readonly number[],
  current: number
): number[] {
  const sorted = [...new Set(available)]
    .filter((value) => Number.isSafeInteger(value) && value > 0)
    .sort((a, b) => a - b);
  const selected = sorted.filter((value) => value <= current);
  return selected.length ? selected : sorted.slice(0, 1);
}

/** Extend the 4DN 5/10/25 kb cadence below 1 kb for sequence windows. */
export function dotplotResolutionLevels(
  map: readonly number[],
  k: number,
  minimum: number
): number[] {
  const stored = map.filter((n) => Number.isSafeInteger(n) && n >= minimum);
  if (!Number.isSafeInteger(k) || k <= 0)
    return [...new Set(stored)].sort((a, b) => a - b);
  const finest = Math.min(...stored, Number.MAX_SAFE_INTEGER);
  const levels = new Set([...stored, k]);
  if (stored.length) {
    for (let decade = 1; decade < finest; decade *= 10) {
      for (const factor of [1, decade === 1000 ? 2 : 2.5, 5]) {
        const level = factor * decade;
        if (Number.isInteger(level) && level > k && level < finest)
          levels.add(level);
      }
    }
  }
  return [...levels].sort((a, b) => a - b);
}
