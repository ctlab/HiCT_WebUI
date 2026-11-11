import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const sandbox = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      new URL(
        "../src/app/core/sequence/backgroundResultDelivery.ts",
        import.meta.url
      ),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }
  ).outputText,
  sandbox
);
const { BackgroundResultDelivery } = sandbox.exports;
const delivery = new BackgroundResultDelivery();
const seen = [];
delivery.defer(
  "sequence/a",
  () => true,
  async () => {
    seen.push("a");
  }
);
await delivery.process([{ id: "sequence/a", state: "running" }]);
assert.deepEqual(seen, []);
await delivery.process([{ id: "sequence/a", state: "finished" }]);
await delivery.process([{ id: "sequence/a", state: "finished" }]);
assert.deepEqual(seen, ["a"]);
for (const state of ["failed", "cancelled"]) {
  delivery.defer(
    state,
    () => true,
    async () => seen.push(state)
  );
  await delivery.process([{ id: state, state }]);
  await delivery.process([{ id: state, state: "finished" }]);
}
delivery.defer(
  "closed",
  () => false,
  async () => seen.push("closed")
);
await delivery.process([{ id: "closed", state: "finished" }]);
assert.deepEqual(seen, ["a"]);
let release;
delivery.defer(
  "concurrent",
  () => true,
  () =>
    new Promise((resolve) => {
      seen.push("once");
      release = resolve;
    })
);
const first = delivery.process([{ id: "concurrent", state: "finished" }]);
await delivery.process([{ id: "concurrent", state: "finished" }]);
release();
await first;
assert.deepEqual(seen, ["a", "once"]);
delivery.defer(
  "failure",
  () => true,
  async () => {
    throw new Error("delivery failed");
  }
);
delivery.defer(
  "next",
  () => true,
  async () => seen.push("next")
);
await delivery.process([
  { id: "failure", state: "finished" },
  { id: "next", state: "finished" },
]);
assert.deepEqual(seen, ["a", "once", "next"]);
console.log(
  "Detached sequence result delivery: completion, at-most-once, map replacement, failure isolation and cancellation passed."
);

const defaults = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      new URL(
        "../src/app/core/sequence/generationDefaults.ts",
        import.meta.url
      ),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }
  ).outputText,
  defaults
);
const choose = (levels, current) =>
  Array.from(defaults.exports.defaultSequenceResolutions(levels, current));
assert.deepEqual(
  choose([10000, 1000, 5000, 1000, 25000], 10000),
  [1000, 5000, 10000]
);
assert.deepEqual(choose([1000, 5000, 10000], 5000), [1000, 5000]);
assert.deepEqual(choose([1000, 5000], 1), [1000]);
assert.deepEqual(choose([], 1000), []);
assert.deepEqual(choose([0, -1, NaN, Infinity, 1000], 1000), [1000]);
console.log(
  "Sequence generation defaults: finest through current, sorted unique levels, missing current level and empty maps passed."
);
