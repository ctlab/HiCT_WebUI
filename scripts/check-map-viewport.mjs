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

const { HiCViewAndLayersManager, ActiveTool } = loadManager(
  "HiCViewAndLayersManager"
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
    const resolutions = [1000, 5000, 10000];
    const generated = [];
    const arrows = {
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
      contigBordersTrack: { features: new Map() },
      scaffoldBordersTrack: { features: new Map() },
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
    assert.notEqual(manager.view.getResolution(), 2.5);
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
