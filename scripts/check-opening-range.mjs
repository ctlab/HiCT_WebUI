import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const options = {
  signalDisplayMode: "OBSERVED",
  colormap: { minSignal: 0, maxSignal: 0.03 },
};
const store = {
  get signalDisplayMode() {
    return options.signalDisplayMode;
  },
  asVisualizationOptions: () => structuredClone(options),
};
const sandbox = {
  exports: {},
  require: (name) =>
    name.includes("visualizationOptionsStore")
      ? { useVisualizationOptionsStore: () => store }
      : {},
};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      new URL(
        "../src/app/core/mapmanagers/VisualizationManager.ts",
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
const descriptor = { bpResolution: 250000 };
const listeners = new Map();
const unexpected = () =>
  assert.fail("Observed navigation must not reload or refit");
const manager = new sandbox.exports.VisualizationManager({
  getMap: () => ({ on: (name, callback) => listeners.set(name, callback) }),
  viewAndLayersManager: {
    currentViewState: { resolutionDesciptor: descriptor },
  },
  networkManager: { requestManager: new Proxy({}, { get: () => unexpected }) },
  reloadTilesFromBackend: unexpected,
  reloadTiles: unexpected,
});
manager.applyOpeningViewportQuantileThreshold = unexpected;
manager.getActiveRenderPipelineConfig = unexpected;
const original = JSON.stringify(options);
// Reproduce rapid wheel bursts across pyramid levels, panning and fit-to-map.
for (const bp of [250000, 50000, 10000, 1000, 10000, 50000, 250000]) {
  descriptor.bpResolution = bp;
  for (let pan = 0; pan < 10; pan++) {
    listeners.get("moveend")();
    await Promise.resolve();
  }
  assert.equal(
    JSON.stringify(options),
    original,
    "navigation preserves contrast"
  );
}
options.colormap.maxSignal = 0.123;
listeners.get("moveend")();
await Promise.resolve();
assert.equal(
  options.colormap.maxSignal,
  0.123,
  "manual contrast is stable too"
);
console.log(
  "Opening contrast stays stable across wheel zoom and pan checks passed"
);
