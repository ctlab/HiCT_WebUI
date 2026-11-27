<template>
  <div
    class="viewport-histogram"
    role="group"
    aria-label="Viewport signal histogram"
    :aria-busy="loading"
  >
    <div
      class="curve-editor"
      ref="editor"
      @dblclick="addPoint"
      @pointermove="movePoint"
      @pointerup="endPoint"
      @pointercancel="endPoint"
      @wheel.stop.prevent="wheelView"
    >
      <svg
        viewBox="0 0 1000 64"
        preserveAspectRatio="none"
        role="img"
        :aria-label="description"
      >
        <path
          v-if="curve"
          :d="`${curve} L 992 60 L 8 60 Z`"
          class="histogram-area"
        />
        <path v-if="curve" :d="curve" class="histogram-curve" />
        <line
          v-for="mark in marks"
          :key="mark.name"
          :x1="mark.x"
          :x2="mark.x"
          y1="0"
          y2="64"
          :class="`histogram-mark ${mark.name}`"
        />
        <polyline v-if="transfer" :points="transfer" class="transfer-line" />
      </svg>
      <span v-if="belowPercent > 0" class="outside-count below">◂ {{ belowPercent }} % below</span>
      <span v-if="abovePercent > 0" class="outside-count above">{{ abovePercent }} % above ▸</span>
      <button
        v-for="(p, i) in controlPoints"
        v-show="p.x >= 0 && p.x <= 1"
        :key="i"
        type="button"
        class="curve-point"
        :style="{ left: 100 * p.x + '%', top: 100 * (1 - p.y) + '%' }"
        :aria-label="'Histogram curve point ' + (i + 1)"
        @pointerdown.stop="beginPoint($event, i)"
        @contextmenu.stop.prevent="emit('remove', i)"
        @keydown.delete.prevent="emit('remove', i)"
        @dblclick.stop
      ></button>
      <button
        v-for="point in endpoints"
        :key="point.side"
        type="button"
        role="slider"
        class="curve-endpoint"
        :class="[point.side, { active: activeEndpoint === point.side }]"
        :style="{ left: 100 * point.x + '%', top: 100 * (1 - point.y) + '%' }"
        :aria-label="point.label"
        :aria-valuenow="Math.round(point.y * 100)"
        :aria-valuetext="Math.round(point.y * 100) + '%'"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-orientation="vertical"
        @pointerdown.stop="beginEndpoint($event, point.side)"
        @keydown="adjustEndpoint($event, point.side)"
        @contextmenu.stop.prevent="
          emit('edit-endpoint', point.side, point.side === 'lower' ? 0 : 1)
        "
        @dblclick.stop
      >
        <span class="curve-endpoint-value" aria-hidden="true">
          {{ point.label }} {{ Math.round(point.y * 100) }}%
        </span>
      </button>
    </div>
    <div ref="axisStrip" class="histogram-axis-strip" title="Drag to move the histogram view"
      @pointerdown="startViewPan" @pointermove="moveViewPan" @pointerup="endViewPan" @pointercancel="endViewPan"
      @dblclick.stop="emit('whole-data')" @wheel.stop.prevent="wheelView"></div>
    <div class="histogram-view-row" role="group" aria-label="Histogram view" :data-mode="viewMode">
      <span class="view-caption">View</span>
      <input aria-label="Histogram view from" inputmode="decimal" :value="String(viewFrom)"
        :aria-invalid="invalid.from || undefined" @focus="selectViewInput" @change="editView('from', $event)"
        @keydown.enter.prevent="commitViewInput" />
      <span aria-hidden="true">–</span>
      <input aria-label="Histogram view to" inputmode="decimal" :value="String(viewTo)"
        :aria-invalid="invalid.to || undefined" @focus="selectViewInput" @change="editView('to', $event)"
        @keydown.enter.prevent="commitViewInput" />
      <button type="button" class="view-action ms-auto" title="Fit view to colour range" aria-label="Fit view to colour range" @click="emit('fit-view')">
        <i class="bi bi-arrows-angle-contract" aria-hidden="true"></i>
      </button>
      <button type="button" class="view-action" title="Whole data" aria-label="Whole data" :class="{ manual: viewMode === 'manual' }"
        @click="emit('whole-data')"><i class="bi bi-arrows-angle-expand" aria-hidden="true"></i></button>
    </div>
    <div class="histogram-controls">
      <slot />
      <button
        type="button"
        class="range-text-button"
        :disabled="loading || !result"
        @click="fit"
      >
        Fit levels
      </button>
    </div>
    <p class="histogram-view-hint">Scroll over the histogram to zoom the view, drag the axis strip to move it.</p>
    <div class="histogram-caption">
      <span role="status" :title="description">
        {{ status }}<template v-if="diagonalMask?.enabled"> · diagonal ±{{ formatLength(diagonalMask.distanceBp) }} ignored</template>
      </span>
      <div
        v-if="result"
        class="histogram-range text-muted"
        role="group"
        aria-label="Visible signal range"
      >
        {{ formatSignalCompact(result.min) }} –
        {{ formatSignalCompact(result.max) }}
      </div>
      <button
        v-if="error"
        type="button"
        class="range-text-button"
        @click="refresh"
      >
        Retry
      </button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { formatLength, formatSignalCompact } from "@/app/core/format/formatSignal";
import type { DiagonalMask } from "@/app/core/visualization/diagonalMask";
import { validHistogramView, type HistogramRange } from "@/app/core/visualization/histogramView";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  ref,
  reactive,
  watch,
} from "vue";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import TileSource from "ol/source/Tile";
import {
  diagnosticBounds,
  querySignalHistogram,
  type SignalHistogram,
} from "@/app/core/visualization/signalDiagnostics";
import {
  histogramCurve,
  viewportHistogramBins,
  viewportLevels,
} from "@/app/core/visualization/viewportHistogram";
type Endpoint = "lower" | "upper";
const props = defineProps<{
  transfer?: string;
  controlPoints?: { x: number; y: number }[];
  curveEndpoints?: Readonly<Record<Endpoint, number>>;
  diagonalMask?: Readonly<DiagonalMask>;
  manager?: ContactMapManager;
  source: "PRIMARY" | "SECONDARY";
  expression?: Record<string, unknown>;
  derived: boolean;
  oe: boolean;
  context: string;
  min: number;
  max: number;
  viewFrom: number;
  viewTo: number;
  viewMode: "auto" | "manual";
  viewMinimum: number;
  lower: number;
  upper: number;
  position: (value: number) => number;
}>();
const emit = defineEmits<{
  (event: "edit", index: number, position: number, output: number): void;
  (event: "edit-endpoint", endpoint: Endpoint, output: number): void;
  (event: "remove", index: number): void;
  (event: "levels", lower: number, upper: number): void;
  (event: "view", view: HistogramRange): void;
  (event: "fit-view" | "whole-data"): void;
  (event: "zoom-view", anchor: number, steps: number): void;
  (event: "pan-view", fraction: number): void;
}>();
const editor = ref<HTMLElement>();
const axisStrip = ref<HTMLElement>();
const invalid = reactive({ from: false, to: false });
const invalidTimers: Partial<Record<"from" | "to", number>> = {};

function selectViewInput(event: FocusEvent): void {
  (event.currentTarget as HTMLInputElement).select();
}
function commitViewInput(event: KeyboardEvent): void {
  (event.currentTarget as HTMLInputElement).blur();
}
function editView(side: "from" | "to", event: Event): void {
  const input = event.currentTarget as HTMLInputElement;
  const value = input.value.trim() ? Number(input.value) : NaN;
  const from = side === "from" ? value : Math.max(props.viewFrom, props.viewMinimum);
  const to = side === "to" ? value : props.viewTo;
  window.clearTimeout(invalidTimers[side]);
  invalid[side] = !validHistogramView({ from, to }, props.viewMinimum);
  if (invalid[side]) {
    input.value = String(side === "from" ? props.viewFrom : props.viewTo);
    invalidTimers[side] = window.setTimeout(() => { invalid[side] = false; }, 2000);
    return;
  }
  emit("view", { from, to });
}

function wheelView(event: WheelEvent): void {
  const box = editor.value?.getBoundingClientRect();
  if (!box?.width || !event.deltaY) return;
  const anchor = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
  const steps = event.deltaY / (event.deltaMode === 1 ? 3 : event.deltaMode === 2 ? 1 : 100);
  emit("zoom-view", anchor, steps);
}

let pan: { pointer: number; lastX: number; width: number } | undefined;
function startViewPan(event: PointerEvent): void {
  const width = axisStrip.value?.getBoundingClientRect().width;
  if (event.button !== 0 || !width) return;
  axisStrip.value?.setPointerCapture(event.pointerId);
  pan = { pointer: event.pointerId, lastX: event.clientX, width };
}
function moveViewPan(event: PointerEvent): void {
  if (pan?.pointer !== event.pointerId) return;
  const delta = event.clientX - pan.lastX;
  pan.lastX = event.clientX;
  if (delta) emit("pan-view", delta / pan.width);
}
function endViewPan(event: PointerEvent): void {
  if (pan?.pointer === event.pointerId) pan = undefined;
}

const activeEndpoint = ref<Endpoint>();
const endpoints = computed(() => {
  if (!props.curveEndpoints || props.oe || props.min >= props.max) return [];
  return (["lower", "upper"] as const).map((side) => ({
    side,
    x: Math.max(
      0,
      Math.min(1, (props[side] - props.min) / (props.max - props.min))
    ),
    y: props.curveEndpoints?.[side] ?? (side === "lower" ? 0 : 1),
    label: side === "lower" ? "At and below Lower" : "At and above Upper",
  }));
});
let dragging: { id: number; point: number | Endpoint } | undefined;
function editPoint(event: MouseEvent, index: number) {
  const rect = editor.value?.getBoundingClientRect();
  if (!props.transfer || !rect || !rect.width || !rect.height) return;
  emit(
    "edit",
    index,
    props.min +
      ((props.max - props.min) * (event.clientX - rect.left)) / rect.width,
    Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height))
  );
}
function addPoint(event: MouseEvent) {
  editPoint(event, -1);
}
function beginPoint(event: PointerEvent, index: number) {
  if (event.button !== 0) return;
  dragging = { id: event.pointerId, point: index };
  editor.value?.setPointerCapture(event.pointerId);
}
function beginEndpoint(event: PointerEvent, point: Endpoint) {
  if (event.button !== 0) return;
  (event.currentTarget as HTMLButtonElement).focus();
  dragging = { id: event.pointerId, point };
  activeEndpoint.value = point;
  editor.value?.setPointerCapture(event.pointerId);
}
function adjustEndpoint(event: KeyboardEvent, side: Endpoint) {
  const up = event.key === "ArrowUp" || event.key === "ArrowRight";
  const down = event.key === "ArrowDown" || event.key === "ArrowLeft";
  if (!props.curveEndpoints || (!up && !down)) return;
  event.preventDefault();
  const percent = Math.round(100 * props.curveEndpoints[side]);
  const next = percent + (up ? 1 : -1) * (event.shiftKey ? 10 : 1);
  emit("edit-endpoint", side, Math.max(0, Math.min(100, next)) / 100);
}
function movePoint(event: PointerEvent) {
  if (dragging?.id !== event.pointerId) return;
  if (typeof dragging.point === "number") {
    editPoint(event, dragging.point);
    return;
  }
  const rect = editor.value?.getBoundingClientRect();
  if (!rect?.height) return;
  const top = event.clientY - rect.top;
  const output =
    top <= 4 ? 1 : top >= rect.height - 4 ? 0 : 1 - top / rect.height;
  emit("edit-endpoint", dragging.point, output);
}
function endPoint(event: PointerEvent) {
  if (dragging?.id !== event.pointerId) return;
  dragging = undefined;
  activeEndpoint.value = undefined;
}
const result = shallowRef<SignalHistogram>();
const loading = ref(false),
  error = ref("");
let controller: AbortController | undefined,
  generation = 0,
  disposed = false;
let observed: ContactMapManager | undefined;
let publishedRasterKey = "";
function rasterKey(): string {
  const source = props.manager?.viewAndLayersManager
    .getActiveHiCDataLayer()
    ?.getSource();
  return source instanceof TileSource ? source.getKey() : "";
}
function invalidate() {
  ++generation;
  controller?.abort();
  result.value = undefined;
  loading.value = true;
}
function onRasterRendered() {
  if (publishedRasterKey !== rasterKey()) void refresh();
}
const binned = computed(() =>
  result.value
    ? viewportHistogramBins(
        result.value.values,
        props.min,
        props.max,
        props.position
      )
    : undefined
);
const curve = computed(() =>
  binned.value ? histogramCurve(binned.value.counts) : ""
);
function outsidePercent(side: "below" | "above"): number {
  const bins = binned.value;
  const count = result.value?.values.length ?? 0;
  if (!bins || count <= bins.nonfinite) return 0;
  return Math.round(100 * bins[side] / (count - bins.nonfinite));
}
const belowPercent = computed(() => outsidePercent("below"));
const abovePercent = computed(() => outsidePercent("above"));
const marks = computed(() =>
  [
    { name: "lower", value: props.lower },
    { name: "upper", value: props.upper },
    ...(props.oe ? [{ name: "neutral", value: props.position(1) }] : []),
  ]
    .filter(
      (mark) =>
        Number.isFinite(mark.value) &&
        mark.value >= props.min &&
        mark.value <= props.max
    )
    .map((mark) => ({
      name: mark.name,
      x: (1000 * (mark.value - props.min)) / (props.max - props.min),
    }))
);
const status = computed(() =>
  loading.value
    ? "Updating viewport…"
    : error.value ||
      (result.value
        ? `${
            result.value.sampled ? "Visible area" : "Viewport"
          } · ${result.value.count.toLocaleString()} values`
        : "Viewport histogram unavailable")
);
const description = computed(() => {
  if (!result.value || !binned.value) return status.value;
  const b = binned.value;
  return `${status.value}; ${
    result.value.resolution
  } bp native bin-reference cells; ${b.zeros} zeros; ${b.nonfinite} missing; ${
    b.below
  } below and ${
    b.above
  } above the histogram view. Fit levels uses sample percentiles 0.5 and 99.5${
    props.oe ? " of positive ratios, with 0.5/2 fallbacks around neutral 1" : ""
  }. Curve height uses square-root counts.`;
});
function fit() {
  if (!result.value || loading.value) return;
  const levels = viewportLevels(result.value.values, props.oe);
  emit("levels", levels.lower, levels.upper);
}
async function refresh() {
  const requestGeneration = ++generation;
  publishedRasterKey = rasterKey();
  controller?.abort();
  result.value = undefined;
  error.value = "";
  const manager = props.manager;
  if (!manager || manager.isDisposed || (!props.derived && !props.expression)) {
    loading.value = false;
    return;
  }
  const abort = new AbortController();
  controller = abort;
  loading.value = true;
  try {
    const response = await querySignalHistogram(
      manager,
      diagnosticBounds(manager),
      {
        source: props.derived ? props.source : "PRIMARY",
        signalMode: props.derived
          ? "TRADITIONAL_NORMALIZED"
          : "PIPELINE_SIGNAL",
        expression: props.derived ? undefined : props.expression,
        signal: abort.signal,
        domain: "matrix",
        tileEdge: 64,
        concurrency: 4,
      }
    );
    if (!disposed && !abort.signal.aborted && requestGeneration === generation)
      result.value = response;
  } catch {
    if (!disposed && !abort.signal.aborted && requestGeneration === generation)
      error.value = "Viewport histogram unavailable";
  } finally {
    if (!disposed && requestGeneration === generation) loading.value = false;
  }
}
function observe() {
  observed?.getMap().un("moveend", refresh);
  observed?.getMap().un("movestart", invalidate);
  observed?.getMap().un("rendercomplete", onRasterRendered);
  observed = props.manager;
  observed?.getMap().on("moveend", refresh);
  observed?.getMap().on("movestart", invalidate);
  observed?.getMap().on("rendercomplete", onRasterRendered);
  void refresh();
}
watch(() => props.manager, observe);
watch(
  () => props.context,
  () => void refresh()
);
onMounted(observe);
onBeforeUnmount(() => {
  Object.values(invalidTimers).forEach((timer) => window.clearTimeout(timer));
  disposed = true;
  ++generation;
  controller?.abort();
  observed?.getMap().un("moveend", refresh);
  observed?.getMap().un("movestart", invalidate);
  observed?.getMap().un("rendercomplete", onRasterRendered);
});
</script>
<style scoped>
.viewport-histogram {
  cursor: default;
}
.histogram-axis-strip {
  background: #f2f4f7;
  cursor: ew-resize;
  height: 8px;
  touch-action: none;
}
.outside-count {
  position: absolute;
  top: 24px;
  color: #475467;
  font-size: 10.5px;
  background: #ffffffe0;
  border-radius: 3px;
  padding-inline: 3px;
  pointer-events: none;
}
.outside-count.below { left: 2px; }
.outside-count.above { right: 2px; }
.histogram-view-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
  color: #475467;
  font-size: 12px;
}
.view-caption { font-weight: 600; color: #344054; }
.histogram-view-row input {
  width: min(74px, 24%);
  height: 26px;
  border: 1px solid #ced4da;
  border-radius: 5px;
  padding: 0 6px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.histogram-view-row input[aria-invalid="true"] { outline: 1px solid #b42318; border-color: #b42318; }
.view-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid #d0d5dd;
  border-radius: 5px;
  color: #344054;
  background: white;
}
.view-action.manual { color: var(--bs-primary); border-color: var(--bs-primary); }
.histogram-view-hint { margin: 0; color: #667085; font-size: 11.5px; }
svg {
  display: block;
  width: 100%;
  height: 54px;
  overflow: hidden;
}
@media (min-height: 800px) {
  svg {
    height: 92px;
  }
}
.curve-editor {
  position: relative;
  touch-action: none;
}
.transfer-line {
  fill: none;
  stroke: #087c9a;
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}
.curve-point {
  position: absolute;
  width: 10px;
  height: 10px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid white;
  background: #075f7c;
  box-shadow: 0 0 0 1px #075f7c;
  transform: translate(-50%, -50%);
  cursor: grab;
}
.curve-endpoint {
  position: absolute;
  z-index: 1;
  width: 9px;
  height: 9px;
  padding: 0;
  border: 1px solid var(--hict-surface-bg, #fff);
  border-radius: 1px;
  background: #075f7c;
  transform: translate(-50%, -50%);
  cursor: ns-resize;
}
.curve-endpoint-value {
  display: none;
  position: absolute;
  inset-block-start: 50%;
  inset-inline-start: calc(100% + 6px);
  width: max-content;
  padding: 3px 6px;
  transform: translateY(-50%);
  border: 1px solid var(--hict-surface-border, #cbd5e1);
  border-radius: 4px;
  color: var(--hict-surface-fg, #1e293b);
  background: var(--hict-surface-bg, #fff);
  font-size: 0.75rem;
  pointer-events: none;
}
.curve-endpoint.upper .curve-endpoint-value {
  inset-inline-start: auto;
  inset-inline-end: calc(100% + 6px);
}
.curve-endpoint:focus-visible .curve-endpoint-value,
.curve-endpoint.active .curve-endpoint-value,
.curve-endpoint:hover .curve-endpoint-value {
  display: block;
}
.histogram-area {
  fill: #94a3b830;
}
.histogram-curve {
  fill: none;
  stroke: #64748b;
  stroke-width: 1.3px;
  vector-effect: non-scaling-stroke;
}
.histogram-mark {
  stroke: #334155;
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
}
.histogram-mark.neutral {
  stroke: #94a3b8;
  stroke-dasharray: 3 2;
}
.histogram-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
}
.histogram-controls .range-text-button {
  margin-inline-start: auto;
  padding-inline: 0;
  font-size: 0.75rem;
  font-weight: 600;
}
.histogram-caption {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.7rem;
  line-height: 1.3;
  color: #64748b;
}
.histogram-caption span {
  flex: 1;
  min-width: 0;
}
.histogram-range {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.range-text-button {
  background: none;
  border: 0;
  padding: 2px;
  min-height: 24px;
  color: #1d4ed8;
  white-space: nowrap;
}
.range-text-button:disabled {
  color: #64748b;
}
</style>
