export type HistogramBins = {
  x: number[];
  widths: number[];
  counts: number[];
  edges: number[];
  zeros: number;
  negatives: number;
  nonfinite: number;
};

/** Logarithmic bins are computed from samples, never from linear-bin centers. */
export function histogramPlotBins(
  values: Float32Array,
  bins: number,
  logX: boolean,
  omitZero: boolean
): HistogramBins {
  if (!Number.isInteger(bins) || bins < 1 || bins > 512)
    throw new Error("Choose 1 to 512 bins.");
  let min = Infinity,
    max = -Infinity,
    zeros = 0,
    negatives = 0,
    nonfinite = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) {
      nonfinite++;
      continue;
    }
    if (value === 0) zeros++;
    if (value < 0) negatives++;
    if ((logX && value <= 0) || (omitZero && value === 0)) continue;
    const v = logX ? Math.log10(value) : value;
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  const empty = {
    x: [],
    widths: [],
    counts: [],
    edges: [],
    zeros,
    negatives,
    nonfinite,
  };
  if (!Number.isFinite(min)) return empty;
  if (min === max) {
    const pad = logX ? 0.05 : Math.max(0.5, Math.abs(min) * 0.05);
    min -= pad;
    max += pad;
    bins = 1;
  }
  const step = (max - min) / bins;
  const edges = Array.from({ length: bins + 1 }, (_, i) =>
    logX ? 10 ** (min + i * step) : min + i * step
  );
  const counts = Array<number>(bins).fill(0);
  for (const value of values) {
    if (
      !Number.isFinite(value) ||
      (logX && value <= 0) ||
      (omitZero && value === 0)
    )
      continue;
    const v = logX ? Math.log10(value) : value;
    counts[Math.max(0, Math.min(bins - 1, Math.floor((v - min) / step)))]++;
  }
  return {
    x: counts.map((_, i) => (edges[i] + edges[i + 1]) / 2),
    widths: counts.map((_, i) => edges[i + 1] - edges[i]),
    counts,
    edges,
    zeros,
    negatives,
    nonfinite,
  };
}
