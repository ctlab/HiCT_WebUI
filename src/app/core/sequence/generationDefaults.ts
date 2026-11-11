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
