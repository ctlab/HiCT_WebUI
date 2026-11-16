import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const notifications = [];
function load(path, imports = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(new URL(path, import.meta.url), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }
    ).outputText,
    { exports, require: (id) => imports[id] ?? {}, Date }
  );
  return exports;
}
const { CommonEventManager } = load(
  "../src/app/core/mapmanagers/CommonEventManager.ts",
  {
    "vue-sonner": { toast: (message) => notifications.push(message) },
    "@/app/ui/reportFailure": {
      reportFailure: (label, failure) =>
        notifications.push([label, failure.message]),
    },
  }
);
const { buildTrackContextMenu } = load(
  "../src/app/ui/components/tracks/trackContextMenu.ts",
  {
    "@/app/core/mapmanagers/contextMenuActions": {},
  }
);
function fixture() {
  const calls = [];
  const api = {
    sourceCapabilities: { PRIMARY: { sequenceScaleTiles: true } },
    history: { applied: { session: "first", revision: 5 }, busy: 0 },
    hasLinkedFasta: true,
    sequenceViewReadOnly: false,
    splitContigAtBp: async (...args) => {
      calls.push(args);
      return { assembly: "updated" };
    },
  };
  const holder = {
    contig_count: 2,
    prefix_sum_bp: [0, 10, 30],
    contigIdToOrd: { 4: 0, 7: 1 },
    contigDescriptors: [
      { contigId: 4, contigLengthBp: 10 },
      { contigId: 7, contigLengthBp: 20, direction: "REVERSED" },
    ],
    getContigLocusByBp: (bp) => ({ contigId: bp < 10 ? 4 : 7 }),
  };
  const map = {
    contigDimensionHolder: holder,
    networkManager: { requestManager: api },
    linearTrackManager: {
      getTrackHoverAt: () => ({
        kind: "feature",
        trackId: "gtf",
        trackName: "Genes",
        startBp: 13,
        endBp: 19,
        strand: "-",
        label: "gene",
      }),
    },
    reloadVisuals: async () => calls.push("reload"),
    isDisposed: false,
    isExporting: false,
    viewAndLayersManager: {
      captureViewPosition: () => ({ centerBp: [15, 16], resolution: 0.01 }),
      restoreViewPosition: (position) => calls.push(position),
    },
  };
  const events = new CommonEventManager(map);
  events.applyAssemblyInfo = (response) => calls.push(response);
  events.resetSelection = () => calls.push("reset");
  map.eventManager = events;
  return { map, events, api, calls };
}
{
  const { events, calls } = fixture();
  assert.equal(
    events.getExactCutTarget(13).offsetBp,
    3,
    "oriented offset, without a second strand inversion"
  );
  for (const bp of [0, 10, 30, -1, 13.5, NaN, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(
      events.getExactCutTarget(bp),
      undefined,
      `invalid or existing boundary ${bp}`
    );
  assert.equal(
    await events.cutAtExactTarget(events.getExactCutTarget(13)),
    true
  );
  assert.deepEqual(calls[0], [7, 3]);
  assert.deepEqual(calls.slice(1), [
    { assembly: "updated" },
    "reset",
    "reload",
    { centerBp: [15, 16], resolution: 0.01 },
  ]);
}
for (const modify of [
  ({ api }) => api.history.applied.revision++,
  ({ api }) => (api.history.applied.session = "replacement"),
  ({ api }) => api.history.busy++,
  ({ api }) => (api.sequenceViewReadOnly = true),
  ({ api }) => (api.sourceCapabilities.PRIMARY.sequenceScaleTiles = false),
  ({ map }) => (map.isExporting = true),
  ({ map }) => (map.isDisposed = true),
  ({ map }) => map.contigDimensionHolder.prefix_sum_bp[1]++,
]) {
  const f = fixture();
  const target = f.events.getExactCutTarget(13);
  modify(f);
  assert.equal(await f.events.cutAtExactTarget(target), false);
  assert.deepEqual(
    f.calls,
    [],
    "stale/read-only/busy targets cannot send an edit or reset selection"
  );
}
{
  const { events, api, calls } = fixture();
  api.splitContigAtBp = async () => {
    throw Error("server rejected revision");
  };
  assert.equal(
    await events.cutAtExactTarget(events.getExactCutTarget(13)),
    false
  );
  assert.deepEqual(calls, []);
}
{
  const f = fixture();
  const menu = buildTrackContextMenu(f.map, "vertical", 100, 20, () => {});
  const start = menu.items.find(
    (item) => item.label === "Cut at feature start"
  );
  const end = menu.items.find((item) => item.label === "Cut at feature end");
  assert.equal(start.disabled, false);
  assert.equal(end.disabled, false);
  f.api.history.applied.revision++;
  start.run();
  await Promise.resolve();
  assert.deepEqual(f.calls, [], "menu action retains its opening revision");
  f.map.linearTrackManager.getTrackHoverAt = () => ({
    kind: "feature",
    startBp: 10,
    endBp: 30,
  });
  const joined = buildTrackContextMenu(f.map, "horizontal", 100, 20, () => {});
  assert.ok(
    joined.items
      .filter((item) => item.label.startsWith("Cut at"))
      .every((item) => item.disabled)
  );
  f.api.sourceCapabilities.PRIMARY.sequenceScaleTiles = false;
  assert.ok(
    !buildTrackContextMenu(f.map, "horizontal", 100, 20, () => {}).items.some(
      (item) => item.label.startsWith("Cut at")
    )
  );
}
console.log(
  "Feature-edge cuts: exact oriented boundaries, stale menu/session guards, read-only/busy states and failure isolation passed."
);

// A native-bin coordinate cannot be reused after entering the base display grid.
// Keep BP destinations and distinguish Center (same scale) from Zoom (readable letters).
const { LinearTrackManager } = load(
  "../src/app/core/mapmanagers/LinearTrackManager.ts",
  {
    "../visualization/sequenceLetterMetrics": {
      sequenceLetterMinimumPixels: () => 16,
    },
  }
);
{
  const restored = [];
  const selected = [];
  const layers = {
    getPixelResolutionForBpResolution: () => 2,
    restoreViewPosition: (position) => restored.push(position),
  };
  const tracks = Object.create(LinearTrackManager.prototype);
  tracks.mapManager = {
    getLayersManager: () => layers,
    getView: () => ({
      getResolution: () => 0.02,
      getRotation: () => 0.1,
      getMinResolution: () => 0,
    }),
    networkManager: { requestManager: { hasLinkedFasta: true } },
  };
  tracks.setSelectedFeature = (feature) => selected.push(feature);
  tracks.getFinestBpResolution = () => 200;
  const feature = { startBp: 1033, endBp: 1066 };
  tracks.centerOnFeature(feature);
  assert.equal(restored[0].resolution, 0.02);
  assert.deepEqual(Array.from(restored[0].centerBp), [1049.5, 1049.5]);
  tracks.zoomToFeature(feature);
  assert.equal(restored[1].resolution, 0.01 / (16 * 1.1));
  assert.deepEqual(Array.from(restored[1].centerBp), [1049.5, 1049.5]);
  assert.equal(restored[1].rotation, 0.1);
  tracks.mapManager.networkManager.requestManager.hasLinkedFasta = false;
  tracks.zoomToFeature(feature);
  assert.equal(
    restored.length,
    2,
    "unlinked sequence cannot enable letter zoom"
  );
  assert.equal(selected.length, 2);
  tracks.mapManager.getMap = () => ({ getSize: () => [1000, 800] });
  tracks.centerOnBpRange(1000, 21000);
  assert.deepEqual(Array.from(restored[2].centerBp), [11000, 11000]);
  assert.equal(
    restored[2].resolution,
    ((20000 / 200) * 2) / (800 * 0.52),
    "large ranges remain fitted rather than capped at a single-bin scale"
  );
}
console.log(
  "Feature Center keeps scale; Zoom uses measured letter scale and BP destinations, including fractional midpoints."
);
