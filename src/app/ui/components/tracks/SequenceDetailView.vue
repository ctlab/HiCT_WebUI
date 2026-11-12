<template>
  <section
    ref="surface"
    class="sequence-detail"
    role="region"
    tabindex="-1"
    aria-label="FASTA sequence view"
    @keydown.esc.prevent="closeView"
  >
    <header>
      <div>
        <h2>FASTA sequence view</h2>
        <p>
          Sequence zoom · Read-only · Coordinates include scaffold gaps · A
          <span class="a">●</span> C <span class="c">●</span> G
          <span class="g">●</span> T <span class="t">●</span>
        </p>
      </div>
      <button class="btn btn-primary" @click="closeView" :disabled="exporting">
        Return to contact map
      </button>
    </header>
    <p class="coordinate-note">
      Configured scaffold separators and imported AGP gaps appear as Ns. These
      bases have no contact bins. Annotation tracks are projected onto the same
      sequence coordinates; gaps contain no annotation signal. Returning
      restores the gap-free contact map.
    </p>
    <section
      v-for="(axis, index) in axes"
      :key="index"
      class="sequence-window"
      :aria-label="axis.label"
    >
      <h3>{{ axis.label }}</h3>
      <form
        class="navigation"
        @submit.prevent="navigate(index, axis.input - 1)"
      >
        <button
          type="button"
          class="btn btn-outline-primary"
          :disabled="
            exporting || axis.busy || !axis.data || axis.data.startBp === 0
          "
          @click="navigate(index, (axis.data?.startBp ?? 0) - count)"
        >
          ← Previous {{ count }} bases
        </button>
        <label
          >First sequence base
          <input
            v-model.number="axis.input"
            :disabled="exporting"
            type="number"
            min="1"
            :max="axis.data?.totalLength"
            required
            class="form-control"
        /></label>
        <button
          type="submit"
          class="btn btn-outline-primary"
          :disabled="exporting || axis.busy"
        >
          Go
        </button>
        <button
          type="button"
          class="btn btn-outline-primary"
          :disabled="
            exporting ||
            axis.busy ||
            !axis.data ||
            (axis.data.startBp ?? 0) + (axis.data.sequence?.length ?? 0) >=
              (axis.data.totalLength ?? 0)
          "
          @click="navigate(index, (axis.data?.startBp ?? 0) + count)"
        >
          Next {{ count }} bases →
        </button>
        <span v-if="axis.data"
          >of {{ axis.data.totalLength?.toLocaleString() }} bp</span
        >
      </form>
      <p v-if="axis.busy" role="status">Loading sequence…</p>
      <p v-if="axis.error" role="alert" class="text-danger">
        {{ axis.error }}
      </p>
      <div v-if="axis.data && !axis.busy" class="sequence-axis-viewport">
        <div
          class="sequence-axis-content"
          :style="{ width: `${(axis.data.sequence?.length ?? count) * 18}px` }"
        >
          <canvas
            v-if="axis.trackCount"
            :ref="(element: unknown) => setTrackCanvas(index, element)"
            class="sequence-annotations"
            :aria-busy="axis.trackBusy"
            :width="(axis.data.sequence?.length ?? count) * 18"
            :height="axis.trackCount * 60"
            :aria-label="`${axis.label} annotations in sequence coordinates`"
            @mousemove="showTrackMetadata(index, $event)"
            @mouseleave="clearTrackMetadata(index)"
          ></canvas>
          <div
            class="bases"
            tabindex="0"
            :aria-label="`${axis.label}: use arrow keys to navigate, hover a base for provenance`"
            @keydown.left.prevent="
              navigate(index, (axis.data?.startBp ?? 0) - count)
            "
            @keydown.right.prevent="
              navigate(index, (axis.data?.startBp ?? 0) + count)
            "
          >
            <span
              v-for="base in bases(axis.data)"
              :key="base.position"
              class="base"
              :class="base.letter.toLowerCase()"
              :style="base.boundary"
              :title="base.description"
              @mouseenter="metadata = base.description"
              @click="metadata = base.description"
            >
              {{ base.letter }}
            </span>
          </div>
          <div class="sequence-ruler" aria-label="Sequence coordinate ruler">
            <span
              v-for="(base, baseIndex) in bases(axis.data)"
              :key="base.position"
              :style="{ left: `${baseIndex * 18}px` }"
              v-show="baseIndex % 10 === 0"
              >{{ (base.position + 1).toLocaleString() }}</span
            >
          </div>
        </div>
      </div>
      <p v-if="axis.trackBusy" role="status">Loading annotations…</p>
      <p v-if="axis.trackError" role="alert" class="text-danger">
        {{ axis.trackError }}
      </p>
      <p v-if="axis.data" class="range">
        Sequence {{ ((axis.data.startBp ?? 0) + 1).toLocaleString() }}–{{
          (
            (axis.data.startBp ?? 0) + (axis.data.sequence?.length ?? 0)
          ).toLocaleString()
        }}
        · Borders use your contig and scaffold styles.
      </p>
    </section>
    <aside aria-live="polite">
      <strong>Base provenance</strong>
      <pre>{{
        metadata ||
        "Hover or click a base to see its sequence, assembly and original FASTA coordinates. Arrow keys move the focused sequence window."
      }}</pre>
    </aside>
  </section>
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import axios from "axios";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import { coordinateLowerBound } from "@/app/core/visualization/sequenceBoundaries";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";
import { useNotificationCenterStore } from "@/app/stores/notificationCenterStore";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
const props = defineProps<{ mapManager: ContactMapManager }>();
const emit = defineEmits<{ (event: "close"): void }>();
const exporting = ref(false);
const closeView = () => {
  if (!exporting.value) emit("close");
};
useEscDismissableDialog({
  priority: 10,
  isOpen: () => true,
  requestClose: closeView,
});
type Region = Awaited<
  ReturnType<
    ContactMapManager["networkManager"]["requestManager"]["querySequenceRegion"]
  >
>;
const count = 60;
const axes = ref<
  {
    label: string;
    input: number;
    busy: boolean;
    error: string;
    data?: Region;
    trackCount: number;
    trackBusy: boolean;
    trackError: string;
  }[]
>([
  {
    label: "Column axis",
    input: 1,
    busy: false,
    error: "",
    trackCount: 0,
    trackBusy: false,
    trackError: "",
  },
  {
    label: "Row axis",
    input: 1,
    busy: false,
    error: "",
    trackCount: 0,
    trackBusy: false,
    trackError: "",
  },
]);
const metadata = ref("");
const surface = ref<HTMLElement>();
const trackGenerations = [0, 0];
const trackCanvases: (HTMLCanvasElement | undefined)[] = [];
const trackHovers: (
  | Awaited<
      ReturnType<
        ContactMapManager["linearTrackManager"]["renderSequenceTracks"]
      >
    >
  | undefined
)[] = [];
let unsubscribeTracks: (() => void) | undefined;
let unregisterExporter: (() => void) | undefined;
let disposed = false;
const borderRevision = ref(0);
let borderListener: EventsKey | undefined;
let borderSignature = "";
function setTrackCanvas(index: number, element: unknown) {
  trackCanvases[index] =
    element instanceof HTMLCanvasElement ? element : undefined;
}
function clearTrackMetadata(index: number) {
  trackCanvases[index]?.removeAttribute("title");
}
function showTrackMetadata(index: number, event: MouseEvent) {
  const canvas = trackCanvases[index];
  if (!canvas) return;
  const hit = trackHovers[index]?.hover(event.offsetX, event.offsetY);
  if (!hit) {
    clearTrackMetadata(index);
    return;
  }
  const details =
    hit.kind === "feature"
      ? [
          hit.label,
          hit.featureType,
          hit.strand,
          ...Object.entries(hit.attributes ?? {}).map(
            ([key, value]) => `${key}: ${value}`
          ),
        ]
          .filter(Boolean)
          .join("\n")
      : `Value: ${hit.value}`;
  canvas.title = `${hit.trackName}\nCurrent assembly: ${hit.startBp + 1}–${
    hit.endBp
  } bp\n${details}`;
  metadata.value = canvas.title;
}
async function renderTracks(index: number, controller: AbortController) {
  const axis = axes.value[index],
    data = axis.data;
  const generation = ++trackGenerations[index];
  const current = () =>
    !disposed &&
    requests[index] === controller &&
    trackGenerations[index] === generation;
  if (!data || !current()) return;
  axis.trackCount = props.mapManager.linearTrackManager.getVisibleTracksForAxis(
    index === 0 ? "horizontal" : "vertical"
  ).length;
  axis.trackError = "";
  axis.trackBusy = axis.trackCount > 0;
  trackHovers[index] = undefined;
  await nextTick();
  const canvas = trackCanvases[index];
  if (!current()) return;
  if (!canvas) {
    axis.trackBusy = false;
    return;
  }
  try {
    // Both sequences are displayed left-to-right; each uses its original axis visibility.
    const rendered =
      await props.mapManager.linearTrackManager.renderSequenceTracks(
        canvas,
        index === 0 ? "horizontal" : "vertical",
        {
          start: data.startBp ?? 0,
          end: (data.startBp ?? 0) + (data.sequence?.length ?? 0),
          segments: data.segments ?? [],
          signal: controller.signal,
          isCurrent: current,
        },
        "horizontal"
      );
    if (!current()) return;
    trackHovers[index] = rendered;
    axis.trackError = rendered?.errors.join("; ") ?? "";
    if (axis.trackError)
      notifications.add("warning", `Sequence annotations: ${axis.trackError}`);
  } catch (error) {
    if (!current() || axios.isCancel(error)) return;
    axis.trackError = extractErrorMessage(error);
    notifications.add("warning", `Sequence annotations: ${axis.trackError}`);
  } finally {
    if (current()) axis.trackBusy = false;
  }
}
const requests: (AbortController | undefined)[] = [];
const notifications = useNotificationCenterStore();
async function navigate(
  index: number,
  start: number,
  assemblyAnchorBp?: number
) {
  if (exporting.value) return;
  const axis = axes.value[index];
  if (!Number.isSafeInteger(start)) {
    axis.error = "Enter a whole-number sequence position.";
    return;
  }
  requests[index]?.abort();
  const controller = new AbortController();
  requests[index] = controller;
  const total = axis.data?.totalLength;
  start = Math.max(
    0,
    total === undefined ? start : Math.min(start, Math.max(0, total - count))
  );
  const end =
    total === undefined ? start + count : Math.min(total, start + count);
  axis.busy = true;
  axis.error = "";
  metadata.value = "";
  try {
    const result =
      await props.mapManager.networkManager.requestManager.querySequenceRegion(
        start,
        end,
        controller.signal,
        { includeGaps: true, assemblyAnchorBp }
      );
    if (requests[index] !== controller) return;
    if (!result.linked)
      throw new Error("Link a FASTA file to display sequence bases.");
    axis.data = result;
    axis.input = (result.startBp ?? 0) + 1;
    axis.busy = false;
    await renderTracks(index, controller);
  } catch (error) {
    if (requests[index] !== controller || axios.isCancel(error)) return;
    axis.error = extractErrorMessage(error);
    notifications.add("warning", `FASTA sequence view: ${axis.error}`);
  } finally {
    if (requests[index] === controller) axis.busy = false;
  }
}
function bases(data: Region) {
  void borderRevision.value;
  const tracks = props.mapManager.viewAndLayersManager.track2DHolder;
  return [...(data.sequence ?? "")].map((letter, index) => {
    const position = (data.startBp ?? 0) + index;
    const segment = data.segments?.find(
      (s) => s.start <= position && position < s.end
    );
    let description = `${letter} · Sequence base ${(
      position + 1
    ).toLocaleString()} (including gaps)`;
    const boundary: Record<string, string> = {};
    if (segment?.gap)
      description +=
        "\nScaffold gap: inserted N, no original FASTA base and no contact bin.";
    else if (
      segment &&
      segment.assemblyStart !== null &&
      segment.sourceStart !== null &&
      segment.sourceEnd !== null
    ) {
      const offset = position - segment.start;
      const source = segment.reversed
        ? segment.sourceEnd - offset
        : segment.sourceStart + offset + 1;
      description += `\nCurrent assembly: ${(
        segment.assemblyStart +
        offset +
        1
      ).toLocaleString()} bp\nOriginal FASTA: ${
        segment.source
      }:${source.toLocaleString()} (${
        segment.reversed ? "−" : "+"
      } strand)\nContig: ${segment.contig}\nScaffold: ${
        segment.scaffold ?? "unplaced"
      }`;
      // Slices may begin within a contig: only draw true boundaries, not request edges.
      const holder = props.mapManager.getContigDimensionHolder();
      const assembly = segment.assemblyStart + offset;
      const contigIndex = coordinateLowerBound(
        holder.prefix_sum_bp,
        assembly,
        (bp) => bp
      );
      const isContig = holder.prefix_sum_bp[contigIndex] === assembly;
      const scaffolds = props.mapManager.scaffoldHolder.scaffoldBordersSorted;
      const scaffoldIndex = coordinateLowerBound(
        scaffolds,
        assembly,
        ([b]) => b.startBP
      );
      const isScaffold = scaffolds[scaffoldIndex]?.[0].startBP === assembly;
      const track = isScaffold
        ? tracks.scaffoldBordersTrack
        : isContig
        ? tracks.contigBordersTrack
        : undefined;
      if (track && track.getStyleType() !== 3) {
        const color = track.options.borderColor;
        const css = Array.isArray(color)
          ? `rgba(${color[0]},${color[1]},${color[2]},${color[3] ?? 1})`
          : color;
        boundary.borderLeft = `${track.options.width}px solid ${css}`;
        if (track.options.borderOutline)
          boundary.boxShadow = "-1px 0 0 1px rgba(0,0,0,0.9)";
      }
    }
    if (segment?.gap && position === segment.start) {
      const previous = data.segments?.find((s) => !s.gap && s.end === position);
      if (
        previous?.assemblyEnd !== null &&
        previous?.assemblyEnd !== undefined
      ) {
        const scaffolds = props.mapManager.scaffoldHolder.scaffoldBordersSorted;
        const i = coordinateLowerBound(
          scaffolds,
          previous.assemblyEnd,
          ([b]) => b.endBP
        );
        const track =
          scaffolds[i]?.[0].endBP === previous.assemblyEnd
            ? tracks.scaffoldBordersTrack
            : tracks.contigBordersTrack;
        if (track.getStyleType() !== 3) {
          const color = track.options.borderColor;
          const css = Array.isArray(color)
            ? `rgba(${color[0]},${color[1]},${color[2]},${color[3] ?? 1})`
            : color;
          boundary.borderLeft = `${track.options.width}px solid ${css}`;
          if (track.options.borderOutline)
            boundary.boxShadow = "-1px 0 0 1px rgba(0,0,0,0.9)";
        }
      }
    }
    return { letter: letter.toUpperCase(), position, description, boundary };
  });
}
onMounted(() => {
  unregisterExporter = props.mapManager.registerSequenceViewExporter(
    async (options) => {
      if (
        disposed ||
        axes.value.some(
          (axis) =>
            axis.busy ||
            axis.trackBusy ||
            axis.error ||
            axis.trackError ||
            !axis.data
        )
      )
        throw new Error(
          "Wait for both sequence windows and their annotations to finish loading before exporting."
        );
      exporting.value = true;
      try {
        const { captureSequenceScene } = await import(
          "@/app/core/export/SequenceScene"
        );
        const viewports = surface.value?.querySelectorAll<HTMLElement>(
          ".sequence-axis-viewport"
        );
        if (!viewports || viewports.length !== axes.value.length)
          throw new Error("Sequence windows are not available for export.");
        return await captureSequenceScene(
          props.mapManager,
          axes.value.map((axis, index) => ({
            label: axis.label,
            orientation: index === 0 ? "horizontal" : "vertical",
            start: axis.data!.startBp ?? 0,
            sequence: axis.data!.sequence ?? "",
            segments: axis.data!.segments ?? [],
            width: viewports[index].clientWidth,
            scrollLeft: viewports[index].scrollLeft,
            bases: bases(axis.data!),
          })),
          options?.metadata,
          options?.progress
        );
      } finally {
        exporting.value = false;
      }
    }
  );
  borderListener = props.mapManager.getMap().on("rendercomplete", () => {
    const tracks = props.mapManager.viewAndLayersManager.track2DHolder;
    const signature = JSON.stringify([
      tracks.contigBordersTrack.options,
      tracks.contigBordersTrack.getStyleType(),
      tracks.scaffoldBordersTrack.options,
      tracks.scaffoldBordersTrack.getStyleType(),
    ]);
    if (signature !== borderSignature) {
      borderSignature = signature;
      borderRevision.value++;
    }
  });
  unsubscribeTracks = props.mapManager.linearTrackManager.subscribeTrackList(
    () => {
      requests.forEach((controller, index) => {
        if (controller && !axes.value[index].busy)
          void renderTracks(index, controller);
      });
    }
  );
  surface.value?.focus();
  const m = props.mapManager,
    descriptor = m.viewAndLayersManager.currentViewState.resolutionDesciptor;
  m.networkManager.requestManager.sequenceViewReadOnly = true;
  const center = m.getView().getCenter() ?? [0, 0];
  const holder = m.getContigDimensionHolder();
  const total = holder.prefix_sum_bp[holder.prefix_sum_bp.length - 1];
  for (let axis = 0; axis < 2; axis++) {
    const pixel =
      (axis === 0 ? center[0] : -center[1]) / descriptor.pixelResolution;
    const anchor = Math.max(
      0,
      Math.min(
        total - 1,
        Math.floor(holder.getFractionalBpOfPx(pixel, descriptor.bpResolution))
      )
    );
    void navigate(axis, 0, anchor);
  }
});
onBeforeUnmount(() => {
  disposed = true;
  if (borderListener) unByKey(borderListener);
  unsubscribeTracks?.();
  unregisterExporter?.();
  requests.forEach((r) => r?.abort());
  // The request manager is a shared service object, not component state.
  // eslint-disable-next-line vue/no-mutating-props
  props.mapManager.networkManager.requestManager.sequenceViewReadOnly = false;
});
</script>
<style scoped>
.sequence-detail {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: #fff;
  color: #17212c;
  padding: 24px;
  overflow: auto;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
h2 {
  font-size: 1.4rem;
}
h3 {
  font-size: 1.1rem;
}
header p,
.range {
  color: #526170;
  font-size: 0.9rem;
}
.coordinate-note {
  padding: 12px;
  border-left: 4px solid #1769c2;
  background: #eef6ff;
}
.sequence-window {
  margin: 24px 0;
}
.navigation {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 10px;
  margin-bottom: 14px;
}
.navigation label {
  display: flex;
  flex-direction: column;
  font-size: 0.85rem;
}
.navigation input {
  width: 200px;
}
.bases {
  display: flex;
  padding: 4px 0;
  min-height: 28px;
  border-bottom: 1px solid #ccd4dc;
  background: #fff;
}
.sequence-axis-viewport {
  overflow-x: auto;
}
.sequence-annotations {
  display: block;
}
.sequence-ruler {
  position: relative;
  height: 28px;
  background: #fff;
  color: #17212c;
}
.sequence-ruler span {
  position: absolute;
  top: 4px;
  font: 11px sans-serif;
  white-space: nowrap;
}
.base {
  position: relative;
  flex: 0 0 18px;
  text-align: center;
  font: 700 17px "HiCT Mono", monospace;
  cursor: help;
  box-sizing: border-box;
}
.base:hover {
  background: #e4ecf6;
}
.position {
  position: absolute;
  left: 0;
  top: -22px;
  color: #526170;
  font: 11px sans-serif;
  display: none;
}
.base:nth-child(10n + 1) .position {
  display: block;
}
.a {
  color: #16823b;
}
.c {
  color: #1769c2;
}
.g {
  color: #996600;
}
.t {
  color: #c52a30;
}
.n {
  color: #626b74;
  background: #f0f1f2;
}
aside {
  background: #f4f7fa;
  padding: 16px;
  border-radius: 6px;
}
pre {
  white-space: pre-wrap;
  font: 14px/1.6 sans-serif;
  margin: 8px 0 0;
  min-height: 120px;
}
</style>
