export type Layout = {
  prefixSumBp: number[];
  contigIds: number[];
  scaffolds: {
    id: number;
    startBP: number;
    endBP: number;
    contigCount: number;
  }[];
  shownEndBp: number;
};

export type Gesture =
  | { kind: "drag"; aBp: number; bBp: number }
  | { kind: "click"; rowBp: number; colBp: number };

export type Snap = {
  toVisibleStart(bp: number): number;
  toVisibleEnd(bp: number): number;
  toleranceBp: number;
};

export type ShiftSelection = {
  startBP: number;
  endBP: number;
  contigIds: number[];
  scaffoldIds: number[];
  status?: string;
};

type Unit = {
  startBP: number;
  endBP: number;
  first: number;
  end: number;
  scaffoldId?: number;
};

const EMPTY_HINT = "Shift-drag across the diagonal to select contigs";

const empty = (): ShiftSelection => ({
  startBP: 0,
  endBP: 0,
  contigIds: [],
  scaffoldIds: [],
  status: EMPTY_HINT,
});

function assemblyUnits(layout: Layout): Unit[] {
  const { prefixSumBp, contigIds, scaffolds } = layout;
  const multi = new Map(
    scaffolds.filter((s) => s.contigCount >= 2).map((s) => [s.startBP, s])
  );
  const units: Unit[] = [];
  for (let first = 0; first < contigIds.length; ) {
    const startBP = prefixSumBp[first];
    const scaffold = multi.get(startBP);
    const end = first + (scaffold?.contigCount ?? 1);
    units.push({
      startBP,
      endBP: prefixSumBp[end],
      first,
      end,
      scaffoldId: scaffold?.id,
    });
    first = end;
  }
  return units;
}

function overlap(units: Unit[], startBP: number, endBP: number): Unit[] {
  return endBP > startBP
    ? units.filter((unit) => unit.startBP < endBP && unit.endBP > startBP)
    : [];
}

function selection(layout: Layout, units: Unit[]): ShiftSelection {
  const first = units[0];
  const last = units.at(-1);
  if (!first || !last) return empty();
  return {
    startBP: first.startBP,
    endBP: last.endBP,
    contigIds: layout.contigIds.slice(first.first, last.end),
    scaffoldIds: units.flatMap((unit) =>
      unit.scaffoldId === undefined ? [] : [unit.scaffoldId]
    ),
  };
}

export function expandRangeToUnits(
  layout: Layout,
  startBP: number,
  endBP: number
): ShiftSelection {
  // Programmatic selection and edit reconciliation can include contigs outside the displayed map.
  return selection(layout, overlap(assemblyUnits(layout), startBP, endBP));
}

export function reconcileSelectedContigs(
  layout: Layout,
  previousIds: readonly number[]
): ShiftSelection {
  const selected = new Set(previousIds);
  const orders = layout.contigIds.flatMap((id, index) =>
    selected.has(id) ? [index] : []
  );
  const first = orders[0];
  const last = orders.at(-1);
  if (
    first === undefined ||
    last === undefined ||
    orders.length !== selected.size ||
    last - first + 1 !== orders.length
  ) {
    return empty();
  }
  return expandRangeToUnits(
    layout,
    layout.prefixSumBp[first],
    layout.prefixSumBp[last + 1]
  );
}

function snapToUnitBorder(
  bp: number,
  borders: number[],
  tolerance: number
): number {
  let best = bp;
  let distance = tolerance;
  for (const border of borders) {
    const diff = Math.abs(border - bp);
    if (diff > distance || (diff === distance && best !== bp)) continue;
    best = border;
    distance = diff;
  }
  return best;
}

export function resolveShiftSelection(
  layout: Layout,
  gesture: Gesture,
  snap: Snap
): ShiftSelection {
  const units = assemblyUnits(layout);
  const limit = layout.shownEndBp;
  if (gesture.kind === "click") {
    const { rowBp, colBp } = gesture;
    if (
      [rowBp, colBp].some((bp) => !Number.isFinite(bp) || bp < 0 || bp >= limit)
    )
      return empty();
    const unit = units.find(
      ({ startBP, endBP }) =>
        Math.min(rowBp, colBp) >= startBP && Math.max(rowBp, colBp) < endBP
    );
    return unit ? selection(layout, [unit]) : empty();
  }

  const clamp = (bp: number) => Math.min(limit, Math.max(0, bp));
  const start = clamp(
    snap.toVisibleStart(clamp(Math.min(gesture.aBp, gesture.bBp)))
  );
  const end = clamp(
    snap.toVisibleEnd(clamp(Math.max(gesture.aBp, gesture.bBp)))
  );
  if (!(end > start)) return empty();

  const tolerance = Math.max(0, snap.toleranceBp);
  const visibleBorder = (bp: number) =>
    bp <= limit &&
    (snap.toVisibleStart(bp) === bp || snap.toVisibleEnd(bp) === bp);
  const borders = units
    .map((unit) => unit.startBP)
    .concat(limit)
    .filter(
      (bp) =>
        (Math.abs(bp - start) <= tolerance ||
          Math.abs(bp - end) <= tolerance) &&
        visibleBorder(bp)
    );
  let snappedStart = snapToUnitBorder(start, borders, tolerance);
  let snappedEnd = snapToUnitBorder(end, borders, tolerance);
  const touched = overlap(units, start, end);
  const first = touched[0];
  const last = touched.at(-1);
  // Tolerance must not round a partially covered tiny unit into the selection.
  if (
    first &&
    first.endBP - first.startBP < tolerance &&
    start > first.startBP
  ) {
    snappedStart = Math.max(snappedStart, first.endBP);
  }
  if (last && last.endBP - last.startBP < tolerance && end < last.endBP) {
    snappedEnd = Math.min(snappedEnd, last.startBP);
  }
  return selection(layout, overlap(units, snappedStart, snappedEnd));
}
