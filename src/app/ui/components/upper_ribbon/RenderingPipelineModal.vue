<!--
 Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis, Zakhar Lobanov, Nikita Zheleznov and Computer Technologies Laboratory ITMO University team.

 Permission is hereby granted, free of charge, to any person obtaining a copy of
 this software and associated documentation files (the "Software"), to deal in
 the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
-->

<template>
  <div class="pipeline-root">
    <div class="modal-backdrop fade show"></div>
    <div class="modal fade show" tabindex="-1" style="display: block" role="dialog">
      <div class="modal-dialog modal-xl modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Rendering Pipeline</h5>
            <button type="button" class="btn-close" @click="emit('dismissed')"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-warning py-2 mb-3">
              Normalization dropdown updates this pipeline, but pipeline edits are not fully back-synced to checkbox controls.
            </div>
            <div class="d-flex gap-3 align-items-center mb-3">
              <div class="form-check">
                <input id="pipeline-enabled" v-model="enabled" class="form-check-input" type="checkbox" />
                <label class="form-check-label" for="pipeline-enabled">Enable custom pipeline</label>
              </div>
              <div class="form-check">
                <input id="pipeline-swap" v-model="swapUpperLower" class="form-check-input" type="checkbox" />
                <label class="form-check-label" for="pipeline-swap">Swap upper/lower diagonal branches</label>
              </div>
              <button class="btn btn-sm btn-outline-secondary ms-auto" :disabled="loading || saving" @click="loadConfig">
                Reload
              </button>
            </div>

            <div class="pipeline-graph card mb-2">
              <div class="card-body p-0">
                <div ref="graphHost" class="graph-host">
                  <canvas ref="graphCanvasRef" class="graph-canvas"></canvas>
                </div>
              </div>
            </div>
            <small class="text-muted d-block mb-2">
              Right-click to add nodes. Available node types: source, constant, dynamic fields, unary ops and binary ops.
              Keep "Upper sink" and "Lower sink" connected to branch outputs.
            </small>

            <div v-if="loading" class="py-2">
              <span class="spinner-border spinner-border-sm me-2"></span>
              Loading pipeline configuration…
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-danger me-auto" :disabled="saving" @click="resetConfig">
              Reset
            </button>
            <button class="btn btn-secondary" @click="emit('dismissed')">Close</button>
            <button class="btn btn-primary" :disabled="saving" @click="saveConfig">
              <span v-if="saving" class="spinner-border spinner-border-sm me-2"></span>
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { toast } from "vue-sonner";
import { LGraph, LGraphCanvas, LGraphNode, LiteGraph } from "litegraph.js";
import "litegraph.js/css/litegraph.css";

type SourceName = "PRIMARY" | "SECONDARY";
type UnaryOp = "ABS" | "LOG1P" | "EXP" | "NEG";
type BinaryOp = "ADD" | "SUB" | "MUL" | "DIV" | "MAX" | "MIN";
type DynamicField =
  | "ROW_BP"
  | "COL_BP"
  | "ROW_BIN"
  | "COL_BIN"
  | "ROW_PX"
  | "COL_PX"
  | "ROW_WEIGHT"
  | "COL_WEIGHT"
  | "DIAG_BP_DISTANCE"
  | "DIAG_BIN_DISTANCE"
  | "DIAG_PX_DISTANCE"
  | "BP_RESOLUTION";

type PipelineExpression =
  | { type: "source"; source: SourceName }
  | { type: "constant"; value: number }
  | { type: "dynamic"; field: DynamicField }
  | { type: "unary"; op: UnaryOp; input: PipelineExpression }
  | {
      type: "binary";
      op: BinaryOp;
      left: PipelineExpression;
      right: PipelineExpression;
    };

const SOURCE_NODE_TYPE = "hict/source";
const CONSTANT_NODE_TYPE = "hict/constant";
const DYNAMIC_NODE_TYPE = "hict/dynamic";
const UNARY_NODE_TYPE = "hict/unary";
const BINARY_NODE_TYPE = "hict/binary";
const SINK_NODE_TYPE = "hict/sink";

const DYNAMIC_FIELDS: DynamicField[] = [
  "ROW_BP",
  "COL_BP",
  "ROW_BIN",
  "COL_BIN",
  "ROW_PX",
  "COL_PX",
  "ROW_WEIGHT",
  "COL_WEIGHT",
  "DIAG_BP_DISTANCE",
  "DIAG_BIN_DISTANCE",
  "DIAG_PX_DISTANCE",
  "BP_RESOLUTION",
];

const UNARY_OPS: UnaryOp[] = ["ABS", "LOG1P", "EXP", "NEG"];
const BINARY_OPS: BinaryOp[] = ["ADD", "SUB", "MUL", "DIV", "MAX", "MIN"];

const emit = defineEmits<{
  (e: "dismissed"): void;
}>();

const props = defineProps<{
  mapManager?: ContactMapManager;
}>();

const enabled = ref(false);
const swapUpperLower = ref(false);
const loading = ref(false);
const saving = ref(false);
const graphHost = ref<HTMLDivElement | null>(null);
const graphCanvasRef = ref<HTMLCanvasElement | null>(null);

let graph: LGraph | null = null;
let graphCanvas: LGraphCanvas | null = null;
let resizeObserver: ResizeObserver | null = null;
let upperSinkId: number | null = null;
let lowerSinkId: number | null = null;
let nodeTypesRegistered = false;

const defaultExpression = (): PipelineExpression => ({
  type: "source",
  source: "PRIMARY",
});

const ensureMapManager = (): ContactMapManager => {
  if (!props.mapManager) {
    throw new Error("Map manager is unavailable");
  }
  return props.mapManager;
};

const toSourceName = (value: unknown): SourceName =>
  String(value ?? "PRIMARY").toUpperCase() === "SECONDARY"
    ? "SECONDARY"
    : "PRIMARY";

const toDynamicField = (value: unknown): DynamicField => {
  const candidate = String(value ?? "ROW_BP").toUpperCase() as DynamicField;
  return DYNAMIC_FIELDS.includes(candidate) ? candidate : "ROW_BP";
};

const toUnaryOp = (value: unknown): UnaryOp => {
  const candidate = String(value ?? "ABS").toUpperCase() as UnaryOp;
  return UNARY_OPS.includes(candidate) ? candidate : "ABS";
};

const toBinaryOp = (value: unknown): BinaryOp => {
  const candidate = String(value ?? "MUL").toUpperCase() as BinaryOp;
  return BINARY_OPS.includes(candidate) ? candidate : "MUL";
};

const parseExpression = (raw: unknown): PipelineExpression => {
  const node = (raw ?? {}) as Record<string, unknown>;
  const type = String(node.type ?? "source").toLowerCase();
  if (type === "constant") {
    const numeric = Number(node.value ?? 0);
    return {
      type: "constant",
      value: Number.isFinite(numeric) ? numeric : 0,
    };
  }
  if (type === "dynamic") {
    return {
      type: "dynamic",
      field: toDynamicField(node.field),
    };
  }
  if (type === "unary") {
    return {
      type: "unary",
      op: toUnaryOp(node.op),
      input: parseExpression(node.input),
    };
  }
  if (type === "binary") {
    return {
      type: "binary",
      op: toBinaryOp(node.op),
      left: parseExpression(node.left),
      right: parseExpression(node.right),
    };
  }
  return {
    type: "source",
    source: toSourceName(node.source),
  };
};

const ensureNodeTypesRegistered = (): void => {
  if (nodeTypesRegistered) {
    return;
  }

  class SourceNode extends LGraphNode {
    constructor() {
      super();
      this.title = "Source";
      this.addOutput("value", "number");
      this.properties = { source: "PRIMARY" };
      this.addWidget(
        "combo",
        "source",
        this.properties.source,
        (value: unknown) => {
          this.properties.source = toSourceName(value);
        },
        { values: ["PRIMARY", "SECONDARY"] }
      );
      this.size = [190, 72];
    }
  }

  class ConstantNode extends LGraphNode {
    constructor() {
      super();
      this.title = "Constant";
      this.addOutput("value", "number");
      this.properties = { value: 0 };
      this.addWidget("number", "value", this.properties.value, (value: unknown) => {
        const numeric = Number(value);
        this.properties.value = Number.isFinite(numeric) ? numeric : 0;
      });
      this.size = [190, 72];
    }
  }

  class DynamicNode extends LGraphNode {
    constructor() {
      super();
      this.title = "Dynamic";
      this.addOutput("value", "number");
      this.properties = { field: "ROW_BP" };
      this.addWidget(
        "combo",
        "field",
        this.properties.field,
        (value: unknown) => {
          this.properties.field = toDynamicField(value);
        },
        { values: DYNAMIC_FIELDS }
      );
      this.size = [220, 78];
    }
  }

  class UnaryNode extends LGraphNode {
    constructor() {
      super();
      this.title = "Unary";
      this.addInput("in", "number");
      this.addOutput("out", "number");
      this.properties = { op: "ABS" };
      this.addWidget(
        "combo",
        "op",
        this.properties.op,
        (value: unknown) => {
          this.properties.op = toUnaryOp(value);
        },
        { values: UNARY_OPS }
      );
      this.size = [190, 78];
    }
  }

  class BinaryNode extends LGraphNode {
    constructor() {
      super();
      this.title = "Binary";
      this.addInput("left", "number");
      this.addInput("right", "number");
      this.addOutput("out", "number");
      this.properties = { op: "MUL" };
      this.addWidget(
        "combo",
        "op",
        this.properties.op,
        (value: unknown) => {
          this.properties.op = toBinaryOp(value);
        },
        { values: BINARY_OPS }
      );
      this.size = [210, 92];
    }
  }

  class SinkNode extends LGraphNode {
    constructor() {
      super();
      this.title = "Sink";
      this.addInput("value", "number");
      this.properties = { branch: "UPPER" };
      this.color = "#0f766e";
      this.bgcolor = "#dcfce7";
      this.size = [190, 62];
    }
  }

  if (!LiteGraph.registered_node_types[SOURCE_NODE_TYPE]) {
    LiteGraph.registerNodeType(SOURCE_NODE_TYPE, SourceNode as unknown as { new (): LGraphNode });
  }
  if (!LiteGraph.registered_node_types[CONSTANT_NODE_TYPE]) {
    LiteGraph.registerNodeType(CONSTANT_NODE_TYPE, ConstantNode as unknown as { new (): LGraphNode });
  }
  if (!LiteGraph.registered_node_types[DYNAMIC_NODE_TYPE]) {
    LiteGraph.registerNodeType(DYNAMIC_NODE_TYPE, DynamicNode as unknown as { new (): LGraphNode });
  }
  if (!LiteGraph.registered_node_types[UNARY_NODE_TYPE]) {
    LiteGraph.registerNodeType(UNARY_NODE_TYPE, UnaryNode as unknown as { new (): LGraphNode });
  }
  if (!LiteGraph.registered_node_types[BINARY_NODE_TYPE]) {
    LiteGraph.registerNodeType(BINARY_NODE_TYPE, BinaryNode as unknown as { new (): LGraphNode });
  }
  if (!LiteGraph.registered_node_types[SINK_NODE_TYPE]) {
    LiteGraph.registerNodeType(SINK_NODE_TYPE, SinkNode as unknown as { new (): LGraphNode });
  }

  nodeTypesRegistered = true;
};

const fitGraphCanvas = (): void => {
  if (!graphHost.value || !graphCanvasRef.value || !graphCanvas) {
    return;
  }
  const width = Math.max(640, Math.floor(graphHost.value.clientWidth));
  const height = Math.max(380, Math.floor(graphHost.value.clientHeight));
  graphCanvasRef.value.width = width;
  graphCanvasRef.value.height = height;
  graphCanvas.resize(width, height);
  graphCanvas.draw(true, true);
};

const createSinkNodes = (): void => {
  if (!graph) {
    return;
  }
  const upperSink = LiteGraph.createNode(SINK_NODE_TYPE) as LGraphNode | null;
  const lowerSink = LiteGraph.createNode(SINK_NODE_TYPE) as LGraphNode | null;
  if (!upperSink || !lowerSink) {
    return;
  }
  upperSink.title = "Upper sink";
  upperSink.properties = { branch: "UPPER" };
  upperSink.pos = [880, 90];

  lowerSink.title = "Lower sink";
  lowerSink.properties = { branch: "LOWER" };
  lowerSink.pos = [880, 320];

  graph.add(upperSink);
  graph.add(lowerSink);
  upperSinkId = upperSink.id ?? null;
  lowerSinkId = lowerSink.id ?? null;
};

const initializeGraph = (): void => {
  if (!graphCanvasRef.value) {
    return;
  }
  ensureNodeTypesRegistered();
  graph = new LGraph();
  graphCanvas = new LGraphCanvas(graphCanvasRef.value, graph);
  graphCanvas.allow_interaction = true;
  graphCanvas.background_image = "";
  graphCanvas.ds.scale = 0.9;
  createSinkNodes();
  fitGraphCanvas();
  if (graphHost.value) {
    resizeObserver = new ResizeObserver(() => fitGraphCanvas());
    resizeObserver.observe(graphHost.value);
  }
};

const clearGraph = (): void => {
  graph?.clear();
  upperSinkId = null;
  lowerSinkId = null;
};

const createNodeFromExpression = (
  expression: PipelineExpression,
  depth: number,
  centerY: number
): LGraphNode | null => {
  if (!graph) {
    return null;
  }
  const x = Math.max(40, 640 - depth * 220);
  let node: LGraphNode | null = null;
  switch (expression.type) {
    case "source":
      node = LiteGraph.createNode(SOURCE_NODE_TYPE) as LGraphNode | null;
      if (node) {
        node.properties.source = expression.source;
      }
      break;
    case "constant":
      node = LiteGraph.createNode(CONSTANT_NODE_TYPE) as LGraphNode | null;
      if (node) {
        node.properties.value = expression.value;
      }
      break;
    case "dynamic":
      node = LiteGraph.createNode(DYNAMIC_NODE_TYPE) as LGraphNode | null;
      if (node) {
        node.properties.field = expression.field;
      }
      break;
    case "unary": {
      node = LiteGraph.createNode(UNARY_NODE_TYPE) as LGraphNode | null;
      if (node) {
        node.properties.op = expression.op;
      }
      break;
    }
    case "binary": {
      node = LiteGraph.createNode(BINARY_NODE_TYPE) as LGraphNode | null;
      if (node) {
        node.properties.op = expression.op;
      }
      break;
    }
  }

  if (!node) {
    return null;
  }

  node.pos = [x, centerY];
  graph.add(node);

  if (expression.type === "unary") {
    const inputNode = createNodeFromExpression(expression.input, depth + 1, centerY);
    inputNode?.connect(0, node, 0);
  } else if (expression.type === "binary") {
    const leftNode = createNodeFromExpression(expression.left, depth + 1, centerY - 80);
    const rightNode = createNodeFromExpression(expression.right, depth + 1, centerY + 80);
    leftNode?.connect(0, node, 0);
    rightNode?.connect(0, node, 1);
  }

  return node;
};

const buildGraphFromExpressions = (
  upperExpression: PipelineExpression,
  lowerExpression: PipelineExpression
): void => {
  if (!graph) {
    return;
  }
  clearGraph();
  createSinkNodes();

  const upperSink = upperSinkId != null ? graph.getNodeById(upperSinkId) : null;
  const lowerSink = lowerSinkId != null ? graph.getNodeById(lowerSinkId) : null;
  const upperNode = createNodeFromExpression(upperExpression, 0, 90);
  const lowerNode = createNodeFromExpression(lowerExpression, 0, 320);
  if (upperNode && upperSink) {
    upperNode.connect(0, upperSink, 0);
  }
  if (lowerNode && lowerSink) {
    lowerNode.connect(0, lowerSink, 0);
  }
  graphCanvas?.draw(true, true);
};

const expressionFromNode = (
  node: LGraphNode | null,
  visited: Set<number>
): PipelineExpression => {
  if (!node) {
    return defaultExpression();
  }
  const nodeId = node.id ?? -1;
  if (visited.has(nodeId)) {
    return defaultExpression();
  }
  visited.add(nodeId);

  if (node.type === SOURCE_NODE_TYPE) {
    return {
      type: "source",
      source: toSourceName(node.properties?.source),
    };
  }
  if (node.type === CONSTANT_NODE_TYPE) {
    const value = Number(node.properties?.value ?? 0);
    return {
      type: "constant",
      value: Number.isFinite(value) ? value : 0,
    };
  }
  if (node.type === DYNAMIC_NODE_TYPE) {
    return {
      type: "dynamic",
      field: toDynamicField(node.properties?.field),
    };
  }
  if (node.type === UNARY_NODE_TYPE) {
    return {
      type: "unary",
      op: toUnaryOp(node.properties?.op),
      input: expressionFromNode(node.getInputNode(0), visited),
    };
  }
  if (node.type === BINARY_NODE_TYPE) {
    return {
      type: "binary",
      op: toBinaryOp(node.properties?.op),
      left: expressionFromNode(node.getInputNode(0), visited),
      right: expressionFromNode(node.getInputNode(1), visited),
    };
  }

  return defaultExpression();
};

const expressionFromSink = (branch: "UPPER" | "LOWER"): PipelineExpression => {
  if (!graph) {
    return defaultExpression();
  }
  const sinkId = branch === "UPPER" ? upperSinkId : lowerSinkId;
  if (sinkId == null) {
    return defaultExpression();
  }
  const sinkNode = graph.getNodeById(sinkId);
  const sourceNode = sinkNode?.getInputNode(0) ?? null;
  return expressionFromNode(sourceNode, new Set<number>());
};

const loadConfig = async (): Promise<void> => {
  loading.value = true;
  try {
    const manager = ensureMapManager();
    const response = await manager.networkManager.requestManager.getRenderPipelineConfig();
    enabled.value = Boolean(response.enabled ?? false);
    swapUpperLower.value = Boolean(response.swapUpperLower ?? false);
    const upperExpression = parseExpression(response.upperExpression ?? response.upper);
    const lowerExpression = parseExpression(response.lowerExpression ?? response.lower);
    buildGraphFromExpressions(upperExpression, lowerExpression);
  } catch (error) {
    toast.error(String(error));
  } finally {
    loading.value = false;
  }
};

const saveConfig = async (): Promise<void> => {
  saving.value = true;
  try {
    const manager = ensureMapManager();
    await manager.networkManager.requestManager.setRenderPipelineConfig({
      enabled: enabled.value,
      swapUpperLower: swapUpperLower.value,
      upperExpression: expressionFromSink("UPPER"),
      lowerExpression: expressionFromSink("LOWER"),
    });
    await manager.reloadTilesFromBackend();
    toast.success("Rendering pipeline updated");
  } catch (error) {
    toast.error(String(error));
  } finally {
    saving.value = false;
  }
};

const resetConfig = async (): Promise<void> => {
  saving.value = true;
  try {
    const manager = ensureMapManager();
    const response = await manager.networkManager.requestManager.resetRenderPipelineConfig();
    enabled.value = Boolean(response.enabled ?? false);
    swapUpperLower.value = Boolean(response.swapUpperLower ?? false);
    buildGraphFromExpressions(
      parseExpression(response.upperExpression ?? response.upper),
      parseExpression(response.lowerExpression ?? response.lower)
    );
    await manager.reloadTilesFromBackend();
    toast.success("Rendering pipeline reset");
  } catch (error) {
    toast.error(String(error));
  } finally {
    saving.value = false;
  }
};

onMounted(() => {
  initializeGraph();
  void loadConfig();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  graphCanvas?.clear();
  graphCanvas = null;
  graph?.clear();
  graph = null;
});
</script>

<style scoped>
.pipeline-root .modal {
  z-index: 1065;
}

.pipeline-graph {
  min-height: 420px;
  overflow: hidden;
}

.graph-host {
  position: relative;
  width: 100%;
  height: 420px;
  background: #111827;
}

.graph-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.pipeline-root :deep(.litegraph) {
  background: transparent;
}
</style>
