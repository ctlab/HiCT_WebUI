<template>
  <canvas
    v-show="visible"
    ref="canvas"
    class="sequence-axis"
    :class="axis"
    aria-label="Assembly FASTA bases"
  ></canvas>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
const props = defineProps<{
  mapManager?: ContactMapManager;
  axis: "horizontal" | "vertical";
}>();
const emit = defineEmits<{ (event: "presence", value: boolean): void }>();
const canvas = ref<HTMLCanvasElement>();
const visible = ref(false);
let listeners: EventsKey[] = [],
  timer: number | undefined,
  generation = 0;
let cached: { key: string; sequence: string } | undefined;
let request: AbortController | undefined;
let unregisterExportRenderer: (() => void) | undefined;
const colors: Record<string, string> = {
  A: "#16823b",
  C: "#1769c2",
  G: "#996600",
  T: "#c52a30",
};
function setVisible(value: boolean) {
  visible.value = value;
  emit("presence", value);
}
function schedule(event?: { type?: string }) {
  if (props.mapManager?.isExporting) return;
  ++generation;
  request?.abort();
  request = undefined;
  if (event?.type === "change:center" || event?.type === "change:resolution" || event?.type === "moveend")
    visible.value = false;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void render(generation), 80);
}
async function render(id: number) {
  const manager = props.mapManager,
    target = canvas.value;
  if (!manager || manager.isDisposed || !target) return;
  const map = manager.getMap(),
    view = manager.getView();
  const descriptor =
    manager.viewAndLayersManager.currentViewState.resolutionDesciptor;
  const scale = descriptor.pixelResolution,
    resolution = descriptor.bpResolution;
  const screenResolution = view.getResolution();
  if (!screenResolution || (screenResolution * resolution) / scale > 0.1) {
    setVisible(false);
    return;
  }
  const horizontal = props.axis === "horizontal",
    extent = view.calculateExtent(map.getSize());
  const bounds =
    manager.viewAndLayersManager.getActiveMapPixelBounds(resolution);
  const first = Math.max(
    horizontal ? bounds.colStartPx : bounds.rowStartPx,
    (horizontal ? extent[0] : -extent[3]) / scale
  );
  const last = Math.min(
    horizontal ? bounds.colEndPx : bounds.rowEndPx,
    (horizontal ? extent[2] : -extent[1]) / scale
  );
  const holder = manager.getContigDimensionHolder();
  const start = Math.floor(holder.getFractionalBpOfPx(first, resolution));
  const end = Math.ceil(holder.getFractionalBpOfPx(last, resolution));
  if (end <= start || end - start > 4096) {
    setVisible(false);
    return;
  }
  const api = manager.networkManager.requestManager;
  const key = JSON.stringify([
    start,
    end,
    api.history.applied,
    api.sequenceRevision,
    manager.getOptions().filename,
  ]);
  try {
    let sequence = cached?.key === key ? cached.sequence : undefined;
    if (sequence === undefined) {
      const controller = new AbortController();
      request = controller;
      const response =
        await manager.networkManager.requestManager.querySequenceRegion(
          start,
          end,
          controller.signal
        );
      if (id !== generation) return;
      if (!response.linked) {
        setVisible(false);
        return;
      }
      sequence = response.sequence ?? "";
      cached = { key, sequence };
    }
    if (id !== generation || manager.isDisposed) return;
    setVisible(true);
    const length = map.getSize()?.[horizontal ? 0 : 1] ?? 1;
    target.width = horizontal ? length : 24;
    target.height = horizontal ? 24 : length;
    const context = target.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, target.width, target.height);
    context.font = "bold 14px 'HiCT Sans', sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (let i = 0; i < sequence.length; i++) {
      const pixel =
        holder.getFractionalPxOfBp(start + i + 0.5, resolution) * scale;
      const screen = map.getPixelFromCoordinate(
        horizontal ? [pixel, 0] : [0, -pixel]
      )[horizontal ? 0 : 1];
      const base = sequence[i].toUpperCase();
      context.fillStyle = colors[base] ?? "#666666";
      context.fillText(
        base,
        horizontal ? screen : 12,
        horizontal ? 12 : screen
      );
    }
  } catch {
    if (id === generation) setVisible(false);
  } finally {
    if (id === generation) request = undefined;
  }
}
watch(
  () => props.mapManager,
  (manager) => {
    unregisterExportRenderer?.();
    unregisterExportRenderer = undefined;
    ++generation;
    window.clearTimeout(timer);
    request?.abort();
    request = undefined;
    listeners.forEach(unByKey);
    listeners = [];
    cached = undefined;
    setVisible(false);
    if (manager) {
      unregisterExportRenderer = manager.registerSequenceRenderer(async () => {
        ++generation;
        window.clearTimeout(timer);
        request?.abort();
        request = undefined;
        await render(generation);
      });
      listeners = [
        manager.getMap().on("rendercomplete", schedule),
        manager.getMap().on("moveend", schedule),
        manager.getView().on("change:resolution", schedule),
        manager.getView().on("change:center", schedule),
      ];
      schedule();
    }
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  unregisterExportRenderer?.();
  ++generation;
  request?.abort();
  window.clearTimeout(timer);
  listeners.forEach(unByKey);
});
</script>
<style scoped>
.sequence-axis {
  position: absolute;
  z-index: 2;
  pointer-events: none;
}
.horizontal {
  left: 0;
  bottom: 0;
  width: 100%;
  height: 24px;
}
.vertical {
  top: 0;
  right: 0;
  width: 24px;
  height: 100%;
}
</style>
