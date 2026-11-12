import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path, overrides = {}) {
  const file = new URL(path, import.meta.url);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (name) => overrides[name] ?? require(name),
  });
  return module.exports;
}

const core = "../src/app/core";
const common = load(`${core}/domain/common.ts`);
const { default: Holder } = load(
  `${core}/mapmanagers/ContigDimensionHolder.ts`,
  {
    "@/CommonUtils": {
      __esModule: true,
      default: { clamp: (x, min, max) => Math.max(min, Math.min(max, x)) },
    },
    "../domain/common": common,
  }
);
const ticks = load(`${core}/controls/rulerTicks.ts`);
const { RulerControl } = load(`${core}/controls/RulerControl.ts`, {
  "./rulerTicks": ticks,
  "../visualization/floatingPanel": {},
  "ol/control": { Control: class {} },
  "ol/proj": {},
  "@/app/stores/styleStore": {},
  "@/app/stores/uiSettingsStore": {},
});
const { ContigDirection, ContigHideType } = common;
const resolution = 1000;
const makeContig = (id, length, { hidden = false, reversed = false } = {}) => ({
  contigId: id,
  contigName: `contig ${id}`,
  contigLengthBp: length,
  direction: reversed ? ContigDirection.REVERSED : ContigDirection.FORWARD,
  contigLengthBins: new Map([[resolution, Math.ceil(length / resolution)]]),
  presenceAtResolution: new Map([
    [
      resolution,
      hidden ? ContigHideType.FORCED_HIDDEN : ContigHideType.FORCED_SHOWN,
    ],
  ]),
});
const holder = new Holder([
  makeContig(0, 2501),
  makeContig(1, 900, { hidden: true }),
  makeContig(2, 1500, { reversed: true }),
  makeContig(3, 500),
  // Two components from a split, with a nonaligned source boundary.
  makeContig(4, 1701),
  makeContig(5, 2401),
]);
const prefix = holder.prefix_sum_px.get(resolution);
const pixelMapSize = prefix.at(-1);
const control = Object.create(RulerControl.prototype);
control.contigDimensionHolder = holder;
control.rulerCoordinateMode = { value: "global" };
control.mapManager = {
  scaffoldHolder: {
    getScaffoldLocusByBp: (bp) => ({
      scaffoldId: bp < 4901 ? 0 : 1,
      scaffoldName: bp < 4901 ? "scaffold A" : "scaffold B",
      startBp: bp < 4901 ? 0 : 4901,
    }),
  },
};

assert.equal(ticks.rulerMajorStep(1), 100);
assert.equal(ticks.rulerMajorStep(11), 2000);
assert.equal(ticks.rulerMajorStep(0.005), 1);
const fraction = 0.002;
const mapStartScreen = 14.25;
const options = {
  axisStart: mapStartScreen,
  axisEnd: mapStartScreen + pixelMapSize / fraction,
  mapStartScreen,
  fraction,
  pixelMapSize,
  resolutionDescriptor: { bpResolution: resolution },
};
for (const mode of ["global", "contig", "scaffold"]) {
  control.rulerCoordinateMode.value = mode;
  const layout = control.getRulerLayout(options);
  assert.ok(layout.ticks.length > 20, mode);
  assert.equal(layout.unit, "bp");
  assert.equal(layout.breaks.length, 1);
  assert.equal(layout.breaks[0].bp, 900);
  assert.equal(layout.breaks[0].count, 1);
  assert.equal(layout.breaks[0].screen, mapStartScreen + prefix[2] / fraction);
  for (const tick of layout.ticks) {
    assert.ok(tick.bp < 2501 || tick.bp >= 3401, "tick in a hidden interval");
    const px = (tick.screen - mapStartScreen) * fraction;
    assert.ok(
      Math.abs(holder.getFractionalBpOfPx(px, resolution) - tick.bp) < 1e-6,
      `${mode}: tick at ${tick.screen} represents bp ${tick.bp}`
    );
    assert.equal(Boolean(tick.label), tick.major, "minor ticks are unlabeled");
  }
  if (mode === "contig") {
    for (const bp of [0, 3401, 4901, 5401, 7102])
      assert.ok(
        layout.ticks.some((tick) => tick.bp === bp && tick.label === "0")
      );
  }
  if (mode === "scaffold")
    assert.ok(
      layout.ticks.some((tick) => tick.bp === 4901 && tick.label === "0")
    );
}

const scoped = control.getRulerLayout({
  ...options,
  axisStart: mapStartScreen + 4.2 / fraction,
  axisEnd: mapStartScreen + 6.5 / fraction,
});
assert.ok(scoped.ticks.length > 0);
assert.ok(
  scoped.ticks.every(
    (tick) =>
      tick.screen >= mapStartScreen + 4.2 / fraction &&
      tick.screen <= mapStartScreen + 6.5 / fraction
  )
);
const dense = control.getRulerLayout({
  ...options,
  axisEnd: mapStartScreen + pixelMapSize / 4,
  fraction: 4,
});
assert.ok(dense.contigs.some((band) => band.count > 1));

const edges = new Holder([
  makeContig(0, 600, { hidden: true }),
  makeContig(1, 1500),
  makeContig(2, 700, { hidden: true }),
]);
control.contigDimensionHolder = edges;
const edgePixelSize = edges.prefix_sum_px.get(resolution).at(-1);
const edgeLayout = control.getRulerLayout({
  ...options,
  axisEnd: mapStartScreen + edgePixelSize / fraction,
  pixelMapSize: edgePixelSize,
});
assert.deepEqual(
  Array.from(edgeLayout.breaks, ({ bp }) => bp),
  [600, 700]
);

console.log(
  "Ruler ticks preserve assembly coordinates across hidden spans, reversals, split components, scopes and one-bin contigs."
);
