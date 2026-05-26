<template>
  <div
    class="zoom-slider ol-control ol-zoomslider custom-zoomslider"
    :style="{ height: `${sliderHeight}px` }"
    title="Zoom level"
  >
    <input
      class="zoom-range"
      type="range"
      min="0"
      max="1000"
      step="1"
      v-model.number="sliderValue"
      @input="onSliderInput"
      aria-label="Zoom level"
    />
    <div class="zoom-marks">
      <div
        v-for="mark in marks"
        :key="mark.key"
        class="zoom-mark"
        :style="{ bottom: `${mark.pos}%` }"
      >
        <span class="zoom-mark-label">{{ mark.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";

const props = defineProps<{
  readonly mapManager?: ContactMapManager | undefined;
}>();

const sliderValue = ref(0);
const minRes = ref(1);
const maxRes = ref(1);
const logMin = ref(0);
const logMax = ref(1);
const resMarks = ref<{ source: string; bp: number; pixel: number }[]>([]);
let viewKey: unknown;

function onMatrixResolutionMarksChanged() {
  recomputeScale();
  syncFromView();
}

function recomputeScale() {
  const map = props.mapManager;
  if (!map) return;
  const layersManager = map.viewAndLayersManager;
  const matrixMarks = layersManager.getMatrixResolutionMarks();
  const pixelRes = matrixMarks.map((mark) => mark.pixelResolution);
  if (!pixelRes.length) return;
  const minPixel = Math.min(...pixelRes);
  const maxPixel = Math.max(...pixelRes);
  const factor = 1024;
  minRes.value = minPixel / factor;
  maxRes.value = maxPixel * factor;
  logMin.value = Math.log(minRes.value);
  logMax.value = Math.log(maxRes.value);
  resMarks.value = matrixMarks.map((mark) => ({
    source: mark.source,
    bp: mark.bpResolution,
    pixel: mark.pixelResolution,
  }));
}

function resolutionToSlider(resolution: number): number {
  const t =
    (Math.log(resolution) - logMin.value) /
    (logMax.value - logMin.value || 1);
  return Math.min(1, Math.max(0, t)) * 1000;
}

function sliderToResolution(value: number): number {
  const t = Math.min(1, Math.max(0, value / 1000));
  return Math.exp(logMin.value + t * (logMax.value - logMin.value));
}

function formatBp(bp: number): string {
  if (bp >= 1_000_000_000) return `${Math.round(bp / 1_000_000_000)}G`;
  if (bp >= 1_000_000) return `${Math.round(bp / 1_000_000)}M`;
  if (bp >= 1_000) return `${Math.round(bp / 1_000)}K`;
  return `${bp}`;
}

const marks = computed(() => {
  const result: { key: string; pos: number; label: string }[] = [];
  result.push({ key: "min", pos: 0, label: "-Inf" });
  for (const entry of resMarks.value) {
    const pos =
      ((Math.log(entry.pixel) - logMin.value) /
        (logMax.value - logMin.value || 1)) *
      100;
    result.push({
      key: `${entry.source}-${entry.bp}-${entry.pixel}`,
      pos,
      label: `${entry.source === "SECONDARY" ? "S " : ""}1:${formatBp(
        entry.bp
      )}`,
    });
  }
  result.push({ key: "max", pos: 100, label: "+Inf" });
  return result;
});

const sliderHeight = computed(() => {
  return Math.max(220, marks.value.length * 22 + 20);
});

function syncFromView() {
  const map = props.mapManager;
  if (!map) return;
  const view = map.getMap().getView();
  const res = view.getResolution();
  if (res == null) return;
  sliderValue.value = resolutionToSlider(res);
}

function onSliderInput() {
  const map = props.mapManager;
  if (!map) return;
  const view = map.getMap().getView();
  const res = sliderToResolution(sliderValue.value);
  view.setResolution(res);
}

watch(
  () => props.mapManager,
  () => {
    recomputeScale();
    syncFromView();
  }
);

onMounted(() => {
  recomputeScale();
  syncFromView();
  window.addEventListener(
    "hict:matrix-resolution-marks-changed",
    onMatrixResolutionMarksChanged
  );
  const map = props.mapManager;
  if (!map) return;
  const view = map.getMap().getView();
  viewKey = view.on("change:resolution", () => {
    syncFromView();
  });
});

onBeforeUnmount(() => {
  window.removeEventListener(
    "hict:matrix-resolution-marks-changed",
    onMatrixResolutionMarksChanged
  );
  const map = props.mapManager;
  if (!map || !viewKey) return;
  map.getMap().getView().un("change:resolution", viewKey as never);
  viewKey = undefined;
});
</script>

<style scoped>
.zoom-slider {
  position: relative;
  width: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #adb5bd;
  border-radius: 4px;
  padding: 10px 0;
}

.zoom-range {
  position: absolute;
  width: 180px;
  height: 24px;
  transform: rotate(-90deg);
}

.zoom-marks {
  position: absolute;
  right: -6px;
  top: 0;
  bottom: 0;
  width: 70px;
  pointer-events: none;
}

.zoom-mark {
  position: absolute;
  right: 0;
  transform: translateY(50%);
  font-size: 9px;
  color: #495057;
  white-space: nowrap;
}

.zoom-mark-label {
  display: inline-block;
  background: rgba(255, 255, 255, 0.9);
  padding: 0 2px;
}
</style>
