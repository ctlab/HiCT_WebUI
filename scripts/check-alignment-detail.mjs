import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { reactive, watch, ref, markRaw } from "vue";

function load(path, dependencies) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(new URL(path, import.meta.url), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
        },
      }
    ).outputText,
    {
      exports,
      require: (name) => dependencies[name] ?? {},
      window: { setTimeout, clearTimeout },
      AbortController,
      DOMException,
    }
  );
  return exports;
}
const markers = load("../src/app/core/visualization/alignmentMarkers.ts", {});
assert.equal(new Set(markers.alignmentMarkers.map((m) => m.path)).size, 5);
assert.equal(markers.alignmentMarker("MATCH", true).id, "reverse");
assert.equal(markers.alignmentMarker("SUBSTITUTION", false).id, "substitution");
assert.match(
  markers.alignmentMarkerSvg(markers.alignmentMarker("MATCH", false)),
  /<svg/
);
const settings = reactive({ automaticAlignmentEnabled: true });
class Source {
  features = [];
  clear() {
    this.features = [];
  }
  isEmpty() {
    return this.features.length === 0;
  }
  addFeatures(features) {
    this.features.push(...features);
  }
  dispose() {}
}
class Feature {
  constructor(geometry) {
    this.geometry = geometry;
  }
  setStyle(style) {
    this.style = style;
  }
}
class Shape {
  constructor(options) {
    Object.assign(this, options);
  }
}
const { AlignmentDetailLayer } = load(
  "../src/app/core/mapmanagers/AlignmentDetailLayer.ts",
  {
    ol: { Feature },
    "ol/geom": { Point: Shape, LineString: Shape },
    "ol/source/Vector": { default: Source },
    "ol/layer/Vector": {
      default: class {
        dispose() {}
      },
    },
    "ol/style": { Style: Shape, Stroke: Shape, Icon: Shape },
    "ol/Observable": { unByKey() {} },
    vue: { watch, ref, markRaw },
    "@/app/stores/uiSettingsStore": { useUiSettingsStore: () => settings },
    "../visualization/sequenceLetterMetrics": {
      sequenceLetterMinimumPixels: () => 10,
    },
    "../visualization/alignmentMarkers": markers,
    "../net/api/SequenceAnalysisRequest": {
      SequenceAnalysisRequest: class {
        constructor(path) {
          this.requestPath = path;
        }
      },
    },
  }
);
const finished = {
  status: "finished",
  jobId: "done",
  result: {
    alignmentCount: 1,
    segments: [
      {
        rowStart: 1,
        rowEnd: 3,
        columnStart: 1,
        columnEnd: 3,
        operation: "MATCH",
        reverse: false,
      },
    ],
  },
};
let requests = 0,
  stops = [],
  query = async () => finished;
const api = {
  hasLinkedFasta: true,
  history: { applied: 0 },
  sequenceRevision: 0,
  onSequenceChange: () => () => {},
  queryAlignmentDetail: (...args) => {
    requests++;
    return query(...args);
  },
  sendRequest: async (request) => stops.push(request.requestPath),
};
const manager = {
  networkManager: { requestManager: api },
  getMap: () => ({
    addLayer() {},
    removeLayer() {},
    on() {},
    getSize: () => [400, 400],
  }),
  getView: () => ({
    on() {},
    getResolution: () => 0.05,
    calculateExtent: () => [0, -20, 20, 0],
  }),
  viewAndLayersManager: {
    getActiveVectorResolutionDescriptor: () => ({
      bpResolution: 1,
      pixelResolution: 1,
    }),
    getActiveMapPixelBounds: () => ({
      rowStartPx: 0,
      rowEndPx: 100,
      colStartPx: 0,
      colEndPx: 100,
    }),
  },
  contigDimensionHolder: {
    onChange: () => () => {},
    getFractionalBpOfPx: (x) => x,
    getFractionalPxOfBp: (x) => x,
  },
  registerSequenceRenderer: () => () => {},
};
const layer = new AlignmentDetailLayer(manager);
await layer.refresh();
assert.equal(layer.source.features.length, 2);
assert.equal(layer.state.visible.value, true);
settings.automaticAlignmentEnabled = false;
assert.equal(layer.source.features.length, 0);
assert.equal(layer.state.visible.value, false);
const disabledCount = requests;
await layer.refresh();
assert.equal(
  requests,
  disabledCount,
  "disabled navigation cannot launch alignments"
);
settings.automaticAlignmentEnabled = true;
await new Promise((resolve) => setTimeout(resolve, 160));
assert.equal(layer.source.features.length, 2, "enabling resumes automatically");
let resolveHeld;
query = () =>
  new Promise((resolve) => {
    resolveHeld = resolve;
  });
api.sequenceRevision++;
const pending = layer.refresh();
settings.automaticAlignmentEnabled = false;
resolveHeld(finished);
await pending;
assert.equal(
  layer.source.features.length,
  0,
  "late responses cannot redraw disabled markers"
);
query = async () => ({ status: "running", jobId: "active" });
settings.automaticAlignmentEnabled = true;
await new Promise((resolve) => setTimeout(resolve, 140));
settings.automaticAlignmentEnabled = false;
assert.ok(
  stops.includes("/sequence/jobs/active/stop"),
  "disable stops the known running job"
);
layer.dispose();
console.log(
  "Alignment controls: marker key, automatic resume, disabled navigation, stale results and job cancellation passed."
);
