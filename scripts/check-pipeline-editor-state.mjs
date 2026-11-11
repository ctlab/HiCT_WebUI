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
