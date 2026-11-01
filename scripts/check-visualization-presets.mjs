import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import vm from "node:vm";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const catalogPath = path.join(
  repoRoot,
  "src/app/core/visualization/colormap/default_options.json"
);
const componentPath = path.join(
  repoRoot,
  "src/app/ui/components/sidebar/SavedVisualOptions.vue"
);
const wizardPath = path.join(
  repoRoot,
  "src/app/ui/components/upper_ribbon/FileWizardModal.vue"
);
const visualizationManagerPath = path.join(
  repoRoot,
  "src/app/core/mapmanagers/VisualizationManager.ts"
);
const settingsEditorPath = path.join(
  repoRoot,
  "src/app/ui/components/sidebar/VisualziationSettingsEditor.vue"
);
const tileSourcePath = path.join(
  repoRoot,
  "src/app/core/VersionedXYZSource.ts"
);
const modDotPlotPath = path.join(
  repoRoot,
  "src/app/core/sequence/modDotPlot.ts"
);

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const presets = catalog?.data?.savedVisualizationPresets;
assert.ok(Array.isArray(presets), "preset catalog must use savedVisualizationPresets");
assert.equal(
  new Set(presets.map((preset) => preset.option_id)).size,
  presets.length,
  "preset ids must be unique"
);
for (const preset of presets) {
  assert.equal(typeof preset.name, "string", "every preset must have a name");
  assert.ok(
    (preset.options && typeof preset.options === "object") ||
      (preset.action && typeof preset.action === "object"),
    `${preset.name} must define either visualization options or an action`
  );
}

const actionPresets = presets.filter((preset) => preset.action);
assert.deepEqual(
  actionPresets.map(({ name, action }) => ({ name, action })),
  [
    {
      name: "ModDotPlot: Hi-C above, identity below",
      action: { type: "sequence-overlay", mode: "below", kind: "moddotplot" },
    },
    {
      name: "ModDotPlot: multicolor overlay",
      action: { type: "sequence-overlay", mode: "overlay", kind: "moddotplot" },
    },
    {
      name: "ModDotPlot palette: active source",
      action: {
        type: "active-source-palette",
        startColor: "#31369500",
        endColor: "#a50026",
      },
    },
  ],
  "ModDotPlot actions must be normal catalog records"
);

assert.match(
  actionPresets[2].action.startColor,
  /00$/,
  "the ModDotPlot palette must keep zero-valued cells transparent"
);

const visualizationManagerSource = fs.readFileSync(visualizationManagerPath, "utf8");
assert.match(
  visualizationManagerSource,
  /loadGeneration === this\.visualizationOptionsLoadGeneration/,
  "source-specific option hydration must reject out-of-order responses"
);
const contrastCode = visualizationManagerSource.slice(
  visualizationManagerSource.indexOf("const replaceColormapNode ="),
  visualizationManagerSource.indexOf("const visualizationOptionsFromTarget =")
);
const contrastContext = vm.createContext({
  isRecord: value => value !== null && typeof value === "object",
  preserveMinimumAlpha: value => value,
});
vm.runInContext(ts.transpileModule(contrastCode + "\nglobalThis.replace = replaceColormapNode;", {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText, contrastContext);
for (const mode of ["LINEAR", "MODDOTPLOT_IDENTITY"]) {
  const input = { type: "binary", op: "DIV", left: { type: "source", source: "SECONDARY" }, right: { type: "constant", value: 100 } };
  const target = { node: { type: "colormap", mode, input }, profile: { source: "SECONDARY" } };
  contrastContext.replace(target, { input: { type: "log", base: 2 }, minSignal: 86, maxSignal: 100 });
  assert.strictEqual(target.node.input, input, "contrast edits must retain the exact signal graph");
  assert.equal(target.node.min.value, 86);
  assert.equal(target.node.max.value, 100);
  assert.equal(target.node.mode, mode);
}
const settingsEditorSource = fs.readFileSync(settingsEditorPath, "utf8");
assert.match(
  settingsEditorSource,
  /generation !== optionsHydrationGeneration/,
  "the live editor must not apply a stale source hydration"
);
assert.match(
  settingsEditorSource,
  /if \(percentageSignalScale\.value\) \{[\s\S]*sliderLowerLimit\.value = 0;[\s\S]*sliderUpperLimit\.value = 100;/,
  "percentage identity targets must keep the threshold slider on a 0-100 scale"
);
const tileSource = fs.readFileSync(tileSourcePath, "utf8");
assert.match(
  tileSource,
  /invalidatePendingTileRequests\(\)/,
  "visualization reloads must invalidate in-flight tile requests"
);
const modDotPlotSource = fs.readFileSync(modDotPlotPath, "utf8");
assert.match(
  modDotPlotSource,
  /op:\s*"DIV"[\s\S]*right:\s*\{\s*type:\s*"constant"[\s\S]*value:\s*scale/,
  "ModDotPlot presets must convert stored fixed-point scores to percentages"
);
assert.match(
  modDotPlotSource,
  /minSignal:\s*minimumIdentity,\s*maxSignal:\s*100/,
  "ModDotPlot colormap thresholds must use the familiar 0-100 percentage scale"
);

const componentSource = fs.readFileSync(componentPath, "utf8");
assert.doesNotMatch(
  componentSource,
  /class=["']builtin-preset["']/,
  "the preset list must not contain a separate hard-coded action UI"
);
for (const preset of actionPresets) {
  assert.ok(
    !componentSource.includes(`>${preset.name}<`),
    `${preset.name} must come from JSON instead of template markup`
  );
}

const wizardSource = fs.readFileSync(wizardPath, "utf8");
assert.match(
  wizardSource,
  /\.filter\(\(preset\) => preset\.action === undefined\)/,
  "command presets must not appear in the Open Wizard's option-only source-style dropdowns"
);

console.log("Visualization preset catalog regression check passed.");

// Only carry pipelines whose inputs still exist when opening a different map.
const transferExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(repoRoot,
  'src/app/core/visualization/transferVisualization.ts'), 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}
}).outputText, {exports: transferExports});
const transferIssues = transferExports.pipelineTransferIssues;
assert.equal(transferIssues({upperExpression: {type:'colormap', input:{type:'source', source:'PRIMARY'}}}).length, 0);
assert.equal(transferIssues({lowerExpression: {type:'track1d', trackId:'__builtin_cooler_weights__'}}).length, 0);
assert.equal(transferIssues({upperExpression: {type:'pixel_blend', top:{type:'source',source:'SECONDARY'},
  bottom:{type:'track1d',trackId:'old-map-track'}}}).length, 2);
console.log('Visualization transfer preserves portable expressions and identifies stale map inputs.');
