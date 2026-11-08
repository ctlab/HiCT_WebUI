/**
 * Sparse quarter-octave histogram of positive finite values (server TileSignalStatistics):
 * bucket b covers [2^e * (1 + q/4), 2^e * (1 + (q + 1)/4)) with e = floor(b/4) + minExponent, q = b % 4.
 */
export type SignalHistogram = {
  minExponent: number;
  zeros: number;
  buckets: [number, number][];
};
export type FiniteRange = {
  min: number | null;
  max: number | null;
  count: number;
  histogram?: SignalHistogram | null;
};
export type TileSignals = {
  source: string;
  bpResolution: number;
  revision: string;
  raw: FiniteRange;
  processed: { expression: string; range: FiniteRange }[];
};

/** JSON property order is immaterial; expression values and structure are not. */
export function expressionKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(expressionKey).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${expressionKey(child)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export function aggregateTileSignals(
  tiles: TileSignals[],
  source: string,
  bpResolution: number,
  expression: unknown
): { raw: FiniteRange; processed: FiniteRange; tiles: number } | undefined {
  const selected = tiles.filter(
    (tile) => tile.source === source && tile.bpResolution === bpResolution
  );
  if (
    !selected.length ||
    new Set(selected.map((tile) => tile.revision)).size !== 1
  )
    return;
  const key = expressionKey(expression);
  function merge(ranges: FiniteRange[]): FiniteRange {
    let min = Infinity,
      max = -Infinity,
      count = 0;
    const histograms: SignalHistogram[] = [];
    for (const range of ranges) {
      if (
        range &&
        Number.isSafeInteger(range.count) &&
        range.count > 0 &&
        typeof range.min === "number" &&
        typeof range.max === "number" &&
        Number.isFinite(range.min) &&
        Number.isFinite(range.max) &&
        range.min <= range.max
      ) {
        min = Math.min(min, range.min);
        max = Math.max(max, range.max);
        count += range.count;
        if (range.histogram) histograms.push(range.histogram);
      }
    }
    return {
      min: count ? min : null,
      max: count ? max : null,
      count,
      histogram: mergeHistograms(histograms),
    };
  }
  const processed = selected.flatMap((tile) =>
    tile.processed
      .filter((signal) => {
        if (signal.expression === "") return true; // standard renderer, already processed
        try {
          return expressionKey(JSON.parse(signal.expression)) === key;
        } catch {
          return false;
        }
      })
      .map((signal) => signal.range)
  );
  return {
    raw: merge(selected.map((tile) => tile.raw)),
    processed: merge(processed),
    tiles: selected.length,
  };
}

/** Combine compatible histograms; returns null when none (older servers) or bucket layouts differ. */
export function mergeHistograms(
  histograms: SignalHistogram[]
): SignalHistogram | null {
  if (!histograms.length) return null;
  const minExponent = histograms[0].minExponent;
  const counts = new Map<number, number>();
  let zeros = 0;
  for (const histogram of histograms) {
    if (
      !histogram ||
      histogram.minExponent !== minExponent ||
      !Array.isArray(histogram.buckets)
    )
      return null;
    zeros += Number.isFinite(histogram.zeros) ? histogram.zeros : 0;
    for (const entry of histogram.buckets) {
      const [bucket, value] = entry;
      if (
        Number.isSafeInteger(bucket) &&
        bucket >= 0 &&
        Number.isFinite(value) &&
        value > 0
      )
        counts.set(bucket, (counts.get(bucket) ?? 0) + value);
    }
  }
  return {
    minExponent,
    zeros,
    buckets: [...counts.entries()].sort((a, b) => a[0] - b[0]),
  };
}

/**
 * Upper edge of the bucket containing the requested quantile. With `includeZeros`, zero
 * pixels count as the lowest values (matching whole-map threshold quantiles); a quantile
 * that falls inside the zeros yields null. Negative values are never counted.
 * Accuracy is one quarter-octave bucket (at most a factor 1.25), which is sufficient for slider limits.
 */
export function histogramQuantile(
  histogram: SignalHistogram | null | undefined,
  quantile: number,
  options?: { includeZeros?: boolean }
): number | null {
  if (!histogram || !histogram.buckets.length) return null;
  const q = Math.max(0, Math.min(1, quantile));
  const positive = histogram.buckets.reduce((sum, [, value]) => sum + value, 0);
  const zeros =
    options?.includeZeros && Number.isFinite(histogram.zeros)
      ? Math.max(0, histogram.zeros)
      : 0;
  const total = positive + zeros;
  if (!(positive > 0)) return null;
  const target = q * total;
  if (target <= zeros) return null;
  let cumulative = zeros;
  for (const [bucket, value] of histogram.buckets) {
    cumulative += value;
    if (cumulative >= target) {
      const exponent = Math.floor(bucket / 4) + histogram.minExponent;
      return Math.pow(2, exponent) * (1 + ((bucket % 4) + 1) / 4);
    }
  }
  const [bucket] = histogram.buckets[histogram.buckets.length - 1];
  return (
    Math.pow(2, Math.floor(bucket / 4) + histogram.minExponent) *
    (1 + ((bucket % 4) + 1) / 4)
  );
}

/**
 * Slider limit that keeps typical thresholds usable on heavy-tailed Hi-C signal. Display
 * thresholds are usually near the 99.5th percentile while the exact maximum (and even the
 * 99.9th percentile, dominated by the diagonal) can be orders of magnitude larger and would
 * pin both handles to the left. The limit is 4 x q99.5 (a q99.5 threshold sits at ~25%),
 * never above the exact maximum. Falls back to the maximum without histogram data.
 */
export function robustUpperLimit(
  range: FiniteRange | null | undefined
): number | null {
  if (!range || range.max == null) return null;
  // Prefer the all-pixel quantile (like opening thresholds); maps that are almost all
  // zeros fall back to the quantile of non-zero pixels.
  const q995 =
    histogramQuantile(range.histogram, 0.995, { includeZeros: true }) ??
    histogramQuantile(range.histogram, 0.995);
  if (q995 == null) return range.max;
  const robust = 4 * q995;
  return robust > 0 && robust < range.max ? robust : range.max;
}
