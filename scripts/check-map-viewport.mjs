import assert from "node:assert/strict";
import fs from "node:fs";
import process from "node:process";
import { setImmediate } from "node:timers";
import vm from "node:vm";
import ts from "typescript";
import View from "ol/View.js";
import Projection from "ol/proj/Projection.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import Feature from "ol/Feature.js";
import Point from "ol/geom/Point.js";
import TileLayer from "ol/layer/Tile.js";
import TileGrid from "ol/tilegrid/TileGrid.js";
import XYZ from "ol/source/XYZ.js";
import { inView } from "ol/layer/Layer.js";

// Exercise the production managers with a real OpenLayers View. Only unrelated
// UI imports and the network/assembly facade are replaced for this Node test.
function loadManager(name, imports = {}) {
  const filename = new URL(
    `../src/app/core/mapmanagers/${name}.ts`,
    import.meta.url
  );
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(
    compiled,
    {
      exports,
      require: (name) => imports[name] ?? {},
      console: { log: () => undefined },
    },
    { filename: filename.pathname }
  );
  return exports;
}

const resolutionModel = loadManager("resolutionModel");
class TestTileSource extends XYZ {
  constructor(_manager, _index, _bp, _source, options) {
    super(options);
  }
  do_reload() {}
}
const { HiCViewAndLayersManager, ActiveTool } = loadManager(
  "HiCViewAndLayersManager", {
    "ol/layer/Tile": { default: TileLayer },
    "ol/tilegrid/TileGrid": { default: TileGrid },
    "../VersionedXYZSource": { VersionedXYZContactMapSource: TestTileSource },
    "./resolutionModel": resolutionModel,
  }
);
class Request {
  constructor(options) {
    Object.assign(this, options);
  }
}
const { CommonEventManager } = loadManager("CommonEventManager", {
  "../net/api/request": {
    ReverseSelectionRangeRequest: Request,
    MoveSelectionRangeRequest: Request,
  },
});

function fixture() {
  const manager = Object.create(HiCViewAndLayersManager.prototype);
  manager.fullGlobalExtent = [0, -10000, 10000, 0];
  manager.activeAxisScopes = {
    row: { kind: "all", label: "All Rows" },
    column: { kind: "all", label: "All Columns" },
  };
  manager.axisScopeRevision = 0;
  manager.pixelProjection = new Projection({
    code: "test-pixels",
    units: "pixels",
    extent: manager.fullGlobalExtent,
  });
  manager.getNavigationResolutionModel = () => ({
    pixelResolutionSet: [1, 5, 10],
  });
  manager.calculateMaximumScaledImageSize = () => 10000;
  manager.mapManager = { getMap: () => ({ getSize: () => [800, 600] }) };
  manager.view = new View({
    ...manager.createViewOptions(manager.fullGlobalExtent),
    center: [4200, -3700],
    resolution: 2.5,
    rotation: 0.2,
  });
  manager.currentViewState = {};
  const layerExtents = [];
  manager.layersHolder = Object.fromEntries(
    [
      "hicDataLayers",
      "track2DLayers",
      "annotationLayers",
      "contigBordersLayers",
      "contigTranslocationArrowsLayers",
      "scaffoldBordersLayers",
    ].map((name, index) => [
      name,
      [
        {
          setExtent: (extent) => {
            layerExtents[index] = extent;
          },
        },
      ],
    ])
  );
  let renders = 0;
  let reloads = 0;
  let minimapRefreshes = 0;
  const received = [];
  const asmInfo = { contigDescriptors: [], scaffoldDescriptors: [] };
  manager.mapManager = {
    viewAndLayersManager: manager,
    contigDimensionHolder: {
      updateContigData(data) {
        assert.equal(data, asmInfo.contigDescriptors);
      },
      prefix_sum_bp: [0, 5000, 10000],
      contigIdToOrd: { 1: 0, 2: 1 },
      contig_count: 2,
    },
    scaffoldHolder: {
      updateScaffoldData(data) {
        assert.equal(data, asmInfo.scaffoldDescriptors);
      },
    },
    getMap: () => ({ changed: () => undefined, getSize: () => [800, 600] }),
    linearTrackManager: {
      render() {
        renders += 1;
      },
    },
    refreshOverviewMinimap() {
      minimapRefreshes += 1;
    },
    reloadVisuals() {
      reloads += 1;
    },
    networkManager: {
      requestManager: {
        reverseSelectionRange: async (request) => {
          received.push(request);
          return asmInfo;
        },
        moveSelectionRange: async (request) => {
          received.push(request);
          return asmInfo;
        },
      },
    },
  };
  manager.scheduleRulerRender = () => undefined;
  const events = new CommonEventManager(manager.mapManager);
  events.getSelectedContigBpRange = () => ({ startBP: 0, endBP: 5000 });
  events.resetSelection = () => undefined;
  events.onMoveSelectionClicked = () => undefined;
  manager.selectionInteractions = {
    translocationArrowSelectionInteraction: {
      getFeatures: () => ({ getArray: () => [{ get: () => undefined }] }),
      get: (key) => (key === "startBP" ? 0 : 5000),
    },
  };
  return {
    manager,
    events,
    received,
    layerExtents,
    counts: () => ({ renders, reloads, minimapRefreshes }),
  };
}

function snapshot(view) {
  return {
    center: [...view.getCenter()],
    resolution: view.getResolution(),
    rotation: view.getRotation(),
    extent: [...view.calculateExtent([800, 600])],
  };
}

async function checkViewport() {
  {
    const { manager } = fixture();
    manager.primaryResolutionSet = resolutionModel.buildSourceResolutionDescriptorSet(
      "PRIMARY", [1000, 5000, 10000, 25000], [10000, 2000, 1000, 400], 1000
    );
    manager.secondaryResolutionSet = resolutionModel.buildSourceResolutionDescriptorSet(
      "SECONDARY", [5000], [2000], 1000
    );
    manager.secondaryExactResolutionOnly = true;
    manager.layersZIndices = { HIC_MAP_LAYER_Z_INDEX: 0 };
    manager.mapManager.getOptions = () => ({ tileSize: 256 });
    manager.mapManager.getMap = () => ({ addLayer() {} });
    for (const key of Object.keys(manager.layersHolder)) manager.layersHolder[key] = [];
    manager.layersHolder.primaryHiCDataLayers = [];
    manager.layersHolder.secondaryHiCDataLayers = [];
    manager.layersHolder.primaryBpResolutionToHiCDataLayer = new Map();
    manager.layersHolder.secondaryBpResolutionToHiCDataLayer = new Map();
    manager.layersHolder.bpResolutionToHiCDataLayer = new Map();
    manager.refreshVisibleBuiltinVectorSources = () => {};
    manager.addSourceHiCDataLayers(manager.primaryResolutionSet);
    manager.addSourceHiCDataLayers(manager.secondaryResolutionSet);
    for (const [enabled, viewResolution, expected, secondary] of [
      [[5000, 10000], 5 / 16, 5000, true],
      [[5000, 10000], 9, 5000, true],
      [[5000, 10000], 10, 10000, false],
      [[5000, 10000], 100, 10000, false],
      [[5000], 100, 5000, true],
      [null, 0.5, 1000, false],
      [null, 5, 5000, true],
      [null, 25, 25000, false],
    ]) {
      manager.enabledBpResolutions = enabled && new Set(enabled);
      manager.view.getResolution = () => viewResolution;
      manager.updateCurrentHiCViewState();
      const renderable = (layers) => layers.filter(layer =>
        inView(layer.getLayerState(), { resolution: viewResolution, zoom: 10 })
      ).map(layer => layer.get("bpResolution"));
      assert.deepEqual(renderable(manager.layersHolder.primaryHiCDataLayers), [expected],
        `selected primary must actually render at ${viewResolution}, enabled=${enabled}`);
      assert.deepEqual(renderable(manager.layersHolder.secondaryHiCDataLayers), secondary ? [5000] : [],
        "generated overlays render only at an exact available primary resolution");
    }
  }
  {
    const { manager } = fixture();
    const resolutions = [1000, 5000, 10000];
    const generated = [];
    const arrows = {
      options: { width: 2 },
      features: new Map(),
      recalculateBorders(resolution) {
        generated.push(resolution);
        const feature = new Feature(new Point([100, -100]));
        feature.set("bpResolution", resolution);
        this.features.set(resolution, [feature]);
      },
    };
    for (const name of Object.keys(manager.layersHolder)) {
      manager.layersHolder[name] = [];
    }
    for (const kind of ["Annotation", "ContigBorders", "ScaffoldBorders"]) {
      manager.layersHolder[`bpResolutionTo${kind}Layer`] = new Map();
    }
    manager.layersHolder.primaryHiCDataLayers = [];
    manager.layersHolder.secondaryHiCDataLayers = [];
    const layers = resolutions.map((resolution) => {
      const layer = new VectorLayer({ source: new VectorSource() });
      layer.set("bpResolution", resolution);
      return layer;
    });
    manager.layersHolder.contigTranslocationArrowsLayers = layers;
    manager.layersHolder.bpResolutionToContigTranslocationArrowsLayer = new Map(
      resolutions.map((resolution, i) => [resolution, layers[i]])
    );
    manager.track2DHolder = {
      contigTranslocationArrowsTrack: arrows,
      annotationTrack: { features: new Map() },
      contigBordersTrack: { features: new Map(), options: { width: 2 } },
      scaffoldBordersTrack: { features: new Map(), options: { width: 2 } },
    };
    manager.getVisibleSourceResolutionDescriptors = () => ({
      primary: {
        bpResolution:
          manager.view.getResolution() >= 10
            ? 10000
            : manager.view.getResolution() >= 5
            ? 5000
            : 1000,
      },
    });
    manager.viewResolutionToResolutionDescriptor = () =>
      manager.getVisibleSourceResolutionDescriptors().primary;
    manager.resolutionChangedAsyncSubscribers = [];
    manager.reloadTracks();
    assert.ok(layers.every((layer) => layer.getSource().isEmpty()));
    manager.currentViewState.activeTool = ActiveTool.TRANSLOCATION;
    manager.reloadTracks();
    assert.deepEqual(
      generated,
      [1000],
      "generate only active-resolution arrows on entry"
    );

    for (const resolution of [5, 10, 5, 1, 10, 1]) {
      manager.view.setResolution(resolution);
      await manager.onViewResolutionChanged();
      const active = manager.getActiveVectorResolutionDescriptor().bpResolution;
      assert.equal(
        manager.layersHolder.bpResolutionToContigTranslocationArrowsLayer
          .get(active)
          .getSource()
          .getFeatures().length,
        1,
        `active arrows must be populated when switching to ${active}`
      );
      for (const layer of layers) {
        const isActive = layer.get("bpResolution") === active;
        assert.equal(layer.getVisible(), isActive);
        assert.equal(
          layer.getSource().getFeatures().length,
          isActive ? 1 : 0,
          `arrows must be populated when switching to ${active}`
        );
      }
      const generationCount = generated.length;
      await manager.onViewResolutionChanged();
      assert.equal(
        generated.length,
        generationCount,
        "no redundant rebuild at the same resolution"
      );
      assert.equal(
        manager.selectionInteractions.translocationArrowSelectionInteraction.get(
          "startBP"
        ),
        0
      );
      assert.equal(
        manager.selectionInteractions.translocationArrowSelectionInteraction.get(
          "endBP"
        ),
        5000
      );
    }
    manager.currentViewState.activeTool = undefined;
    manager.reloadTracks();
    assert.ok(
      layers.every(
        (layer) => !layer.getVisible() && layer.getSource().isEmpty()
      )
    );
    manager.view.setResolution(5);
    await manager.onViewResolutionChanged();
    assert.ok(layers.every((layer) => !layer.getVisible()));
    manager.currentViewState.activeTool = ActiveTool.TRANSLOCATION;
    manager.reloadTracks();
    assert.equal(
      layers[1].getSource().getFeatures().length,
      1,
      "re-entry regenerates arrows"
    );
  }

  for (const action of [
    "onReverseSelectionClicked",
    "onClickInTranslocationMode",
  ]) {
    const { manager, events, received, counts } = fixture();
    const before = snapshot(manager.view);
    // A null center even during a synchronous change event breaks map consumers.
    manager.view.on("change:center", () => assert.ok(manager.view.getCenter()));
    for (let i = 0; i < 3; i += 1) {
      events[action]();
      await new Promise((resolve) => setImmediate(resolve));
      assert.ok(manager.view.isDef(), `${action}: view must remain renderable`);
      assert.deepEqual(
        snapshot(manager.view),
        before,
        `${action}: preserve viewport`
      );
    }
    assert.equal(received.length, 3);
    assert.deepEqual(counts(), { renders: 3, reloads: 3, minimapRefreshes: 3 });
  }

  {
    const { manager, layerExtents } = fixture();
    let scopeExtent = [3000, -6000, 6000, -2000];
    manager.activeAxisScopeExtent = scopeExtent;
    manager.computeAxisScopeExtent = () => scopeExtent;
    const before = snapshot(manager.view);
    manager.reapplyAxisScopes();
    assert.deepEqual(
      snapshot(manager.view),
      before,
      "unchanged isolation preserves viewport"
    );
    assert.ok(layerExtents.every((extent) => extent === scopeExtent));
    scopeExtent = [6000, -8000, 8000, -6000];
    manager.reapplyAxisScopes();
    assert.deepEqual(
      [...manager.view.getCenter()],
      [6000, -6000],
      "moved scope clamps center"
    );
    assert.equal(manager.view.getResolution(), before.resolution);
    assert.equal(manager.view.getRotation(), before.rotation);
    scopeExtent = null;
    const clamped = snapshot(manager.view);
    manager.reapplyAxisScopes();
    assert.deepEqual(
      snapshot(manager.view),
      clamped,
      "removing isolation does not zoom out"
    );
    assert.ok(layerExtents.every((extent) => extent === undefined));
  }

  {
    const { manager } = fixture();
    manager.view.setRotation(0);
    manager.computeAxisScopeExtent = () => [1000, -2000, 3000, -1000];
    manager.setAxisScopes({ kind: "all" }, { kind: "all" });
    assert.deepEqual(
      [...manager.view.getCenter()],
      [2000, -1500],
      "explicit scope choice still fits"
    );
    assert.equal(manager.view.getResolution(), 2.5, "scope fits without padding");
  }

  for (const scale of [1, 4]) {
    const { manager } = fixture();
    const before = snapshot(manager.view);
    manager.calculateMaximumScaledImageSize = () => 10000 * scale;
    manager.view.on("change:center", () => assert.ok(manager.view.getCenter()));
    manager.updateProjectionAndViewExtent(scale);
    assert.deepEqual(
      [...manager.view.getCenter()],
      before.center.map((x) => x * scale)
    );
    assert.equal(manager.view.getResolution(), before.resolution * scale);
    assert.equal(manager.view.getRotation(), before.rotation);
    assert.ok(
      manager.view.isDef(),
      "overlay/resolution updates must leave a renderable view"
    );
  }

  {
    const { manager } = fixture();
    manager.view = new View(
      manager.createViewOptions(manager.fullGlobalExtent)
    );
    assert.equal(manager.view.isDef(), false);
    manager.updateProjectionAndViewExtent();
    assert.ok(
      manager.view.isDef(),
      "initial view still receives a valid fallback"
    );
    assert.deepEqual([...manager.view.getCenter()], [0, 0]);
    assert.equal(manager.view.getResolution(), 10);
  }

  {
    const { manager } = fixture();
    const before = snapshot(manager.view);
    manager.view.applyOptions_ = () =>
      assert.fail("resolution callbacks must not reapply constraints");
    manager.reapplyAxisScopes({
      refreshViewOptions: false,
      renderLinearTracks: false,
    });
    assert.deepEqual(snapshot(manager.view), before);
  }

  console.log(
    "Map viewport regression check passed (edits, isolation, overlay, resolution updates and translocation arrows)."
  );
}

checkViewport().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// Closing a file must make already queued layout work inert.
const { ContactMapManager } = loadManager("ContactMapManager");
const closedMap = Object.create(ContactMapManager.prototype);
closedMap.disposed = false;
closedMap.sequenceRenderers = new Set();
const releaseSequenceRenderer = closedMap.registerSequenceRenderer(async () => {});
assert.equal(closedMap.sequenceRenderers.size, 1);
releaseSequenceRenderer();
assert.equal(closedMap.sequenceRenderers.size, 0);
closedMap.registerSequenceRenderer(async () => {});
closedMap.visualizationManager = { dispose() {} };
closedMap.linearTrackManager = { dispose() {} };
closedMap.clearOverviewMapTarget = () => {};
closedMap.viewAndLayersManager = { dispose() {} };
closedMap.map = { setTarget() {}, updateSize() { throw Error("rendered a closed map"); } };
closedMap.dispose();
assert.equal(closedMap.sequenceRenderers.size, 0, "Dispose releases sequence renderer callbacks");
closedMap.refreshWorkspaceLayout();
closedMap.scheduleWorkspaceLayoutRefresh();
closedMap.reloadVisuals();
closedMap.dispose();
console.log("Disposed map rejects pending layout and visual updates.");

const minimapManager = Object.create(ContactMapManager.prototype);
const minimapBounds = [0, -100, 100, 0];
for (const [requested, expected] of [
  [[-50, -150, 150, 50], minimapBounds],
  [[-20, -60, 40, -20], [0, -60, 40, -20]],
  [[60, -60, 120, -20], [60, -60, 100, -20]],
  [[20, -40, 60, 20], [20, -40, 60, 0]],
  [[20, -120, 60, -60], [20, -100, 60, -60]],
  [[10, -20, 10.01, -19.99], [10, -20, 10.01, -19.99]],
  [[120, -40, 150, -20], null],
]) {
  const actual = minimapManager.clampExtentToBounds(requested, minimapBounds);
  assert.deepEqual(actual ? Array.from(actual) : null, expected);
}
console.log("Minimap preserves viewport coordinates and clips every edge without inflation.");

async function checkSequenceExportLifecycle() {
  const manager = Object.create(ContactMapManager.prototype);
  manager.networkManager = { requestManager: { sequenceViewReadOnly: true } };
  manager.disposed = false;
  await assert.rejects(manager.buildViewportExportSvg(), /finish loading/);
  const firstRelease = manager.registerSequenceViewExporter(async () => { throw Error('old callback'); });
  let finish;
  const result = { svg: {}, canvas: {} };
  const release = manager.registerSequenceViewExporter(() => new Promise(resolve => { finish = resolve; }));
  firstRelease(); // A stale component must not unregister its replacement.
  const pending = manager.buildViewportExportSvg();
  assert.equal(manager.isExporting, true);
  await assert.rejects(manager.buildViewportExportSvg(), /already running/);
  finish(result);
  assert.equal(await pending, result);
  assert.equal(manager.isExporting, false);
  release();
  manager.registerSequenceViewExporter(async () => { throw Error('assembly changed'); });
  await assert.rejects(manager.buildViewportExportSvg(), /assembly changed/);
  assert.equal(manager.isExporting, false, 'Failed export must release its guard');
  manager.disposed = true;
  await assert.rejects(manager.buildViewportExportSvg(), /finish loading/);
  console.log('Sequence export callback ownership, concurrency, failure recovery and disposal guards passed.');
}
await checkSequenceExportLifecycle();
