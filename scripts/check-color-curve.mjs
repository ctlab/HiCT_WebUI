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
const { buildCurve, colorFraction, curveParts, prepareColorFraction, validatedCurve, validatedCurveMode, valueFractionFromLog } = await import(
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
const vectors = JSON.parse(readFileSync(new URL("./color-curve-vectors.json", import.meta.url), "utf8"));
for (const { mode, gamma, points, samples, name } of vectors) {
  const transfer = prepareColorFraction(gamma, points ?? undefined, mode ?? undefined);
  for (const [signal, expected] of samples) {
    assert.ok(Math.abs(transfer(signal) - expected) < 1e-9, `${mode} ${name} at ${signal}`);
    if (mode === null) assert.equal(transfer(signal), colorFraction(signal, gamma, points ?? undefined));
  }
}
for (const mode of ["smooth-value", "smooth-log"]) {
  const coordinate = mode === "smooth-log" ? valueFractionFromLog : (x) => x;
  const evaluate = (x) => colorFraction(coordinate(x), 1, [0.66, 0.38], mode);
  const h = 1e-7;
  const secondDifference = (x) => evaluate(x + h) - 2 * evaluate(x) + evaluate(x - h);
  assert.ok(secondDifference(0.66 - 1e-6) > 0, `${mode} convex before knot`);
  assert.ok(secondDifference(0.66 + 1e-6) < 0, `${mode} concave after knot`);
  const knots = [[0, 0.17], [0.15, 0.73], [0.53, 0.33], [0.8, 0.37], [1, 0.2]];
  const interpolate = prepareColorFraction(1, knots.flat(), mode);
  for (let i = 1; i < knots.length; i++) {
    const [start, a] = knots[i - 1], [end, b] = knots[i];
    for (let j = 0; j <= 100; j++) {
      const y = interpolate(coordinate(start + (end - start) * j / 100));
      assert.ok(y >= Math.min(a, b) - 1e-12 && y <= Math.max(a, b) + 1e-12, `${mode} no overshoot`);
    }
  }
}
assert.throws(() => validatedCurveMode("linear"), /Invalid color curve mode/);
console.log(
  "Legacy curves, 27 golden vectors, endpoint weights, inflection and spline bounds passed."
);
