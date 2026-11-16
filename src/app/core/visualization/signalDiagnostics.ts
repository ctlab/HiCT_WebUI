import type { ContactMapManager } from "../mapmanagers/ContactMapManager";

export type SignalBounds = {
  unit?: "PIXELS" | "BINS";
  bpResolution: number;
  startRowPx: number;
  endRowPx: number;
  startColPx: number;
  endColPx: number;
};
export type SignalMode =
  | "RAW_COUNTS"
  | "COOLER_WEIGHTED"
  | "TRADITIONAL_NORMALIZED"
  | "PIPELINE_SIGNAL";
export type SignalHistogram = {
  /** Bounded query samples retained for local rebinning without repeated I/O. */
  values: Float32Array;
  min: number;
  max: number;
  counts: number[];
  count: number;
  sampled: boolean;
  resolution: number;
  domain: "matrix" | "row" | "column" | "scalar";
};

/** Infer coordinate dependencies only; evaluation remains in the server pipeline. */
export function histogramSignalDomain(
  expression: Record<string, unknown>
): SignalHistogram["domain"] {
  const dependencies = (value: unknown, depth = 0): number => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      depth > 128
    )
      return 3;
    const node = value as Record<string, unknown>;
    const input = (key: string) => dependencies(node[key], depth + 1);
    switch (
      String(node.type ?? "source")
        .trim()
        .toLowerCase()
    ) {
      case "constant":
        return 0;
      case "track1d":
        return ["COL", "COLUMN"].includes(
          String(node.axis ?? "ROW")
            .trim()
            .toUpperCase()
        )
          ? 2
          : 1;
      case "dynamic": {
        const field = String(node.field ?? "")
          .trim()
          .toUpperCase();
        if (["ROW_BP", "ROW_BIN", "ROW_PX", "ROW_WEIGHT"].includes(field))
          return 1;
        if (["COL_BP", "COL_BIN", "COL_PX", "COL_WEIGHT"].includes(field))
          return 2;
        if (
          [
            "BP_RESOLUTION",
            "RESOLUTION_SCALING_COEFF",
            "RESOLUTION_LINEAR_SCALING_COEFF",
          ].includes(field)
        )
          return 0;
        return 3;
      }
      case "unary":
      case "log":
      case "clamp":
        return input("input");
      case "log_input":
        return input("input") | input("base");
      case "binary":
        return input("left") | input("right");
      default:
        return 3;
    }
  };
  return (["scalar", "row", "column", "matrix"] as const)[
    dependencies(expression)
  ];
}

export function diagnosticBounds(
  manager: ContactMapManager,
  selection = false
): SignalBounds {
  const layers = manager.viewAndLayersManager;
  const descriptor = layers.currentViewState.resolutionDesciptor;
  const extent = selection
    ? layers.selectionInteractions.contigSelectExtent.getExtent()
    : manager.getView().calculateExtent(manager.getMap().getSize());
  if (!extent || !extent.every(Number.isFinite))
    throw new Error("Select a rectangle first.");
  if (descriptor.displayGrid === "SEQUENCE_BP")
    return layers.getNativeMatrixBounds(extent);
  const bounds = layers.getActiveMapPixelBounds(descriptor.bpResolution);
  const scale = descriptor.pixelResolution;
  const result = {
    bpResolution: descriptor.bpResolution,
    startRowPx: Math.max(bounds.rowStartPx, Math.floor(-extent[3] / scale)),
    endRowPx: Math.min(bounds.rowEndPx, Math.ceil(-extent[1] / scale)),
    startColPx: Math.max(bounds.colStartPx, Math.floor(extent[0] / scale)),
    endColPx: Math.min(bounds.colEndPx, Math.ceil(extent[2] / scale)),
  };
  if (
    result.endRowPx <= result.startRowPx ||
    result.endColPx <= result.startColPx
  )
    throw new Error("The region does not intersect the map.");
  return result;
}

export function histogram(
  values: Float32Array,
  bins = 64
): Omit<SignalHistogram, "sampled" | "resolution" | "domain" | "values"> {
  let min = Infinity,
    max = -Infinity,
    count = 0;
  for (const value of values)
    if (Number.isFinite(value)) {
      min = Math.min(min, value);
      max = Math.max(max, value);
      count++;
    }
  if (!count)
    throw new Error("No finite signal values are available in this region.");
  const counts = Array<number>(bins).fill(0);
  for (const value of values)
    if (Number.isFinite(value))
      counts[
        max === min
          ? 0
          : Math.min(bins - 1, Math.floor(((value - min) / (max - min)) * bins))
      ]++;
  return { min, max, count, counts };
}

/** Two-dimensional strata avoid sampling one column repeatedly on square maps. */
export function histogramTileIndices(
  rows: number,
  cols: number,
  limit = 16
): number[] {
  if (rows * cols <= limit)
    return Array.from({ length: rows * cols }, (_, i) => i);
  const rowStrata = Math.min(
    rows,
    limit,
    Math.max(1, Math.round(Math.sqrt((limit * rows) / cols)))
  );
  const colStrata = Math.min(cols, Math.max(1, Math.floor(limit / rowStrata)));
  const indices: number[] = [];
  for (let r = 0; r < rowStrata; r++)
    for (let c = 0; c < colStrata; c++)
      indices.push(
        Math.floor(((r + 0.5) * rows) / rowStrata) * cols +
          Math.floor(((c + 0.5) * cols) / colStrata)
      );
  return indices;
}

/** Bounded memory and request sizes, with explicit stratified sampling for large regions. */
export async function querySignalHistogram(
  manager: ContactMapManager,
  bounds: SignalBounds,
  options: {
    source?: "PRIMARY" | "SECONDARY";
    signalMode?: SignalMode;
    expression?: Record<string, unknown>;
    triangle?: "both" | "upper" | "lower";
    signal?: AbortSignal;
    domain?: "auto" | "matrix";
    /** Smaller bounded blocks for interactive viewport previews. */
    tileEdge?: 64 | 128 | 256;
    concurrency?: 1 | 2 | 4;
  } = {}
): Promise<SignalHistogram> {
  const domain =
    options.domain === "auto" &&
    options.expression &&
    options.signalMode === "PIPELINE_SIGNAL"
      ? histogramSignalDomain(options.expression)
      : "matrix";
  bounds = { ...bounds };
  if (domain === "row" || domain === "scalar")
    bounds.endColPx = Math.min(bounds.endColPx, bounds.startColPx + 1);
  if (domain === "column" || domain === "scalar")
    bounds.endRowPx = Math.min(bounds.endRowPx, bounds.startRowPx + 1);
  if (
    bounds.endRowPx <= bounds.startRowPx ||
    bounds.endColPx <= bounds.startColPx
  )
    throw new Error("The region does not intersect the map.");
  const maxTiles = 16;
  const edge = options.tileEdge ?? 256;
  const rowEdge = domain === "matrix" ? edge : domain === "row" ? 4096 : 1;
  const colEdge = domain === "matrix" ? edge : domain === "column" ? 4096 : 1;
  const rows = Math.ceil((bounds.endRowPx - bounds.startRowPx) / rowEdge);
  const cols = Math.ceil((bounds.endColPx - bounds.startColPx) / colEdge);
  const tileCount = rows * cols;
  const tileIndices = histogramTileIndices(rows, cols, maxTiles);
  const n = tileIndices.length;
  const values = new Float32Array(n * rowEdge * colEdge);
  let count = 0;
  const api = manager.networkManager.requestManager;
  const queryBlock = async (i: number) => {
    if (options.signal?.aborted || manager.isDisposed)
      throw new DOMException("Cancelled", "AbortError");
    const index = tileIndices[i];
    const startRowPx = bounds.startRowPx + Math.floor(index / cols) * rowEdge;
    const startColPx = bounds.startColPx + (index % cols) * colEdge;
    const endRowPx = Math.min(bounds.endRowPx, startRowPx + rowEdge);
    const endColPx = Math.min(bounds.endColPx, startColPx + colEdge);
    const result = await api.queryMatrixFloat32({
      ...bounds,
      ...options,
      startRowPx,
      startColPx,
      endRowPx,
      endColPx,
    });
    if (options.signal?.aborted || manager.isDisposed)
      throw new DOMException("Cancelled", "AbortError");
    if (
      result.rows !== endRowPx - startRowPx ||
      result.cols !== endColPx - startColPx ||
      result.values.length !== result.rows * result.cols
    )
      throw new Error("Histogram query was interrupted. Refresh to try again.");
    return { result, startRowPx, startColPx };
  };
  const concurrency = options.concurrency ?? 1;
  for (let i = 0; i < n; i += concurrency) {
    const blocks = await Promise.all(
      Array.from({ length: Math.min(concurrency, n - i) }, (_, j) =>
        queryBlock(i + j)
      )
    );
    for (const { result, startRowPx, startColPx } of blocks) {
      for (let row = 0; row < result.rows; row++)
        for (let col = 0; col < result.cols; col++) {
          if (
            domain === "matrix" &&
            options.triangle === "upper" &&
            startRowPx + row > startColPx + col
          )
            continue;
          if (
            domain === "matrix" &&
            options.triangle === "lower" &&
            startRowPx + row < startColPx + col
          )
            continue;
          values[count++] = result.values[row * result.cols + col];
        }
    }
  }
  return {
    ...histogram(values.subarray(0, count)),
    values: values.subarray(0, count),
    sampled: tileCount > n,
    resolution: bounds.bpResolution,
    domain,
  };
}
