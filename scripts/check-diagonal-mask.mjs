import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/app/core/visualization/diagonalMask.ts", import.meta.url),
  "utf8"
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { DEFAULT_DIAGONAL_MASK, maskedOffsetBins, parseDistanceBp, validatedDiagonalMask, isMasked } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

assert.equal(maskedOffsetBins(DEFAULT_DIAGONAL_MASK, 1000), -1);
const mask = { enabled: true, distanceBp: 100_000 };
assert.equal(maskedOffsetBins(mask, 1_000), 99);
assert.equal(maskedOffsetBins(mask, 100_000), 0);
assert.equal(maskedOffsetBins(mask, 1_000_000), 0);
assert.equal(maskedOffsetBins({ ...mask, distanceBp: 150_000 }, 100_000), 1);
assert.equal(isMasked(mask, 10, 109, 1_000), true);
assert.equal(isMasked(mask, 10, 110, 1_000), false);
for (const [text, bp] of [["100 kb", 100000], ["0.1 Mb", 100000], ["1,500", 1500]]) {
  assert.equal(parseDistanceBp(text), bp);
}
for (const text of ["-5", "abc", "0", "1001 Mb"]) {
  assert.equal(parseDistanceBp(text), undefined);
}
assert.deepEqual(validatedDiagonalMask(null), DEFAULT_DIAGONAL_MASK);
assert.deepEqual(validatedDiagonalMask(mask), mask);
assert.throws(() => validatedDiagonalMask({ ...mask, distanceBp: 2.5 }));
console.log("Diagonal distance parsing and strict, absolute assembly bin bounds pass.");
