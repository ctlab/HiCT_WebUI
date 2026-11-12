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
let reloads = 0,
  fits = 0;
const manager = new sandbox.exports.VisualizationManager({
  getMap: () => ({ on: () => undefined }),
  viewAndLayersManager: {
    currentViewState: { resolutionDesciptor: descriptor },
  },
  networkManager: { requestManager: { renderPipelineRevision: 1 } },
  reloadTilesFromBackend: async () => {
    reloads++;
  },
});
manager.getActiveRenderPipelineConfig = async () => ({
  enabled: true,
  upperExpression: { maxSignal: options.colormap.maxSignal },
});
manager.applyOpeningViewportQuantileThreshold = async (quantile) => {
  fits++;
  options.colormap.maxSignal /= 2;
  await manager.rememberOpeningRange(quantile);
};
await manager.rememberOpeningRange(0.995);
await manager.refreshOpeningRangeOnMoveEnd();
assert.equal(fits, 0, "panning at the same level keeps contrast stable");
descriptor.bpResolution = 50000;
await manager.refreshOpeningRangeOnMoveEnd();
assert.equal(fits, 1, "a finer level gets a fresh opening range");
assert.equal(reloads, 1);
options.signalDisplayMode = "OBSERVED_OVER_EXPECTED";
descriptor.bpResolution = 10000;
await manager.refreshOpeningRangeOnMoveEnd();
assert.equal(fits, 1, "O/E retains its diverging range");
options.signalDisplayMode = "OBSERVED";
await manager.refreshOpeningRangeOnMoveEnd();
assert.equal(fits, 2, "returning to Observed resumes the opening range");
options.colormap.maxSignal = 0.123;
descriptor.bpResolution = 1000;
await manager.refreshOpeningRangeOnMoveEnd();
assert.equal(fits, 2, "an explicit upper threshold wins");
assert.equal(
  manager.openingRange,
  null,
  "manual settings relinquish automatic ownership"
);
descriptor.bpResolution = 500;
await manager.refreshOpeningRangeOnMoveEnd();
assert.equal(fits, 2, "later zooms cannot reactivate relinquished ownership");
console.log("Opening range ownership checks passed");
