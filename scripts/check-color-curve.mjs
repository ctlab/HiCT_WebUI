import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/app/core/visualization/colorMidpoint.ts", import.meta.url),
  "utf8"
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const { buildCurve, colorFraction, curveParts, validatedCurve } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
const right = [0.85, 1, 1, 0];
for (const [input, points, expected] of [
  [0.5, undefined, 0.5],
  [0.5, [0.5, 0.8], 0.8],
  [0, [0, 0.25], 0.25],
  [-3, [0, 0.25], 0.25],
  [0.5, [0, 0.25], 0.625],
  [1, right, 0],
  [7, right, 0],
  [0.85, right, 1],
  [0.925, right, 0.5],
]) {
  assert.ok(Math.abs(colorFraction(input, 1, points) - expected) < 1e-12);
}
const full = [0, 0.2, 0.5, 0.5, 1, 0];
assert.deepEqual(validatedCurve(full), full);
assert.deepEqual(curveParts(full), {
  start: 0.2,
  end: 0,
  interior: [{ x: 0.5, y: 0.5 }],
});
for (const invalid of [
  [0.5, 0.5, 0, 0.2],
  [1, 0, 0.5, 0.5],
  [0, 1.2],
  [0, 0, 0, 1],
]) {
  assert.throws(() => validatedCurve(invalid));
}
assert.equal(buildCurve(0, 1, []), undefined);
assert.deepEqual(
  buildCurve(0.25, 0, [{ x: 0.85, y: 1 }]),
  [0, 0.25, 0.85, 1, 1, 0]
);
assert.equal(colorFraction(0.5, 2), 0.25);
// Stored empty curves used linear transfer regardless of gamma.
assert.equal(colorFraction(0.5, 2, []), 0.5);
console.log(
  "Color curves preserve legacy behavior and apply endpoint weights beyond the slider limits."
);
