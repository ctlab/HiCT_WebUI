import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Exercise production scale/range code without constructing a map or network client.
const filename = process.env.HICT_LINEAR_TRACK_SOURCE || new URL(
  "../src/app/core/mapmanagers/LinearTrackManager.ts", import.meta.url
);
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, require: () => ({}) });
const probe = Object.create(exports.LinearTrackManager.prototype);
probe.resolveBinIntervalPx = (bin) => ({ startPx: bin.startPx, endPx: bin.endPx, visible: bin.visible !== false });
const bins = [
  { startPx: 0, endPx: 1, value: -9 },
  { startPx: 1, endPx: 2, value: 6 },
  { startPx: 2, endPx: 3, value: 0 },
  { startPx: 5, endPx: 6, value: -999 },
  { startPx: 1, endPx: 2, value: -999, visible: false },
];
const viewport = { startPx: 0, endPx: 3 };
const range = probe.resolveSignalRange(undefined, bins, viewport, 1);
assert.equal(range.min, -9, "auto range must retain negative visible observations");
assert.equal(range.max, 6);
const negative = probe.resolveSignalRange(undefined, bins.slice(0, 1), viewport, 1);
assert.equal(negative.min, -9);
assert.equal(negative.max, 0, "negative-only range includes zero baseline");
assert.equal(probe.resolveSignalRange({ rangeAuto: false, rangeMin: -3, rangeMax: 8 }, bins, viewport, 1).min, -3);
for (const log of [false, true]) {
  const scale = probe.buildScaleTransform(-9, 6, log, 10);
  const zero = scale.normalize(0);
  assert.equal(scale.normalize(-9), 0);
  assert.equal(scale.normalize(6), 1);
  assert.ok(scale.normalize(-4) < zero && zero < scale.normalize(4));
  assert.equal(scale.display(-4), -4);
  assert.ok(Array.from(probe.buildScaleTicks(scale, 100)).includes(0));
  const symmetric = probe.buildScaleTransform(-9, 9, log, 10);
  assert.equal(symmetric.normalize(0), .5);
  assert.ok(Math.abs(symmetric.normalize(-4) + symmetric.normalize(4) - 1) < 1e-12);
}
const positive = probe.buildScaleTransform(0, 9, true, 10);
assert.ok(Math.abs(positive.normalize(4) - Math.log10(5)) < 1e-12,
  "existing nonnegative log1p scaling remains unchanged");
console.log("Signed track ranges, zero baselines, log transforms and ticks pass");
