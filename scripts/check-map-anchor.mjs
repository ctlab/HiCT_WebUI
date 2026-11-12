import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// The adapter reaches into one private OpenLayers field. Pin the version and the private names, so an
// upgrade fails here until the adapter has been checked against the new View implementation.
const olPackage = JSON.parse(
  fs.readFileSync(
    new URL("../node_modules/ol/package.json", import.meta.url),
    "utf8"
  )
);
const source = fs.readFileSync(
  new URL("../src/app/core/mapmanagers/mapAnchor.ts", import.meta.url),
  "utf8"
);
const sandbox = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText,
  sandbox
);
const { anchoredCenter, installTopLeftAnchor, SUPPORTED_OL_VERSION } =
  sandbox.exports;
assert.equal(
  olPackage.version,
  SUPPORTED_OL_VERSION,
  `OpenLayers is ${olPackage.version}. Recheck mapAnchor.ts against its View, then update SUPPORTED_OL_VERSION.`
);
const viewSource = fs.readFileSync(
  new URL("../node_modules/ol/View.js", import.meta.url),
  "utf8"
);
for (const name of [
  "applyOptions_(options) {",
  "this.constraints_ = {",
  "center: centerConstraint,",
])
  assert.ok(
    viewSource.includes(name),
    `OpenLayers View no longer contains: ${name}`
  );

const plain = (value) => JSON.parse(JSON.stringify(value));
// Map extent [minX, minY, maxX, maxY]: origin top-left, y grows downward as negative values.
const extent = [0, -1000, 1000, 0];

// A viewport larger than the map in both directions: the map sits at the top-left, not centred.
{
  const size = [2000, 1500]; // at resolution 1 the view is 2000 x 1500 map units
  const center = anchoredCenter(extent, [500, -500], 1, size);
  assert.deepEqual(plain(center), [1000, -750]);
  // The visible area then starts exactly at the map origin.
  assert.equal(center[0] - (size[0] * 1) / 2, 0);
  assert.equal(center[1] + (size[1] * 1) / 2, 0);
  // Any requested center gives the same answer: there is nothing to pan.
  for (const c of [
    [0, 0],
    [1000, -1000],
    [-5e6, 5e6],
  ])
    assert.deepEqual(plain(anchoredCenter(extent, c, 1, size)), [1000, -750]);
}

// A viewport smaller than the map: free panning inside, never past the top or left edge.
{
  const size = [400, 300];
  const view = (c) => plain(anchoredCenter(extent, c, 1, size));
  assert.deepEqual(view([500, -500]), [500, -500]); // inside: unchanged
  assert.deepEqual(view([100, -100]), [200, -150]); // pulled back from the top-left overscroll
  assert.deepEqual(view([-300, 400]), [200, -150]);
  assert.deepEqual(view([900, -900]), [800, -850]); // far corner: the map's end meets the view's edge
  assert.deepEqual(view([5000, -5000]), [800, -850]);
  // The top-left corner of the map is reachable exactly.
  assert.deepEqual(view([200, -150]), [200, -150]);
}

// Mixed: wider than the map but shorter.
{
  const size = [3000, 300];
  // Horizontally the map sits at the left. Vertically it pans freely inside the map.
  assert.deepEqual(
    plain(anchoredCenter(extent, [800, -500], 1, size)),
    [1500, -500]
  );
  assert.deepEqual(
    plain(anchoredCenter(extent, [800, 100], 1, size)),
    [1500, -150]
  );
  assert.deepEqual(
    plain(anchoredCenter(extent, [800, -990], 1, size)),
    [1500, -850]
  );
}

// The rule is scale aware: the same position at another resolution.
{
  const size = [400, 300];
  const c = anchoredCenter(extent, [0, 0], 0.5, size); // view is 200 x 150 map units
  assert.deepEqual(plain(c), [100, -75]);
}

// Idempotent: anchoring an anchored center changes nothing.
for (const size of [
  [2000, 1500],
  [400, 300],
  [3000, 300],
])
  for (const r of [0.25, 1, 4]) {
    const once = anchoredCenter(extent, [123, -456], r, size);
    assert.deepEqual(plain(anchoredCenter(extent, once, r, size)), plain(once));
  }

// Install: wraps the constraint, survives applyOptions_ rebuilding it, honours the switch and rotation.
{
  let enabled = true;
  let rotation = 0;
  const calls = [];
  const view = {
    constraints_: null,
    getRotation: () => rotation,
    applyOptions_(options) {
      // What OpenLayers does: rebuild the constraints from the options.
      this.constraints_ = {
        center: (center) => {
          calls.push("inner");
          return center;
        },
      };
      this.lastExtent = options.extent;
    },
  };
  view.applyOptions_({ extent });
  installTopLeftAnchor(view, extent, () => enabled);
  const run = (c) => plain(view.constraints_.center(c, 1, [400, 300]));
  assert.deepEqual(run([100, -100]), [200, -150]);
  enabled = false;
  assert.deepEqual(run([100, -100]), [100, -100]);
  enabled = true;
  rotation = 0.5;
  assert.deepEqual(run([100, -100]), [100, -100]);
  rotation = 0;
  // After OpenLayers rebuilds the constraints with a new extent the anchor is installed again.
  const smaller = [0, -500, 500, 0];
  view.applyOptions_({ extent: smaller });
  assert.equal(view.lastExtent[2], 500);
  assert.deepEqual(
    plain(view.constraints_.center([450, -450], 1, [400, 300])),
    [300, -350]
  );
  // Unusable inputs fall through to OpenLayers.
  assert.equal(view.constraints_.center(undefined, 1, [400, 300]), undefined);
  assert.deepEqual(
    plain(view.constraints_.center([5, -5], Number.NaN, [400, 300])),
    [5, -5]
  );
  assert.deepEqual(
    plain(view.constraints_.center([5, -5], 1, [0, 0])),
    [5, -5]
  );
}

console.log(
  `Map anchor: OpenLayers ${olPackage.version} pinned, corner anchoring, free panning, scale, idempotence, re-install and switch passed.`
);
