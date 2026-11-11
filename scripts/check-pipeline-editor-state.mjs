import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
const { LiteGraph, LGraphNode, LGraph } = require("litegraph.js");
const module = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      new URL(
        "../src/app/core/visualization/pipelineEditorState.ts",
        import.meta.url
      ),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }
  ).outputText,
  { module, exports: module.exports, require }
);
const { pipelineExpressionSignature } = module.exports;
const restorePipelineEditorGraph = (data, allowed) =>
  module.exports.restorePipelineEditorGraph(data, allowed, {
    LGraph,
    LiteGraph,
  });
class NumberNode extends LGraphNode {
  constructor() {
    super();
    this.properties = { value: 7 };
    this.addInput("input", "number");
    this.addInput("other", "number");
    this.addOutput("min", "number");
    this.addOutput("max", "number");
  }
}
class Inspector extends LGraphNode {
  constructor() {
    super();
    this.addInput("signal", "number");
  }
}
LiteGraph.registerNodeType("test/number", NumberNode);
LiteGraph.registerNodeType("test/inspector", Inspector);
const allowed = new Set(["test/number", "test/inspector"]);
const source = LiteGraph.createNode("test/number"),
  inspector = LiteGraph.createNode("test/inspector");
const original = new LGraph();
original.add(source);
original.add(inspector);
source.properties.value = 37;
source.pos = [125, 375];
inspector.pos = [500, 400];
source.connect(1, inspector, 0);
const encoded = JSON.parse(JSON.stringify(original.serialize()));
const restored = restorePipelineEditorGraph(encoded, allowed);
assert.equal(restored.getNodeById(source.id).properties.value, 37);
assert.deepEqual(
  Array.from(restored.getNodeById(source.id).pos).slice(0, 2),
  [125, 375]
);
assert.equal(restored.getNodeById(inspector.id).getInputLink(0).origin_slot, 1);
const clone = () => JSON.parse(JSON.stringify(encoded));
let bad = clone();
bad.nodes[0].type = "basic/script";
assert.throws(
  () => restorePipelineEditorGraph(bad, allowed),
  /Invalid pipeline node/
);
bad = clone();
bad.nodes[0].properties.value = "malformed";
assert.throws(
  () => restorePipelineEditorGraph(bad, allowed),
  /Invalid property/
);
bad = clone();
bad.links.push([...bad.links[0]]);
assert.throws(() => restorePipelineEditorGraph(bad, allowed), /duplicate/);
bad = clone();
bad.nodes[0].onExecute = "injected";
bad.onConfigure = "injected";
assert.equal(
  restorePipelineEditorGraph(bad, allowed).getNodeById(source.id).onExecute,
  undefined
);
bad = clone();
bad.nodes[0].id = 1e15;
assert.throws(() => restorePipelineEditorGraph(bad, allowed), /identity/);
const cycle = new LGraph(),
  a = LiteGraph.createNode("test/number"),
  b = LiteGraph.createNode("test/number");
cycle.add(a);
cycle.add(b);
a.connect(0, b, 0);
b.connect(0, a, 0);
assert.throws(
  () =>
    restorePipelineEditorGraph(
      JSON.parse(JSON.stringify(cycle.serialize())),
      allowed
    ),
  /cycle/
);
const color = {
  type: "colormap",
  minSignal: 0,
  maxSignal: 37,
  input: { type: "source", source: "PRIMARY" },
};
assert.equal(
  pipelineExpressionSignature(color),
  pipelineExpressionSignature({
    ...color,
    min: {
      type: "constant",
      value: 0,
      rangeSource: "PRIMARY",
      rangeOutput: "selectedMin",
    },
    max: {
      type: "constant",
      value: 37,
      rangeSource: "PRIMARY",
      rangeOutput: "selectedMax",
    },
  })
);
assert.notEqual(
  pipelineExpressionSignature(color),
  pipelineExpressionSignature({ ...color, maxSignal: 38 })
);
const expansive = new LGraph();
let previous;
for (let index = 0; index < 20; index++) {
  const node = LiteGraph.createNode("test/number");
  expansive.add(node);
  if (previous) {
    previous.connect(0, node, 0);
    previous.connect(1, node, 1);
  }
  previous = node;
}
assert.throws(
  () =>
    restorePipelineEditorGraph(
      JSON.parse(JSON.stringify(expansive.serialize())),
      allowed
    ),
  /expansion/
);
console.log(
  "Pipeline editor layout, output-port, validation and signature regressions passed."
);

const presetModule = { exports: {} };
const storage = new Map();
const sessionStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      new URL(
        "../src/app/core/visualization/renderPipelinePreset.ts",
        import.meta.url
      ),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }
  ).outputText,
  {
    module: presetModule,
    exports: presetModule.exports,
    TextEncoder,
    sessionStorage,
    require: (id) =>
      id === "./pipelineEditorState" ? module.exports : require(id),
  }
);
const {
  parseRenderPipelinePreset,
  captureRenderPipelinePreset,
  restorePresetEditorState,
  pipelineEditorStorageKey,
} = presetModule.exports;
const fullPreset = {
  enabled: true,
  swapUpperLower: true,
  upperExpression: {
    type: "rgb",
    c1: { type: "constant", value: 123 },
    c2: 4,
    c3: 5,
    alpha: 1,
  },
  lowerExpression: {
    type: "colormap",
    input: { type: "source", source: "SECONDARY" },
    startColor: "#ffffff",
    endColor: "#ff0000",
    minSignal: 0,
    maxSignal: 100,
  },
};
const plain = (value) => JSON.parse(JSON.stringify(value));
assert.equal(parseRenderPipelinePreset(undefined), undefined);
const detached = parseRenderPipelinePreset(fullPreset);
assert.deepEqual(plain(detached), fullPreset);
detached.upperExpression.c1.value = 9;
assert.equal(fullPreset.upperExpression.c1.value, 123);
for (const bad of [
  null,
  {},
  { ...fullPreset, enabled: 1 },
  { ...fullPreset, upperExpression: { type: "unknown" } },
  { ...fullPreset, lowerExpression: { type: "constant", value: NaN } },
  {
    ...fullPreset,
    lowerExpression: {
      type: "log_input",
      input: { type: "source", source: "PRIMARY" },
      base: 1,
    },
  },
  {
    ...fullPreset,
    lowerExpression: {
      type: "binary",
      op: "ADD",
      left: { type: "rgb" },
      right: { type: "constant", value: 1 },
    },
  },
  { ...fullPreset, editorState: { liteGraph: { nodes: null, links: [] } } },
  JSON.parse('{"enabled":true,"swapUpperLower":false,"constructor":{}}'),
])
  assert.throws(() => parseRenderPipelinePreset(bad));
let deep = { type: "source", source: "PRIMARY" };
for (let i = 0; i < 140; i++) deep = { type: "unary", op: "ABS", input: deep };
assert.throws(
  () => parseRenderPipelinePreset({ ...fullPreset, upperExpression: deep }),
  /limit/
);
assert.throws(
  () =>
    parseRenderPipelinePreset({
      ...fullPreset,
      extension: "x".repeat(2_000_000),
    }),
  /2 MB/
);
const host = "http://preset.test:5000/";
const key = pipelineEditorStorageKey(host);
const editorState = {
  liteGraph: {
    nodes: [{ id: 1, type: "hict/histogram", pos: [99, 101] }],
    links: [],
  },
  viewport: { scale: 0.6, offset: [-11, 12] },
};
const signature = pipelineExpressionSignature([
  fullPreset.upperExpression,
  fullPreset.lowerExpression,
]);
storage.set(
  key,
  JSON.stringify({ ...editorState, expressionSignature: signature })
);
const captured = captureRenderPipelinePreset(fullPreset, host);
assert.deepEqual(plain(captured.editorState), editorState);
restorePresetEditorState(captured, host);
assert.equal(JSON.parse(storage.get(key)).expressionSignature, signature);
storage.set(
  key,
  JSON.stringify({ ...editorState, expressionSignature: "unapplied draft" })
);
assert.equal(
  captureRenderPipelinePreset(fullPreset, host).editorState,
  undefined
);
storage.set(
  key,
  JSON.stringify({ liteGraph: null, expressionSignature: signature })
);
assert.equal(
  captureRenderPipelinePreset(fullPreset, host).editorState,
  undefined
);
storage.set(key, "invalid JSON");
assert.equal(
  captureRenderPipelinePreset(fullPreset, host).editorState,
  undefined
);
restorePresetEditorState(fullPreset, host);
assert.equal(storage.has(key), false);
console.log(
  "Full graph preset expressions, detached copies, validation and matching editor layout passed."
);

assert.equal(
  presetModule.exports.snapshotColorToRGBA([Math.fround(232 / 255), 0, 0, 1]),
  "rgba(232,0,0,1)"
);
assert.equal(
  presetModule.exports.snapshotColorToRGBA([
    0,
    Math.fround(11 / 255),
    1,
    Math.fround(128 / 255),
  ]),
  `rgba(0,11,255,${128 / 255})`
);
assert.throws(() => presetModule.exports.snapshotColorToRGBA([1, 2, 3]));
assert.throws(() => presetModule.exports.snapshotColorToRGBA([1, 2, 3, 1]));

const originalGet = sessionStorage.getItem;
const originalSet = sessionStorage.setItem;
sessionStorage.getItem = () => {
  throw new Error("Storage unavailable");
};
assert.deepEqual(
  plain(captureRenderPipelinePreset(fullPreset, host)),
  fullPreset
);
sessionStorage.setItem = () => {
  throw new Error("Storage full");
};
assert.doesNotThrow(() => restorePresetEditorState(captured, host));
sessionStorage.getItem = originalGet;
sessionStorage.setItem = originalSet;
let boundaryExpression = { type: "constant", value: 2 };
for (let index = 0; index < 120; index++)
  boundaryExpression = { type: "unary", op: "ABS", input: boundaryExpression };
assert.doesNotThrow(() =>
  parseRenderPipelinePreset({
    ...fullPreset,
    upperExpression: boundaryExpression,
  })
);
assert.throws(
  () =>
    parseRenderPipelinePreset({
      ...fullPreset,
      upperExpression: { type: "unary", op: "ABS", input: boundaryExpression },
    }),
  /nesting/
);

for (let channel = 0; channel <= 255; channel++) {
  assert.equal(
    presetModule.exports.snapshotColorToRGBA([
      Math.fround(channel / 255),
      Math.fround((255 - channel) / 255),
      0,
      Math.fround(channel / 255),
    ]),
    `rgba(${channel},${255 - channel},0,${channel / 255})`
  );
}
