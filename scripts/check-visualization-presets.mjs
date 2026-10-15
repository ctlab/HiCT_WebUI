import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const settingsEditorSource = fs.readFileSync(settingsEditorPath, "utf8");
assert.match(
  settingsEditorSource,
  /generation !== optionsHydrationGeneration/,
  "the live editor must not apply a stale source hydration"
);
const tileSource = fs.readFileSync(tileSourcePath, "utf8");
assert.match(
  tileSource,
  /invalidatePendingTileRequests\(\)/,
  "visualization reloads must invalidate in-flight tile requests"
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
