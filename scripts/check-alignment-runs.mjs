import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      new URL(
        "../src/app/core/visualization/alignmentRunGeometry.ts",
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
const { alignmentRunGeometry } = exports;
const plain = (x) => JSON.parse(JSON.stringify(x));
const segment = {
  rowStart: 10,
  rowEnd: 13,
  columnStart: 20,
  columnEnd: 23,
  operation: "MATCH",
  reverse: false,
  alignment: 0,
};
const point = (c, r) => [c * 2, -r * 3];
assert.deepEqual(plain(alignmentRunGeometry(segment, point)), [
  [40, -30],
  [42, -33],
  [44, -36],
  [46, -39],
]);
assert.deepEqual(
  plain(alignmentRunGeometry({ ...segment, reverse: true }, point)),
  [
    [46, -30],
    [44, -33],
    [42, -36],
    [40, -39],
  ]
);
assert.deepEqual(
  plain(
    alignmentRunGeometry(
      { ...segment, rowEnd: 10, operation: "INSERTION" },
      point
    )
  ),
  [
    [40, -30],
    [46, -30],
  ]
);
assert.deepEqual(
  plain(
    alignmentRunGeometry(
      { ...segment, columnEnd: 20, operation: "DELETION" },
      point
    )
  ),
  [
    [40, -30],
    [40, -39],
  ]
);
assert.deepEqual(
  plain(
    alignmentRunGeometry(
      { ...segment, rowEnd: 11, columnEnd: 21, operation: "SUBSTITUTION" },
      point
    )
  ),
  [
    [40, -30],
    [42, -33],
  ]
);
const warped = alignmentRunGeometry(segment, (c, r) => [
  c <= 21 ? c : c + 100,
  -r,
]);
assert.equal(warped[1][0], 21);
assert.equal(
  warped[2][0],
  122,
  "Intermediate vertices must follow native fragment geometry, not a straight endpoint interpolation"
);
const large = alignmentRunGeometry(
  {
    ...segment,
    rowStart: 2_500_000_000,
    rowEnd: 2_500_000_001,
    columnStart: 3_000_000_000,
    columnEnd: 3_000_000_001,
  },
  point
);
assert.deepEqual(plain(large), [
  [6_000_000_000, -7_500_000_000],
  [6_000_000_002, -7_500_000_003],
]);
for (const damage of [
  { rowStart: -1 },
  { rowEnd: 10 },
  { rowEnd: 14 },
  { columnEnd: 20 },
  { rowEnd: 9000, columnEnd: 9010 },
  { rowStart: NaN },
  { operation: "unknown" },
  { rowStart: 0.5 },
  { rowStart: 2 ** 53 },
])
  assert.throws(() => alignmentRunGeometry({ ...segment, ...damage }, point));
assert.throws(() =>
  alignmentRunGeometry({ ...segment, operation: "INSERTION" }, point)
);
console.log(
  "Continuous alignment runs follow exact base boundaries, both strands, indels and nonuniform fragment geometry."
);
