export type FiniteRange = { min: number | null; max: number | null; count: number };
export type TileSignals = {
  source: string; bpResolution: number; revision: string; raw: FiniteRange;
  processed: { expression: string; range: FiniteRange }[];
};

/** JSON property order is immaterial; expression values and structure are not. */
export function expressionKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(expressionKey).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${expressionKey(child)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function aggregateTileSignals(tiles: TileSignals[], source: string, bpResolution: number,
  expression: unknown): { raw: FiniteRange; processed: FiniteRange; tiles: number } | undefined {
  const selected = tiles.filter(tile => tile.source === source && tile.bpResolution === bpResolution);
  if (!selected.length || new Set(selected.map(tile => tile.revision)).size !== 1) return;
  const key = expressionKey(expression);
  function merge(ranges: FiniteRange[]): FiniteRange {
    let min = Infinity, max = -Infinity, count = 0;
    for (const range of ranges) {
      if (range && Number.isSafeInteger(range.count) && range.count > 0 &&
          typeof range.min === 'number' && typeof range.max === 'number' &&
          Number.isFinite(range.min) && Number.isFinite(range.max) && range.min <= range.max) {
        min = Math.min(min, range.min); max = Math.max(max, range.max); count += range.count;
      }
    }
    return { min: count ? min : null, max: count ? max : null, count };
  }
  const processed = selected.flatMap(tile => tile.processed.filter(signal => {
    if (signal.expression === '') return true; // standard renderer, already processed
    try { return expressionKey(JSON.parse(signal.expression)) === key; } catch { return false; }
  }).map(signal => signal.range));
  return { raw: merge(selected.map(tile => tile.raw)), processed: merge(processed), tiles: selected.length };
}
