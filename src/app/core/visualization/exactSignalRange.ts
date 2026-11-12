export type ExactRange = { min: number; max: number; count: number };
export type StatisticsBlock = {
  revision: string;
  size: number;
  rows?: number;
  cols?: number;
  min?: number | null;
  max?: number | null;
  count?: number;
};

/** Visit every pixel, including implicit zeros, without retaining matrix data. */
export async function scanExactSignalRange(
  snapshot: StatisticsBlock,
  query: (row: number, col: number) => Promise<StatisticsBlock>,
  signal: AbortSignal,
  progress: (completed: number, total: number) => void
): Promise<ExactRange> {
  const edge = 512;
  const blocks = Math.ceil(snapshot.size / edge);
  const total = blocks * blocks;
  if (
    !Number.isSafeInteger(snapshot.size) ||
    snapshot.size <= 0 ||
    !Number.isSafeInteger(total)
  )
    throw new Error("No valid resolution extent is available.");
  let min = Infinity,
    max = -Infinity,
    count = 0,
    completed = 0;
  progress(0, total);
  for (let row = 0; row < snapshot.size; row += edge) {
    for (let col = 0; col < snapshot.size; col += edge) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const block = await query(row, col);
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      if (block.revision !== snapshot.revision || block.size !== snapshot.size)
        throw new Error("Map changed during the statistics scan.");
      const rows = Math.min(edge, snapshot.size - row);
      const cols = Math.min(edge, snapshot.size - col);
      const { count: finiteCount, min: blockMin, max: blockMax } = block;
      if (
        block.rows !== rows ||
        block.cols !== cols ||
        typeof finiteCount !== "number" ||
        !Number.isSafeInteger(finiteCount) ||
        finiteCount < 0 ||
        finiteCount > rows * cols
      )
        throw new Error(
          "Incomplete statistics block; exact limits are unavailable."
        );
      if (finiteCount > 0) {
        if (
          typeof blockMin !== "number" ||
          typeof blockMax !== "number" ||
          !Number.isFinite(blockMin) ||
          !Number.isFinite(blockMax) ||
          blockMin > blockMax
        )
          throw new Error("Invalid statistics block.");
        min = Math.min(min, blockMin);
        max = Math.max(max, blockMax);
        count += finiteCount;
      }
      progress(++completed, total);
    }
  }
  if (!count) throw new Error("No finite signal values at this resolution.");
  return { min, max, count };
}
