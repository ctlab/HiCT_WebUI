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
      <button
        v-for="(p, i) in controlPoints"
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
    </div>
    <div
      v-if="result"
      class="d-flex justify-content-between text-muted small"
      aria-label="Visible signal range"
    >
      <span>{{ formatSignalCompact(result.min) }}</span>
      <span>{{ formatSignalCompact(result.max) }}</span>
    </div>
    <div class="histogram-caption">
      <span role="status" :title="description">{{ status }}</span>
      <button
        type="button"
        class="range-text-button"
        :disabled="loading || !result"
        @click="fit"
      >
        Fit levels
      </button>
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
import { formatSignalCompact } from "@/app/core/format/formatSignal";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  ref,
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
const props = defineProps<{
  transfer?: string;
  controlPoints?: { x: number; y: number }[];
  manager?: ContactMapManager;
  source: "PRIMARY" | "SECONDARY";
  expression?: Record<string, unknown>;
  derived: boolean;
  oe: boolean;
  context: string;
  min: number;
  max: number;
  lower: number;
  upper: number;
  position: (value: number) => number;
}>();
const emit = defineEmits<{
  (event: "edit", index: number, position: number, output: number): void;
  (event: "remove", index: number): void;
  (event: "levels", lower: number, upper: number): void;
}>();
const editor = ref<HTMLElement>();
let dragging: { id: number; index: number } | undefined;
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
  dragging = { id: event.pointerId, index };
  editor.value?.setPointerCapture(event.pointerId);
}
function movePoint(event: PointerEvent) {
  if (dragging?.id === event.pointerId) editPoint(event, dragging.index);
}
function endPoint(event: PointerEvent) {
  if (dragging?.id === event.pointerId) dragging = undefined;
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
  } above slider limits. Fit levels uses sample percentiles 0.5 and 99.5${
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
svg {
  display: block;
  width: 100%;
  height: 54px;
  overflow: hidden;
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
