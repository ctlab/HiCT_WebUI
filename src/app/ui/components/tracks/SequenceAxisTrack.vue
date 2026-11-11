<template>
  <canvas
    v-show="visible"
    ref="canvas"
    class="sequence-axis"
    :class="[axis, { dragging }]"
    :style="
      axis === 'horizontal'
        ? { height: `${stripSize}px` }
        : { width: `${stripSize}px` }
    "
    role="img"
    tabindex="0"
    aria-label="FASTA track (forward strand, optionally reverse complement below). Drag to pan; scroll or double-click to zoom. Arrow keys pan; plus and minus zoom."
    @pointerdown="startPan"
    @pointermove="pan"
    @pointerup="endPan"
    @pointercancel="endPan"
    @wheel.prevent="forwardNavigation"
    @dblclick.prevent="forwardNavigation"
    @keydown="navigateByKey"
    @mousemove="showBaseMetadata"
    @mouseleave="scheduleTooltipHide"
    @contextmenu.prevent="onContextMenu"
  />
  <AxisContextMenu
    v-if="contextMenu"
    :items="contextMenu.items"
    :title="contextMenu.title"
    :x="contextMenu.x"
    :y="contextMenu.y"
    @close="contextMenu = null"
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
import {
  SEQUENCE_LETTER_FONT,
  sequenceLetterMinimumPixels,
} from "@/app/core/visualization/sequenceLetterMetrics";

import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  complementBase,
  sequenceStripSize,
  strandRows,
} from "@/app/core/visualization/sequenceStrands";
import { coordinateLowerBound } from "@/app/core/visualization/sequenceBoundaries";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { useNotificationCenterStore } from "@/app/stores/notificationCenterStore";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";
import axios from "axios";
import FloatingTrackTooltip from "./FloatingTrackTooltip.vue";
import AxisContextMenu from "../common/AxisContextMenu.vue";
import {
  copyText,
  formatLocus,
  type ContextMenuItem,
} from "@/app/core/mapmanagers/contextMenuActions";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import { SequenceAnalysisRequest } from "@/app/core/net/api/SequenceAnalysisRequest";
const settings = useUiSettingsStore();
const stripSize = computed(() =>
  sequenceStripSize(settings.sequenceShowReverseStrand)
);
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
watch(
  () => settings.sequenceShowReverseStrand,
  () => schedule()
);

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
  unsubscribers: (() => void)[] = [],
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
let renderedBases: {
  screen: number;
  label: string;
  reverseLabel: string;
  bp: number;
  base: string;
}[] = [];
let renderedRows = strandRows(false);
function clearBaseMetadata() {
  cancelTooltipHide();
  hoverText.value = "";
}
function locateBase(event: MouseEvent) {
  const target = canvas.value;
  if (!target) return undefined;
  const box = target.getBoundingClientRect();
  const position =
    props.axis === "horizontal"
      ? event.clientX - box.left
      : event.clientY - box.top;
  const cross =
    props.axis === "horizontal"
      ? event.clientY - box.top
      : event.clientX - box.left;
  const reverseRow = renderedRows.find((row) => row.strand === "reverse");
  const onReverse = !!reverseRow && cross >= reverseRow.start;
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
  const base =
    closest && Math.abs(closest.screen - position) <= 10 ? closest : undefined;
  return { boundary, base, onReverse };
}
function showBaseMetadata(event: MouseEvent) {
  if (!canvas.value || dragging.value || contextMenu.value) return;
  cancelTooltipHide();
  const located = locateBase(event);
  if (!located) return;
  const { boundary, base, onReverse } = located;
  hoverPoint.value = { x: event.clientX, y: event.clientY };
  if (boundary) hoverText.value = boundary.label;
  else if (base) hoverText.value = onReverse ? base.reverseLabel : base.label;
  else clearBaseMetadata();
}
const contextMenu = ref<{
  x: number;
  y: number;
  title: string;
  items: ContextMenuItem[];
} | null>(null);
function onContextMenu(event: MouseEvent) {
  clearBaseMetadata();
  const manager = props.mapManager;
  if (!manager || !canvas.value) return;
  const base = locateBase(event)?.base;
  const sequence = renderedBases.map((entry) => entry.base).join("");
  const showing = settings.sequenceShowReverseStrand;
  contextMenu.value = {
    x: event.clientX,
    y: event.clientY,
    title: `FASTA · ${props.axis === "horizontal" ? "Columns" : "Rows"}`,
    items: [
      {
        label: "Copy position",
        disabled: !base,
        run: () => {
          if (!base) return;
          const locus = manager
            .getContigDimensionHolder()
            .getContigLocusByBp(base.bp);
          void copyText(
            formatLocus(locus.contigName, locus.inContigBp + 1),
            "Position"
          );
        },
      },
      {
        label: "Copy visible sequence",
        disabled: sequence.length === 0,
        run: () => void copyText(sequence, "Visible sequence"),
      },
      {
        label: showing ? "Hide reverse strand" : "Show reverse strand",
        run: () => {
          settings.sequenceShowReverseStrand = !showing;
        },
      },
    ],
  };
}
// The one sequence request in flight, with the range it covers. Later renders whose viewport is
// still inside that range wait for it instead of aborting it and starting over.
let inFlight:
  | {
      key: string;
      start: number;
      end: number;
      controller: AbortController;
      promise: Promise<Region>;
    }
  | undefined;
function abortInFlight() {
  inFlight?.controller.abort();
  inFlight = undefined;
}
/**
 * The assembly or the linked FASTA changed. Whatever was fetched or drawn describes the old
 * state, so drop it, cancel the stale read and repaint at the same viewport.
 */
function onSequenceInvalidated() {
  if (disposed) return;
  cached = undefined;
  abortInFlight();
  renderedBases = [];
  renderedBoundaries = [];
  lastFailure = "";
  schedule();
}
let frame: number | undefined;
function cancelScheduledFrame() {
  if (frame !== undefined) window.cancelAnimationFrame(frame);
  frame = undefined;
}
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
// Letters appear once a base is wide enough for its widest glyph and stay until it is clearly
// too narrow, so a zoom that hovers at the limit does not make the strip flicker.
const LETTER_FONT = SEQUENCE_LETTER_FONT;
let lettersShown = false;
/** `bpPerCssPixel` is the span of one CSS pixel on the sequence axis. */
function lettersFit(bpPerCssPixel: number): boolean {
  if (!(bpPerCssPixel > 0)) return false;
  const needed = sequenceLetterMinimumPixels();
  return 1 / bpPerCssPixel >= needed * (lettersShown ? 0.9 : 1);
}
/** Many events (center, resolution, moveend) fire per frame: coalesce them into one render pass. */
function schedule() {
  if (disposed || frame !== undefined || props.mapManager?.isExporting) return;
  frame = window.requestAnimationFrame(() => {
    frame = undefined;
    renderScheduled();
  });
}
function renderScheduled() {
  if (disposed || props.mapManager?.isExporting) return;
  ++generation;
  renderedBases = [];
  clearBaseMetadata();
  window.clearTimeout(timer);
  void render(generation, false);
  timer = window.setTimeout(() => void render(generation), 80);
}
/** The map repaints constantly; only a resized strip needs a new render. */
function onRenderComplete() {
  const target = canvas.value;
  const size = props.mapManager?.getMap().getSize();
  if (!target || !size || !visible.value) return;
  const horizontal = props.axis === "horizontal";
  const width = horizontal ? size[0] : stripSize.value;
  const height = horizontal ? stripSize.value : size[1];
  if (target.width !== width || target.height !== height) schedule();
}
/** Pin a reading-direction arrow to the leading edge of each strand row. */
function drawStrandMarkers(
  context: CanvasRenderingContext2D,
  rows: ReturnType<typeof strandRows>,
  horizontal: boolean
) {
  context.save();
  context.font = "bold 13px 'HiCT Sans', sans-serif";
  for (const row of rows) {
    const glyph =
      row.strand === "forward"
        ? horizontal
          ? "→"
          : "↓"
        : horizontal
        ? "←"
        : "↑";
    const x = horizontal ? 1 : row.start + 1;
    const y = horizontal ? row.start + 1 : 1;
    const w = horizontal ? 18 : row.end - row.start - 2;
    const h = horizontal ? row.end - row.start - 2 : 18;
    context.fillStyle =
      row.strand === "forward"
        ? "rgba(226,232,240,0.95)"
        : "rgba(30,41,59,0.9)";
    context.fillRect(x, y, w, h);
    context.fillStyle = row.strand === "forward" ? "#0f172a" : "#f8fafc";
    context.fillText(glyph, x + w / 2, y + h / 2);
  }
  if (horizontal) {
    context.strokeStyle = "#e2e8f0";
    context.beginPath();
    context.moveTo(0, rows[0].end);
    context.lineTo(context.canvas.width, rows[0].end);
    context.stroke();
  } else {
    context.strokeStyle = "#e2e8f0";
    context.beginPath();
    context.moveTo(rows[0].end, 0);
    context.lineTo(rows[0].end, context.canvas.height);
    context.stroke();
  }
  context.restore();
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
    !lettersFit((screenResolution * resolution) / scale)
  ) {
    lettersShown = false;
    setVisible(false);
    return;
  }
  lettersShown = true;
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
    const thickness = stripSize.value;
    target.width = horizontal ? length : thickness;
    target.height = horizontal ? thickness : length;
    setVisible(true);
    if (!response && !allowFetch) {
      renderedBases = [];
      renderedBoundaries = [];
      return;
    }
    if (response === undefined) {
      let flight = inFlight;
      if (
        !(
          flight &&
          flight.key === key &&
          flight.start <= start &&
          flight.end >= end
        )
      ) {
        flight?.controller.abort();
        const controller = new AbortController();
        const extra = Math.min(512, Math.max(32, end - start));
        const fetchStart = Math.max(0, start - extra);
        const fetchEnd = Math.min(
          holder.prefix_sum_bp[holder.prefix_sum_bp.length - 1],
          end + extra
        );
        const promise =
          manager.networkManager.requestManager.querySequenceRegion(
            fetchStart,
            fetchEnd,
            controller.signal
          );
        const started = {
          key,
          start: fetchStart,
          end: fetchEnd,
          controller,
          promise,
        };
        flight = started;
        inFlight = started;
        const clear = () => {
          if (inFlight === started) inFlight = undefined;
        };
        promise.then(clear, clear);
      }
      const fetched = flight;
      response = await fetched.promise;
      if (!response.linked) {
        if (id === generation) setVisible(false);
        return;
      }
      // Cache even when a newer render superseded this one: that render reuses the same request.
      cached = { key, start: fetched.start, end: fetched.end, response };
      if (id !== generation) return;
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
    const rows = strandRows(settings.sequenceShowReverseStrand);
    renderedRows = rows;
    context.font = LETTER_FONT;
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
      const complement = complementBase(base);
      const reverseLabel = label.replace(
        `${base} · Current assembly:`,
        `${complement} · Reverse strand (−), complement of ${base} · Current assembly:`
      );
      renderedBases.push({
        screen,
        label: `${label}\nForward strand (+)`,
        reverseLabel,
        bp: position,
        base,
      });
      for (const row of rows) {
        const letter = row.strand === "forward" ? base : complement;
        context.fillStyle = colors[letter] ?? "#666666";
        context.fillText(
          letter,
          horizontal ? screen : row.center,
          horizontal ? row.center : screen
        );
      }
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
        context.lineTo(
          horizontal ? screen : thickness,
          horizontal ? thickness : screen
        );
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
    if (rows.length > 1) drawStrandMarkers(context, rows, horizontal);
    // Exposes what is drawn, for assistive tools and the acceptance checks.
    target.dataset.bases = renderedBases.map((entry) => entry.base).join("");
    target.dataset.firstBp = renderedBases.length
      ? String(renderedBases[0].bp)
      : "";
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
    cancelScheduledFrame();
    abortInFlight();
    listeners.forEach(unByKey);
    listeners = [];
    unsubscribers.forEach((off) => off());
    unsubscribers = [];
    cached = undefined;
    lastFailure = "";
    setVisible(false);
    if (manager) {
      unregisterExportRenderer = manager.registerSequenceRenderer(async () => {
        ++generation;
        window.clearTimeout(timer);
        cancelScheduledFrame();
        abortInFlight();
        await render(generation);
      });
      listeners = [
        manager.getMap().on("rendercomplete", onRenderComplete),
        manager.getMap().on("moveend", schedule),
        manager.getView().on("change:resolution", schedule),
        manager.getView().on("change:center", schedule),
      ];
      unsubscribers = [
        manager.networkManager.requestManager.onSequenceChange(
          onSequenceInvalidated
        ),
        manager.getContigDimensionHolder().onChange(onSequenceInvalidated),
      ];
      schedule();
      void refreshGapSetting();
    }
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  contextMenu.value = null;
  disposed = true;
  drag = undefined;
  clearBaseMetadata();
  unregisterExportRenderer?.();
  ++generation;
  abortInFlight();
  window.clearTimeout(timer);
  cancelScheduledFrame();
  listeners.forEach(unByKey);
  unsubscribers.forEach((off) => off());
  unsubscribers = [];
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
