import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function load(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(new URL(file, import.meta.url), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }
    ).outputText,
    { exports, require: (name) => imports[name] ?? {} }
  );
  return exports;
}
const strands = load("../src/app/core/visualization/sequenceStrands.ts");
const { measureBases } = load(
  "../src/app/core/sequence/sequenceMeasurement.ts",
  { "../visualization/sequenceStrands": strands }
);
const bases = [..."ACGTRYMKSWBDHVN"].map((base, bp) => ({
  base,
  bp: bp + 2_500_000_000,
}));
const plain = (x) => JSON.parse(JSON.stringify(x));
assert.deepEqual(
  plain(measureBases(bases, 2_500_000_002, 2_500_000_005, "horizontal", false)),
  {
    axis: "horizontal",
    startBp: 2_500_000_002,
    endBp: 2_500_000_006,
    reverse: false,
    sequence: "GTRY",
  }
);
assert.equal(
  measureBases(bases, 2_500_000_005, 2_500_000_002, "vertical", true).sequence,
  "RYAC"
);
assert.equal(
  measureBases(bases, 2_500_000_000, 2_500_000_014, "vertical", true).sequence,
  "NBDHVWSMKRYACGT"
);
assert.equal(
  measureBases(bases, 2_500_000_003, 2_500_000_003, "horizontal", false)
    .sequence,
  "T"
);
assert.equal(measureBases(bases, 0, 3, "horizontal", false), undefined);
assert.equal(
  measureBases(
    [bases[0], bases[2]],
    2_500_000_000,
    2_500_000_002,
    "horizontal",
    false
  ),
  undefined
);
assert.equal(
  measureBases(
    [bases[1], bases[0]],
    2_500_000_000,
    2_500_000_001,
    "horizontal",
    false
  ),
  undefined
);
console.log(
  "FASTA measurements preserve inclusive letters, gapless intervals, large coordinates and reverse-complement reading direction."
);
