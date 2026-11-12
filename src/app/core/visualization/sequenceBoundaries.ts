/** First sorted entry whose coordinate is >= target; no assembly-wide scan at base zoom. */
export function coordinateLowerBound<T>(
  items: readonly T[],
  target: number,
  coordinate: (item: T) => number
): number {
  let low = 0,
    high = items.length;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (coordinate(items[mid]) < target) low = mid + 1;
    else high = mid;
  }
  return low;
}
