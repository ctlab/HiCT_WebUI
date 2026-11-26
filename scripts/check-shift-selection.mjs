import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/app/core/mapmanagers/shiftSelection.ts", import.meta.url),
  "utf8"
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const { resolveShiftSelection, expandRangeToUnits, reconcileSelectedContigs } =
  await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const click = (rowBp, colBp = rowBp) => ({ kind: "click", rowBp, colBp });
const drag = (aBp, bBp) => ({ kind: "drag", aBp, bBp });
const identity = (bp) => bp;
const snap = {
  toVisibleStart: identity,
  toVisibleEnd: identity,
  toleranceBp: 3,
};
const layout = {
  prefixSumBp: [0, 60, 110, 170, 210, 270, 330, 334, 338, 420, 500, 580],
  contigIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  scaffolds: [
    { id: 12, startBP: 60, endBP: 210, contigCount: 3 },
    { id: 13, startBP: 338, endBP: 500, contigCount: 2 },
    { id: 14, startBP: 210, endBP: 270, contigCount: 1 },
  ],
  shownEndBp: 580,
};
const coarse = {
  ...snap,
  toVisibleStart: (bp) => (bp >= 330 && bp < 338 ? 338 : bp),
  toVisibleEnd: (bp) => (bp > 330 && bp <= 338 ? 330 : bp),
};
const cases = [
  [click(240), [5]],
  [click(140), [2, 3, 4], [12]],
  [drag(30, 140), [1, 2, 3, 4], [12]],
  [drag(300, 140), [2, 3, 4, 5, 6], [12]],
  [drag(80, 150), [2, 3, 4], [12]],
  [drag(460, 600), [9, 10, 11], [13]],
  [drag(-20, 240), [1, 2, 3, 4, 5], [12]],
  [drag(230, 272), [5]],
  [drag(300, 360), [6, 7, 8, 9, 10], [13], coarse],
  [click(240, 455), []],
  [drag(210, 210), []],
];
for (const [gesture, ids, scaffolds = [], snapping = snap] of cases) {
  const result = resolveShiftSelection(layout, gesture, snapping);
  assert.deepEqual(result.contigIds, ids, JSON.stringify(gesture));
  assert.deepEqual(result.scaffoldIds, scaffolds);
  if (ids.length) {
    assert.equal(result.startBP, layout.prefixSumBp[ids[0] - 1]);
    assert.equal(result.endBP, layout.prefixSumBp[ids.at(-1)]);
    assert.equal(result.status, undefined);
  } else {
    assert.equal(
      result.status,
      "Shift-drag across the diagonal to select contigs"
    );
  }
  if (gesture.kind === "drag") {
    assert.deepEqual(
      resolveShiftSelection(layout, drag(gesture.bBp, gesture.aBp), snapping),
      result
    );
  }
}
assert.deepEqual(
  resolveShiftSelection(layout, drag(300, 338), coarse).contigIds,
  [6]
);
assert.deepEqual(
  resolveShiftSelection({ ...layout, shownEndBp: 500 }, drag(460, 750), snap)
    .contigIds,
  [9, 10]
);

const reversed = {
  ...layout,
  contigIds: [1, 4, 3, 2, ...layout.contigIds.slice(4)],
};
assert.deepEqual(
  reconcileSelectedContigs(reversed, [2, 3, 4]).contigIds,
  [4, 3, 2]
);
assert.deepEqual(reconcileSelectedContigs(layout, [2, 3, 4]).scaffoldIds, [12]);
assert.deepEqual(
  reconcileSelectedContigs({ ...layout, scaffolds: [] }, [2, 3, 4]).contigIds,
  [2, 3, 4]
);
assert.deepEqual(
  reconcileSelectedContigs({ ...layout, scaffolds: [] }, [2, 3, 4]).scaffoldIds,
  []
);
assert.deepEqual(reconcileSelectedContigs(layout, [2, 99, 4]).contigIds, []);
assert.deepEqual(reconcileSelectedContigs(layout, [2, 5]).contigIds, []);

let seed = 867177;
const random = (limit) => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed % limit;
};
for (let trial = 0; trial < 500; trial++) {
  const count = 1 + random(40);
  const edges = [0];
  const ids = Array.from({ length: count }, (_, i) => {
    edges.push(edges.at(-1) + 1 + random(16));
    return i * 2 + 1;
  });
  const scaffolds = [];
  const units = [];
  for (let i = 0; i < count; ) {
    const size = Math.min(count - i, random(3) === 0 ? 2 + random(4) : 1);
    const id = size > 1 ? 100 + i : undefined;
    const unit = {
      start: edges[i],
      end: edges[i + size],
      ids: ids.slice(i, i + size),
      id,
    };
    units.push(unit);
    if (id !== undefined)
      scaffolds.push({
        id,
        startBP: unit.start,
        endBP: unit.end,
        contigCount: size,
      });
    i += size;
  }
  const limit = edges.at(-1);
  const candidate = {
    prefixSumBp: edges,
    contigIds: ids,
    scaffolds,
    shownEndBp: limit,
  };
  const borders = units.map((unit) => unit.start).concat(limit);
  const nearest = (bp) =>
    borders
      .filter((edge) => Math.abs(edge - bp) <= 3)
      .sort((a, b) => Math.abs(a - bp) - Math.abs(b - bp) || a - b)[0] ?? bp;
  const clamp = (bp) => Math.max(0, Math.min(limit, bp));
  for (let gesture = 0; gesture < 20; gesture++) {
    const a = random(limit + 17) - 8;
    const b = random(limit + 17) - 8;
    const start = clamp(Math.min(a, b));
    const end = clamp(Math.max(a, b));
    const partialStart = units.find(
      (u) => u.start < start && start < u.end && u.end - u.start < 3
    );
    const partialEnd = units.find(
      (u) => u.start < end && end < u.end && u.end - u.start < 3
    );
    const snappedStart = partialStart?.end ?? nearest(start);
    const snappedEnd = partialEnd?.start ?? nearest(end);
    const touched =
      start === end || snappedStart >= snappedEnd
        ? []
        : units.filter((u) => u.start < snappedEnd && u.end > snappedStart);
    const result = resolveShiftSelection(candidate, drag(a, b), snap);
    assert.deepEqual(
      result.contigIds,
      touched.flatMap((u) => u.ids)
    );
    assert.deepEqual(
      result.scaffoldIds,
      touched.filter((u) => u.id !== undefined).map((u) => u.id)
    );
    assert.deepEqual(
      resolveShiftSelection(candidate, drag(b, a), snap),
      result
    );
    if (!touched.length) continue;
    assert.equal(result.startBP, touched[0].start);
    assert.equal(result.endBP, touched.at(-1).end);
    assert(edges.includes(result.startBP) && edges.includes(result.endBP));
    assert.deepEqual(
      expandRangeToUnits(candidate, result.startBP, result.endBP),
      result
    );
  }
}
console.log(
  "Shift selection passed mockup cases, edit reconciliation and 10,000 seeded gestures."
);
