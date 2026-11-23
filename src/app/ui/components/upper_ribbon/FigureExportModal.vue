<template>
  <Teleport to="body">
    <div class="figure-export-backdrop"></div>
    <section
      ref="dialog"
      class="figure-export-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="figure-export-title"
    >
      <header>
        <h5 id="figure-export-title">Export figure</h5>
        <button
          class="btn-close"
          type="button"
          aria-label="Close"
          @click="emit('dismissed')"
        ></button>
      </header>
      <div class="figure-export-body">
        <div class="figure-export-options">
          <label v-if="!sequenceOnly"
            >Area
            <select
              v-model="scope"
              class="form-select form-select-sm"
              aria-label="Export area"
              :disabled="busy"
            >
              <option value="viewport">Viewport</option>
              <option value="whole-map">Whole map</option>
              <option value="selection">Selected rectangle</option>
            </select>
          </label>
          <label v-if="!sequenceOnly" class="form-check-label"
            ><input
              v-model="rulers"
              type="checkbox"
              aria-label="Include rulers and FASTA"
              :disabled="busy"
            />
            Rulers and FASTA</label
          >
          <label v-if="!sequenceOnly" class="form-check-label"
            ><input
              v-model="tracks"
              type="checkbox"
              aria-label="Include 1D tracks"
              :disabled="busy"
            />
            1D tracks</label
          >
          <label v-if="!sequenceOnly" class="form-check-label">
            <input
              v-model="includeSecondary"
              type="checkbox"
              :disabled="busy"
              aria-label="Include ModDotPlot or second map"
            />
            ModDotPlot or second map
          </label>
        </div>
        <p v-if="capturing" role="status">
          Capturing figure · {{ Math.round(progress * 100) }}%
        </p>
        <p v-if="printError" class="text-danger" role="alert">
          {{ printError }}
        </p>
        <p v-if="error" class="text-danger" role="alert">{{ error }}</p>
        <div class="figure-export-options">
          <label
            >Print width
            <select
              v-model="printWidth"
              class="form-select form-select-sm"
              aria-label="Figure print size"
              :disabled="busy"
            >
              <option :value="0">Captured size</option>
              <option :value="86">Single column · 86 mm</option>
              <option :value="132">1.5 columns · 132 mm</option>
              <option :value="178">Double column · 178 mm</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label v-if="printWidth === 'custom'">
            Width (mm)
            <input
              v-model.number="customPrintWidth"
              type="number"
              min="10"
              max="2000"
              step="any"
              class="form-control form-control-sm"
              :disabled="busy"
            />
          </label>
          <p v-if="printDimensions" class="small text-muted mb-0" role="status">
            {{ printDimensions.widthMm }} ×
            {{ printDimensions.heightMm.toFixed(1) }} mm ·
            {{ Math.round(printDimensions.effectiveRasterDpi) }} dpi from
            captured pixels. SVG/PDF labels remain vector.
          </p>
        </div>
        <p
          v-if="printTextPoints !== null"
          class="small"
          :class="printTextPoints < 5 ? 'text-danger' : 'text-muted'"
          role="status"
        >
          Smallest export text: {{ printTextPoints.toFixed(1) }} pt at this
          width.
          <template v-if="printTextPoints < 5">
            For larger text, capture a smaller area or use a vertical
            comparison.
          </template>
        </p>
        <p v-if="outdated" class="alert alert-info" role="status">
          Update the preview to apply the changed options.
          <button
            type="button"
            class="btn btn-sm btn-outline-primary ms-2"
            :disabled="busy"
            @click="capture"
          >
            Update preview
          </button>
        </p>
        <AdvancedSection dialog-id="figure-export">
          <label>
            Label size
            <select
              v-model="printLabelMode"
              class="form-select form-select-sm"
              :disabled="busy"
            >
              <option value="auto">Auto (at least 6 pt)</option>
              <option value="captured">As captured</option>
              <option value="custom">Custom minimum</option>
            </select>
          </label>
          <label v-if="printLabelMode === 'custom'">
            Minimum label size (pt)
            <input
              v-model.number="customLabelPoints"
              type="number"
              min="1"
              max="36"
              step="any"
              class="form-control form-control-sm"
              :disabled="busy"
            />
          </label>
          <label
            v-if="!sequenceOnly && scope === 'whole-map'"
            class="form-check-label"
          >
            <input
              v-model="expandWholeMap"
              type="checkbox"
              :disabled="busy"
              aria-label="Expand small whole maps to fit window"
            />
            Expand small maps to fit window
          </label>
          <label v-if="!sequenceOnly" class="form-check-label"
            ><input
              v-model="crop"
              type="checkbox"
              aria-label="Crop export to map"
              :disabled="busy"
            />
            Crop to map</label
          >
          <button
            class="btn btn-outline-primary btn-sm"
            type="button"
            :disabled="busy"
            @click="capture"
          >
            {{
              capturing
                ? "Capturing…"
                : figure
                ? "Refresh capture"
                : "Capture preview"
            }}
          </button>
          <div v-if="figure" class="snapshot-save-row">
            <label
              >Snapshot name
              <input
                v-model="snapshotName"
                class="form-control form-control-sm"
                aria-label="Snapshot name"
                maxlength="100"
                :disabled="busy"
                placeholder="Before cut"
              />
            </label>
            <button
              class="btn btn-outline-secondary btn-sm"
              :disabled="
                busy ||
                outdated ||
                comparisonOutdated ||
                snapshots.length >= MAX_FIGURE_SNAPSHOTS
              "
              @click="saveSnapshot"
            >
              {{ storing ? "Saving snapshot…" : "Save snapshot" }}
            </button>
            <button
              class="btn btn-outline-secondary btn-sm"
              :aria-expanded="showSnapshots"
              @click="showSnapshots = !showSnapshots"
            >
              Snapshots ({{ snapshots.length }})
            </button>
          </div>
          <p
            v-if="snapshots.length >= MAX_FIGURE_SNAPSHOTS"
            class="small text-muted"
            role="status"
          >
            Eight snapshots stored. Remove one to save another.
          </p>
          <section
            v-if="showSnapshots"
            class="snapshot-library"
            aria-label="Saved figure snapshots"
          >
            <p class="small text-muted">
              Included when you save the session. Comparing uses the captured
              scenes and their own regions and rendering settings.
            </p>
            <p v-if="!snapshots.length" class="small">
              No snapshots yet. Name the current capture and save a snapshot.
            </p>
            <ul v-else class="list-unstyled snapshot-list">
              <li v-for="snapshot in snapshots" :key="snapshot.document.id">
                <span>
                  <button
                    class="btn btn-link p-0 snapshot-name"
                    :aria-label="`View snapshot ${snapshot.document.name}`"
                    :disabled="busy"
                    @click="viewSnapshot(snapshot)"
                  >
                    {{ snapshot.document.name }}
                  </button>
                  <small>{{
                    new Date(snapshot.document.capturedAt).toLocaleString()
                  }}</small></span
                >
                <button
                  class="btn btn-outline-primary btn-sm"
                  :disabled="busy || outdated"
                  @click="compareSnapshot(snapshot)"
                >
                  Compare to snapshot
                </button>
                <button
                  class="btn btn-outline-danger btn-sm"
                  :aria-label="`Remove snapshot ${snapshot.document.name}`"
                  :disabled="busy"
                  @click="removeSnapshot(snapshot.document.id)"
                >
                  Remove
                </button>
              </li>
            </ul>
            <div v-if="selectedSnapshot" class="snapshot-comparison-controls">
              <label
                >Current panel label<input
                  v-model="currentLabel"
                  class="form-control form-control-sm"
                  aria-label="Current panel label"
                  maxlength="100"
                  :disabled="busy"
              /></label>
              <label
                >Layout<select
                  v-model="layout"
                  class="form-select form-select-sm"
                  aria-label="Comparison layout"
                  :disabled="busy"
                >
                  <option value="horizontal">Side by side</option>
                  <option value="vertical">Above and below</option>
                </select></label
              >
              <button
                class="btn btn-outline-primary btn-sm"
                :disabled="busy || outdated"
                @click="updateComparison"
              >
                {{ comparing ? "Composing…" : "Update comparison" }}
              </button>
              <button
                class="btn btn-outline-secondary btn-sm"
                :disabled="busy"
                @click="clearComparison"
              >
                Current capture
              </button>
            </div>
            <p v-if="comparisonOutdated" role="status" class="small text-muted">
              Comparison settings changed. Update the comparison before saving.
            </p>
          </section>
        </AdvancedSection>
        <p v-if="notice" role="status" class="small text-success">
          {{ notice }}
          <button
            v-if="removedSnapshot"
            class="btn btn-link btn-sm"
            :disabled="busy"
            @click="undoRemove"
          >
            Undo remove
          </button>
        </p>
        <div
          class="figure-export-preview"
          tabindex="0"
          aria-label="Captured figure preview"
        >
          <img v-if="previewUrl" :src="previewUrl" alt="Captured figure" />
          <p v-else>
            Capture a preview to inspect the figure before saving it.
          </p>
        </div>
        <p v-if="viewingSnapshot" class="small mt-2" role="status">
          Saved snapshot: {{ viewingSnapshot.document.name }}
          <button
            class="btn btn-link btn-sm"
            :disabled="busy"
            @click="clearComparison"
          >
            Current capture
          </button>
        </p>
        <p v-if="comparison" class="small mt-2 mb-0" role="status">
          Comparison: {{ comparisonLabel }}
        </p>
        <p v-if="displayed" class="small mt-2 mb-0">
          {{ displayed.width.toLocaleString() }} ×
          {{ displayed.height.toLocaleString() }} pixels · captured
          {{ new Date(displayed.capturedAt).toLocaleString() }}. All formats use
          this same capture.
        </p>
      </div>
      <footer>
        <span class="small text-muted"
          >Choose a format and save destination.</span
        >
        <div class="figure-export-actions">
          <button
            v-for="format in formats"
            :id="`export-${format}-button`"
            :key="format"
            class="btn btn-outline-primary"
            type="button"
            :disabled="
              !displayed ||
              busy ||
              !!saving ||
              outdated ||
              comparisonOutdated ||
              !!printError
            "
            @click="save(format)"
          >
            {{
              saving === format ? "Saving…" : `Save ${format.toUpperCase()}…`
            }}
          </button>
          <button
            class="btn btn-secondary"
            type="button"
            @click="emit('dismissed')"
          >
            Close
          </button>
        </div>
      </footer>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
import AdvancedSection from "../common/AdvancedSection.vue";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import type { FrozenFigure } from "@/app/core/export/FrozenFigure";
import { figurePrintDimensions } from "@/app/core/export/FigurePrintSize";
import {
  smallestFigureTextPx,
  printedTextPoints,
} from "@/app/core/export/FigurePrintReadability";
import {
  createFigureSnapshot,
  MAX_FIGURE_SNAPSHOTS,
  type FigureSnapshot,
} from "@/app/core/export/FigureSnapshotDocument";
import {
  compareCapturedFigures,
  type FigureComparisonLayout,
} from "@/app/core/export/FigureComparison";
import { useModalFocus } from "@/app/ui/modalFocus";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";
import { notifyFileSave } from "@/app/ui/fileSaveNotice";
import { useStyleStore } from "@/app/stores/styleStore";

const props = defineProps<{
  mapManager: ContactMapManager;
  metadata?: Record<string, unknown>;
}>();
const emit = defineEmits<{ (event: "dismissed"): void }>();
const formats = ["svg", "png", "pdf"] as const;
const dialog = ref<HTMLElement | null>(null);
const scope = ref<"viewport" | "whole-map" | "selection">("viewport");
const crop = ref(true),
  expandWholeMap = ref(true),
  rulers = ref(true),
  tracks = ref(true),
  includeSecondary = ref(true);
const sequenceOnly = computed(
  () => props.mapManager.networkManager.requestManager.sequenceViewReadOnly
);
const figure = shallowRef<FrozenFigure | null>(null);
const comparison = shallowRef<FrozenFigure | null>(null);
const viewingSnapshot = shallowRef<FigureSnapshot | null>(null);
const displayed = computed(
  () => comparison.value ?? viewingSnapshot.value?.figure ?? figure.value
);
const printWidth = ref<number | "custom">(86);
const customPrintWidth = ref(86);
const printLabelMode = ref<"auto" | "captured" | "custom">("auto");
const customLabelPoints = ref(6);
const widthMm = computed(() =>
  printWidth.value === "custom" ? customPrintWidth.value : printWidth.value
);
const labelMinimum = computed(() =>
  printLabelMode.value === "captured"
    ? undefined
    : printLabelMode.value === "auto"
    ? 6
    : customLabelPoints.value
);
const printError = computed(() => {
  const width = widthMm.value;
  if (
    printWidth.value === "custom" &&
    (!Number.isFinite(width) || width < 10 || width > 2000)
  )
    return "Enter a print width from 10 to 2,000 mm.";
  if (
    width &&
    printLabelMode.value === "custom" &&
    (!Number.isFinite(customLabelPoints.value) ||
      customLabelPoints.value < 1 ||
      customLabelPoints.value > 36)
  )
    return "Enter a label size from 1 to 36 pt.";
  return "";
});
const smallestTextPx = ref<number | null>(null);
const printTextPoints = computed(() =>
  !printError.value &&
  smallestTextPx.value !== null &&
  displayed.value &&
  widthMm.value
    ? Math.max(
        labelMinimum.value ?? 0,
        printedTextPoints(
          smallestTextPx.value,
          displayed.value.width,
          widthMm.value
        )
      )
    : null
);
const printDimensions = computed(() =>
  !printError.value && displayed.value && widthMm.value
    ? figurePrintDimensions(displayed.value.width, displayed.value.height, {
        widthMm: widthMm.value,
      })
    : null
);
const snapshots = computed(() => props.mapManager.figureSnapshots.snapshots);
const snapshotName = ref("");
const showSnapshots = ref(false),
  storing = ref(false),
  comparing = ref(false),
  notice = ref("");
const selectedSnapshot = ref("");
const removedSnapshot = shallowRef<FigureSnapshot | null>(null);
const currentLabel = ref("Current capture");
const layout = ref<FigureComparisonLayout>("horizontal");
const comparisonOutdated = ref(false);
const comparisonLabel = ref("");
const previewUrl = ref("");
const capturing = ref(false),
  progress = ref(0),
  error = ref("");
const saving = ref<"svg" | "png" | "pdf" | null>(null);
const busy = computed(
  () => capturing.value || comparing.value || storing.value || !!saving.value
);
const outdated = ref(false);
let disposed = false,
  generation = 0;
let controller: AbortController | undefined;
let comparisonController: AbortController | undefined;
function releasePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = "";
}
function updatePreview() {
  releasePreview();
  smallestTextPx.value = null;
  if (displayed.value)
    previewUrl.value = URL.createObjectURL(displayed.value.png);
  if (displayed.value) {
    try {
      smallestTextPx.value = smallestFigureTextPx(displayed.value);
    } catch {
      /* Preview/export remain available if text cannot be measured. */
    }
  }
}
function clearComparison() {
  comparisonController?.abort();
  comparison.value = null;
  viewingSnapshot.value = null;
  selectedSnapshot.value = "";
  comparisonOutdated.value = false;
  updatePreview();
}
function viewSnapshot(snapshot: FigureSnapshot) {
  if (busy.value) return;
  clearComparison();
  viewingSnapshot.value = snapshot;
  error.value = "";
  notice.value = "";
  updatePreview();
}
watch([currentLabel, layout], () => {
  if (comparison.value) comparisonOutdated.value = true;
});
async function saveSnapshot() {
  const source = displayed.value,
    current = generation,
    manager = props.mapManager;
  if (
    !source ||
    capturing.value ||
    storing.value ||
    comparing.value ||
    !!saving.value ||
    outdated.value ||
    comparisonOutdated.value
  )
    return;
  storing.value = true;
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
  if (disposed || current !== generation) return;
  error.value = "";
  notice.value = "";
  try {
    const snapshot = await createFigureSnapshot(
      source,
      snapshotName.value || `Snapshot ${snapshots.value.length + 1}`
    );
    if (disposed || current !== generation || manager !== props.mapManager)
      return;
    manager.figureSnapshots.add(snapshot);
    snapshotName.value = "";
    notice.value = `Snapshot “${snapshot.document.name}” added. Save the session to keep it.`;
  } catch (failure) {
    if (!disposed) error.value = extractErrorMessage(failure);
  } finally {
    if (!disposed) storing.value = false;
  }
}
function removeSnapshot(id: string) {
  removedSnapshot.value =
    snapshots.value.find((item) => item.document.id === id) ?? null;
  props.mapManager.figureSnapshots.remove(id);
  if (
    selectedSnapshot.value === id ||
    viewingSnapshot.value?.document.id === id
  )
    clearComparison();
  notice.value = "Snapshot removed. Save the session to keep this change.";
}
function undoRemove() {
  if (!removedSnapshot.value) return;
  try {
    props.mapManager.figureSnapshots.add(removedSnapshot.value);
    removedSnapshot.value = null;
    notice.value = "Snapshot restored. Save the session to keep it.";
  } catch (failure) {
    error.value = extractErrorMessage(failure);
  }
}
async function compareSnapshot(snapshot: FigureSnapshot) {
  const source = figure.value,
    manager = props.mapManager;
  if (
    !source ||
    capturing.value ||
    comparing.value ||
    storing.value ||
    !!saving.value ||
    outdated.value
  )
    return;
  const current = ++generation;
  comparisonController?.abort();
  comparisonController = new AbortController();
  viewingSnapshot.value = null;
  comparing.value = true;
  comparisonOutdated.value = true;
  error.value = "";
  notice.value = "";
  selectedSnapshot.value = snapshot.document.id;
  try {
    const result = await compareCapturedFigures(
      [
        {
          figure: snapshot.figure,
          label: snapshot.document.name,
          snapshotId: snapshot.document.id,
        },
        {
          figure: source,
          label: currentLabel.value.trim() || "Current capture",
        },
      ],
      layout.value,
      comparisonController.signal
    );
    if (disposed || current !== generation || manager !== props.mapManager)
      return;
    comparison.value = result;
    comparisonLabel.value = `${snapshot.document.name} / ${
      currentLabel.value.trim() || "Current capture"
    }`;
    comparisonOutdated.value = false;
    updatePreview();
  } catch (failure) {
    if (!disposed) error.value = extractErrorMessage(failure);
  } finally {
    if (!disposed) comparing.value = false;
  }
}
function updateComparison() {
  const snapshot = snapshots.value.find(
    (item) => item.document.id === selectedSnapshot.value
  );
  if (snapshot) void compareSnapshot(snapshot);
}
watch([scope, crop, rulers, tracks, expandWholeMap, includeSecondary], () => {
  if (figure.value) outdated.value = true;
  clearComparison();
});
watch(
  () => props.mapManager,
  () => {
    controller?.abort();
    comparisonController?.abort();
    comparing.value = false;
    storing.value = false;
    generation++;
    releasePreview();
    figure.value = null;
    comparison.value = null;
    viewingSnapshot.value = null;
    selectedSnapshot.value = "";
    comparisonOutdated.value = false;
    capturing.value = false;
    outdated.value = false;
  }
);
async function capture() {
  if (capturing.value || saving.value || comparing.value || storing.value)
    return;
  clearComparison();
  const current = ++generation,
    manager = props.mapManager;
  controller = new AbortController();
  const signal = controller.signal;
  capturing.value = true;
  progress.value = 0;
  error.value = "";
  try {
    const result = await manager.captureCurrentFigure(
      {
        scope: scope.value,
        cropToMap: crop.value,
        includeRulers: rulers.value,
        includeTracks: tracks.value,
        includeSecondary: includeSecondary.value,
        fitSmallWholeMap: expandWholeMap.value,
        metadata: props.metadata,
        backgroundColor: useStyleStore().mapBackgroundColor.RGBA,
        signal,
      },
      (value) => {
        if (!disposed && current === generation) progress.value = value;
      }
    );
    if (disposed || current !== generation || signal.aborted) return;
    figure.value = result;
    updatePreview();
    outdated.value = false;
  } catch (failure) {
    if (!disposed && current === generation && !signal.aborted)
      error.value = extractErrorMessage(failure);
  } finally {
    if (!disposed && current === generation) capturing.value = false;
  }
}
async function save(format: "svg" | "png" | "pdf") {
  const captured = displayed.value;
  if (
    !captured ||
    capturing.value ||
    comparing.value ||
    storing.value ||
    saving.value ||
    outdated.value ||
    comparisonOutdated.value
  )
    return;
  saving.value = format;
  error.value = "";
  try {
    const result = await props.mapManager.saveCapturedFigure(
      captured,
      format,
      undefined,
      (value) => {
        progress.value = value;
      },
      widthMm.value
        ? { widthMm: widthMm.value, minimumTextPoints: labelMinimum.value }
        : undefined
    );
    notifyFileSave(result, `${format.toUpperCase()} export`);
  } catch (failure) {
    if (!disposed) error.value = extractErrorMessage(failure);
  } finally {
    if (!disposed) saving.value = null;
  }
}
useModalFocus(dialog);
useEscDismissableDialog({
  priority: 1075,
  isOpen: () => true,
  requestClose: () => emit("dismissed"),
});
onMounted(() => {
  void capture();
});
onBeforeUnmount(() => {
  disposed = true;
  generation++;
  controller?.abort();
  comparisonController?.abort();
  releasePreview();
});
</script>

<style scoped>
.snapshot-save-row,
.snapshot-comparison-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.snapshot-save-row label,
.snapshot-comparison-controls label {
  font-size: 0.8rem;
}
.snapshot-library {
  border: 1px solid #cbd2db;
  border-radius: 0.4rem;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
}
.snapshot-list {
  max-height: 11rem;
  overflow: auto;
}
.snapshot-list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}
.snapshot-list li span {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.snapshot-name {
  font-weight: 600;
  text-align: left;
  overflow-wrap: anywhere;
}
.snapshot-list small {
  display: block;
  color: #52606d;
}
@media (max-width: 700px) {
  .snapshot-list li {
    flex-wrap: wrap;
  }
  .snapshot-list li span {
    flex-basis: 100%;
  }
}

.figure-export-backdrop {
  position: fixed;
  inset: 0;
  background: #0007;
  z-index: 1070;
}
.figure-export-dialog {
  position: fixed;
  inset: 4vh 4vw;
  z-index: 1075;
  display: flex;
  flex-direction: column;
  background: #fff;
  color: #172033;
  border: 1px solid #cbd5e1;
  border-radius: 0.6rem;
  box-shadow: 0 12px 40px #0003;
  overflow: hidden;
  font-family: system-ui, sans-serif;
}
header,
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  flex-shrink: 0;
}
header {
  border-bottom: 1px solid #cbd5e1;
}
header h5 {
  margin: 0;
}
footer {
  border-top: 1px solid #cbd5e1;
  flex-wrap: wrap;
}
.figure-export-body {
  padding: 1rem;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}
.figure-export-options,
.figure-export-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.figure-export-options {
  margin-bottom: 0.75rem;
}
.figure-export-preview {
  flex: 1;
  min-height: 160px;
  overflow: auto;
  padding: 1rem;
  background: #e8ecf0;
}
.figure-export-preview img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  margin: auto;
  object-fit: contain;
}
</style>
