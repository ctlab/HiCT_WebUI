import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const path = new URL(
  "../src/app/core/net/SourceCapabilities.ts",
  import.meta.url
);
const compiled = ts.transpileModule(fs.readFileSync(path, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const sandbox = { exports: {} };
vm.runInNewContext(compiled, sandbox);
const { parseSourceCapabilities, importedWeightsAvailability } =
  sandbox.exports;
const available = { state: "AVAILABLE", reasonCode: "", reason: "" };
const source = {
  schemaVersion: 1,
  units: "CONTACT_COUNT",
  scoreScale: 1,
  contactDataState: "PRESENT",
  resolutions: [4, 10],
  importedWeightResolutions: [4],
  weightMetadataComplete: true,
  contactNormalization: available,
  importedWeights: available,
};
assert.equal(parseSourceCapabilities(source), source);
assert.equal(importedWeightsAvailability(source, 4).state, "AVAILABLE");
assert.equal(
  importedWeightsAvailability(source, 10).reasonCode,
  "NO_WEIGHTS_AT_RESOLUTION"
);
assert.equal(
  importedWeightsAvailability({ ...source, weightMetadataComplete: false }, 10)
    .state,
  "UNKNOWN"
);
const unavailable = {
  state: "UNAVAILABLE",
  reasonCode: "NOT_CONTACT_DATA",
  reason: "Not contact data",
};
const identity = {
  ...source,
  units: "IDENTITY_PERCENT",
  scoreScale: 10000,
  contactDataState: "ABSENT",
  importedWeightResolutions: [],
  contactNormalization: unavailable,
  importedWeights: unavailable,
};
assert.equal(parseSourceCapabilities(identity), identity);
assert.equal(
  importedWeightsAvailability(identity, 4).reasonCode,
  "NOT_CONTACT_DATA"
);
for (const bad of [
  undefined,
  null,
  [],
  {},
  { ...source, schemaVersion: 2 },
  { ...source, scoreScale: NaN },
  { ...source, scoreScale: 0 },
  { ...source, scoreScale: Infinity },
  { ...source, units: "invented" },
  { ...source, resolutions: [4, 4] },
  { ...source, resolutions: [0] },
  { ...source, importedWeightResolutions: [7] },
  { ...source, contactNormalization: { ...available, state: "invented" } },
]) {
  assert.equal(parseSourceCapabilities(bad), undefined);
}
assert.equal(importedWeightsAvailability(undefined, 4), undefined);
console.log(
  "Source capability parsing and resolution-specific availability passed"
);
