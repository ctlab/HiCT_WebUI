import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/app/core/format/formatSignal.ts", import.meta.url),
  "utf8"
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
});
const { formatSignal, formatSignalCompact, copyBp, formatLength } =
  await import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
  );

assert.equal(formatSignal(0.0591340996325), "0.0591");
assert.equal(formatSignal(12470.44921875), "12,470");
assert.equal(formatSignal(2.5e-7), "2.5 × 10⁻⁷");
assert.equal(formatSignal(0), "0");
assert.equal(formatSignal(Number.NaN), "—");
assert.equal(formatSignalCompact(12500), "12.5 k");
assert.equal(copyBp(412350.4), "412350");
assert.equal(formatLength(910724), "910.7 kb");
console.log("Signal labels and copied coordinates use the expected precision");
