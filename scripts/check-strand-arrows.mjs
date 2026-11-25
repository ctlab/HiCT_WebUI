import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/app/core/visualization/strandArrows.ts", import.meta.url),
  "utf8"
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
});
const {
  arrowCentres,
  arrowColor,
  featureChevrons,
  featureGeometry,
  strandFill,
} = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

assert.deepEqual(featureGeometry(20), {
  coding: 15,
  utr: 8,
  intron: 1,
  chevronHalf: 4,
});
assert.deepEqual(featureGeometry(12), {
  coding: 9,
  utr: 5,
  intron: 1,
  chevronHalf: 2,
});
assert.deepEqual(featureGeometry(16), {
  coding: 12,
  utr: 6,
  intron: 1,
  chevronHalf: 3,
});
assert.deepEqual(arrowCentres(0, 9), []);
assert.deepEqual(arrowCentres(0, 10), [5]);
assert.deepEqual(arrowCentres(0, 28), [9, 19]);
assert.deepEqual(arrowCentres(0, 600), [150, 300, 450]);
const single = [{ x0: 0, x1: 90 }];
assert.deepEqual(featureChevrons("+", single, "#d92d20"), [
  { centres: [23, 45, 68], color: "#ffffff", onIntron: false },
]);
assert.deepEqual(featureChevrons(".", single, "#4e79a7"), []);
const exons = [
  { x0: 0, x1: 30 },
  { x0: 60, x1: 75 },
  { x0: 128, x1: 150 },
];
assert.deepEqual(featureChevrons("-", exons, "#1d4ed8"), [
  { centres: [40, 50], color: "#1d4ed8", onIntron: true },
  { centres: [88, 102, 115], color: "#1d4ed8", onIntron: true },
]);
assert.deepEqual(featureChevrons("-", exons, "#1d4ed8", { x0: 65, x1: 107 }), [
  { centres: [86, 96], color: "#1d4ed8", onIntron: true },
]);
assert.deepEqual(
  featureChevrons(
    "+",
    [
      { x0: 0, x1: 30 },
      { x0: 35, x1: 60 },
    ],
    "#d92d20"
  ),
  []
);
assert.equal(strandFill("+", undefined, undefined, "#4e79a7"), "#d92d20");
assert.equal(strandFill("-", "0", undefined, "#4e79a7"), "#1d4ed8");
assert.equal(
  strandFill("+", "0,140,0", "12,3,45", "#4e79a7"),
  "rgb(0, 140, 0)"
);
assert.equal(strandFill("-", "1,,1", "12,3,45", "#4e79a7"), "rgb(12, 3, 45)");
assert.equal(strandFill(".", undefined, undefined, "#4e79a7"), "#4e79a7");
assert.equal(arrowColor("rgb(240, 220, 40)"), "#101828");
assert.equal(arrowColor("#d92d20"), "#ffffff");
console.log(
  "Transcript geometry, bounded chevrons, clipping and RGB precedence pass."
);
