import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const module = { exports: {} };
const draws = [];
const element = () => {
  const attrs = new Map();
  return {
    setAttribute: (key, value) => attrs.set(key, value),
    getAttribute: key => attrs.get(key),
    get attributes() { return Array.from(attrs, ([name, value]) => ({ name, value })); },
    append: () => {}, querySelectorAll: () => [],
  };
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(
  "../src/app/core/export/SelectionScene.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { module, exports: module.exports,
  crypto: { randomUUID: () => "test" },
  document: { createElementNS: element,
    createElement: () => ({ getContext: () => ({ drawImage: (...args) => draws.push(args) }) }) },
});
const bounds = (...args) => {
  const value = module.exports.visibleMapBounds(...args);
  return value && JSON.parse(JSON.stringify(value));
};
const rectangle = [[10, 20], [80, 20], [80, 60], [10, 60]];
for (let turn = 0; turn < 4; turn++) {
  const rotated = rectangle.slice(turn).concat(rectangle.slice(0, turn));
  assert.deepEqual(bounds(rotated, [100, 100]), { left: 10, top: 20, width: 70, height: 40 });
  assert.deepEqual(bounds([...rotated].reverse(), [100, 100]), { left: 10, top: 20, width: 70, height: 40 });
}
assert.deepEqual(bounds([[50, -50], [150, 50], [50, 150], [-50, 50]], [100, 100]),
  { left: 0, top: 0, width: 100, height: 100 });
assert.deepEqual(bounds([[90, -30], [130, 10], [90, 50], [50, 10]], [100, 100]),
  { left: 50, top: 0, width: 50, height: 50 });
assert.equal(bounds([[110, -30], [130, -10], [110, 10], [90, -10]], [100, 100]), undefined,
  "Touching only at a corner must not produce an empty image");
assert.equal(bounds([[115, -30], [135, -10], [115, 10], [95, -10]], [100, 100]), undefined,
  "Overlapping bounds do not imply the rotated map is visible");
assert.equal(bounds(rectangle, [0, 100]), undefined);
assert.equal(bounds([[NaN, 0], ...rectangle.slice(1)], [100, 100]), undefined);
const cropped = module.exports.cropSelectionScene({ svg: { childNodes: [] }, canvas: { width: 100, height: 100 } },
  { left: 20, top: 10, width: 50.25, height: 30.75, marginLeft: 10, marginTop: 10 });
assert.equal(cropped.svg.getAttribute("width"), "61");
assert.equal(cropped.svg.getAttribute("height"), "41");
assert.equal(cropped.svg.getAttribute("viewBox"), "0 0 61 41");
assert.equal(cropped.canvas.width, 61);
assert.equal(cropped.canvas.height, 41);
assert.deepEqual(draws[3].slice(1), [20, 10, 50.25, 30.75, 10, 10, 50.25, 30.75], "Do not rescale or truncate fractional map bounds");
console.log("Export crop regressions passed: rotation, clipping, fractional page dimensions and invalid geometry.");
