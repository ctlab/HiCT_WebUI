import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { Collection } from "ol";

function load(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(new URL(file, import.meta.url), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }
    ).outputText,
    { exports, require: (id) => imports[id] ?? {} }
  );
  return exports;
}
const model = load("../src/app/core/mapmanagers/regionSelection.ts");
const domain = { rowStart: 0, rowEnd: 4000, columnStart: 0, columnEnd: 4000 };
const contigs = [
  { name: "left", start: 0, length: 253 },
  { name: "right:part", start: 253, length: 3747 },
];
const references = {
  contigs,
  scaffolds: [
    { name: "shared:one", start: 0, length: 253 },
    { name: "two", start: 253, length: 1747 },
  ],
};
const fields = {
  rowStart: "left:1",
  rowEnd: "left:253",
  columnStart: "right:part:1",
  columnEnd: "right:part:1,000",
};
const plain = (value) => JSON.parse(JSON.stringify(value));
assert.deepEqual(
  plain(model.parseRegion(fields, "one-based", references, domain)),
  { rowStart: 0, rowEnd: 253, columnStart: 253, columnEnd: 1253 }
);
assert.deepEqual(
  plain(
    model.parseRegion(
      {
        rowStart: "0",
        rowEnd: "1",
        columnStart: "right:part:0",
        columnEnd: "right:part:1",
      },
      "zero-based",
      references,
      domain
    )
  ),
  { rowStart: 0, rowEnd: 1, columnStart: 253, columnEnd: 254 }
);
for (const bad of [
  "",
  "-1",
  "1.5",
  "1e3",
  "1,00",
  "NaN",
  "Infinity",
  "9007199254740992",
])
  assert.throws(() =>
    model.parseRegion(
      { ...fields, rowStart: bad },
      "one-based",
      references,
      domain
    )
  );
assert.throws(() =>
  model.parseBoundary("left:254", true, "one-based", references)
);
assert.throws(() =>
  model.parseBoundary("unknown:1", false, "one-based", references)
);
assert.throws(() =>
  model.parseBoundary("left:1", false, "one-based", {
    ...references,
    contigs: [...contigs, contigs[0]],
  })
);
assert.throws(() =>
  model.parseRegion(
    { ...fields, rowEnd: "left:1", rowStart: "left:2" },
    "one-based",
    contigs,
    domain
  )
);
assert.throws(() =>
  model.parseRegion(fields, "one-based", references, { ...domain, rowStart: 1 })
);
assert.equal(
  model.parseBoundary("long:4", false, "one-based", {
    contigs: [{ name: "long", start: 2_500_000_000, length: 17 }],
    scaffolds: [],
  }),
  2_500_000_003
);
const mixedFields = {
  rowStart: "scf:shared:one:1",
  rowEnd: "scf:two:15",
  columnStart: "ctg:right:part:5",
  columnEnd: "assembly:2222",
};
assert.deepEqual(
  plain(
    model.parseRegion(mixedFields, "one-based", references, domain, "scaffold")
  ),
  { rowStart: 0, rowEnd: 268, columnStart: 257, columnEnd: 2222 }
);
for (const [boundary, end, convention, frame, formatted] of [
  [253, false, "one-based", "scaffold", "scf:two:1"],
  [253, true, "one-based", "scaffold", "scf:shared:one:253"],
  [253, false, "zero-based", "contig", "ctg:right:part:0"],
  [253, true, "zero-based", "contig", "ctg:left:253"],
  [2222, true, "one-based", "scaffold", "assembly:2222"],
]) {
  assert.equal(
    model.formatBoundary(boundary, end, convention, references, frame),
    formatted
  );
  assert.equal(
    model.parseBoundary(formatted, end, convention, references, frame),
    boundary
  );
}
assert.equal(
  model.parseBoundary("two:12", true, "one-based", references, "scaffold"),
  265
);
assert.throws(() =>
  model.parseBoundary("scf:two:1748", true, "one-based", references)
);
assert.throws(() =>
  model.parseBoundary("20", false, "one-based", references, "scaffold")
);
assert.equal(model.snapRegionBoundary(30 - 1e-12, false), 30);
assert.equal(model.snapRegionBoundary(30 + 1e-12, true), 30);
assert.equal(model.snapRegionBoundary(30.2, false), 30);
assert.equal(model.snapRegionBoundary(30.2, true), 31);

const { HiCViewAndLayersManager } = load(
  "../src/app/core/mapmanagers/HiCViewAndLayersManager.ts",
  { "./regionSelection": model }
);
const layers = Object.create(HiCViewAndLayersManager.prototype);
layers.currentViewState = {
  resolutionDesciptor: { bpResolution: 100, pixelResolution: 1 },
  selectionBorders: {},
  selectedContigIds: [],
  selectedScaffoldIds: [],
  entitySelectionKind: "contig",
};
layers.activeAxisScopes = { row: { kind: "all" }, column: { kind: "all" } };
layers.selectedContigIds = new Set();
layers.selectedScaffoldIds = new Set();
layers.selectionCollections = {
  selectedContigFeatures: new Collection(),
  selectedScaffoldFeatures: new Collection(),
};
let worldExtent, vertexVisible;
layers.selectionInteractions = {
  contigSelectExtent: {
    setExtent: (extent) => {
      worldExtent = extent;
    },
    vertexOverlay_: { setVisible: (value) => (vertexVisible = value) },
    extentOverlay_: { setVisible() {} },
  },
};
const holder = {
  prefix_sum_bp: [0, 100, 400],
  contig_count: 2,
  contigDescriptors: [
    { contigId: 7, contigLengthBp: 100 },
    { contigId: 8, contigLengthBp: 300 },
  ],
  contigIdToOrd: { 7: 0, 8: 1 },
  getFractionalPxOfBp: (bp, res) => bp / res,
  getFractionalBpOfPx: (px, res) => px * res,
};
layers.mapManager = {
  contigDimensionHolder: holder,
  scaffoldHolder: { scaffoldBordersSorted: [[{ startBP: 0, endBP: 400 }, 42]] },
};
const exact = { rowStart: 13, rowEnd: 47, columnStart: 103, columnEnd: 149 };
layers.setRegionBounds(exact);
assert.deepEqual(plain(layers.getRegionBounds()), exact);
assert.deepEqual(Array.from(worldExtent), [1.03, -0.47, 1.49, -0.13]);
assert.equal(
  layers.getSelectedEntityRange(),
  null,
  "region is not an entity edit target"
);
assert.equal(vertexVisible, true);
assert.throws(() => layers.setRegionBounds({ ...exact, rowStart: -1 }));
assert.deepEqual(
  plain(layers.getRegionBounds()),
  exact,
  "invalid coordinate input preserves existing selection"
);
layers.currentViewState.resolutionDesciptor = {
  bpResolution: 1,
  pixelResolution: 0.01,
};
layers.setRegionBounds(exact);
assert.deepEqual(
  plain(layers.getRegionBounds()),
  exact,
  "BP endpoints survive display grid changes exactly"
);
layers.selectEntityRangeByBp(50, 250);
assert.deepEqual(Array.from(layers.currentViewState.selectedContigIds), [7, 8]);
assert.equal(
  layers.getRegionBounds(),
  undefined,
  "entity gesture clears analysis rectangle"
);
assert.deepEqual(plain(layers.getSelectedEntityRange()), {
  startBP: 0,
  endBP: 400,
});
layers.selectEntityRangeByBp(101, 102, "scaffold");
assert.deepEqual(Array.from(layers.currentViewState.selectedScaffoldIds), [42]);
layers.setRegionBounds(exact);
assert.equal(layers.currentViewState.selectedContigIds.length, 0);
assert.equal(layers.selectionCollections.selectedContigFeatures.getLength(), 0);
layers.clearSelections();
assert.equal(layers.getRegionBounds(), undefined);
assert.equal(vertexVisible, false);
console.log(
  "Separate entity/region state, exact BP projections, coordinate conventions, scopes, malformed inputs and long positions passed."
);

for (const frame of ["assembly", "scaffold", "contig"]) {
  for (const convention of ["one-based", "zero-based"]) {
    const formatted = (x, end) =>
      model.formatBoundary(x, end, convention, references, frame);
    const heading =
      frame[0].toUpperCase() +
      frame.slice(1) +
      " coordinates (bp, " +
      (convention === "one-based"
        ? "1-based inclusive)"
        : "0-based, end excluded)");
    const text = [
      heading,
      "Rows\t" + formatted(240, false) + "\t" + formatted(290, true),
      "Columns\t" + formatted(259, false) + "\t" + formatted(333, true),
    ].join("\r\n");
    assert.deepEqual(plain(model.parseCopiedRegion(text, references, domain)), {
      frame,
      convention,
      bounds: { rowStart: 240, rowEnd: 290, columnStart: 259, columnEnd: 333 },
    });
    assert.throws(() =>
      model.parseCopiedRegion(text + "\textra", references, domain)
    );
  }
}
