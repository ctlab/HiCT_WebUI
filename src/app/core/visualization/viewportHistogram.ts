/** Display-axis bins. Out-of-range samples are reported, never piled into edge bins. */
export function viewportHistogramBins(
  values: Float32Array,
  min: number,
  max: number,
  position: (value: number) => number,
  bins = 64
) {
  const counts = Array<number>(bins).fill(0);
  let below = 0,
    above = 0,
    nonfinite = 0,
    zeros = 0;
  if (!(max > min) || !Number.isInteger(bins) || bins < 1 || bins > 512)
    throw new Error("Invalid histogram axis.");
  for (const value of values) {
    if (!Number.isFinite(value)) {
      nonfinite++;
      continue;
    }
    if (value === 0) zeros++;
    const p = position(value);
    if (!Number.isFinite(p) || p < min) {
      below++;
      continue;
    }
    if (p > max) {
      above++;
      continue;
    }
    counts[Math.min(bins - 1, Math.floor(((p - min) / (max - min)) * bins))]++;
  }
  return { counts, below, above, nonfinite, zeros };
}

/** Catmull–Rom display curve with bounded Bezier controls, not a density estimate. */
export function histogramCurve(counts: readonly number[]): string {
  if (!counts.length) return "";
  const peak = Math.max(1, ...counts);
  const points = counts.map((count, i) => ({
    x: (1000 * (i + 0.5)) / counts.length,
    y: 60 - 56 * Math.sqrt(Math.max(0, count) / peak),
  }));
  const clampY = (y: number) => Math.max(4, Math.min(60, y));
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[Math.max(0, i - 1)],
      b = points[i],
      c = points[i + 1],
      d = points[Math.min(points.length - 1, i + 2)];
    path += ` C ${b.x + (c.x - a.x) / 6} ${clampY(b.y + (c.y - a.y) / 6)} ${
      c.x - (d.x - b.x) / 6
    } ${clampY(c.y - (d.y - b.y) / 6)} ${c.x} ${c.y}`;
  }
  return path;
}

/** Exact sample quantiles; no percentile computed from histogram bin centers. */
export function viewportLevels(values: Float32Array, oe: boolean) {
  const finite = Array.from(values)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!finite.length) throw new Error("No finite viewport signals.");
  let lower = finite[Math.floor((finite.length - 1) * 0.005)],
    upper = finite[Math.ceil((finite.length - 1) * 0.995)];
  if (oe) {
    // Zero is a measured depletion but cannot define a logarithmic color bound.
    const positive = finite.filter((value) => value > 0);
    lower = positive[Math.floor((positive.length - 1) * 0.005)] ?? 0.5;
    upper = positive[Math.ceil((positive.length - 1) * 0.995)] ?? 2;
    if (!(lower < 1)) lower = 0.5;
    if (!(upper > 1)) upper = 2;
  } else if (!(upper > lower)) {
    if (lower === 0) {
      upper = 1;
    } else {
      const padding = Math.max(1e-6, Math.abs(lower) * 0.05);
      lower -= padding;
      upper += padding;
    }
  }
  return { lower, upper };
}
