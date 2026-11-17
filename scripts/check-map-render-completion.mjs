import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const exports = {};
const timers = new Map();
let next = 0;
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync("src/app/core/mapmanagers/mapRenderCompletion.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText,
  {
    exports,
    window: {
      setInterval: (callback, ms) => {
        assert.equal(ms, 100);
        timers.set(++next, callback);
        return next;
      },
      clearInterval: (id) => timers.delete(id),
    },
  }
);
const ol = JSON.parse(fs.readFileSync("node_modules/ol/package.json", "utf8"));
assert.equal(
  ol.version,
  exports.RENDER_COMPLETION_OL_VERSION,
  "Recheck the OpenLayers queue/readiness adapter after upgrades"
);
const mapSource = fs.readFileSync("node_modules/ol/Map.js", "utf8");
assert.match(mapSource, /getLoadingOrNotReady\(\)/);
assert.match(mapSource, /this\.tileQueue_/);
const listeners = new Map();
let queued = 2,
  loading = 1,
  notReady = false,
  renders = 0;
const map = {
  on: (name, callback) => listeners.set(name, callback),
  un: (name, callback) => {
    assert.equal(listeners.get(name), callback);
    listeners.delete(name);
  },
  tileQueue_: { getCount: () => queued, getTilesLoading: () => loading },
  getLoadingOrNotReady: () => notReady,
  render: () => renders++,
};
const dispose = exports.watchMapRenderCompletion(map);
assert.equal(timers.size, 0, "No idle polling before loading");
listeners.get("loadstart")();
listeners.get("loadstart")();
assert.equal(timers.size, 1);
const tick = () => [...timers.values()].forEach((callback) => callback());
tick();
assert.equal(renders, 0, "Do not redraw while transfers remain");
queued = 0;
tick();
assert.equal(renders, 0, "Wait for the loading slot");
loading = 0;
notReady = true;
tick();
assert.equal(renders, 0, "Wait for layer readiness");
notReady = false;
tick();
assert.equal(
  renders,
  1,
  "Request the frame after obsolete queued tiles were discarded"
);
listeners.get("loadend")();
assert.equal(timers.size, 0, "Stop on completion");
tick();
assert.equal(renders, 1);
listeners.get("loadstart")();
assert.equal(timers.size, 1);
dispose();
assert.equal(timers.size, 0);
assert.equal(listeners.size, 0);
console.log(
  "Map completion refresh waits for idle renderers and releases its timer/listeners"
);
