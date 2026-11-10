import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(
  new URL("../src/app/core/mapmanagers/SessionDocument.ts", import.meta.url),
  "utf8"
);
const sandbox = { exports: {}, TextEncoder };
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText,
  sandbox
);
const { parseSessionDocument, MAX_SESSION_BYTES } = sandbox.exports;
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
for (const version of [undefined, 0, 3, 999, "2", null])
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
for (let i = 0; i < 40; i++) nested = { child: nested };
reject({ ...valid, extra: nested }, "nesting limit");
reject({ ...valid, extra: Array(100001).fill(null) }, "too many values");
console.log(
  "Session versions, finite coordinates, field shapes and resource bounds passed."
);
