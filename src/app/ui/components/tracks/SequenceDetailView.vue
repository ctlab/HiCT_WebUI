<template>
  <Teleport to="body">
    <section
      ref="surface"
      class="sequence-detail"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label="FASTA sequence view"
      @keydown.esc.prevent="emit('close')"
    >
      <header>
        <div>
          <h2>FASTA sequence view</h2>
          <p>
            Read-only · Coordinates include scaffold gaps · A
            <span class="a">●</span> C <span class="c">●</span> G
            <span class="g">●</span> T <span class="t">●</span>
          </p>
        </div>
        <button class="btn btn-primary" @click="emit('close')">
          Return to contact map
        </button>
      </header>
      <p class="coordinate-note">
        Configured scaffold separators and imported AGP gaps appear as Ns. These
        bases have no contact bins. Contact-map coordinates and other tracks
        remain unchanged when you return.
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
            :disabled="axis.busy || !axis.data || axis.data.startBp === 0"
            @click="navigate(index, (axis.data?.startBp ?? 0) - count)"
          >
            ← Previous {{ count }} bases
          </button>
          <label
            >First sequence base
            <input
              v-model.number="axis.input"
              type="number"
              min="1"
              :max="axis.data?.totalLength"
              required
              class="form-control"
          /></label>
          <button
            type="submit"
            class="btn btn-outline-primary"
            :disabled="axis.busy"
          >
            Go
          </button>
          <button
            type="button"
            class="btn btn-outline-primary"
            :disabled="
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
        <div
          v-if="axis.data && !axis.busy"
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
            <span class="position">{{
              (base.position + 1).toLocaleString()
            }}</span
            >{{ base.letter }}
          </span>
        </div>
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
  </Teleport>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import axios from "axios";
import { coordinateLowerBound } from "@/app/core/visualization/sequenceBoundaries";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";
import { useNotificationCenterStore } from "@/app/stores/notificationCenterStore";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
const props = defineProps<{ mapManager: ContactMapManager }>();
const emit = defineEmits<{ (event: "close"): void }>();
useEscDismissableDialog({
  priority: 10,
  isOpen: () => true,
  requestClose: () => emit("close"),
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
  }[]
>([
  { label: "Column axis", input: 1, busy: false, error: "" },
  { label: "Row axis", input: 1, busy: false, error: "" },
]);
const metadata = ref("");
const surface = ref<HTMLElement>();
let app: HTMLElement | null = null;
let appWasInert = false;
const requests: (AbortController | undefined)[] = [];
const notifications = useNotificationCenterStore();
async function navigate(
  index: number,
  start: number,
  assemblyAnchorBp?: number
) {
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
  } catch (error) {
    if (requests[index] !== controller || axios.isCancel(error)) return;
    axis.error = extractErrorMessage(error);
    notifications.add("warning", `FASTA sequence view: ${axis.error}`);
  } finally {
    if (requests[index] === controller) axis.busy = false;
  }
}
function bases(data: Region) {
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
    return { letter: letter.toUpperCase(), position, description, boundary };
  });
}
onMounted(() => {
  app = document.querySelector("#app");
  appWasInert = app?.hasAttribute("inert") ?? false;
  app?.setAttribute("inert", "");
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
  if (!appWasInert) app?.removeAttribute("inert");
  requests.forEach((r) => r?.abort());
  props.mapManager.networkManager.requestManager.sequenceViewReadOnly = false;
});
</script>
<style scoped>
.sequence-detail {
  position: fixed;
  inset: 0;
  z-index: 2000;
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
  overflow-x: auto;
  padding: 30px 3px 10px;
  min-height: 70px;
  border-bottom: 1px solid #ccd4dc;
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
