import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
function loadTypeScript(url) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(url, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
    {
      exports,
      TextEncoder,
      require: (id) => {
        if (id.startsWith("@/"))
          return loadTypeScript(
            new URL(`../src/${id.slice(2)}.ts`, import.meta.url)
          );
        if (id.startsWith(".")) return loadTypeScript(new URL(`${id}.ts`, url));
        return nodeRequire(id);
      },
    }
  );
  return exports;
}
const sandbox = {
  exports: loadTypeScript(
    new URL("../src/app/core/mapmanagers/SessionDocument.ts", import.meta.url)
  ),
};
const { parseSessionDocument, createSessionEnvelope, MAX_SESSION_BYTES } =
  sandbox.exports;
const valid = {
  version: 2,
  filename: "tiny.hict.hdf5",
  view: { center: [1, -1], resolution: 1, rotation: 0 },
};
assert.equal(
  parseSessionDocument(JSON.stringify(valid)).filename,
  valid.filename
);
assert.equal(parseSessionDocument('{"version":1}').version, 1);
const reject = (document, field) =>
  assert.throws(
    () => parseSessionDocument(JSON.stringify(document)),
    new RegExp(field)
  );
for (const version of [undefined, 0, 4, 999, "2", null])
  reject({ ...valid, version }, "version");
for (const document of [null, [], "session"]) reject(document, "document");
for (const center of [[], [1], [1, 2, 3], ["1", 2], [null, 2], {}])
  reject({ ...valid, view: { center } }, "view.center");
for (const resolution of [0, -1, "1", null])
  reject({ ...valid, view: { resolution } }, "view.resolution");
reject({ ...valid, view: { rotation: "0" } }, "view.rotation");
reject({ ...valid, filename: 42 }, "filename");
reject({ ...valid, visualizationOptions: [] }, "visualizationOptions");
reject(
  { ...valid, axisTrackVisibility: { horizontalHidden: [1] } },
  "horizontalHidden"
);
reject(
  {
    ...valid,
    savedLocations: [
      { location_id: 1, center_point: [1, 2], resolution: 0, rotation: 0 },
    ],
  },
  "resolution"
);
const bookmark = {
  location_id: 1,
  center_point: [1, -2],
  resolution: 1,
  rotation: 0,
};
assert.equal(
  parseSessionDocument(JSON.stringify({ ...valid, savedLocations: [bookmark] }))
    .savedLocations[0].name,
  undefined
);
assert.equal(
  parseSessionDocument(
    JSON.stringify({
      ...valid,
      savedLocations: [{ ...bookmark, name: "Landmark α🧬" }],
    })
  ).savedLocations[0].name,
  "Landmark α🧬"
);
reject({ ...valid, savedLocations: [{ ...bookmark, name: {} }] }, "name");
reject({ ...valid, savedVisualizationPresets: [{}] }, "option_id");
assert.throws(
  () => parseSessionDocument('{"version":2,"view":{"resolution":1e999}}'),
  /view.resolution/
);
assert.throws(
  () => parseSessionDocument('{"version":2,"__proto__":{}}'),
  /reserved/
);
assert.throws(() => parseSessionDocument("{"), /valid JSON/);
assert.throws(
  () => parseSessionDocument(" ".repeat(MAX_SESSION_BYTES + 1)),
  /8 MiB/
);
let nested = {};
for (let i = 0; i < 170; i++) nested = { child: nested };
reject({ ...valid, extra: nested }, "nesting limit");
reject({ ...valid, extra: Array(100001).fill(null) }, "too many values");
console.log(
  "Session versions, finite coordinates, field shapes and resource bounds passed."
);

for (const options of [
  { applyCoolerWeights: "false" },
  { postLogBase: 1 },
  { autoThresholdQuantile: 2 },
  { signalDisplayMode: "unknown" },
  { colormap: { minSignal: 4, maxSignal: 1 } },
  { colormap: { startColorRGBAString: "invalid color" } },
  { coolerWeightsNaNCount: 1.5 },
])
  reject({ ...valid, visualizationOptions: options }, "visualizationOptions");
reject({ ...valid, trackStyles: { contigs: {} } }, "trackStyles.contigs");
assert.equal(
  parseSessionDocument(JSON.stringify({ ...valid, trackStyles: {} }))
    .trackStyles,
  undefined
);
reject(
  {
    ...valid,
    savedVisualizationPresets: [
      {
        option_id: 1,
        name: "bad",
        action: { type: "sequence-overlay", kind: "unknown", mode: "overlay" },
      },
    ],
  },
  "action.kind"
);
reject(
  {
    ...valid,
    savedVisualizationPresets: [
      { option_id: 1, name: "a" },
      { option_id: 1, name: "b" },
    ],
  },
  "duplicate ID"
);
// Version 3: envelope around a server snapshot plus client-only state.
const snapshot = {
  snapshotVersion: 1,
  filesFingerprinted: true,
  assemblySource: "PRIMARY",
  primary: { filename: "tiny.hict.hdf5" },
  secondary: null,
  tracks: [],
  renderPipeline: { enabled: false },
};
const client = {
  workspace: {
    version: 1,
    background: "rgba(255,255,255,1)",
    view: { center: [1, -1], resolution: 2, rotation: 0 },
  },
  savedLocations: [],
  savedVisualizationPresets: [],
};
const v3 = createSessionEnvelope(snapshot, client, "2026-11-10T00:00:00.000Z");
assert.equal(v3.version, 3);
assert.equal(v3.format, "hict-session");
const parsed = parseSessionDocument(JSON.stringify(v3));
assert.equal(parsed.snapshot.primary.filename, "tiny.hict.hdf5");
const namedClient = {
  ...client,
  savedLocations: [{ ...bookmark, name: "Landmark α🧬" }],
};
assert.equal(
  parseSessionDocument(
    JSON.stringify(createSessionEnvelope(snapshot, namedClient))
  ).client.savedLocations[0].name,
  "Landmark α🧬"
);
reject(
  createSessionEnvelope(snapshot, {
    ...client,
    savedLocations: [{ ...bookmark, name: 42 }],
  }),
  "name"
);
// A document with no recorded file identities cannot be restored safely.
reject({ ...v3, snapshot: { ...snapshot, filesFingerprinted: false } }, "filesFingerprinted");
reject({ ...v3, format: "other" }, "format");
reject({ ...v3, snapshot: [] }, "snapshot");
reject({ ...v3, snapshot: { ...snapshot, snapshotVersion: 2 } }, "snapshotVersion");
reject({ ...v3, snapshot: { ...snapshot, primary: {} } }, "primary.filename");
reject({ ...v3, snapshot: { ...snapshot, assemblySource: "BOTH" } }, "assemblySource");
reject({ ...v3, snapshot: { ...snapshot, assemblySource: "SECONDARY" } }, "SECONDARY needs");
reject({ ...v3, snapshot: { ...snapshot, tracks: {} } }, "snapshot.tracks");
reject({ ...v3, snapshot: { ...snapshot, renderPipeline: null } }, "renderPipeline");
reject({ ...v3, client: null }, "client");
reject(
  { ...v3, client: { ...client, workspace: { ...client.workspace, version: 2 } } },
  "workspace.version"
);
reject(
  {
    ...v3,
    client: {
      ...client,
      workspace: { ...client.workspace, view: { center: [1], resolution: 1, rotation: 0 } },
    },
  },
  "client.workspace.view.center"
);
reject(
  {
    ...v3,
    client: {
      ...client,
      savedLocations: [
        { location_id: 1, center_point: [1, 2], resolution: 0, rotation: 0 },
      ],
    },
  },
  "client.savedLocations\\[0\\].resolution"
);
reject({ ...v3, version: 7 }, "newer HiCT");
for (const mode of ["FILE", "SQRT_COVERAGE"])
  parseSessionDocument(JSON.stringify({ ...v3, client: { ...client, normalizationWeights: mode } }));
reject({ ...v3, client: { ...client, normalizationWeights: "AVERAGE" } }, "client.normalizationWeights");
console.log("Version 3 envelope, identity requirement and client state validation passed.");
for (const filename of process.argv.slice(2))
  parseSessionDocument(fs.readFileSync(filename, "utf8"));
console.log(
  "Nested visualization, style, palette/action and duplicate-ID validation passed."
);

const fullGraph = {
  enabled: true,
  swapUpperLower: true,
  upperExpression: {
    type: "colormap",
    input: { type: "source", source: "PRIMARY" },
    startColor: "#ffffff",
    endColor: "#ff0000",
    minSignal: 0,
    maxSignal: 9,
  },
  lowerExpression: { type: "rgb", c1: 1, c2: 2, c3: 3, alpha: 255 },
  editorState: {
    liteGraph: { nodes: [], links: [] },
    viewport: { scale: 0.5, offset: [2, 3] },
  },
};
const fullLibrary = {
  ...v3,
  client: {
    ...client,
    savedVisualizationPresets: [
      { option_id: 91, name: "Complete graph", renderPipeline: fullGraph },
    ],
  },
};
assert.deepEqual(
  JSON.parse(
    JSON.stringify(
      parseSessionDocument(JSON.stringify(fullLibrary)).client
        .savedVisualizationPresets[0].renderPipeline
    )
  ),
  fullGraph
);
const invalidLibrary = JSON.parse(JSON.stringify(fullLibrary));
invalidLibrary.client.savedVisualizationPresets[0].renderPipeline.upperExpression =
  { type: "unknown" };
assert.throws(
  () => parseSessionDocument(JSON.stringify(invalidLibrary)),
  /Unsupported expression/
);
let chain = { type: "source", source: "PRIMARY" };
for (let index = 0; index < 100; index++)
  chain = { type: "unary", op: "ABS", input: chain };
fullLibrary.client.savedVisualizationPresets[0].renderPipeline.upperExpression =
  chain;
assert.doesNotThrow(() => parseSessionDocument(JSON.stringify(fullLibrary)));
console.log(
  "Complete preset graphs and editor layouts survive native session parsing with bounded deep expressions."
);
