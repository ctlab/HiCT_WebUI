import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";

// The production module with OpenLayers/Vue replaced by inert stubs: only the pure geometry of the
// visible-contig search and the label collision filter is exercised here.
class Stub {
  constructor(options = {}) {
    Object.assign(this, options);
  }
  getText() {
    return this.text;
  }
}
class Text extends Stub {
  setOffsetX() {}
  setOffsetY() {}
  setTextAlign() {}
}
class Track2D {}
const modules = {
  vue: { markRaw: (v) => v, toRaw: (v) => v },
  "ol/extent": {
    boundingExtent: () => [],
    intersects: (a, b) =>
      a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1],
  },
  "ol/Feature": { default: Stub },
  "ol/geom": {
    MultiPolygon: Stub,
    Polygon: Stub,
    LineString: Stub,
    SimpleGeometry: Stub,
  },
  "ol/style/Fill": { default: Stub },
  "ol/style/Stroke": { default: Stub },
  "ol/style/Style": { default: Stub },
  "ol/style/Text": { default: Text },
  "ol/geom/Point": { default: Stub },
  "../domain/common": { ContigHideType: {} },
  "./Track2D": { Track2D },
};
const sandbox = {
  exports: {},
  require: (name) => modules[name] ?? {},
  document: undefined,
};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      new URL("../src/app/core/tracks/Track2DSymmetric.ts", import.meta.url),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText,
  sandbox
);
const { Track2DSymmetric } = sandbox.exports;
class Probe extends Track2DSymmetric {
  range(...args) {
    return [...this.visibleContigOrderRange(...args)];
  }
  select(candidates) {
    return [...this.selectNonOverlappingLabels(candidates)];
  }
}
const probe = new Probe({ name: "probe", features: new Map() }, {});

// 100 contigs of 1000 map pixels each, one map unit per pixel, at screen resolution 1.
const prefix = Array.from({ length: 101 }, (_, i) => i * 1000);
const viewport = (x0, y0, x1, y1, resolution = 1) => ({
  extent: [x0, y0, x1, y1],
  resolution,
});
// A viewport centred on the diagonal near contig 50 reaches only its neighbours (label reach is 600 px).
assert.deepEqual(
  probe.range(prefix, 1, viewport(50000, -50500, 50500, -50000)),
  [49, 52]
);
// The same viewport far from the diagonal sees no contig square at all.
assert.deepEqual(
  probe.range(prefix, 1, viewport(10000, -80000, 10500, -79500)),
  [0, 0]
);
// A viewport over the whole map visits every contig.
assert.deepEqual(
  probe.range(prefix, 1, viewport(0, -100000, 100000, 0)),
  [0, 100]
);
// Extra reach (arrows stick out of their contig) widens the range on both sides.
const [plain0, plain1] = probe.range(
  prefix,
  1,
  viewport(50000, -50500, 50500, -50000)
);
const [wide0, wide1] = probe.range(
  prefix,
  1,
  viewport(50000, -50500, 50500, -50000),
  2000
);
assert.ok(wide0 < plain0 && wide1 > plain1, "extra reach widens the range");
// Zooming out increases the pixel reach of labels, so more contigs are visited.
const [far0, far1] = probe.range(
  prefix,
  1,
  viewport(50000, -50500, 50500, -50000, 4)
);
assert.ok(far1 - far0 > plain1 - plain0, "coarser view keeps more neighbours");
// Degenerate maps never throw.
assert.deepEqual(probe.range([0], 1, viewport(0, -1, 1, 0)), [0, 0]);
assert.deepEqual(probe.range(prefix, 0, viewport(0, -1, 1, 0)), [0, 0]);
// Every contig whose square intersects the viewport is inside the range.
for (const [x0, y0, x1, y1] of [
  [1234, -9000, 5678, -2000],
  [90500, -99900, 99999, -90100],
  [0, -10, 10, 0],
]) {
  const [first, end] = probe.range(prefix, 1, viewport(x0, y0, x1, y1));
  for (let order = 0; order < 100; order++) {
    const from = prefix[order],
      to = prefix[order + 1];
    const reaches = from <= x1 && to >= x0 && from <= -y0 && to >= -y1;
    if (reaches)
      assert.ok(
        order >= first && order < end,
        `contig ${order} is visible for ${[x0, y0, x1, y1]}`
      );
  }
}

// Collision filter: the widest entity wins, touching labels within the 2 px padding collide.
const label = (name, spanPx, box) => ({ feature: name, spanPx, box });
const kept = probe.select([
  label("narrow-overlapping", 50, [40, 0, 90, 10]),
  label("wide", 100, [0, 0, 50, 10]),
  label("apart", 20, [100, 0, 150, 10]),
  label("within-padding", 10, [151, 0, 200, 10]),
  label("other-row", 5, [0, 20, 50, 30]),
]);
assert.deepEqual([...kept].sort(), ["apart", "other-row", "wide"]);
assert.deepEqual(probe.select([]), []);
const identical = probe.select([
  label("a", 10, [0, 0, 5, 5]),
  label("b", 10, [0, 0, 5, 5]),
]);
assert.equal(identical.length, 1, "identical boxes keep exactly one");
console.log(
  "Track labels: visible contig range and label collision filter passed."
);
