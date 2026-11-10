import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Follows the square-root coverage job: success, failure, cancel, a caller that went away, and a
// request that throws. Nothing may be reported as ready unless the server said so.
const source = fs.readFileSync(
  new URL("../src/app/core/visualization/coverageNormalization.ts", import.meta.url),
  "utf8"
);
const sandbox = { exports: {}, console, setTimeout };
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText,
  sandbox
);
const { prepareCoverage } = sandbox.exports;
const status = (state, progress = 0, extra = {}) => ({
  state, progress, message: "m", algorithm: "a", error: null, prepared: state === "READY",
  mode: "FILE", consistent: true, estimatedBytes: 1, ...extra,
});
const stub = (first, later) => {
  const queue = [...later];
  const calls = { prepare: 0, status: 0 };
  return {
    calls,
    prepareCoverageNormalization: async () => { calls.prepare++; return first; },
    coverageNormalizationStatus: async () => { calls.status++; const next = queue.shift(); if (next instanceof Error) throw next; return next; },
  };
};

const seen = [];
let r = await prepareCoverage(stub(status("RUNNING", 0.1), [status("RUNNING", 0.6), status("READY", 1)]), (s) => seen.push(s.progress), { pollMs: 1 });
assert.equal(r.ok, true);
assert.deepEqual(seen, [0.1, 0.6, 1], "every status is reported in order");

r = await prepareCoverage(stub(status("RUNNING"), [status("FAILED", 0.2, { error: "disk is on fire" })]), () => {}, { pollMs: 1 });
assert.equal(r.ok, false);
assert.equal(r.cancelled, false);
assert.match(r.message, /disk is on fire.*Nothing was changed/);

r = await prepareCoverage(stub(status("RUNNING"), [status("CANCELLED")]), () => {}, { pollMs: 1 });
assert.equal(`${r.ok}/${r.cancelled}`, "false/true");

let stop = false;
const waiting = stub(status("RUNNING"), Array.from({ length: 50 }, () => status("RUNNING")));
r = await prepareCoverage(waiting, () => { stop = true; }, { pollMs: 1, shouldStop: () => stop });
assert.equal(`${r.ok}/${r.cancelled}`, "false/true", "a caller that went away stops following, without cancelling");
assert.equal(waiting.calls.status, 0);

const joined = stub(status("RUNNING"), [status("READY", 1)]);
r = await prepareCoverage(joined, () => {}, { start: false, pollMs: 1 });
assert.equal(joined.calls.prepare, 0, "following a running job never starts another");
assert.equal(r.ok, true);

r = await prepareCoverage(stub(status("RUNNING"), [new Error("network")]), () => {}, { pollMs: 1 });
assert.equal(r.ok, false);
assert.match(r.message, /could not be prepared.*Nothing was changed/);

r = await prepareCoverage(stub(status("READY", 1), []), () => {}, { pollMs: 1 });
assert.equal(r.ok, true, "an already prepared map is ready at once");
console.log("Coverage normalization job following passed.");
