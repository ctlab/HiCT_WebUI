import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(relative, overrides = {}) {
  const file = new URL(relative, import.meta.url);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (name) => overrides[name] ?? require(name),
    Float32Array,
    DOMException,
  });
  return module.exports;
}
const { histogram, querySignalHistogram, histogramSignalDomain } = load(
  "../src/app/core/visualization/signalDiagnostics.ts"
);
const { histogramPlotBins } = load(
  "../src/app/core/visualization/histogramPlot.ts"
);
const logarithmic = histogramPlotBins(
  new Float32Array([0, 0, -1, 1, 10, 100, 1000, NaN]),
  3,
  true,
  false
);
assert.deepEqual([...logarithmic.counts], [1, 1, 2]);
assert.equal(logarithmic.zeros, 2);
assert.equal(logarithmic.negatives, 1);
assert.equal(logarithmic.nonfinite, 1);
assert.deepEqual([...logarithmic.edges], [1, 10, 100, 1000]);
assert.equal(
  histogramPlotBins(new Float32Array([0, -2]), 64, true, false).counts.length,
  0
);
assert.deepEqual(
  [...histogramPlotBins(new Float32Array([37, 37]), 64, true, false).counts],
  [2]
);
assert.equal(
  histogramPlotBins(
    new Float32Array([-1, 0, 1]),
    64,
    false,
    true
  ).counts.reduce((a, b) => a + b),
  2
);
assert.throws(
  () => histogramPlotBins(new Float32Array([1]), 0, false, false),
  /bins/
);
assert.throws(() => histogram(new Float32Array([NaN, Infinity])), /No finite/);
const constant = histogram(new Float32Array([86, 86, NaN]));
assert.equal(constant.min, 86);
assert.equal(constant.max, 86);
assert.equal(constant.counts[0], 2);
const signed = histogram(new Float32Array([-10, 0, 10, NaN]), 2);
assert.deepEqual([...signed.counts], [1, 2]);
let requests = 0;
const manager = {
  networkManager: {
    requestManager: {
      queryMatrixFloat32: async (q) => {
        requests++;
        const rows = q.endRowPx - q.startRowPx,
          cols = q.endColPx - q.startColPx;
        return { rows, cols, values: new Float32Array(rows * cols).fill(2) };
      },
    },
  },
};
const small = {
  bpResolution: 1000,
  startRowPx: 0,
  endRowPx: 3,
  startColPx: 0,
  endColPx: 3,
};
assert.equal(
  (await querySignalHistogram(manager, small, { triangle: "upper" })).count,
  6
);
assert.equal(
  (await querySignalHistogram(manager, small, { triangle: "lower" })).count,
  6
);
requests = 0;
const sampled = await querySignalHistogram(manager, {
  ...small,
  endRowPx: 10000,
  endColPx: 10000,
});
assert.equal(requests, 16);
assert.equal(sampled.sampled, true);
await assert.rejects(
  querySignalHistogram(manager, small, { signal: { aborted: true } }),
  /Cancelled/
);

const rowTrack = { type: "track1d", trackId: "coverage", axis: "ROW" };
const colTrack = { ...rowTrack, axis: " column " };
const scalarSignal = { type: "constant", value: 37 };
assert.equal(histogramSignalDomain(rowTrack), "row");
assert.equal(histogramSignalDomain(colTrack), "column");
assert.equal(histogramSignalDomain(scalarSignal), "scalar");
assert.equal(
  histogramSignalDomain({ type: "dynamic", field: "DIAG_BIN_DISTANCE" }),
  "matrix"
);
assert.equal(histogramSignalDomain({ type: "unknown" }), "matrix");
const scaledTrack = {
  type: "binary",
  op: "MUL",
  left: rowTrack,
  right: scalarSignal,
};
assert.equal(histogramSignalDomain(scaledTrack), "row");
const mixedTracks = { ...scaledTrack, right: colTrack };
assert.equal(histogramSignalDomain(mixedTracks), "matrix");
for (const [expression, domain, count] of [
  [rowTrack, "row", 3],
  [colTrack, "column", 5],
  [scalarSignal, "scalar", 1],
  [scaledTrack, "row", 3],
  [mixedTracks, "matrix", 15],
]) {
  const result = await querySignalHistogram(
    manager,
    { ...small, endColPx: 5 },
    { expression, domain: "auto", signalMode: "PIPELINE_SIGNAL" }
  );
  assert.equal(result.domain, domain);
  assert.equal(result.count, count);
  assert.equal(result.sampled, false);
}
const selectionTrack = await querySignalHistogram(manager, small, {
  expression: rowTrack,
  domain: "matrix",
  signalMode: "PIPELINE_SIGNAL",
  triangle: "upper",
});
assert.equal(
  selectionTrack.count,
  6,
  "Selection histograms count matrix cells, even for a row-valued processed signal"
);
requests = 0;
const longTrack = await querySignalHistogram(
  manager,
  { ...small, endRowPx: 200000 },
  { expression: rowTrack, domain: "auto", signalMode: "PIPELINE_SIGNAL" }
);
assert.equal(requests, 16);
assert.equal(longTrack.count, 65536);
assert.equal(longTrack.sampled, true);
const interruptedManager = {
  networkManager: {
    requestManager: {
      queryMatrixFloat32: async () => ({
        rows: 0,
        cols: 0,
        values: new Float32Array(),
      }),
    },
  },
};
await assert.rejects(
  querySignalHistogram(interruptedManager, small),
  /interrupted/
);

const common = load("../src/app/core/domain/common.ts");
const { default: Holder } = load(
  "../src/app/core/mapmanagers/ContigDimensionHolder.ts",
  {
    "@/CommonUtils": {
      default: { clamp: (x, lo, hi) => Math.min(hi, Math.max(lo, x)) },
      __esModule: true,
    },
    "../domain/common": common,
  }
);
for (const direction of [
  common.ContigDirection.FORWARD,
  common.ContigDirection.REVERSED,
]) {
  for (const length of [2000, 2501]) {
    const holder = new Holder([
      {
        contigId: 0,
        contigName: "ctg",
        contigLengthBp: length,
        direction,
        contigLengthBins: new Map([[1000, Math.ceil(length / 1000)]]),
        presenceAtResolution: new Map([
          [1000, common.ContigHideType.FORCED_SHOWN],
        ]),
      },
    ]);
    for (const bp of [0.5, 500.5, 1000.5, length - 0.5]) {
      const px = holder.getFractionalPxOfBp(bp, 1000);
      assert.ok(
        Math.abs(holder.getFractionalBpOfPx(px, 1000) - bp) < 1e-7,
        `${direction}/${length}/${bp}`
      );
    }
  }
}
console.log("Signal diagnostics and base-level coordinate regressions passed.");

const { scanExactSignalRange } = load(
  "../src/app/core/visualization/exactSignalRange.ts"
);
const snapshot = { revision: "test:1", size: 1025 };
const visited = [];
let progress = 0;
const exact = await scanExactSignalRange(
  snapshot,
  async (row, col) => {
    visited.push([row, col]);
    const rows = Math.min(512, snapshot.size - row),
      cols = Math.min(512, snapshot.size - col);
    return {
      ...snapshot,
      rows,
      cols,
      count: rows * cols,
      min: row === 1024 ? -3 : 0,
      max: row === 1024 && col === 1024 ? 16777217 : 10,
    };
  },
  new AbortController().signal,
  (done, total) => {
    progress = done / total;
  }
);
assert.equal(visited.length, 9);
assert.equal(exact.count, 1025 ** 2);
assert.equal(exact.min, -3);
assert.equal(exact.max, 16777217, "No float32 rounding of extrema");
assert.equal(progress, 1);
await assert.rejects(
  scanExactSignalRange(
    snapshot,
    async () => ({ ...snapshot, revision: "test:2" }),
    new AbortController().signal,
    () => {}
  ),
  /Map changed/
);
await assert.rejects(
  scanExactSignalRange(
    snapshot,
    async () => ({ ...snapshot, rows: 0, cols: 0, count: 0 }),
    new AbortController().signal,
    () => {}
  ),
  /Incomplete/
);
const abort = new AbortController();
abort.abort();
await assert.rejects(
  scanExactSignalRange(
    snapshot,
    async () => {
      throw new Error("Must not query");
    },
    abort.signal,
    () => {}
  ),
  /Cancelled/
);
const singleton = { revision: "test:1", size: 1 };
await assert.rejects(
  scanExactSignalRange(
    singleton,
    async () => ({
      ...singleton,
      rows: 1,
      cols: 1,
      count: 0,
      min: null,
      max: null,
    }),
    new AbortController().signal,
    () => {}
  ),
  /No finite/
);
console.log("Exact whole-resolution scan regressions passed.");

const { viewportHistogramBins, histogramCurve, viewportLevels } = load(
  "../src/app/core/visualization/viewportHistogram.ts"
);
const displayBins = viewportHistogramBins(
  new Float32Array([-5, 0, 0, 1, 2, 3, 5, NaN]),
  0,
  3,
  (x) => x,
  3
);
assert.deepEqual([...displayBins.counts], [2, 1, 2]);
assert.equal(displayBins.below, 1);
assert.equal(displayBins.above, 1);
assert.equal(displayBins.nonfinite, 1);
assert.equal(displayBins.zeros, 2);
const logBins = viewportHistogramBins(
  new Float32Array([1, 10, 100, 1000]),
  0,
  3,
  Math.log10,
  3
);
assert.deepEqual([...logBins.counts], [1, 1, 2]);
assert.throws(
  () => viewportHistogramBins(new Float32Array(), 1, 1, (x) => x),
  /axis/
);
const path = histogramCurve([0, 9, 0, 100, 1, 0]);
assert.ok(path.startsWith("M "));
assert.equal((path.match(/ C /g) || []).length, 5);
assert.ok(!/NaN|Infinity/.test(path));
assert.equal(histogramCurve([]), "");
const levels = viewportLevels(
  Float32Array.from({ length: 1001 }, (_, i) => i),
  false
);
assert.equal(levels.lower, 5);
assert.equal(levels.upper, 995);
const flatLevels = viewportLevels(new Float32Array([37, 37, NaN]), false);
assert.ok(flatLevels.lower < 37 && flatLevels.upper > 37);
const ratioLevels = viewportLevels(new Float32Array([0, 0.5, 2, NaN]), true);
assert.ok(ratioLevels.lower > 0 && ratioLevels.lower < 1);
assert.equal(ratioLevels.upper, 2);
assert.throws(() => viewportLevels(new Float32Array([NaN]), false), /finite/);
console.log(
  "Viewport bins, clipped samples, spline and exact-sample level checks passed."
);
let inFlight = 0,
  peakInFlight = 0,
  interactiveRequests = 0;
const interactiveManager = {
  networkManager: {
    requestManager: {
      queryMatrixFloat32: async (q) => {
        interactiveRequests++;
        inFlight++;
        peakInFlight = Math.max(peakInFlight, inFlight);
        await new Promise((resolve) => setImmediate(resolve));
        inFlight--;
        const rows = q.endRowPx - q.startRowPx,
          cols = q.endColPx - q.startColPx;
        assert.ok(rows <= 64 && cols <= 64);
        return { rows, cols, values: new Float32Array(rows * cols).fill(3) };
      },
    },
  },
};
const interactive = await querySignalHistogram(
  interactiveManager,
  { ...small, endRowPx: 10000, endColPx: 10000 },
  { tileEdge: 64, concurrency: 4 }
);
assert.equal(interactiveRequests, 16);
assert.equal(peakInFlight, 4);
assert.equal(interactive.values.length, 65536);
assert.equal(interactive.count, 65536);
assert.equal(interactive.sampled, true);
console.log(
  "Interactive histogram request, memory and concurrency bounds passed."
);
const { histogramTileIndices } = load(
  "../src/app/core/visualization/signalDiagnostics.ts"
);
const squareSamples = [...histogramTileIndices(16, 16)];
assert.equal(squareSamples.length, 16);
assert.equal(new Set(squareSamples.map((i) => Math.floor(i / 16))).size, 4);
assert.equal(new Set(squareSamples.map((i) => i % 16)).size, 4);
assert.equal(
  squareSamples.filter((i) => Math.floor(i / 16) === i % 16).length,
  4
);
for (const [rows, cols] of [
  [1, 1000],
  [1000, 1],
  [3, 70],
  [70, 3],
  [37, 17],
]) {
  const sample = [...histogramTileIndices(rows, cols)];
  assert.ok(sample.length <= 16);
  assert.equal(new Set(sample).size, sample.length);
  assert.ok(sample.every((i) => i >= 0 && i < rows * cols));
}
assert.deepEqual([...histogramTileIndices(2, 3)], [0, 1, 2, 3, 4, 5]);
console.log(
  "Two-dimensional sampling covers independent rows, columns and diagonal strata."
);
assert.equal(
  ratioLevels.lower,
  0.5,
  "O/E level fitting excludes measured zero from the logarithmic lower bound"
);
for (const values of [
  [0, 0],
  [1, 1],
  [2, 3],
  [0.1, 0.2],
]) {
  const fitted = viewportLevels(new Float32Array(values), true);
  assert.ok(fitted.lower > 0 && fitted.lower < 1 && fitted.upper > 1);
  assert.ok(
    fitted.lower >= 0.1,
    "No machine-epsilon lower bound from measured zeros"
  );
}
const emptyLevels = viewportLevels(new Float32Array([0, 0, 0]), false);
assert.equal(emptyLevels.lower, 0);
assert.equal(
  emptyLevels.upper,
  1,
  "An empty viewport must keep zero at the lower endpoint color"
);
