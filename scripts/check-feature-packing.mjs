import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const filename = new URL(
  "../src/app/core/mapmanagers/featurePacking.ts",
  import.meta.url
);
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports }, { filename: filename.pathname });
const { packIntervalsIntoLanes } = exports;

const values = [
  { id: "late", start: 10, end: 20 },
  { id: "wide", start: 0, end: 30 },
  { id: "touching", start: 20, end: 25 },
  { id: "nested", start: 5, end: 8 },
];
const packed = packIntervalsIntoLanes(values, value => value.start, value => value.end);
assert.equal(packed.laneCount, 2);
assert.equal(packed.lanes.get(values[1]), 0, "first interval uses lane zero");
assert.equal(packed.lanes.get(values[3]), 1, "overlap uses another lane");
assert.equal(packed.lanes.get(values[0]), 1, "released lane is reused deterministically");
assert.equal(packed.lanes.get(values[2]), 1, "touching endpoints do not overlap");

const dense = Array.from({ length: 10_000 }, (_, i) => ({ start: i, end: i + 100 }));
const densePacked = packIntervalsIntoLanes(dense, value => value.start, value => value.end);
assert.equal(densePacked.laneCount, 100);
assert.equal(densePacked.lanes.size, dense.length);
console.log("Feature packing regression checks passed");
