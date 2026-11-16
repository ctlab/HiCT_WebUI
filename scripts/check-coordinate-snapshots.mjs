import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import { reactive, computed } from "vue";

const require = createRequire(import.meta.url);
const root =
  process.argv[2] ||
  path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename);
  const exports = {};
  const module = { exports };
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const localRequire = (name) => {
    // Notifications are a browser-only dependency, outside this model test.
    if (name === "vue-sonner") return { toast: { error() {} } };
    if (name.startsWith("@/"))
      return load(path.join(root, "src", name.slice(2)) + ".ts");
    if (name.startsWith("."))
      return load(path.resolve(path.dirname(filename), name) + ".ts");
    return require(name);
  };
  vm.runInNewContext(
    source,
    { module, exports, require: localRequire, console },
    { filename }
  );
  cache.set(filename, module.exports);
  return module.exports;
}

const Holder = load(
  path.join(root, "src/app/core/mapmanagers/ContigDimensionHolder.ts")
).default;
const ScaffoldHolder = load(
  path.join(root, "src/app/core/mapmanagers/ScaffoldHolder.ts")
).ScaffoldHolder;
const contig = (id, length) => ({
  contigId: id,
  contigName: `c${id}`,
  contigLengthBp: length,
  direction: 1,
  contigLengthBins: new Map([[100, length / 100]]),
  presenceAtResolution: new Map([[100, 1]]),
});
const holder = reactive(
  new Holder([contig(0, 200), contig(1, 0), contig(2, 300)])
);
const names = computed(() =>
  holder.contigDescriptors.map((c) => c.contigName).join(",")
);
assert.equal(names.value, "c0,c1,c2");
holder.ensureResolution(100);
const bins = holder.prefix_sum_bins,
  pixels = holder.prefix_sum_px;
for (let i = 0; i < 20; i++) holder.ensureResolution(100);
assert.equal(holder.prefix_sum_bins, bins, "unchanged indices must be reused");
assert.equal(holder.prefix_sum_px, pixels);
holder.ensureResolution(50);
assert.deepEqual([...holder.prefix_sum_bins.get(50)], [0, 4, 4, 10]);
holder.updateContigData([contig(2, 300), contig(0, 200), contig(1, 0)]);
holder.ensureResolution(50);
assert.deepEqual([...holder.prefix_sum_bins.get(50)], [0, 6, 10, 10]);
assert.equal(names.value, "c2,c0,c1", "Vue must observe snapshot replacement");

const scaffolds = reactive(new ScaffoldHolder(holder));
const labels = computed(() =>
  scaffolds.scaffoldBordersSorted
    .map(([, id]) => scaffolds.scaffoldTable.get(id).scaffoldName)
    .join(",")
);
const scaffold = (id, name, start, end) => ({
  scaffoldId: id,
  scaffoldName: name,
  scaffoldBordersBP: { startBP: start, endBP: end },
});
scaffolds.updateScaffoldData([
  scaffold(4, "B", 200, 500),
  scaffold(3, "A", 0, 200),
]);
assert.equal(labels.value, "A,B");
assert.equal(scaffolds.getScaffoldLocusByBp(200).scaffoldName, "B");
const oldTable = scaffolds.scaffoldTable;
scaffolds.updateScaffoldData([
  scaffold(4, "renamed", 0, 300),
  scaffold(3, "A", 300, 500),
]);
assert.equal(
  labels.value,
  "renamed,A",
  "computed scope options must update after reorder/rename"
);
assert.equal(
  oldTable.get(4).scaffoldName,
  "B",
  "previous snapshots must remain intact"
);
assert.equal(scaffolds.getScaffoldLocusByBp(299).scaffoldName, "renamed");
assert.equal(scaffolds.getScaffoldLocusByBp(300).scaffoldName, "A");
assert.equal(scaffolds.getScaffoldLocusByBp(500), null);
scaffolds.updateScaffoldData([]);
assert.equal(labels.value, "");
assert.equal(scaffolds.getScaffoldLocusByBp(0), null);
holder.updateContigData([]);
holder.ensureResolution(50);
assert.deepEqual([...holder.prefix_sum_bp], [0]);
console.log(
  "Coordinate snapshot, zero-bin boundary, invalidation and Vue notification checks passed."
);

// Sequence display must retain stable listeners and an independent native axis,
// including when a real stored 1 bp level hides one of the fragments.
const pieces = [
  { id: 0, offset: 0, length: 1, bins: 1, origin: 0 },
  { id: 1, offset: 1, length: 4, bins: 2, origin: -1 },
  { id: 2, offset: 5, length: 12, bins: 4, origin: -1 },
].map((piece) => ({
  ...contig(piece.id, piece.length),
  contigOffsetInSource: piece.offset,
  contigLengthBins: new Map([
    [1, piece.length],
    [4, piece.bins],
  ]),
  presenceAtResolution: new Map([
    [1, piece.id === 0 ? 0 : 1],
    [4, 1],
  ]),
  contigBinOffsets: new Map([[4, piece.origin]]),
}));
const dimensions = new Holder(pieces),
  identity = dimensions;
const before = pieces.map((piece) => [
  Array.from(piece.contigLengthBins),
  Array.from(piece.presenceAtResolution),
  Array.from(piece.contigBinOffsets),
]);
let changes = 0;
dimensions.onChange(() => changes++);
const preview = dimensions.getSequenceCoordinates();
assert.equal(
  dimensions.usesSequenceCoordinates,
  false,
  "look-ahead must not mutate the displayed grid"
);
assert.equal(dimensions.prefix_sum_px.get(1).at(-1), 16);
assert.equal(preview.prefix_sum_px.get(1).at(-1), 17);
dimensions.setSequenceCoordinates(true);
assert.equal(
  dimensions,
  identity,
  "ruler and track references must stay attached to the same holder"
);
assert.equal(changes, 1);
assert.deepEqual([...dimensions.prefix_sum_px.get(1)], [0, 1, 5, 17]);
assert.deepEqual(
  [...dimensions.getNativeCoordinates().prefix_sum_px.get(4)],
  [0, 1, 3, 7]
);
assert.equal(dimensions.getNativeCoordinates().prefix_sum_px.get(1).at(-1), 16);
for (let bp = 0; bp <= 17; bp += 0.125) {
  assert.equal(dimensions.getFractionalPxOfBp(bp, 1), bp);
  assert.equal(dimensions.getFractionalBpOfPx(bp, 1), bp);
}
dimensions.ensureResolution(2);
assert.equal(
  pieces[0].contigLengthBins.has(2),
  false,
  "guidance must not change the source snapshot"
);
const reordered = [...pieces]
  .reverse()
  .map((piece) => ({ ...piece, direction: 0 }));
dimensions.updateContigData(reordered);
assert.equal(changes, 2);
assert.deepEqual([...dimensions.prefix_sum_px.get(1)], [0, 12, 16, 17]);
assert.equal(
  dimensions.getNativeCoordinates().contigDescriptors[0].contigId,
  2
);
assert.equal(dimensions.getNativeCoordinates().prefix_sum_px.get(1).at(-1), 16);
dimensions.setSequenceCoordinates(false);
assert.equal(changes, 3);
assert.equal(dimensions.prefix_sum_px.get(1).at(-1), 16);
assert.equal(dimensions.resolutions.includes(2), false);
assert.deepEqual(
  pieces.map((piece) => [
    Array.from(piece.contigLengthBins),
    Array.from(piece.presenceAtResolution),
    Array.from(piece.contigBinOffsets),
  ]),
  before
);
const huge = new Holder([
  {
    ...contig(9, 3_000_000_017),
    contigLengthBins: new Map([[1_000_000_000, 4]]),
    presenceAtResolution: new Map([[1_000_000_000, 1]]),
    contigBinOffsets: new Map(),
  },
]);
huge.setSequenceCoordinates(true);
assert.equal(huge.getFractionalPxOfBp(2_500_000_003.5, 1), 2_500_000_003.5);
assert.equal(huge.getFractionalBpOfPx(2_500_000_003.5, 1), 2_500_000_003.5);
assert.equal(huge.getNativeCoordinates().resolutions.includes(1), false);
console.log(
  "Sequence coordinates: clipped widths, stable listeners, stored 1 bp conflicts, immutable native snapshots and long offsets pass."
);
