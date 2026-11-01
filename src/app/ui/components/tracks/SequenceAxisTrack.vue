<template>
  <canvas
    v-show="visible"
    ref="canvas"
    class="sequence-axis"
    :class="[axis, { dragging }]"
    role="img"
    tabindex="0"
    aria-label="FASTA track. Drag to pan; scroll or double-click to zoom. Arrow keys pan; plus and minus zoom."
    @pointerdown="startPan"
    @pointermove="pan"
    @pointerup="endPan"
    @pointercancel="endPan"
    @wheel.prevent="forwardNavigation"
    @dblclick.prevent="forwardNavigation"
    @keydown="navigateByKey"
    @mousemove="showBaseMetadata"
    @mouseleave="scheduleTooltipHide"
  />
  <FloatingTrackTooltip
    :open="!!hoverText"
    :x="hoverPoint.x"
    :y="hoverPoint.y"
    @enter="cancelTooltipHide"
    @leave="scheduleTooltipHide"
    @dismiss="clearBaseMetadata"
  >
    <strong>FASTA · {{ axis === "horizontal" ? "Columns" : "Rows" }}</strong>
    <div class="base-metadata">{{ hoverText }}</div>
  </FloatingTrackTooltip>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { coordinateLowerBound } from "@/app/core/visualization/sequenceBoundaries";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { useNotificationCenterStore } from "@/app/stores/notificationCenterStore";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";
import axios from "axios";
import FloatingTrackTooltip from "./FloatingTrackTooltip.vue";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import { SequenceAnalysisRequest } from "@/app/core/net/api/SequenceAnalysisRequest";
const settings = useUiSettingsStore();
const hoverText = ref("");
const hoverPoint = ref({ x: 0, y: 0 });
const dragging = ref(false);
let drag: { pointer: number; client: number; center: number } | undefined;
let tooltipHideTimer: number | undefined;
let defaultGap: number | undefined;
let disposed = false;
function cancelTooltipHide() {
  window.clearTimeout(tooltipHideTimer);
}
function scheduleTooltipHide() {
  cancelTooltipHide();
  tooltipHideTimer = window.setTimeout(clearBaseMetadata, 150);
}
function startPan(event: PointerEvent) {
  const manager = props.mapManager;
  if (!manager || manager.isExporting || event.button !== 0) return;
  const center = manager.getView().getCenter();
  if (!center) return;
  const horizontal = props.axis === "horizontal";
  drag = {
    pointer: event.pointerId,
    client: horizontal ? event.clientX : event.clientY,
    center: center[horizontal ? 0 : 1],
  };
  dragging.value = true;
  clearBaseMetadata();
  canvas.value?.setPointerCapture(event.pointerId);
  canvas.value?.focus({ preventScroll: true });
  event.preventDefault();
}
function pan(event: PointerEvent) {
  const manager = props.mapManager;
  if (!manager || manager.isExporting || drag?.pointer !== event.pointerId)
    return;
  const view = manager.getView(),
    center = view.getCenter()?.slice();
  if (!center) return;
  const horizontal = props.axis === "horizontal";
  const delta = (horizontal ? event.clientX : event.clientY) - drag.client;
  center[horizontal ? 0 : 1] =
    drag.center + delta * (view.getResolution() ?? 1) * (horizontal ? -1 : 1);
  view.setCenter(center);
  event.preventDefault();
}
function endPan(event: PointerEvent) {
  if (event.pointerId !== drag?.pointer) return;
  if (canvas.value?.hasPointerCapture(event.pointerId))
    canvas.value.releasePointerCapture(event.pointerId);
  drag = undefined;
  dragging.value = false;
}
function forwardNavigation(event: WheelEvent | MouseEvent) {
  const manager = props.mapManager,
    target = canvas.value;
  if (!manager || manager.isExporting || !target) return;
  clearBaseMetadata();
  const viewport = manager.getMap().getViewport(),
    mapRect = viewport.getBoundingClientRect(),
    rect = target.getBoundingClientRect();
  const horizontal = props.axis === "horizontal";
  const ratio = horizontal
    ? (event.clientX - rect.left) / rect.width
    : (event.clientY - rect.top) / rect.height;
  const init = {
    clientX: mapRect.left + mapRect.width * (horizontal ? ratio : 0.5),
    clientY: mapRect.top + mapRect.height * (horizontal ? 0.5 : ratio),
    bubbles: true,
    cancelable: true,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
  };
  viewport.dispatchEvent(
    event instanceof WheelEvent
      ? new WheelEvent("wheel", {
          ...init,
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaZ: event.deltaZ,
          deltaMode: event.deltaMode,
        })
      : new MouseEvent("dblclick", init)
  );
}
function navigateByKey(event: KeyboardEvent) {
  const manager = props.mapManager,
    target = canvas.value;
  if (!manager || manager.isExporting || !target) return;
  const horizontal = props.axis === "horizontal",
    axis = horizontal ? 0 : 1;
  const direction =
    event.key === (horizontal ? "ArrowLeft" : "ArrowUp")
      ? -1
      : event.key === (horizontal ? "ArrowRight" : "ArrowDown")
      ? 1
      : 0;
  if (direction) {
    const view = manager.getView(),
      center = view.getCenter()?.slice();
    if (!center) return;
    center[axis] +=
      direction *
      (horizontal ? 1 : -1) *
      (view.getResolution() ?? 1) *
      (event.shiftKey ? 128 : 32);
    view.setCenter(center);
    event.preventDefault();
  } else if (["+", "=", "-"].includes(event.key)) {
    const rect = target.getBoundingClientRect();
    forwardNavigation(
      new WheelEvent("wheel", {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        deltaY: event.key === "-" ? 100 : -100,
      })
    );
    event.preventDefault();
  }
}
async function refreshGapSetting() {
  const manager = props.mapManager;
  if (!manager) return;
  try {
    const { data } = await manager.networkManager.requestManager.sendRequest(
      new SequenceAnalysisRequest("/sequence/settings", {})
    );
    if (disposed || manager !== props.mapManager || manager.isDisposed) return;
    defaultGap = Number.isFinite(data.gapLengthBp)
      ? data.gapLengthBp
      : undefined;
    schedule();
  } catch {
    /* The actual FASTA request reports connection failures; do not duplicate notifications. */
  }
}
watch(() => settings.sequenceGapLengthBp, refreshGapSetting);

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
let cached:
  | { key: string; start: number; end: number; response: Region }
  | undefined;
let renderedBoundaries: { screen: number; label: string }[] = [];
let renderedBases: { screen: number; label: string }[] = [];
function clearBaseMetadata() {
  cancelTooltipHide();
  hoverText.value = "";
}
function showBaseMetadata(event: MouseEvent) {
  const target = canvas.value;
  if (!target || dragging.value) return;
  cancelTooltipHide();
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
  const boundary = renderedBoundaries.find(
    (b) => Math.abs(b.screen - position) <= 4
  );
  hoverPoint.value = { x: event.clientX, y: event.clientY };
  if (boundary) hoverText.value = boundary.label;
  else if (closest && Math.abs(closest.screen - position) <= 10)
    hoverText.value = closest.label;
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
  if (visible.value === value) return;
  visible.value = value;
  emit("presence", value);
}
function schedule() {
  if (disposed || props.mapManager?.isExporting) return;
  ++generation;
  renderedBases = [];
  clearBaseMetadata();
  request?.abort();
  request = undefined;

  window.clearTimeout(timer);
  void render(generation, false);
  timer = window.setTimeout(() => void render(generation), 80);
}
async function render(id: number, allowFetch = true) {
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
  if (
    !manager.networkManager.requestManager.hasLinkedFasta ||
    !screenResolution ||
    (screenResolution * resolution) / scale > 0.1
  ) {
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
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    end - start > 4096
  ) {
    setVisible(false);
    return;
  }
  const api = manager.networkManager.requestManager;
  const key = JSON.stringify([
    api.history.applied,
    api.sequenceRevision,
    manager.getOptions().filename,
  ]);
  try {
    let response =
      cached?.key === key && cached.start <= start && cached.end >= end
        ? cached.response
        : undefined;
    const horizontal = props.axis === "horizontal";
    const length = map.getSize()?.[horizontal ? 0 : 1] ?? 1;
    target.width = horizontal ? length : 32;
    target.height = horizontal ? 32 : length;
    setVisible(true);
    if (!response && !allowFetch) {
      renderedBases = [];
      renderedBoundaries = [];
      return;
    }
    if (response === undefined) {
      const controller = new AbortController();
      request = controller;
      const extra = Math.min(512, Math.max(32, end - start));
      const fetchStart = Math.max(0, start - extra);
      const fetchEnd = Math.min(
        holder.prefix_sum_bp[holder.prefix_sum_bp.length - 1],
        end + extra
      );
      response =
        await manager.networkManager.requestManager.querySequenceRegion(
          fetchStart,
          fetchEnd,
          controller.signal
        );
      if (id !== generation) return;
      if (!response.linked) {
        setVisible(false);
        return;
      }
      cached = { key, start: fetchStart, end: fetchEnd, response };
    }
    if (id !== generation || manager.isDisposed) return;
    lastFailure = "";
    const sequence = response.sequence ?? "";
    renderedBases = [];
    renderedBoundaries = [];
    target.dataset.startBp = String(start);
    target.dataset.endBp = String(end);
    const context = target.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, target.width, target.height);
    context.font = "bold 14px 'HiCT Sans', sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    const responseStart = response.startBp ?? cached?.start ?? start;
    for (
      let i = Math.max(0, start - responseStart);
      i < Math.min(sequence.length, end - responseStart);
      i++
    ) {
      const pixel =
        holder.getFractionalPxOfBp(responseStart + i + 0.5, resolution) * scale;
      const screen = map.getPixelFromCoordinate(
        horizontal ? [pixel, 0] : [0, -pixel]
      )[horizontal ? 0 : 1];
      const base = sequence[i].toUpperCase();
      const position = responseStart + i;
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
        horizontal ? screen : 16,
        horizontal ? 16 : screen
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
        context.lineTo(horizontal ? screen : 32, horizontal ? 32 : screen);
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
      const [borders, scaffoldId] = scaffolds[i];
      const name =
        manager.scaffoldHolder.scaffoldTable.get(scaffoldId)?.scaffoldName ??
        "Scaffold";
      for (const bp of [borders.startBP, borders.endBP]) {
        if (
          bp < start ||
          bp > end ||
          bp === 0 ||
          bp === holder.prefix_sum_bp[holder.prefix_sum_bp.length - 1]
        )
          continue;
        const pixel = holder.getFractionalPxOfBp(bp, resolution) * scale;
        const screen = map.getPixelFromCoordinate(
          horizontal ? [pixel, 0] : [0, -pixel]
        )[horizontal ? 0 : 1];
        renderedBoundaries.push({
          screen,
          label: `${name} · scaffold boundary\nCurrent assembly: ${bp.toLocaleString()} bp\nConfigured separator: ${
            defaultGap === undefined
              ? "not loaded"
              : defaultGap.toLocaleString() + " Ns"
          } in concatenated sequence.\nNot expanded on the gap-free map. Imported AGP gaps are preserved in sequence exports.`,
        });
      }
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
    drag = undefined;
    dragging.value = false;
    clearBaseMetadata();
    defaultGap = undefined;
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
      void refreshGapSetting();
    }
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  disposed = true;
  drag = undefined;
  clearBaseMetadata();
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
  cursor: grab;
  touch-action: none;
  background: #fff;
  border-bottom: 1px solid #cbd5e1;
}
.horizontal {
  left: 0;
  top: 0;
  width: 100%;
  height: 32px;
}
.vertical {
  top: 0;
  left: 0;
  width: 32px;
  height: 100%;
}
.sequence-axis.dragging {
  cursor: grabbing;
}
.sequence-axis:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: -2px;
}
.base-metadata {
  white-space: pre-line;
  margin-top: 4px;
}
</style>
