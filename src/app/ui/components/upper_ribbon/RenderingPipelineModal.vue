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
    <div v-show="!previewMode" class="modal-backdrop fade show"></div>
    <div
      class="modal fade show"
      :class="{ 'pipeline-preview': previewMode }"
      tabindex="-1"
      style="display: block"
      role="dialog"
    >
      <div class="modal-dialog pipeline-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Rendering Pipeline</h5>
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary ms-auto me-2 d-flex align-items-center gap-1"
              @click="togglePreviewMode"
            >
              <i :class="previewMode ? 'bi bi-eye-slash' : 'bi bi-eye'"></i>
              <span>{{ previewMode ? "Show editor" : "Preview" }}</span>
            </button>
            <button type="button" class="btn-close" @click="dismissModal"></button>
          </div>
          <div v-if="!previewMode" class="modal-body">
            <div class="alert alert-warning py-2 mb-3">
              Normalization dropdown updates this pipeline, but pipeline edits are not fully back-synced to checkbox controls. Expected and O/E views fall back to the standard renderer because custom pipelines operate on per-pixel signals.
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
              <select
                v-model="selectedPresetId"
                class="form-select form-select-sm pipeline-preset-select"
                :disabled="loading || saving"
              >
                <option
                  v-for="preset in RENDERING_PRESETS"
                  :key="preset.id"
                  :value="preset.id"
                >
                  {{ preset.label }}
                </option>
              </select>
              <button
                class="btn btn-sm btn-outline-primary"
                :disabled="loading || saving"
                @click="loadSelectedPreset"
              >
                Load preset
              </button>
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
              Right-click to add HiCT nodes only. Upper/Lower sinks accept color outputs; use the same full-map graph on both sinks for overlays.
            </small>

            <div v-if="loading" class="py-2">
              <span class="spinner-border spinner-border-sm me-2"></span>
              Loading pipeline configuration…
            </div>
          </div>
          <div v-if="!previewMode" class="modal-footer">
            <button class="btn btn-outline-danger me-auto" :disabled="saving" @click="resetConfig">
              Reset
            </button>
            <input
              ref="importInputRef"
              type="file"
              accept=".json,application/json"
              class="d-none"
              @change="onImportFileSelected"
            />
            <button class="btn btn-outline-secondary" :disabled="saving || loading" @click="exportGraphToFile">
              Export graph
            </button>
            <button class="btn btn-outline-secondary" :disabled="saving || loading" @click="triggerImportGraph">
              Import graph
            </button>
            <button class="btn btn-secondary" @click="dismissModal">Close</button>
            <button
              class="btn btn-outline-primary"
              :disabled="saving || previewing"
              @click="previewConfig"
            >
              <span
                v-if="previewing"
                class="spinner-border spinner-border-sm me-2"
              ></span>
              Preview
            </button>
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
import { VisualizationManager } from "@/app/core/mapmanagers/VisualizationManager";
import type { TrackSummaryResponse } from "@/app/core/net/api/response";
import SimpleLinearGradient from "@/app/core/visualization/colormap/SimpleLinearGradient";
import { useStyleStore } from "@/app/stores/styleStore";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
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
  | "RESOLUTION_SCALING_COEFF"
  | "RESOLUTION_LINEAR_SCALING_COEFF"
  | "DIAG_BP_DISTANCE"
  | "DIAG_BIN_DISTANCE"
  | "DIAG_PX_DISTANCE"
  | "BP_RESOLUTION";
type TrackAxis = "ROW" | "COL";
type ColorSpaceNodeType = "rgb" | "hsl" | "hsv";
type PixelBlendMode =
  | "OVER"
  | "ADD"
  | "SUBTRACT"
  | "MULTIPLY"
  | "SCREEN"
  | "DIFFERENCE"
  | "LIGHTEN"
  | "DARKEN"
  | "XOR";

type PipelineExpression =
  | { type: "source"; source: SourceName }
  | { type: "track1d"; trackId: string; axis: TrackAxis }
  | { type: "constant"; value: number }
  | { type: "dynamic"; field: DynamicField }
  | { type: "unary"; op: UnaryOp; input: PipelineExpression }
  | {
      type: "log";
      input: PipelineExpression;
      base: number;
    }
  | {
      type: "log_input";
      input: PipelineExpression;
      base: PipelineExpression;
    }
  | {
      type: "binary";
      op: BinaryOp;
      left: PipelineExpression;
      right: PipelineExpression;
    }
  | {
      type: "clamp";
      input: PipelineExpression;
      minValue: number;
      maxValue: number;
    }
  | {
      type: "colormap";
      mode: "LINEAR";
      input: PipelineExpression;
      startColor: string;
      endColor: string;
      minSignal: number;
      maxSignal: number;
    }
  | {
      type: ColorSpaceNodeType;
      c1: PipelineExpression;
      c2: PipelineExpression;
      c3: PipelineExpression;
      alpha: PipelineExpression;
    }
  | {
      type: "pixel_blend";
      mode: PixelBlendMode;
      top: PipelineExpression;
      bottom: PipelineExpression;
      topOpacity: number;
      bottomOpacity: number;
    };

const SOURCE_NODE_TYPE = "hict/source";
const TRACK1D_NODE_TYPE = "hict/track1d";
const CONSTANT_NODE_TYPE = "hict/constant";
const DYNAMIC_NODE_TYPE = "hict/dynamic";
const UNARY_NODE_TYPE = "hict/unary";
const LOG_NODE_TYPE = "hict/log";
const LOG_INPUT_NODE_TYPE = "hict/log_input";
const BINARY_NODE_TYPE = "hict/binary";
const CLAMP_NODE_TYPE = "hict/clamp";
const COLORMAP_NODE_TYPE = "hict/colormap";
const RGB_NODE_TYPE = "hict/rgb";
const HSL_NODE_TYPE = "hict/hsl";
const HSV_NODE_TYPE = "hict/hsv";
const PIXEL_BLEND_NODE_TYPE = "hict/pixel_blend";
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
  "RESOLUTION_SCALING_COEFF",
  "RESOLUTION_LINEAR_SCALING_COEFF",
  "DIAG_BP_DISTANCE",
  "DIAG_BIN_DISTANCE",
  "DIAG_PX_DISTANCE",
  "BP_RESOLUTION",
];

const UNARY_OPS: UnaryOp[] = ["ABS", "LOG1P", "EXP", "NEG"];
const BINARY_OPS: BinaryOp[] = ["ADD", "SUB", "MUL", "DIV", "MAX", "MIN"];
const PIXEL_BLEND_MODES: PixelBlendMode[] = [
  "OVER",
  "ADD",
  "SUBTRACT",
  "MULTIPLY",
  "SCREEN",
  "DIFFERENCE",
  "LIGHTEN",
  "DARKEN",
  "XOR",
];
const HICT_PIPELINE_FILTER = "hict_pipeline_graph";
const BUILTIN_COOLER_WEIGHTS_TRACK_ID = "__builtin_cooler_weights__";
const NODE_MENU_CATEGORY_ORDER = [
  "Sources",
  "Constants",
  "Math",
  "Colormaps",
  "Compositing",
  "Outputs",
] as const;
const NODE_MENU_NODE_TYPES_BY_CATEGORY: Record<(typeof NODE_MENU_CATEGORY_ORDER)[number], string[]> = {
  Sources: [SOURCE_NODE_TYPE, TRACK1D_NODE_TYPE, DYNAMIC_NODE_TYPE],
  Constants: [CONSTANT_NODE_TYPE],
  Math: [UNARY_NODE_TYPE, LOG_NODE_TYPE, LOG_INPUT_NODE_TYPE, BINARY_NODE_TYPE, CLAMP_NODE_TYPE],
  Colormaps: [COLORMAP_NODE_TYPE, RGB_NODE_TYPE, HSL_NODE_TYPE, HSV_NODE_TYPE],
  Compositing: [PIXEL_BLEND_NODE_TYPE],
  Outputs: [SINK_NODE_TYPE],
};

const RENDERING_PRESETS = [
  { id: "primary_only", label: "Default Primary only" },
  { id: "dotplot_overlay", label: "Dotplot overlay" },
] as const;
type RenderingPresetId = (typeof RENDERING_PRESETS)[number]["id"];

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
const previewing = ref(false);
const previewMode = ref(false);
const selectedPresetId = ref<RenderingPresetId>("primary_only");
const graphHost = ref<HTMLDivElement | null>(null);
const graphCanvasRef = ref<HTMLCanvasElement | null>(null);
const importInputRef = ref<HTMLInputElement | null>(null);
const trackOptions = ref<TrackSummaryResponse[]>([]);
const pendingVisualizationSync = ref(false);
const previewSnapshot = ref<{
  enabled: boolean;
  swapUpperLower: boolean;
  upperExpression: PipelineExpression;
  lowerExpression: PipelineExpression;
} | null>(null);

let graph: LGraph | null = null;
let graphCanvas: LGraphCanvas | null = null;
let resizeObserver: ResizeObserver | null = null;
let upperSinkId: number | null = null;
let lowerSinkId: number | null = null;
let nodeTypesRegistered = false;
let activeNativeColorInput: HTMLInputElement | null = null;

let originalGetNodeTypesCategories: ((filter?: string) => string[]) | null = null;
let originalGetNodeTypesInCategory:
  | ((category: string, filter?: string) => Array<{ type: string }>)
  | null = null;

const visualizationOptionsStore = useVisualizationOptionsStore();
const styleStore = useStyleStore();

const defaultSignalExpression = (): PipelineExpression => ({
  type: "source",
  source: "PRIMARY",
});

const clampToRange = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
};

const defaultColorExpression = (input?: PipelineExpression): PipelineExpression => ({
  type: "colormap",
  mode: "LINEAR",
  input: input ?? defaultSignalExpression(),
  startColor: "#ffffff00",
  endColor: "#006000ff",
  minSignal: 0,
  maxSignal: 1,
});

const cloneExpression = <T extends PipelineExpression>(expression: T): T =>
  JSON.parse(JSON.stringify(expression)) as T;

const ensureMapManager = (): ContactMapManager => {
  if (!props.mapManager) {
    throw new Error("Map manager is unavailable");
  }
  return props.mapManager;
};

const sanitizeColor = (value: unknown, fallback: string): string => {
  const text = String(value ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text) || /^#[0-9a-fA-F]{8}$/.test(text)) {
    return text;
  }
  return fallback;
};

const toPixelBlendMode = (value: unknown): PixelBlendMode => {
  const normalized = String(value ?? "OVER").trim().toUpperCase();
  return PIXEL_BLEND_MODES.includes(normalized as PixelBlendMode)
    ? (normalized as PixelBlendMode)
    : "OVER";
};

const getVisualizationGradient = (): SimpleLinearGradient | null => {
  const gradient = visualizationOptionsStore.colormap;
  return gradient instanceof SimpleLinearGradient ? gradient : null;
};

const buildSignalExpressionFromVisualizationOptions = (
  source: SourceName,
  overrides?: {
    preLogBase?: number;
    postLogBase?: number;
    applyCoolerWeights?: boolean;
    resolutionScaling?: boolean;
    resolutionLinearScaling?: boolean;
  }
): PipelineExpression => {
  const preLogBase =
    overrides?.preLogBase ?? visualizationOptionsStore.preLogBase;
  const postLogBase =
    overrides?.postLogBase ?? visualizationOptionsStore.postLogBase;
  const applyCoolerWeights =
    overrides?.applyCoolerWeights ??
    visualizationOptionsStore.applyCoolerWeights;
  const resolutionScaling =
    overrides?.resolutionScaling ??
    visualizationOptionsStore.resolutionScaling;
  const resolutionLinearScaling =
    overrides?.resolutionLinearScaling ??
    visualizationOptionsStore.resolutionLinearScaling;

  let expression: PipelineExpression = {
    type: "source",
    source,
  };
  if (Number.isFinite(preLogBase) && preLogBase > 0 && Math.abs(preLogBase - 1) > 1e-9) {
    expression = {
      type: "log",
      input: expression,
      base: preLogBase,
    };
  }
  if (resolutionScaling) {
    expression = {
      type: "binary",
      op: "MUL",
      left: expression,
      right: { type: "dynamic", field: "RESOLUTION_SCALING_COEFF" },
    };
  }
  if (resolutionLinearScaling) {
    expression = {
      type: "binary",
      op: "MUL",
      left: expression,
      right: { type: "dynamic", field: "RESOLUTION_LINEAR_SCALING_COEFF" },
    };
  }
  if (applyCoolerWeights) {
    expression = {
      type: "binary",
      op: "MUL",
      left: expression,
      right: {
        type: "binary",
        op: "MUL",
        left: {
          type: "track1d",
          trackId: BUILTIN_COOLER_WEIGHTS_TRACK_ID,
          axis: "ROW",
        },
        right: {
          type: "track1d",
          trackId: BUILTIN_COOLER_WEIGHTS_TRACK_ID,
          axis: "COL",
        },
      },
    };
  }
  if (Number.isFinite(postLogBase) && postLogBase > 0 && Math.abs(postLogBase - 1) > 1e-9) {
    expression = {
      type: "log",
      input: expression,
      base: postLogBase,
    };
  }
  return expression;
};

const buildColorExpressionFromVisualizationOptions = (
  source: SourceName,
  overrides?: {
    preLogBase?: number;
    postLogBase?: number;
    applyCoolerWeights?: boolean;
    resolutionScaling?: boolean;
    resolutionLinearScaling?: boolean;
    startColor?: string;
    endColor?: string;
    minSignal?: number;
    maxSignal?: number;
  }
): PipelineExpression => {
  const gradient = getVisualizationGradient();
  const minSignal = gradient?.minSignal;
  const maxSignal = gradient?.maxSignal;
  return {
    type: "colormap",
    mode: "LINEAR",
    input: buildSignalExpressionFromVisualizationOptions(source, overrides),
    startColor: sanitizeColor(
      overrides?.startColor ?? gradient?.startColorRGBA?.HEXA,
      "#ffffff00"
    ),
    endColor: sanitizeColor(
      overrides?.endColor ?? gradient?.endColorRGBA?.HEXA,
      "#006000ff"
    ),
    minSignal:
      overrides?.minSignal ??
      (typeof minSignal === "number" && Number.isFinite(minSignal)
        ? minSignal
        : 0),
    maxSignal:
      overrides?.maxSignal ??
      (typeof maxSignal === "number" && Number.isFinite(maxSignal)
        ? maxSignal
        : 1),
  };
};

const buildPrimaryOnlyPreset = (): {
  enabled: boolean;
  swapUpperLower: boolean;
  upperExpression: PipelineExpression;
  lowerExpression: PipelineExpression;
} => {
  const expression = buildColorExpressionFromVisualizationOptions("PRIMARY");
  return {
    enabled: true,
    swapUpperLower: false,
    upperExpression: expression,
    lowerExpression: cloneExpression(expression),
  };
};

const buildDotplotOverlayPreset = (): {
  enabled: boolean;
  swapUpperLower: boolean;
  upperExpression: PipelineExpression;
  lowerExpression: PipelineExpression;
} => {
  const darkBackground = styleStore.mapBackgroundColor.L <= 55;
  const top = buildColorExpressionFromVisualizationOptions("PRIMARY", {
    preLogBase: -1,
    postLogBase: -1,
    applyCoolerWeights: true,
    resolutionScaling: false,
    resolutionLinearScaling: false,
    startColor: "#ffffffff",
    endColor: "#e80000ff",
    minSignal: 0,
    maxSignal: 0.003,
  });
  const bottom = buildColorExpressionFromVisualizationOptions("SECONDARY", {
    preLogBase: -1,
    postLogBase: -1,
    applyCoolerWeights: false,
    resolutionScaling: false,
    resolutionLinearScaling: false,
    startColor: "#00000000",
    endColor: darkBackground ? "#00ff66ff" : "#000000ff",
    minSignal: 0,
    maxSignal: 200,
  });
  const overlay: PipelineExpression = {
    type: "pixel_blend",
    mode: "OVER",
    top,
    bottom,
    topOpacity: 0.4,
    bottomOpacity: 1,
  };
  return {
    enabled: true,
    swapUpperLower: false,
    upperExpression: overlay,
    lowerExpression: cloneExpression(overlay),
  };
};

const normalizeHexaColor = (value: unknown, fallback: string): string => {
  const sanitized = sanitizeColor(value, fallback).toLowerCase();
  if (/^#[0-9a-f]{8}$/.test(sanitized)) {
    return sanitized;
  }
  if (/^#[0-9a-f]{6}$/.test(sanitized)) {
    return `${sanitized}ff`;
  }
  return sanitizeColor(fallback, "#000000ff").toLowerCase();
};

const cleanupColorPicker = (): void => {
  if (activeNativeColorInput) {
    try {
      activeNativeColorInput.remove();
    } catch (error) {
      console.debug("Failed to destroy active color picker", error);
    } finally {
      activeNativeColorInput = null;
    }
  }
};

const openColorPickerInput = (
  initialColor: string,
  onSelected: (hexaColor: string) => void
): void => {
  cleanupColorPicker();
  const nativeInput = document.createElement("input");
  nativeInput.type = "color";
  nativeInput.value = normalizeHexaColor(initialColor, "#000000ff").slice(0, 7);
  nativeInput.style.position = "fixed";
  nativeInput.style.left = "-9999px";
  nativeInput.style.top = "-9999px";
  nativeInput.style.opacity = "0";
  nativeInput.style.pointerEvents = "none";
  document.body.appendChild(nativeInput);
  activeNativeColorInput = nativeInput;

  let changed = false;
  nativeInput.addEventListener("input", () => {
    changed = true;
    onSelected(normalizeHexaColor(nativeInput.value, initialColor));
    graphCanvas?.draw(true, true);
  });
  nativeInput.addEventListener("change", () => {
    changed = true;
    onSelected(normalizeHexaColor(nativeInput.value, initialColor));
    graphCanvas?.draw(true, true);
  });
  nativeInput.addEventListener(
    "blur",
    () => {
      if (!changed) {
        graphCanvas?.draw(true, true);
      }
      cleanupColorPicker();
    },
    { once: true }
  );
  nativeInput.click();
};

const toSourceName = (value: unknown): SourceName =>
  String(value ?? "PRIMARY").toUpperCase() === "SECONDARY"
    ? "SECONDARY"
    : "PRIMARY";

const toTrackAxis = (value: unknown): TrackAxis =>
  String(value ?? "ROW").toUpperCase() === "COL" ? "COL" : "ROW";

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

const toFiniteNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseClampBoundary = (value: unknown, fallback: number): number => {
  if (value == null) {
    return fallback;
  }
  if (typeof value === "number" || typeof value === "string") {
    return toFiniteNumber(value, fallback);
  }
  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if (String(objectValue.type ?? "").toLowerCase() === "constant") {
      return toFiniteNumber(objectValue.value, fallback);
    }
    return toFiniteNumber(objectValue.value, fallback);
  }
  return fallback;
};

const isColorExpression = (expression: PipelineExpression): boolean => {
  return (
    expression.type === "colormap" ||
    expression.type === "rgb" ||
    expression.type === "hsl" ||
    expression.type === "hsv" ||
    expression.type === "pixel_blend"
  );
};

const ensureColorRootExpression = (expression: PipelineExpression): PipelineExpression => {
  return isColorExpression(expression)
    ? expression
    : defaultColorExpression(expression);
};

const parseExpression = (raw: unknown): PipelineExpression => {
  const node = (raw ?? {}) as Record<string, unknown>;
  const type = String(node.type ?? "source").toLowerCase();
  if (type === "constant") {
    return {
      type: "constant",
      value: toFiniteNumber(node.value, 0),
    };
  }
  if (type === "dynamic") {
    return {
      type: "dynamic",
      field: toDynamicField(node.field),
    };
  }
  if (type === "track1d") {
    return {
      type: "track1d",
      trackId: String(node.trackId ?? ""),
      axis: toTrackAxis(node.axis),
    };
  }
  if (type === "unary") {
    return {
      type: "unary",
      op: toUnaryOp(node.op),
      input: parseExpression(node.input),
    };
  }
  if (type === "log") {
    return {
      type: "log",
      input: parseExpression(node.input),
      base: toFiniteNumber(node.base, Math.E),
    };
  }
  if (type === "log_input") {
    const baseValue = node.base;
    return {
      type: "log_input",
      input: parseExpression(node.input),
      base:
        typeof baseValue === "object" && baseValue != null
          ? parseExpression(baseValue)
          : {
              type: "constant",
              value: toFiniteNumber(baseValue, Math.E),
            },
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
  if (type === "clamp") {
    return {
      type: "clamp",
      input: parseExpression(node.input),
      minValue: parseClampBoundary(node.minValue ?? node.minSignal ?? node.min, 0),
      maxValue: parseClampBoundary(node.maxValue ?? node.maxSignal ?? node.max, 1),
    };
  }
  if (type === "colormap") {
    return {
      type: "colormap",
      mode: "LINEAR",
      input: parseExpression(node.input),
      startColor: sanitizeColor(node.startColor, "#ffffff00"),
      endColor: sanitizeColor(node.endColor, "#006000ff"),
      minSignal: toFiniteNumber(node.minSignal ?? 0, 0),
      maxSignal: toFiniteNumber(node.maxSignal ?? 1, 1),
    };
  }
  if (type === "rgb" || type === "hsl" || type === "hsv") {
    return {
      type,
      c1: parseExpression(node.c1 ?? node.r ?? node.h ?? { type: "constant", value: 0 }),
      c2: parseExpression(node.c2 ?? node.g ?? node.s ?? { type: "constant", value: 1 }),
      c3: parseExpression(node.c3 ?? node.b ?? node.l ?? node.v ?? { type: "constant", value: 1 }),
      alpha: parseExpression(node.alpha ?? node.a ?? { type: "constant", value: 255 }),
    };
  }
  if (type === "pixel_blend") {
    return {
      type: "pixel_blend",
      mode: toPixelBlendMode(node.mode),
      top: ensureColorRootExpression(parseExpression(node.top ?? node.foreground ?? node.upper)),
      bottom: ensureColorRootExpression(
        parseExpression(node.bottom ?? node.background ?? node.lower ?? { type: "source", source: "SECONDARY" })
      ),
      topOpacity: toFiniteNumber(node.topOpacity ?? node.topOpacityValue ?? 1, 1),
      bottomOpacity: toFiniteNumber(node.bottomOpacity ?? node.bottomOpacityValue ?? 1, 1),
    };
  }
  return {
    type: "source",
    source: toSourceName(node.source),
  };
};

const cleanupContextMenus = (): void => {
  document.querySelectorAll(".litecontextmenu").forEach((element) => {
    element.remove();
  });
};

const installNodeTypeFilterOverrides = (): void => {
  if (!originalGetNodeTypesCategories) {
    originalGetNodeTypesCategories = (
      LiteGraph as unknown as {
        getNodeTypesCategories: (filter?: string) => string[];
      }
    ).getNodeTypesCategories.bind(LiteGraph);
  }
  if (!originalGetNodeTypesInCategory) {
    originalGetNodeTypesInCategory = (
      LiteGraph as unknown as {
        getNodeTypesInCategory: (
          category: string,
          filter?: string
        ) => Array<{ type: string }>;
      }
    ).getNodeTypesInCategory.bind(LiteGraph);
  }

  (LiteGraph as unknown as { getNodeTypesCategories: (filter?: string) => string[] }).getNodeTypesCategories =
    (() => {
      const registeredTypes = LiteGraph.registered_node_types as Record<string, unknown>;
      return NODE_MENU_CATEGORY_ORDER.filter((category) =>
        NODE_MENU_NODE_TYPES_BY_CATEGORY[category].some((nodeType) => Boolean(registeredTypes[nodeType]))
      );
    }) as never;
  (LiteGraph as unknown as {
    getNodeTypesInCategory: (
      category: string,
      filter?: string
    ) => Array<{ type: string }>;
  }).getNodeTypesInCategory = ((category: string) => {
    const registeredTypes = LiteGraph.registered_node_types as Record<
      string,
      { type?: string } | undefined
    >;
    const typedCategory = category as (typeof NODE_MENU_CATEGORY_ORDER)[number];
    const allowedTypes = NODE_MENU_NODE_TYPES_BY_CATEGORY[typedCategory] ?? [];
    return allowedTypes
      .map((nodeType) => registeredTypes[nodeType])
      .filter((entry): entry is { type?: string } => Boolean(entry))
      .sort((left, right) =>
        String(left.type ?? "").localeCompare(String(right.type ?? ""))
      ) as Array<{ type: string }>;
  }) as never;
};

const restoreNodeTypeFilterOverrides = (): void => {
  if (originalGetNodeTypesCategories) {
    (LiteGraph as unknown as { getNodeTypesCategories: (filter?: string) => string[] }).getNodeTypesCategories =
      originalGetNodeTypesCategories as never;
  }
  if (originalGetNodeTypesInCategory) {
    (LiteGraph as unknown as {
      getNodeTypesInCategory: (
        category: string,
        filter?: string
      ) => Array<{ type: string }>;
    }).getNodeTypesInCategory = originalGetNodeTypesInCategory as never;
  }
};

const coolerWeightsTrackOption = (): TrackSummaryResponse =>
  ({
    trackId: BUILTIN_COOLER_WEIGHTS_TRACK_ID,
    name: "Cooler weights",
    type: "COOLER_WEIGHTS",
    sourceFile: "internal:.hict.hdf5",
    color: "#5b84b1ff",
    visible: false,
    featureCount: 0,
    renderStyle: "LINE",
    renderMode: "SIGNAL",
    aggregationMode: "MEAN",
    logScale: false,
  }) as TrackSummaryResponse;

const trackIds = (): string[] => {
  return trackOptions.value.map((track) => track.trackId);
};

const ensureNodeTrackId = (trackId: unknown): string => {
  const ids = trackIds();
  const candidate = String(trackId ?? "");
  if (ids.includes(candidate)) {
    return candidate;
  }
  return ids[0] ?? "";
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

  class Track1DNode extends LGraphNode {
    constructor() {
      super();
      this.title = "1D track";
      this.addOutput("value", "number");
      this.properties = {
        trackId: ensureNodeTrackId(""),
        axis: "ROW",
      };
      this.addWidget(
        "combo",
        "track",
        this.properties.trackId,
        (value: unknown) => {
          this.properties.trackId = ensureNodeTrackId(value);
        },
        { values: trackIds() }
      );
      this.addWidget(
        "toggle",
        "row axis",
        this.properties.axis === "ROW",
        (value: unknown) => {
          this.properties.axis = Boolean(value) ? "ROW" : "COL";
        },
        { on: "ROW", off: "COL" }
      );
      this.size = [230, 104];
    }
  }

  class ConstantNode extends LGraphNode {
    constructor() {
      super();
      this.title = "Constant";
      this.addOutput("value", "number");
      this.properties = { value: 0 };
      this.addWidget("number", "value", this.properties.value, (value: unknown) => {
        this.properties.value = toFiniteNumber(value, 0);
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
      this.size = [230, 82];
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

  class LogNode extends LGraphNode {
    constructor() {
      super();
      this.title = "Log (base)";
      this.addInput("in", "number");
      this.addOutput("out", "number");
      this.properties = { base: 10 };
      this.addWidget("number", "base", this.properties.base, (value: unknown) => {
        this.properties.base = toFiniteNumber(value, 10);
      });
      this.size = [200, 84];
    }
  }

  class LogInputNode extends LGraphNode {
    constructor() {
      super();
      this.title = "Log (base input)";
      this.addInput("in", "number");
      this.addInput("base", "number");
      this.addOutput("out", "number");
      this.properties = { base: 10 };
      this.addWidget("number", "fallback base", this.properties.base, (value: unknown) => {
        this.properties.base = toFiniteNumber(value, 10);
      });
      this.size = [224, 104];
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

  class ClampNode extends LGraphNode {
    constructor() {
      super();
      this.title = "Clamp";
      this.addInput("in", "number");
      this.addOutput("out", "number");
      this.properties = { minValue: 0, maxValue: 1 };
      this.addWidget("number", "min", this.properties.minValue, (value: unknown) => {
        this.properties.minValue = toFiniteNumber(value, 0);
      });
      this.addWidget("number", "max", this.properties.maxValue, (value: unknown) => {
        this.properties.maxValue = toFiniteNumber(value, 1);
      });
      this.size = [210, 104];
    }
  }

  class ColormapNode extends LGraphNode {
    constructor() {
      super();
      this.title = "Linear Colormap";
      this.addInput("signal", "number");
      this.addOutput("color", "color");
      this.properties = {
        mode: "LINEAR",
        startColor: "#ffffff00",
        endColor: "#006000ff",
        minSignal: 0,
        maxSignal: 1,
      };
      this.addWidget("button", "pick start", "", () => {
        openColorPickerInput(
          sanitizeColor(this.properties.startColor, "#ffffff00"),
          (hexaColor) => {
            this.properties.startColor = normalizeHexaColor(
              hexaColor,
              this.properties.startColor
            );
            graphCanvas?.draw(true, true);
          }
        );
      });
      this.addWidget("button", "pick end", "", () => {
        openColorPickerInput(
          sanitizeColor(this.properties.endColor, "#006000ff"),
          (hexaColor) => {
            this.properties.endColor = normalizeHexaColor(
              hexaColor,
              this.properties.endColor
            );
            graphCanvas?.draw(true, true);
          }
        );
      });
      this.addWidget("text", "start hex", this.properties.startColor, (value: unknown) => {
        this.properties.startColor = sanitizeColor(value, "#ffffff00");
      });
      this.addWidget("text", "end hex", this.properties.endColor, (value: unknown) => {
        this.properties.endColor = sanitizeColor(value, "#006000ff");
      });
      this.addWidget("number", "min", this.properties.minSignal, (value: unknown) => {
        this.properties.minSignal = toFiniteNumber(value, 0);
      });
      this.addWidget("number", "max", this.properties.maxSignal, (value: unknown) => {
        this.properties.maxSignal = toFiniteNumber(value, 1);
      });
      this.size = [250, 188];
    }

    onDrawForeground(context: CanvasRenderingContext2D): void {
      const start = sanitizeColor(this.properties.startColor, "#ffffff00");
      const end = sanitizeColor(this.properties.endColor, "#006000ff");
      const rectY = 28;
      const rectW = 48;
      const rectH = 12;
      context.save();
      context.fillStyle = start;
      context.fillRect(16, rectY, rectW, rectH);
      context.strokeStyle = "#d1d5db";
      context.strokeRect(16, rectY, rectW, rectH);
      context.fillStyle = end;
      context.fillRect(84, rectY, rectW, rectH);
      context.strokeStyle = "#d1d5db";
      context.strokeRect(84, rectY, rectW, rectH);
      context.fillStyle = "#e5e7eb";
      context.font = "10px sans-serif";
      context.fillText("start", 17, rectY - 3);
      context.fillText("end", 85, rectY - 3);
      context.restore();
    }
  }

  class ColorSpaceNode extends LGraphNode {
    constructor(private readonly colorSpaceType: ColorSpaceNodeType) {
      super();
      this.title = colorSpaceType.toUpperCase();
      this.addInput("c1", "number");
      this.addInput("c2", "number");
      this.addInput("c3", "number");
      this.addInput("a", "number");
      this.addOutput("color", "color");
      this.properties = {
        c1: colorSpaceType === "hsv" ? 0 : 0,
        c2: 1,
        c3: colorSpaceType === "hsl" ? 0.5 : 1,
        alpha: 255,
      };
      this.addWidget("number", "c1", this.properties.c1, (value: unknown) => {
        this.properties.c1 = toFiniteNumber(value, 0);
      });
      this.addWidget("number", "c2", this.properties.c2, (value: unknown) => {
        this.properties.c2 = toFiniteNumber(value, 1);
      });
      this.addWidget("number", "c3", this.properties.c3, (value: unknown) => {
        this.properties.c3 = toFiniteNumber(value, 1);
      });
      this.addWidget("number", "alpha", this.properties.alpha, (value: unknown) => {
        this.properties.alpha = toFiniteNumber(value, 255);
      });
      this.size = [200, 148];
    }
  }

  class RGBNode extends ColorSpaceNode {
    constructor() {
      super("rgb");
      this.title = "RGB";
    }
  }

  class HSLNode extends ColorSpaceNode {
    constructor() {
      super("hsl");
      this.title = "HSL";
    }
  }

  class HSVNode extends ColorSpaceNode {
    constructor() {
      super("hsv");
      this.title = "HSV";
    }
  }

  class PixelBlendNode extends LGraphNode {
    constructor() {
      super();
      this.title = "Pixel Blend";
      this.addInput("top", "color");
      this.addInput("bottom", "color");
      this.addOutput("color", "color");
      this.properties = {
        mode: "OVER",
        topOpacity: 1,
        bottomOpacity: 1,
      };
      this.addWidget(
        "combo",
        "mode",
        this.properties.mode,
        (value: unknown) => {
          this.properties.mode = toPixelBlendMode(value);
        },
        { values: PIXEL_BLEND_MODES }
      );
      this.addWidget("number", "top opacity", this.properties.topOpacity, (value: unknown) => {
        this.properties.topOpacity = toFiniteNumber(value, 1);
      });
      this.addWidget(
        "number",
        "bottom opacity",
        this.properties.bottomOpacity,
        (value: unknown) => {
          this.properties.bottomOpacity = toFiniteNumber(value, 1);
        }
      );
      this.size = [232, 120];
    }
  }

  class SinkNode extends LGraphNode {
    constructor() {
      super();
      this.title = "Sink";
      this.addInput("value", "color");
      this.properties = { branch: "UPPER" };
      this.color = "#0f766e";
      this.bgcolor = "#dcfce7";
      this.size = [190, 62];
    }
  }

  for (const [ctor, title, category] of [
    [SourceNode, "Source", "Sources"],
    [Track1DNode, "1D track", "Sources"],
    [DynamicNode, "Dynamic", "Sources"],
    [ConstantNode, "Constant", "Constants"],
    [UnaryNode, "Unary", "Math"],
    [LogNode, "Log (base)", "Math"],
    [LogInputNode, "Log (base input)", "Math"],
    [BinaryNode, "Binary", "Math"],
    [ClampNode, "Clamp", "Math"],
    [ColormapNode, "Linear Colormap", "Colormaps"],
    [RGBNode, "RGB", "Colormaps"],
    [HSLNode, "HSL", "Colormaps"],
    [HSVNode, "HSV", "Colormaps"],
    [PixelBlendNode, "Pixel Blend", "Compositing"],
    [SinkNode, "Sink", "Outputs"],
  ] as Array<[unknown, string, string]>) {
    (ctor as { filter?: string }).filter = HICT_PIPELINE_FILTER;
    (ctor as { title?: string }).title = title;
    (ctor as { category?: string }).category = category;
  }

  if (!LiteGraph.registered_node_types[SOURCE_NODE_TYPE]) {
    LiteGraph.registerNodeType(SOURCE_NODE_TYPE, SourceNode as unknown as { new (): LGraphNode });
  }
  if (!LiteGraph.registered_node_types[TRACK1D_NODE_TYPE]) {
    LiteGraph.registerNodeType(TRACK1D_NODE_TYPE, Track1DNode as unknown as { new (): LGraphNode });
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
  if (!LiteGraph.registered_node_types[LOG_NODE_TYPE]) {
    LiteGraph.registerNodeType(LOG_NODE_TYPE, LogNode as unknown as { new (): LGraphNode });
  }
  if (!LiteGraph.registered_node_types[LOG_INPUT_NODE_TYPE]) {
    LiteGraph.registerNodeType(LOG_INPUT_NODE_TYPE, LogInputNode as unknown as { new (): LGraphNode });
  }
  if (!LiteGraph.registered_node_types[BINARY_NODE_TYPE]) {
    LiteGraph.registerNodeType(BINARY_NODE_TYPE, BinaryNode as unknown as { new (): LGraphNode });
  }
  if (!LiteGraph.registered_node_types[CLAMP_NODE_TYPE]) {
    LiteGraph.registerNodeType(CLAMP_NODE_TYPE, ClampNode as unknown as { new (): LGraphNode });
  }
  if (!LiteGraph.registered_node_types[COLORMAP_NODE_TYPE]) {
    LiteGraph.registerNodeType(COLORMAP_NODE_TYPE, ColormapNode as unknown as { new (): LGraphNode });
  }
  if (!LiteGraph.registered_node_types[RGB_NODE_TYPE]) {
    LiteGraph.registerNodeType(RGB_NODE_TYPE, RGBNode as unknown as { new (): LGraphNode });
  }
  if (!LiteGraph.registered_node_types[HSL_NODE_TYPE]) {
    LiteGraph.registerNodeType(HSL_NODE_TYPE, HSLNode as unknown as { new (): LGraphNode });
  }
  if (!LiteGraph.registered_node_types[HSV_NODE_TYPE]) {
    LiteGraph.registerNodeType(HSV_NODE_TYPE, HSVNode as unknown as { new (): LGraphNode });
  }
  if (!LiteGraph.registered_node_types[PIXEL_BLEND_NODE_TYPE]) {
    LiteGraph.registerNodeType(
      PIXEL_BLEND_NODE_TYPE,
      PixelBlendNode as unknown as { new (): LGraphNode }
    );
  }
  if (!LiteGraph.registered_node_types[SINK_NODE_TYPE]) {
    LiteGraph.registerNodeType(SINK_NODE_TYPE, SinkNode as unknown as { new (): LGraphNode });
  }

  nodeTypesRegistered = true;
};

const setWidgetValue = (node: LGraphNode, widgetName: string, value: unknown): void => {
  const widgets = (node as unknown as { widgets?: Array<{ name?: string; value?: unknown }> }).widgets ?? [];
  const widget = widgets.find((entry) => entry.name === widgetName);
  if (widget) {
    widget.value = value;
  }
};

const syncNodeWidgetsFromProperties = (node: LGraphNode): void => {
  if (node.type === SOURCE_NODE_TYPE) {
    setWidgetValue(node, "source", toSourceName(node.properties?.source));
    return;
  }
  if (node.type === TRACK1D_NODE_TYPE) {
    setWidgetValue(node, "track", ensureNodeTrackId(node.properties?.trackId));
    setWidgetValue(node, "row axis", toTrackAxis(node.properties?.axis) === "ROW");
    return;
  }
  if (node.type === CONSTANT_NODE_TYPE) {
    setWidgetValue(node, "value", toFiniteNumber(node.properties?.value, 0));
    return;
  }
  if (node.type === DYNAMIC_NODE_TYPE) {
    setWidgetValue(node, "field", toDynamicField(node.properties?.field));
    return;
  }
  if (node.type === UNARY_NODE_TYPE) {
    setWidgetValue(node, "op", toUnaryOp(node.properties?.op));
    return;
  }
  if (node.type === LOG_NODE_TYPE) {
    setWidgetValue(node, "base", toFiniteNumber(node.properties?.base, 10));
    return;
  }
  if (node.type === LOG_INPUT_NODE_TYPE) {
    setWidgetValue(node, "fallback base", toFiniteNumber(node.properties?.base, 10));
    return;
  }
  if (node.type === BINARY_NODE_TYPE) {
    setWidgetValue(node, "op", toBinaryOp(node.properties?.op));
    return;
  }
  if (node.type === CLAMP_NODE_TYPE) {
    setWidgetValue(node, "min", toFiniteNumber(node.properties?.minValue, 0));
    setWidgetValue(node, "max", toFiniteNumber(node.properties?.maxValue, 1));
    return;
  }
  if (node.type === COLORMAP_NODE_TYPE) {
    setWidgetValue(node, "start hex", sanitizeColor(node.properties?.startColor, "#ffffff00"));
    setWidgetValue(node, "end hex", sanitizeColor(node.properties?.endColor, "#006000ff"));
    setWidgetValue(node, "min", toFiniteNumber(node.properties?.minSignal, 0));
    setWidgetValue(node, "max", toFiniteNumber(node.properties?.maxSignal, 1));
    return;
  }
  if (node.type === RGB_NODE_TYPE || node.type === HSL_NODE_TYPE || node.type === HSV_NODE_TYPE) {
    setWidgetValue(node, "c1", toFiniteNumber(node.properties?.c1, 0));
    setWidgetValue(node, "c2", toFiniteNumber(node.properties?.c2, 1));
    setWidgetValue(node, "c3", toFiniteNumber(node.properties?.c3, 1));
    setWidgetValue(node, "alpha", toFiniteNumber(node.properties?.alpha, 255));
    return;
  }
  if (node.type === PIXEL_BLEND_NODE_TYPE) {
    setWidgetValue(node, "mode", toPixelBlendMode(node.properties?.mode));
    setWidgetValue(node, "top opacity", toFiniteNumber(node.properties?.topOpacity, 1));
    setWidgetValue(
      node,
      "bottom opacity",
      toFiniteNumber(node.properties?.bottomOpacity, 1)
    );
  }
};

const fitGraphCanvas = (): void => {
  if (!graphHost.value || !graphCanvasRef.value || !graphCanvas) {
    return;
  }
  const width = Math.max(640, Math.floor(graphHost.value.clientWidth));
  const height = Math.max(420, Math.floor(graphHost.value.clientHeight));
  graphCanvasRef.value.width = width;
  graphCanvasRef.value.height = height;
  graphCanvas.resize(width, height);
  graphCanvas.draw(true, true);
};

const fitGraphView = (requiredWidth: number, requiredHeight: number): void => {
  if (!graphCanvas || !graphHost.value) {
    return;
  }
  const availableWidth = Math.max(1, Math.floor(graphHost.value.clientWidth) - 72);
  const availableHeight = Math.max(1, Math.floor(graphHost.value.clientHeight) - 72);
  const scaleX = availableWidth / Math.max(1, requiredWidth);
  const scaleY = availableHeight / Math.max(1, requiredHeight);
  const targetScale = Math.min(1, scaleX, scaleY);
  graphCanvas.ds.scale = clampToRange(targetScale, 0.35, 1);
  graphCanvas.ds.offset[0] = 26;
  graphCanvas.ds.offset[1] = 24;
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
  upperSink.pos = [900, 90];

  lowerSink.title = "Lower sink";
  lowerSink.properties = { branch: "LOWER" };
  lowerSink.pos = [900, 320];

  graph.add(upperSink);
  graph.add(lowerSink);
  upperSinkId = upperSink.id ?? null;
  lowerSinkId = lowerSink.id ?? null;
};

const updateTrackNodeWidgets = (): void => {
  if (!graph) {
    return;
  }
  const ids = trackIds();
  const fallback = ids[0] ?? "";
  const nodes = (graph as unknown as { _nodes?: LGraphNode[] })._nodes ?? [];
  nodes.forEach((node) => {
    if (node.type !== TRACK1D_NODE_TYPE) {
      return;
    }
    const widgets = (node as unknown as { widgets?: Array<{ name?: string; value?: unknown; options?: Record<string, unknown> }> }).widgets ?? [];
    const trackWidget = widgets.find((widget) => widget.name === "track");
    if (trackWidget) {
      if (!trackWidget.options) {
        trackWidget.options = {};
      }
      trackWidget.options.values = ids;
      const selected = ensureNodeTrackId((node.properties ?? {}).trackId ?? fallback);
      node.properties = {
        ...(node.properties ?? {}),
        trackId: selected,
      };
      trackWidget.value = selected;
    }
  });
  graphCanvas?.draw(true, true);
};

const initializeGraph = (): void => {
  if (!graphCanvasRef.value) {
    return;
  }
  ensureNodeTypesRegistered();
  installNodeTypeFilterOverrides();
  graph = new LGraph();
  (graph as unknown as { filter?: string }).filter = HICT_PIPELINE_FILTER;
  graphCanvas = new LGraphCanvas(graphCanvasRef.value, graph);
  (graphCanvas as unknown as { filter?: string }).filter = HICT_PIPELINE_FILTER;
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

const triggerImportGraph = (): void => {
  importInputRef.value?.click();
};

const clearGraph = (): void => {
  graph?.clear();
  upperSinkId = null;
  lowerSinkId = null;
};

const GRAPH_VERTICAL_GAP = 40;
const GRAPH_HORIZONTAL_GAP = 250;
const GRAPH_TOP_PADDING = 44;
const GRAPH_BRANCH_GAP = 150;
const GRAPH_LEFT_PADDING = 60;
const GRAPH_RIGHT_PADDING = 120;
const GRAPH_SINK_STACK_GAP = 18;

const estimateNodeHeight = (expression: PipelineExpression): number => {
  switch (expression.type) {
    case "track1d":
      return 104;
    case "constant":
      return 72;
    case "dynamic":
      return 82;
    case "unary":
      return 78;
    case "log":
      return 84;
    case "log_input":
      return 104;
    case "binary":
      return 92;
    case "clamp":
      return 104;
    case "colormap":
      return 148;
    case "rgb":
    case "hsl":
    case "hsv":
      return 148;
    case "pixel_blend":
      return 120;
    case "source":
    default:
      return 72;
  }
};

const measureExpressionHeight = (
  expression: PipelineExpression,
  cache: WeakMap<object, number>
): number => {
  const cached = cache.get(expression as object);
  if (cached != null) {
    return cached;
  }

  let height = estimateNodeHeight(expression);
  if (expression.type === "unary" || expression.type === "log" || expression.type === "clamp" || expression.type === "colormap") {
    const childHeight = measureExpressionHeight(expression.input, cache);
    height = Math.max(height, childHeight);
  } else if (expression.type === "log_input") {
    const inputHeight = measureExpressionHeight(expression.input, cache);
    const baseHeight = measureExpressionHeight(expression.base, cache);
    height = Math.max(height, inputHeight + GRAPH_VERTICAL_GAP + baseHeight);
  } else if (expression.type === "binary") {
    const leftHeight = measureExpressionHeight(expression.left, cache);
    const rightHeight = measureExpressionHeight(expression.right, cache);
    height = Math.max(height, leftHeight + GRAPH_VERTICAL_GAP + rightHeight);
  } else if (
    expression.type === "rgb" ||
    expression.type === "hsl" ||
    expression.type === "hsv"
  ) {
    const c1Height = measureExpressionHeight(expression.c1, cache);
    const c2Height = measureExpressionHeight(expression.c2, cache);
    const c3Height = measureExpressionHeight(expression.c3, cache);
    const alphaHeight = measureExpressionHeight(expression.alpha, cache);
    height = Math.max(
      height,
      c1Height +
        GRAPH_VERTICAL_GAP +
        c2Height +
        GRAPH_VERTICAL_GAP +
        c3Height +
        GRAPH_VERTICAL_GAP +
        alphaHeight
    );
  } else if (expression.type === "pixel_blend") {
    const topHeight = measureExpressionHeight(expression.top, cache);
    const bottomHeight = measureExpressionHeight(expression.bottom, cache);
    height = Math.max(height, topHeight + GRAPH_VERTICAL_GAP + bottomHeight);
  }

  cache.set(expression as object, height);
  return height;
};

const measureExpressionDepth = (
  expression: PipelineExpression,
  cache: WeakMap<object, number>
): number => {
  const cached = cache.get(expression as object);
  if (cached != null) {
    return cached;
  }

  let depth = 1;
  if (expression.type === "unary" || expression.type === "log" || expression.type === "clamp" || expression.type === "colormap") {
    depth = 1 + measureExpressionDepth(expression.input, cache);
  } else if (expression.type === "log_input") {
    depth =
      1 +
      Math.max(
        measureExpressionDepth(expression.input, cache),
        measureExpressionDepth(expression.base, cache)
      );
  } else if (expression.type === "binary") {
    depth =
      1 +
      Math.max(
        measureExpressionDepth(expression.left, cache),
        measureExpressionDepth(expression.right, cache)
      );
  } else if (
    expression.type === "rgb" ||
    expression.type === "hsl" ||
    expression.type === "hsv"
  ) {
    depth =
      1 +
      Math.max(
        measureExpressionDepth(expression.c1, cache),
        measureExpressionDepth(expression.c2, cache),
        measureExpressionDepth(expression.c3, cache),
        measureExpressionDepth(expression.alpha, cache)
      );
  } else if (expression.type === "pixel_blend") {
    depth =
      1 +
      Math.max(
        measureExpressionDepth(expression.top, cache),
        measureExpressionDepth(expression.bottom, cache)
      );
  }

  cache.set(expression as object, depth);
  return depth;
};

const createNodeForExpression = (expression: PipelineExpression): LGraphNode | null => {
  let node: LGraphNode | null = null;
  switch (expression.type) {
    case "source":
      node = LiteGraph.createNode(SOURCE_NODE_TYPE) as LGraphNode | null;
      if (node) {
        node.properties.source = expression.source;
      }
      break;
    case "track1d":
      node = LiteGraph.createNode(TRACK1D_NODE_TYPE) as LGraphNode | null;
      if (node) {
        node.properties.trackId = ensureNodeTrackId(expression.trackId);
        node.properties.axis = expression.axis;
        const widgets = (node as unknown as { widgets?: Array<{ name?: string; value?: unknown }> }).widgets ?? [];
        const axisWidget = widgets.find((widget) => widget.name === "row axis");
        if (axisWidget) {
          axisWidget.value = expression.axis === "ROW";
        }
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
    case "unary":
      node = LiteGraph.createNode(UNARY_NODE_TYPE) as LGraphNode | null;
      if (node) {
        node.properties.op = expression.op;
      }
      break;
    case "log":
      node = LiteGraph.createNode(LOG_NODE_TYPE) as LGraphNode | null;
      if (node) {
        node.properties.base = toFiniteNumber(expression.base, 10);
      }
      break;
    case "log_input":
      node = LiteGraph.createNode(LOG_INPUT_NODE_TYPE) as LGraphNode | null;
      if (node) {
        node.properties.base = 10;
      }
      break;
    case "binary":
      node = LiteGraph.createNode(BINARY_NODE_TYPE) as LGraphNode | null;
      if (node) {
        node.properties.op = expression.op;
      }
      break;
    case "clamp":
      node = LiteGraph.createNode(CLAMP_NODE_TYPE) as LGraphNode | null;
      if (node) {
        node.properties.minValue = expression.minValue;
        node.properties.maxValue = expression.maxValue;
      }
      break;
    case "colormap":
      node = LiteGraph.createNode(COLORMAP_NODE_TYPE) as LGraphNode | null;
      if (node) {
        node.properties.mode = expression.mode;
        node.properties.startColor = expression.startColor;
        node.properties.endColor = expression.endColor;
        node.properties.minSignal = expression.minSignal;
        node.properties.maxSignal = expression.maxSignal;
      }
      break;
    case "rgb":
      node = LiteGraph.createNode(RGB_NODE_TYPE) as LGraphNode | null;
      break;
    case "hsl":
      node = LiteGraph.createNode(HSL_NODE_TYPE) as LGraphNode | null;
      break;
    case "hsv":
      node = LiteGraph.createNode(HSV_NODE_TYPE) as LGraphNode | null;
      break;
    case "pixel_blend":
      node = LiteGraph.createNode(PIXEL_BLEND_NODE_TYPE) as LGraphNode | null;
      if (node) {
        node.properties.mode = expression.mode;
        node.properties.topOpacity = expression.topOpacity;
        node.properties.bottomOpacity = expression.bottomOpacity;
      }
      break;
  }
  if (graph && node) {
    graph.add(node);
    syncNodeWidgetsFromProperties(node);
  }
  return node;
};

const positionExpressionTree = (
  expression: PipelineExpression,
  depth: number,
  topY: number,
  sinkX: number,
  heightCache: WeakMap<object, number>
): LGraphNode | null => {
  if (!graph) {
    return null;
  }
  const subtreeHeight = measureExpressionHeight(expression, heightCache);
  const node = createNodeForExpression(expression);
  if (!node) {
    return null;
  }
  const nodeHeight = Number(node.size?.[1] ?? estimateNodeHeight(expression));
  const nodeY = topY + Math.max(0, (subtreeHeight - nodeHeight) / 2);
  const nodeX = sinkX - (depth + 1) * GRAPH_HORIZONTAL_GAP;
  node.pos = [nodeX, nodeY];

  if (expression.type === "unary" || expression.type === "log" || expression.type === "clamp" || expression.type === "colormap") {
    const childHeight = measureExpressionHeight(expression.input, heightCache);
    const childTop = topY + Math.max(0, (subtreeHeight - childHeight) / 2);
    const inputNode = positionExpressionTree(
      expression.input,
      depth + 1,
      childTop,
      sinkX,
      heightCache
    );
    inputNode?.connect(0, node, 0);
  }

  if (expression.type === "log_input") {
    const inputHeight = measureExpressionHeight(expression.input, heightCache);
    const baseHeight = measureExpressionHeight(expression.base, heightCache);
    const childrenTop =
      topY + Math.max(0, (subtreeHeight - (inputHeight + GRAPH_VERTICAL_GAP + baseHeight)) / 2);
    const inputNode = positionExpressionTree(
      expression.input,
      depth + 1,
      childrenTop,
      sinkX,
      heightCache
    );
    const baseNode = positionExpressionTree(
      expression.base,
      depth + 1,
      childrenTop + inputHeight + GRAPH_VERTICAL_GAP,
      sinkX,
      heightCache
    );
    inputNode?.connect(0, node, 0);
    baseNode?.connect(0, node, 1);
  }

  if (expression.type === "binary") {
    const leftHeight = measureExpressionHeight(expression.left, heightCache);
    const rightHeight = measureExpressionHeight(expression.right, heightCache);
    const childrenTop =
      topY +
      Math.max(
        0,
        (subtreeHeight - (leftHeight + GRAPH_VERTICAL_GAP + rightHeight)) / 2
      );
    const leftNode = positionExpressionTree(
      expression.left,
      depth + 1,
      childrenTop,
      sinkX,
      heightCache
    );
    const rightNode = positionExpressionTree(
      expression.right,
      depth + 1,
      childrenTop + leftHeight + GRAPH_VERTICAL_GAP,
      sinkX,
      heightCache
    );
    leftNode?.connect(0, node, 0);
    rightNode?.connect(0, node, 1);
  }

  if (expression.type === "rgb" || expression.type === "hsl" || expression.type === "hsv") {
    const c1Height = measureExpressionHeight(expression.c1, heightCache);
    const c2Height = measureExpressionHeight(expression.c2, heightCache);
    const c3Height = measureExpressionHeight(expression.c3, heightCache);
    const alphaHeight = measureExpressionHeight(expression.alpha, heightCache);
    const childrenTotalHeight =
      c1Height +
      GRAPH_VERTICAL_GAP +
      c2Height +
      GRAPH_VERTICAL_GAP +
      c3Height +
      GRAPH_VERTICAL_GAP +
      alphaHeight;
    const childrenTop = topY + Math.max(0, (subtreeHeight - childrenTotalHeight) / 2);
    const c1Node = positionExpressionTree(
      expression.c1,
      depth + 1,
      childrenTop,
      sinkX,
      heightCache
    );
    const c2Node = positionExpressionTree(
      expression.c2,
      depth + 1,
      childrenTop + c1Height + GRAPH_VERTICAL_GAP,
      sinkX,
      heightCache
    );
    const c3Node = positionExpressionTree(
      expression.c3,
      depth + 1,
      childrenTop + c1Height + GRAPH_VERTICAL_GAP + c2Height + GRAPH_VERTICAL_GAP,
      sinkX,
      heightCache
    );
    const alphaNode = positionExpressionTree(
      expression.alpha,
      depth + 1,
      childrenTop +
        c1Height +
        GRAPH_VERTICAL_GAP +
        c2Height +
        GRAPH_VERTICAL_GAP +
        c3Height +
        GRAPH_VERTICAL_GAP,
      sinkX,
      heightCache
    );
    c1Node?.connect(0, node, 0);
    c2Node?.connect(0, node, 1);
    c3Node?.connect(0, node, 2);
    alphaNode?.connect(0, node, 3);
  }

  if (expression.type === "pixel_blend") {
    const topHeight = measureExpressionHeight(expression.top, heightCache);
    const bottomHeight = measureExpressionHeight(expression.bottom, heightCache);
    const childrenTop =
      topY + Math.max(0, (subtreeHeight - (topHeight + GRAPH_VERTICAL_GAP + bottomHeight)) / 2);
    const topNode = positionExpressionTree(
      expression.top,
      depth + 1,
      childrenTop,
      sinkX,
      heightCache
    );
    const bottomNode = positionExpressionTree(
      expression.bottom,
      depth + 1,
      childrenTop + topHeight + GRAPH_VERTICAL_GAP,
      sinkX,
      heightCache
    );
    topNode?.connect(0, node, 0);
    bottomNode?.connect(0, node, 1);
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
  const upperColorExpression = ensureColorRootExpression(upperExpression);
  const lowerColorExpression = ensureColorRootExpression(lowerExpression);
  const sharedPipeline =
    JSON.stringify(upperColorExpression) === JSON.stringify(lowerColorExpression);
  const heightCache = new WeakMap<object, number>();
  const depthCache = new WeakMap<object, number>();

  const upperHeight = measureExpressionHeight(upperColorExpression, heightCache);
  const lowerHeight = measureExpressionHeight(lowerColorExpression, heightCache);
  const maxDepth = Math.max(
    measureExpressionDepth(upperColorExpression, depthCache),
    measureExpressionDepth(lowerColorExpression, depthCache)
  );
  const sinkX = GRAPH_LEFT_PADDING + (maxDepth + 1) * GRAPH_HORIZONTAL_GAP;
  const upperCenterY = GRAPH_TOP_PADDING + upperHeight * 0.5;
  const lowerTopY = GRAPH_TOP_PADDING + upperHeight + GRAPH_BRANCH_GAP;
  const lowerCenterY = lowerTopY + lowerHeight * 0.5;

  if (upperSink) {
    const sinkHeight = Number(upperSink.size?.[1] ?? 62);
    if (sharedPipeline) {
      const sharedCenterY = GRAPH_TOP_PADDING + upperHeight * 0.5;
      upperSink.pos = [
        sinkX,
        sharedCenterY - sinkHeight - GRAPH_SINK_STACK_GAP * 0.5,
      ];
    } else {
      upperSink.pos = [sinkX, upperCenterY - sinkHeight * 0.5];
    }
  }
  if (lowerSink) {
    const sinkHeight = Number(lowerSink.size?.[1] ?? 62);
    if (sharedPipeline) {
      const sharedCenterY = GRAPH_TOP_PADDING + upperHeight * 0.5;
      lowerSink.pos = [sinkX, sharedCenterY + GRAPH_SINK_STACK_GAP * 0.5];
    } else {
      lowerSink.pos = [sinkX, lowerCenterY - sinkHeight * 0.5];
    }
  }

  if (sharedPipeline) {
    const sharedNode = positionExpressionTree(
      upperColorExpression,
      0,
      GRAPH_TOP_PADDING,
      sinkX,
      heightCache
    );
    if (sharedNode && upperSink) {
      sharedNode.connect(0, upperSink, 0);
    }
    if (sharedNode && lowerSink) {
      sharedNode.connect(0, lowerSink, 0);
    }
  } else {
    const upperNode = positionExpressionTree(
      upperColorExpression,
      0,
      GRAPH_TOP_PADDING,
      sinkX,
      heightCache
    );
    const lowerNode = positionExpressionTree(
      lowerColorExpression,
      0,
      lowerTopY,
      sinkX,
      heightCache
    );

    if (upperNode && upperSink) {
      upperNode.connect(0, upperSink, 0);
    }
    if (lowerNode && lowerSink) {
      lowerNode.connect(0, lowerSink, 0);
    }
  }

  updateTrackNodeWidgets();

  const sinkWidth = Math.max(
    Number(upperSink?.size?.[0] ?? 190),
    Number(lowerSink?.size?.[0] ?? 190)
  );
  const totalWidth = sinkX + sinkWidth + GRAPH_RIGHT_PADDING;
  const totalHeight = sharedPipeline
    ? GRAPH_TOP_PADDING + upperHeight + GRAPH_TOP_PADDING
    : lowerTopY + lowerHeight + GRAPH_TOP_PADDING;
  fitGraphView(totalWidth, totalHeight);
  graphCanvas?.draw(true, true);
};

const expressionFromNode = (
  node: LGraphNode | null,
  visited: Set<number>
): PipelineExpression => {
  if (!node) {
    return defaultSignalExpression();
  }
  const nodeId = node.id ?? -1;
  if (visited.has(nodeId)) {
    return defaultSignalExpression();
  }
  visited.add(nodeId);

  if (node.type === SOURCE_NODE_TYPE) {
    return {
      type: "source",
      source: toSourceName(node.properties?.source),
    };
  }

  if (node.type === TRACK1D_NODE_TYPE) {
    return {
      type: "track1d",
      trackId: ensureNodeTrackId(node.properties?.trackId),
      axis: toTrackAxis(node.properties?.axis),
    };
  }

  if (node.type === CONSTANT_NODE_TYPE) {
    return {
      type: "constant",
      value: toFiniteNumber(node.properties?.value, 0),
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

  if (node.type === LOG_NODE_TYPE) {
    return {
      type: "log",
      input: expressionFromNode(node.getInputNode(0), visited),
      base: toFiniteNumber(node.properties?.base, 10),
    };
  }

  if (node.type === LOG_INPUT_NODE_TYPE) {
    return {
      type: "log_input",
      input: expressionFromNode(node.getInputNode(0), visited),
      base: node.getInputNode(1)
        ? expressionFromNode(node.getInputNode(1), visited)
        : {
            type: "constant",
            value: toFiniteNumber(node.properties?.base, 10),
          },
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

  if (node.type === CLAMP_NODE_TYPE) {
    return {
      type: "clamp",
      input: expressionFromNode(node.getInputNode(0), visited),
      minValue: toFiniteNumber(node.properties?.minValue, 0),
      maxValue: toFiniteNumber(node.properties?.maxValue, 1),
    };
  }

  if (node.type === COLORMAP_NODE_TYPE) {
    return {
      type: "colormap",
      mode: "LINEAR",
      input: expressionFromNode(node.getInputNode(0), visited),
      startColor: sanitizeColor(node.properties?.startColor, "#ffffff00"),
      endColor: sanitizeColor(node.properties?.endColor, "#006000ff"),
      minSignal: toFiniteNumber(node.properties?.minSignal, 0),
      maxSignal: toFiniteNumber(node.properties?.maxSignal, 1),
    };
  }

  if (node.type === RGB_NODE_TYPE || node.type === HSL_NODE_TYPE || node.type === HSV_NODE_TYPE) {
    const fallbackConstant = (value: unknown): PipelineExpression => ({
      type: "constant",
      value: toFiniteNumber(value, 0),
    });

    const c1 = node.getInputNode(0)
      ? expressionFromNode(node.getInputNode(0), visited)
      : fallbackConstant(node.properties?.c1 ?? 0);
    const c2 = node.getInputNode(1)
      ? expressionFromNode(node.getInputNode(1), visited)
      : fallbackConstant(node.properties?.c2 ?? 1);
    const c3 = node.getInputNode(2)
      ? expressionFromNode(node.getInputNode(2), visited)
      : fallbackConstant(node.properties?.c3 ?? 1);
    const alpha = node.getInputNode(3)
      ? expressionFromNode(node.getInputNode(3), visited)
      : fallbackConstant(node.properties?.alpha ?? 255);

    if (node.type === RGB_NODE_TYPE) {
      return { type: "rgb", c1, c2, c3, alpha };
    }
    if (node.type === HSL_NODE_TYPE) {
      return { type: "hsl", c1, c2, c3, alpha };
    }
    return { type: "hsv", c1, c2, c3, alpha };
  }

  if (node.type === PIXEL_BLEND_NODE_TYPE) {
    const topFallback = defaultColorExpression();
    const bottomFallback = defaultColorExpression({
      type: "source",
      source: "SECONDARY",
    });
    return {
      type: "pixel_blend",
      mode: toPixelBlendMode(node.properties?.mode),
      top: node.getInputNode(0)
        ? ensureColorRootExpression(expressionFromNode(node.getInputNode(0), visited))
        : topFallback,
      bottom: node.getInputNode(1)
        ? ensureColorRootExpression(expressionFromNode(node.getInputNode(1), visited))
        : bottomFallback,
      topOpacity: toFiniteNumber(node.properties?.topOpacity, 1),
      bottomOpacity: toFiniteNumber(node.properties?.bottomOpacity, 1),
    };
  }

  return defaultSignalExpression();
};

const expressionFromSink = (branch: "UPPER" | "LOWER"): PipelineExpression => {
  if (!graph) {
    return defaultColorExpression();
  }
  const sinkId = branch === "UPPER" ? upperSinkId : lowerSinkId;
  if (sinkId == null) {
    return defaultColorExpression();
  }
  const sinkNode = graph.getNodeById(sinkId);
  const sourceNode = sinkNode?.getInputNode(0) ?? null;
  return ensureColorRootExpression(expressionFromNode(sourceNode, new Set<number>()));
};

const exportGraphToFile = (): void => {
  try {
    const payload = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      enabled: enabled.value,
      swapUpperLower: swapUpperLower.value,
      upperExpression: expressionFromSink("UPPER"),
      lowerExpression: expressionFromSink("LOWER"),
      liteGraph: graph?.serialize?.() ?? null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "hict_render_pipeline.json";
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    toast.error(String(error));
  }
};

const onImportFileSelected = async (event: Event): Promise<void> => {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const importedEnabled = parsed.enabled;
    const importedSwap = parsed.swapUpperLower;
    const upperRaw = parsed.upperExpression ?? parsed.upper;
    const lowerRaw = parsed.lowerExpression ?? parsed.lower;
    enabled.value = typeof importedEnabled === "boolean" ? importedEnabled : enabled.value;
    swapUpperLower.value =
      typeof importedSwap === "boolean" ? importedSwap : swapUpperLower.value;
    buildGraphFromExpressions(parseExpression(upperRaw), parseExpression(lowerRaw));
    toast.success("Pipeline graph imported");
  } catch (error) {
    toast.error(`Import failed: ${String(error)}`);
  } finally {
    if (input) {
      input.value = "";
    }
  }
};

const buildConfigPayload = (): Record<string, unknown> => ({
  enabled: enabled.value,
  swapUpperLower: swapUpperLower.value,
  upperExpression: expressionFromSink("UPPER"),
  lowerExpression: expressionFromSink("LOWER"),
});

const loadSelectedPreset = (): void => {
  if (!graph) {
    return;
  }
  const preset =
    selectedPresetId.value === "dotplot_overlay"
      ? buildDotplotOverlayPreset()
      : buildPrimaryOnlyPreset();
  enabled.value = preset.enabled;
  swapUpperLower.value = preset.swapUpperLower;
  buildGraphFromExpressions(preset.upperExpression, preset.lowerExpression);
  toast.success(
    selectedPresetId.value === "dotplot_overlay"
      ? "Dotplot overlay preset loaded"
      : "Primary-only preset loaded"
  );
};

const persistConfig = async (
  reloadTiles: boolean,
  successMessage?: string
): Promise<void> => {
  const manager = ensureMapManager();
  await manager.networkManager.requestManager.setRenderPipelineConfig(
    buildConfigPayload()
  );
  if (reloadTiles) {
    await manager.reloadTilesFromBackend();
  }
  if (successMessage) {
    toast.success(successMessage);
  }
};

const destroyGraphRuntime = (): void => {
  cleanupColorPicker();
  cleanupContextMenus();
  resizeObserver?.disconnect();
  resizeObserver = null;
  graphCanvas?.clear();
  graphCanvas = null;
  graph?.clear();
  graph = null;
  upperSinkId = null;
  lowerSinkId = null;
};

const restoreGraphRuntime = async (): Promise<void> => {
  await nextTick();
  initializeGraph();
  await refreshTrackOptions();
  if (previewSnapshot.value && !pendingVisualizationSync.value) {
    enabled.value = previewSnapshot.value.enabled;
    swapUpperLower.value = previewSnapshot.value.swapUpperLower;
    buildGraphFromExpressions(
      previewSnapshot.value.upperExpression,
      previewSnapshot.value.lowerExpression
    );
  } else {
    await loadConfig();
  }
  previewSnapshot.value = null;
  pendingVisualizationSync.value = false;
};

const dismissModal = async (): Promise<void> => {
  previewMode.value = false;
  cleanupColorPicker();
  cleanupContextMenus();
  if (!loading.value && !saving.value) {
    try {
      if (graph) {
        await persistConfig(false);
      } else if (previewSnapshot.value) {
        const manager = ensureMapManager();
        await manager.networkManager.requestManager.setRenderPipelineConfig({
          enabled: previewSnapshot.value.enabled,
          swapUpperLower: previewSnapshot.value.swapUpperLower,
          upperExpression: previewSnapshot.value.upperExpression,
          lowerExpression: previewSnapshot.value.lowerExpression,
        });
      }
    } catch (error) {
      console.debug("Failed to persist rendering pipeline on close", error);
    }
  }
  destroyGraphRuntime();
  emit("dismissed");
};

const togglePreviewMode = (): void => {
  cleanupColorPicker();
  cleanupContextMenus();
  if (!previewMode.value) {
    if (graph) {
      previewSnapshot.value = {
        enabled: enabled.value,
        swapUpperLower: swapUpperLower.value,
        upperExpression: expressionFromSink("UPPER"),
        lowerExpression: expressionFromSink("LOWER"),
      };
    } else {
      previewSnapshot.value = null;
    }
    previewMode.value = true;
    destroyGraphRuntime();
    return;
  }
  previewMode.value = false;
  void restoreGraphRuntime();
};

const previewConfig = async (): Promise<void> => {
  if (!graph || previewMode.value) {
    return;
  }
  previewing.value = true;
  try {
    previewSnapshot.value = {
      enabled: enabled.value,
      swapUpperLower: swapUpperLower.value,
      upperExpression: expressionFromSink("UPPER"),
      lowerExpression: expressionFromSink("LOWER"),
    };
    await persistConfig(true);
    previewMode.value = true;
    destroyGraphRuntime();
  } catch (error) {
    toast.error(String(error));
  } finally {
    previewing.value = false;
  }
};

const onVisualizationOptionsUpdated = (): void => {
  if (previewMode.value || loading.value || saving.value) {
    pendingVisualizationSync.value = true;
    return;
  }
  void loadConfig();
};

const refreshTrackOptions = async (): Promise<void> => {
  try {
    const manager = ensureMapManager();
    const listed = await manager.networkManager.requestManager.listTracks();
    const withBuiltin = [coolerWeightsTrackOption(), ...listed];
    const deduped = new Map<string, TrackSummaryResponse>();
    withBuiltin.forEach((track) => deduped.set(track.trackId, track));
    trackOptions.value = Array.from(deduped.values());
    updateTrackNodeWidgets();
  } catch (error) {
    console.debug("Failed to load track options for render pipeline", error);
  }
};

const loadConfig = async (): Promise<void> => {
  if (previewMode.value || !graph) {
    pendingVisualizationSync.value = true;
    return;
  }
  loading.value = true;
  try {
    await refreshTrackOptions();
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
    if (pendingVisualizationSync.value && !previewMode.value && !saving.value) {
      pendingVisualizationSync.value = false;
      void loadConfig();
    }
  }
};

const saveConfig = async (): Promise<void> => {
  saving.value = true;
  try {
    await persistConfig(true, "Rendering pipeline updated");
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
  window.addEventListener("resize", fitGraphCanvas);
  window.addEventListener(
    VisualizationManager.VISUALIZATION_OPTIONS_UPDATED_EVENT,
    onVisualizationOptionsUpdated
  );
  void loadConfig();
});

onBeforeUnmount(() => {
  previewMode.value = false;
  cleanupColorPicker();
  window.removeEventListener("resize", fitGraphCanvas);
  window.removeEventListener(
    VisualizationManager.VISUALIZATION_OPTIONS_UPDATED_EVENT,
    onVisualizationOptionsUpdated
  );
  restoreNodeTypeFilterOverrides();
  destroyGraphRuntime();
});
</script>

<style scoped>
.pipeline-root .modal {
  z-index: 1065;
  position: fixed;
  inset: 0;
  display: flex !important;
  align-items: flex-start;
  justify-content: center;
  overflow: hidden;
}

.pipeline-dialog {
  width: min(96vw, 1960px);
  max-width: min(96vw, 1960px);
  height: min(94vh, 1320px);
  margin: 12px auto 0 auto;
}

.pipeline-graph {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.pipeline-preset-select {
  max-width: 240px;
}

.pipeline-root .modal-content {
  height: 100%;
  display: flex;
  overflow: hidden;
  position: relative;
}

.pipeline-root .modal.pipeline-preview .pipeline-dialog {
  height: auto;
  min-height: 0;
}

.pipeline-root .modal.pipeline-preview .modal-content {
  height: auto;
}

.pipeline-root .modal-body {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.graph-host {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 420px;
  background: #111827;
  overflow: hidden;
}

.pipeline-graph :deep(.card-body) {
  height: 100%;
  min-height: 0;
}

.graph-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.pipeline-root :deep(.litegraph) {
  background: transparent;
}

:global(.litecontextmenu) {
  z-index: 5000 !important;
}
</style>
