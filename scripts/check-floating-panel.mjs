import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";
const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      new URL(
        "../src/app/core/visualization/floatingPanel.ts",
        import.meta.url
      ),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText,
  { exports }
);
const place = exports.placeFloatingPanel;
for (const [vw, vh] of [
  [320, 480],
  [1000, 800],
  [1920, 1080],
]) {
  for (const [width, height] of [
    [120, 32],
    [280, 300],
    [vw - 24, vh - 24],
  ]) {
    for (const x of [0, 12, vw / 2, vw - 12, vw])
      for (const y of [0, 12, vh / 2, vh - 12, vh]) {
        const p = place(x, y, width, height, vw, vh);
        assert.ok(p.left >= 12 && p.top >= 12);
        assert.ok(
          p.left + width <= vw - 12 && p.top + height <= vh - 12,
          JSON.stringify(p)
        );
      }
  }
}
assert.equal(place(100, 100, 200, 100, 1000, 800).left, 116);
assert.equal(place(980, 780, 200, 100, 1000, 800).left, 764);
assert.equal(place(980, 780, 200, 100, 1000, 800).top, 664);
console.log(
  "Floating tooltips: all viewport edges, compact screens and maximum-size content pass."
);
