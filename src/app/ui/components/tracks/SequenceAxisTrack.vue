<template>
  <canvas
    v-show="visible"
    ref="canvas"
    class="sequence-axis"
    :class="axis"
    aria-label="Assembly FASTA bases"
    @mousemove="showBaseMetadata"
    @mouseleave="clearBaseMetadata"
  ></canvas>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { useNotificationCenterStore } from "@/app/stores/notificationCenterStore";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";
import axios from "axios";
import { coordinateLowerBound } from "@/app/core/visualization/sequenceBoundaries";
const props = defineProps<{
  mapManager?: ContactMapManager;
  axis: "horizontal" | "vertical";
}>();
const emit = defineEmits<{ (event: "presence", value: boolean): void }>();
const canvas = ref<HTMLCanvasElement>();
const visible = ref(false);
const notifications = useNotificationCenterStore();
let lastFailure = "";
let listeners: EventsKey[] = [],
  timer: number | undefined,
  generation = 0;
type Region = Awaited<
  ReturnType<
    ContactMapManager["networkManager"]["requestManager"]["querySequenceRegion"]
  >
>;
let cached: { key: string; response: Region } | undefined;
let renderedBases: { screen: number; label: string }[] = [];
function clearBaseMetadata() {
  canvas.value?.removeAttribute("title");
}
function showBaseMetadata(event: MouseEvent) {
  const target = canvas.value;
  if (!target) return;
  const box = target.getBoundingClientRect();
  const position =
    props.axis === "horizontal"
      ? event.clientX - box.left
      : event.clientY - box.top;
  let closest: typeof renderedBases[number] | undefined;
  for (const base of renderedBases)
    if (
      !closest ||
      Math.abs(base.screen - position) < Math.abs(closest.screen - position)
    )
      closest = base;
  if (closest && Math.abs(closest.screen - position) <= 10)
    target.title = closest.label;
  else clearBaseMetadata();
}
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
  renderedBases = [];
  clearBaseMetadata();
  request?.abort();
  request = undefined;
  if (
    event?.type === "change:center" ||
    event?.type === "change:resolution" ||
    event?.type === "moveend"
  )
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
    let response = cached?.key === key ? cached.response : undefined;
    if (response === undefined) {
      const controller = new AbortController();
      request = controller;
      response =
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
      cached = { key, response };
    }
    if (id !== generation || manager.isDisposed) return;
    lastFailure = "";
    const sequence = response.sequence ?? "";
    renderedBases = [];
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
      const position = start + i;
      const segment = response.segments?.find(
        (s) => s.start <= position && s.end > position
      );
      let label = `${base} · Current assembly: ${(
        position + 1
      ).toLocaleString()} bp`;
      if (
        segment &&
        !segment.gap &&
        segment.sourceStart !== null &&
        segment.sourceEnd !== null
      ) {
        const original = segment.reversed
          ? segment.sourceEnd - (position - segment.start)
          : segment.sourceStart + (position - segment.start) + 1;
        label += `\nOriginal FASTA: ${
          segment.source
        }:${original.toLocaleString()} (${
          segment.reversed ? "−" : "+"
        } strand)`;
        label += `\nContig: ${segment.contig}\nScaffold: ${
          segment.scaffold ?? "unplaced"
        }`;
      }
      renderedBases.push({ screen, label });
      context.fillStyle = colors[base] ?? "#666666";
      context.fillText(
        base,
        horizontal ? screen : 12,
        horizontal ? 12 : screen
      );
    }
    const tracks = manager.viewAndLayersManager.track2DHolder;
    const drawBoundary = (
      bp: number,
      track: typeof tracks.contigBordersTrack
    ) => {
      if (bp < start || bp > end || track.getStyleType() === 3) return;
      const pixel = holder.getFractionalPxOfBp(bp, resolution) * scale;
      const screen = map.getPixelFromCoordinate(
        horizontal ? [pixel, 0] : [0, -pixel]
      )[horizontal ? 0 : 1];
      const line = () => {
        context.beginPath();
        context.moveTo(horizontal ? screen : 0, horizontal ? 0 : screen);
        context.lineTo(horizontal ? screen : 24, horizontal ? 24 : screen);
        context.stroke();
      };
      if (track.options.borderOutline) {
        context.strokeStyle = "rgba(0,0,0,0.9)";
        context.lineWidth = track.options.width + 3;
        line();
      }
      const color = track.options.borderColor;
      context.strokeStyle = Array.isArray(color)
        ? `rgba(${color[0]},${color[1]},${color[2]},${color[3] ?? 1})`
        : color;
      context.lineWidth = track.options.width;
      line();
    };
    for (
      let i = coordinateLowerBound(holder.prefix_sum_bp, start, (bp) => bp);
      i < holder.prefix_sum_bp.length && holder.prefix_sum_bp[i] <= end;
      i++
    )
      drawBoundary(holder.prefix_sum_bp[i], tracks.contigBordersTrack);
    const scaffolds = manager.scaffoldHolder.scaffoldBordersSorted;
    for (
      let i = Math.max(
        0,
        coordinateLowerBound(scaffolds, start, ([b]) => b.startBP) - 1
      );
      i < scaffolds.length && scaffolds[i][0].startBP <= end;
      i++
    ) {
      const [borders] = scaffolds[i];
      drawBoundary(borders.startBP, tracks.scaffoldBordersTrack);
      drawBoundary(borders.endBP, tracks.scaffoldBordersTrack);
    }
  } catch (error) {
    if (id === generation) {
      setVisible(false);
      if (!axios.isCancel(error)) {
        const message = `FASTA track could not be displayed: ${extractErrorMessage(
          error
        )}`;
        if (message !== lastFailure) notifications.add("warning", message);
        lastFailure = message;
      }
    }
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
    lastFailure = "";
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
  pointer-events: auto;
  cursor: help;
}
.horizontal {
  left: 0;
  top: 0;
  width: 100%;
  height: 24px;
}
.vertical {
  top: 0;
  left: 0;
  width: 24px;
  height: 100%;
}
</style>
