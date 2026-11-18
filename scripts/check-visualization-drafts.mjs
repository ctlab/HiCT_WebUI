import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  cache = new Map();
function load(url) {
  const key = url.href;
  if (cache.has(key)) return cache.get(key);
  const exports = {};
  cache.set(key, exports);
  const code = ts.transpileModule(fs.readFileSync(url, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (name) =>
      name.startsWith(".") ? load(new URL(name + ".ts", url)) : require(name),
  });
  return exports;
}
const root = new URL("../src/app/core/visualization/", import.meta.url);
const {
  VisualizationDrafts,
  applyVisualizationDraft,
  visualizationContextKey,
} = load(new URL("visualizationDrafts.ts", root));
const Options = load(new URL("VisualizationOptions.ts", root)).default;
const Gradient = load(
  new URL("colormap/SimpleLinearGradient.ts", root)
).default;
const { ColorTranslator } = require("colortranslator");
const primary = { source: "PRIMARY", targetId: null, mode: "OBSERVED" };
const secondary = {
  source: "SECONDARY",
  targetId: "lower/identity",
  mode: "OBSERVED",
};
const oe = { ...primary, mode: "OBSERVED_OVER_EXPECTED" };
const drafts = new VisualizationDrafts();
const first = drafts.note(primary, { postLogBase: 2, maxSignal: 50 });
const snapshot = drafts.read(primary);
const second = drafts.note(primary, { maxSignal: 100 });
assert.ok(second > first);
assert.equal(
  snapshot.maxSignal,
  50,
  "Captured intent is immutable after later edits"
);
drafts.acknowledge(primary, first);
assert.equal(drafts.read(primary).maxSignal, 100);
assert.equal(
  drafts.read(primary).postLogBase,
  undefined,
  "Only acknowledged field revisions clear"
);
drafts.note(secondary, { maxSignal: 95 });
drafts.note(oe, { maxSignal: 4 });
assert.equal(drafts.read(primary).maxSignal, 100);
assert.equal(drafts.read(secondary).maxSignal, 95);
assert.equal(drafts.read(oe).maxSignal, 4);
assert.equal(
  visualizationContextKey({ ...secondary, mode: "OBSERVED_OVER_EXPECTED" }),
  visualizationContextKey(secondary)
);
assert.notEqual(
  visualizationContextKey({ ...secondary, targetId: "upper/identity" }),
  visualizationContextKey(secondary)
);
const policy = drafts.note(primary, {
  applyCoolerWeights: false,
  coolerWeightsNaNPolicy: "DISABLE_WEIGHTS",
});
drafts.acknowledge(primary, policy, [
  "applyCoolerWeights",
  "coolerWeightsNaNPolicy",
]);
assert.equal(
  drafts.read(primary).maxSignal,
  100,
  "Failed normalization must not discard an earlier palette draft"
);
const base = new Options(
  -1,
  -1,
  true,
  true,
  true,
  new Gradient(
    new ColorTranslator("#ffffff80"),
    new ColorTranslator("#ff0000ff"),
    0,
    11
  ),
  false,
  0.995,
  "OBSERVED",
  "REPLACE_NANS_WITH_ZERO",
  true,
  3
);
const changed = applyVisualizationDraft(base, {
  ...drafts.read(primary),
  postLogBase: 2,
  resolutionScaling: false,
  applyCoolerWeights: false,
});
assert.ok(changed instanceof Options);
assert.ok(changed.colormap instanceof Gradient);
assert.equal(changed.colormap.maxSignal, 100);
assert.equal(changed.colormap.minSignal, 0);
assert.equal(changed.colormap.startColorRGBA.HEXA.toLowerCase(), "#ffffff80");
assert.equal(changed.colormap.endColorRGBA.HEXA.toLowerCase(), "#ff0000ff");
assert.equal(changed.postLogBase, 2);
assert.equal(changed.resolutionScaling, false);
assert.equal(changed.resolutionLinearScaling, true);
assert.equal(changed.applyCoolerWeights, false);
assert.equal(changed.coolerWeightsHaveNaNs, true);
assert.equal(changed.coolerWeightsNaNCount, 3);
assert.equal(
  base.colormap.maxSignal,
  11,
  "Projection must not mutate the committed options"
);
drafts.acknowledge(primary, second);
assert.equal(Object.keys(drafts.read(primary)).length, 0);
assert.equal(drafts.read(secondary).maxSignal, 95);
drafts.note(primary, { minSignal: NaN });
assert.ok(
  Number.isNaN(drafts.read(primary).minSignal),
  "Invalid unfinished input remains a draft until corrected, not a backend write"
);
console.log(
  "Visualization field revisions, immutable intents, source/target/mode isolation and option projection passed."
);

const { visualizationOptionsDraft } = load(
  new URL("visualizationDrafts.ts", root)
);
const presetRevision = drafts.note(primary, visualizationOptionsDraft(base));
drafts.note(secondary, { maxSignal: 77 });
drafts.discardBefore(presetRevision);
assert.equal(drafts.read(primary).maxSignal, 11);
assert.equal(drafts.read(primary).minSignal, 0);
assert.equal(
  drafts.read(secondary).maxSignal,
  77,
  "A full preset discards older fields without erasing a later source edit"
);
assert.equal(Object.keys(drafts.read(oe)).length, 0);
const preset = visualizationOptionsDraft(base);
assert.equal(
  preset.coolerWeightsHaveNaNs,
  undefined,
  "Server weight metadata is not user preset intent"
);
assert.equal(preset.coolerWeightsNaNCount, undefined);
assert.equal(
  applyVisualizationDraft(base, preset, "EXPECTED").signalDisplayMode,
  "EXPECTED"
);
console.log(
  "Explicit preset revisions discard older drafts and preserve later edits and server metadata."
);
const midpoint = load(new URL("colorMidpoint.ts", root));
for (const fraction of [0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99]) {
  const gamma = midpoint.gammaFromMidpoint(fraction);
  assert.ok(Math.abs(midpoint.midpointFraction(gamma) - fraction) < 1e-12);
  assert.ok(Math.abs(midpoint.colorFraction(fraction, gamma) - 0.5) < 1e-12);
}
assert.equal(midpoint.colorFraction(0.25, 0.5), 0.5);
assert.equal(midpoint.colorFraction(0.5, 2), 0.25);
assert.equal(midpoint.midpointFraction(1), 0.5);
const gammaDrafts = new VisualizationDrafts();
const oldGamma = gammaDrafts.note(primary, { gamma: 2 });
gammaDrafts.note(primary, { gamma: 0.5 });
gammaDrafts.acknowledge(primary, oldGamma);
const gammaOptions = applyVisualizationDraft(base, gammaDrafts.read(primary));
assert.equal(gammaOptions.colormap.gamma, 0.5);
assert.equal(gammaOptions.colormap.minSignal, base.colormap.minSignal);
assert.equal(gammaOptions.colormap.maxSignal, base.colormap.maxSignal);
assert.equal(base.colormap.gamma, 1);
for (const value of [0, -1, NaN, Infinity, 101])
  assert.throws(() => midpoint.validateColorGamma(value));
console.log(
  "Color midpoints invert the transfer curve and preserve newer drafts, endpoints and signal settings."
);
