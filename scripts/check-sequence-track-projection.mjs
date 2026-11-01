import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const file = new URL(
  "../src/app/core/visualization/sequenceTrackProjection.ts",
  import.meta.url
);
const exports = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText,
  { exports }
);
const { projectSequenceTrackBins: project } = exports;
const feature = {
  startBp: 8,
  endBp: 15,
  value: 4,
  count: 1,
  label: "gene",
  strand: "-",
  thickStartBp: 9,
  thickEndBp: 14,
  blocks: [
    { startBp: 8, endBp: 12, coding: true },
    { startBp: 13, endBp: 15, coding: false },
  ],
  attributes: { description: "original" },
};
const segments = [
  { start: 100, end: 105, assemblyStart: 5, gap: false },
  { start: 105, end: 1105, assemblyStart: null, gap: true },
  { start: 1105, end: 1115, assemblyStart: 10, gap: false },
];
const before = JSON.stringify({ feature, segments });
const pieces = project([feature], segments);
assert.equal(pieces.length, 2);
assert.equal(pieces[0].startPx, 103);
assert.equal(pieces[0].endPx, 105);
assert.equal(pieces[1].startPx, 1105);
assert.equal(pieces[1].endPx, 1110);
assert.equal(pieces[1].thickStartPx, 1105);
assert.equal(pieces[1].thickEndPx, 1109);
assert.deepEqual(
  JSON.parse(JSON.stringify(pieces[1].blocks.map((b) => [b.startPx, b.endPx]))),
  [
    [1105, 1107],
    [1108, 1110],
  ]
);
assert.equal(
  pieces[1].strand,
  "-",
  "assembly strand must not be reversed twice"
);
assert.equal(
  JSON.stringify({ feature, segments }),
  before,
  "do not mutate cached source responses"
);
assert.equal(
  project([feature], [segments[1]]).length,
  0,
  "a gap-only view has no inherited signal"
);
// Independent per-base oracle: variable-length pieces, cuts inside coding blocks,
// clipped windows, and zero-length pieces. No value may be painted into a gap.
let seed = 71;
const random = (n) => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed % n;
};
for (let trial = 0; trial < 1000; trial++) {
  let source = 0,
    padded = 0;
  const slices = [],
    oracle = new Map();
  for (let i = 0; i < 10; i++) {
    const length = random(16),
      gap = random(11);
    slices.push({
      start: padded,
      end: padded + length,
      assemblyStart: source,
      gap: false,
    });
    for (let j = 0; j < length; j++) oracle.set(source + j, padded + j);
    source += length;
    padded += length;
    slices.push({
      start: padded,
      end: padded + gap,
      assemblyStart: null,
      gap: true,
    });
    padded += gap;
  }
  const start = random(source + 1),
    end = start + random(source - start + 1);
  const output = project(
    [{ ...feature, startBp: start, endBp: end, blocks: [] }],
    slices
  );
  const actual = [];
  for (const p of output)
    for (let x = p.startPx; x < p.endPx; x++) actual.push(x);
  const expected = [];
  for (let x = start; x < end; x++) expected.push(oracle.get(x));
  assert.deepEqual(actual, expected);
}
console.log(
  "Padded annotation projection passed: gap-only, coding/exon splits, strands, immutable inputs and 1000 independent per-base oracle cases."
);

const managerFile = new URL(
  "../src/app/core/mapmanagers/LinearTrackManager.ts",
  import.meta.url
);
const managerExports = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(managerFile, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText,
  {
    exports: managerExports,
    require: (name) =>
      name.endsWith("sequenceTrackProjection") ? exports : {},
  }
);
const manager = Object.create(managerExports.LinearTrackManager.prototype);
const version = { session: "session-a", revision: 4 };
let queries = 0,
  checks = 0,
  draws = [];
const api = {
  history: { applied: version },
  queryTracks1DByUnits: async () => {
    queries++;
    return {
      startBp: 5,
      endBp: 20,
      tracks: [{ trackId: "features", bins: [feature] }],
    };
  },
  getAssemblyHistory: async () => {
    checks++;
    return { summary: version };
  },
};
manager.mapManager = {
  getLayersManager: () => ({
    currentViewState: { resolutionDesciptor: { bpResolution: 1000 } },
  }),
  networkManager: { requestManager: api },
};
manager.getVisibleTracksForAxis = () => [
  {
    trackId: "features",
    name: "Features",
    type: "BED",
    color: "#ff0000",
    renderStyle: "FEATURE",
  },
];
manager.drawTrackCanvas = (...args) => draws.push(args);
const canvas = { width: 1080, height: 60 },
  options = { start: 100, end: 1115, segments, isCurrent: () => true };
assert.ok(
  await manager.renderSequenceTracks(canvas, "vertical", options, "horizontal")
);
assert.equal(queries, 1);
assert.equal(checks, 1);
assert.equal(draws[0][1], "horizontal");
assert.equal(
  draws[0][5],
  false,
  "detached rendering must not update map hover/search/render caches"
);
assert.equal(
  draws[0][6],
  "vertical",
  "honor row visibility even when rendered horizontally"
);
assert.equal(draws[0][2].tracks[0].bins.length, 2);
api.getAssemblyHistory = async () => ({
  summary: { session: "session-a", revision: 5 },
});
await assert.rejects(
  manager.renderSequenceTracks(canvas, "horizontal", options),
  /changed in another client/
);
assert.equal(
  draws.length,
  1,
  "an intervening external edit must prevent drawing"
);
assert.equal(
  await manager.renderSequenceTracks(canvas, "horizontal", {
    ...options,
    isCurrent: () => false,
  }),
  null
);
assert.equal(
  draws.length,
  1,
  "obsolete navigation must not repaint the canvas"
);
const q = queries;
await manager.renderSequenceTracks(canvas, "horizontal", {
  ...options,
  segments: [segments[1]],
});
assert.equal(
  queries,
  q,
  "gap-only windows must not fetch source annotation data"
);
assert.equal(draws.at(-1)[2].tracks[0].bins.length, 0);
console.log(
  "Production annotation renderer guards passed: source-revision race, obsolete navigation, row visibility and no map-cache publication."
);
