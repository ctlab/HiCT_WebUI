<template>
  <Teleport to="body">
    <div class="analysis-backdrop"></div>
    <section
      class="analysis-modal"
      :class="{ 'moddotplot-modal': !alignment }"
      ref="modalFocusElement"
      role="dialog"
      aria-modal="true"
      aria-labelledby="moddotplot-title"
    >
      <form class="modal-content" @submit.prevent="start">
        <header class="modal-header">
          <h5 id="moddotplot-title" class="modal-title">{{ title }}</h5>
          <button
            type="button"
            class="btn-close"
            aria-label="Close"
            @click="emit('dismissed')"
          ></button>
        </header>
        <div class="modal-body">
          <p v-if="error" class="alert alert-danger" role="alert">
            {{ error }}
          </p>
          <div
            v-if="unavailableReason"
            class="alert alert-warning"
            role="status"
          >
            {{ unavailableReason }}
            <button
              v-if="readiness.needsFasta.value"
              type="button"
              class="btn btn-sm btn-primary me-2"
              :disabled="busy"
              @click="emit('linkFasta')"
            >
              Link FASTA…
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary"
              :disabled="readiness.checking.value || busy"
              @click="readiness.refresh"
            >
              Check again
            </button>
          </div>
          <fieldset :disabled="busy">
            <label for="moddotplot-scope" class="form-label"
              >Analysis scope</label
            >
            <select
              id="moddotplot-scope"
              v-model="scope"
              class="form-select mb-3"
            >
              <option value="assembly">Whole active assembly</option>
              <option v-if="selection" value="selection">
                Selected region · {{ regionDimensions(selection) }}
              </option>
              <option value="view" :disabled="!currentView">Current view</option>
            </select>
            <label for="sequence-overlay-detail" class="form-label">Finest detail</label>
            <select
              id="sequence-overlay-detail"
              v-model="detail"
              class="form-select"
              @focus="loadDetailEstimates"
              @pointerdown="loadDetailEstimates"
            >
              <option
                v-for="size in suggested"
                :key="size"
                :value="size"
                :disabled="!!detailEstimate(size)?.limitingLevel"
                :title="detailEstimate(size)?.hardLimitReason"
              >
                {{ detailLabel(size) }}
              </option>
              <option value="custom">Custom sizes…</option>
            </select>
            <div v-if="detail === 'custom'" class="mt-3">
              <label for="sequence-overlay-resolutions" class="form-label">
                Sizes in bp, separated by commas or spaces
              </label>
              <input
                id="sequence-overlay-resolutions"
                v-model="resolutionList"
                type="text"
                class="form-control"
                :class="{ 'is-invalid': resolutionError }"
                :aria-invalid="!!resolutionError"
              />
            </div>
            <p v-if="cost?.overviewLevels.length" class="form-text">
              {{ detail === "custom"
                ? "These sizes are generated. Overview levels reported by the server are added:"
                : "Coarser overview levels are added automatically:" }}
              {{ overviewLabel }}.
            </p>
            <p v-if="resolutionError" class="small text-danger" role="alert">
              {{ resolutionError }}
            </p>
            <label for="dotplot-display" class="form-label"
              >Show result as</label
            >
            <select
              id="dotplot-display"
              v-model="displayMode"
              class="form-select mb-2"
            >
              <option value="overlay">Overlay on the Hi-C map</option>
              <option value="above">Above the diagonal</option>
              <option value="below">Below diagonal</option>
              <option value="none">Don’t link</option>
            </select>
            <SequenceEstimateCallout
              v-if="cost"
              v-model:accept-large-output="acceptLargeOutput"
              :estimate="cost"
              class="mb-3"
            >
              <template #recovery>
                <button type="button" class="btn btn-link analysis-estimate-action" @click="useSizesThatFit">
                  Use sizes that fit
                </button>
              </template>
            </SequenceEstimateCallout>
            <p v-if="costError" class="text-danger small" role="alert">{{ costError }}</p>
            <AdvancedSection
              dialog-id="moddotplot"
              hint="k-mer, window, identity, output"
            >
              <dl v-if="cost" class="small">
                <dt>Requested analysis levels</dt>
                <dd>{{ cost.requestedLevels.join(", ") }} bp</dd>
                <dt>Automatic overview levels</dt>
                <dd>{{ cost.overviewLevels.join(", ") || "None" }}</dd>
              </dl>
              <div v-if="!alignment" class="row g-3">
                <div class="col-sm-6">
                  <label for="moddotplot-identity" class="form-label"
                    >Minimum identity (%)</label
                  ><input
                    id="moddotplot-identity"
                    v-model.number="identity"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    class="form-control"
                    required
                  />
                </div>
              </div>
              <div v-if="!alignment" class="mt-3">
                <SequenceGapSettings
                  :request-manager="
                    props.mapManager.networkManager.requestManager
                  "
                />

                <div class="row g-3 mt-0">
                  <div class="col-sm-6">
                    <label for="moddotplot-threads" class="form-label"
                      >Worker threads</label
                    ><input
                      id="moddotplot-threads"
                      v-model.number="threads"
                      type="number"
                      min="-1"
                      max="256"
                      step="1"
                      class="form-control"
                      required
                    /><small class="form-text"
                      >-1 uses all allocated logical CPUs; 0 chooses
                      automatically; 1 is single-threaded.</small
                    >
                  </div>
                  <div class="col-sm-6">
                    <label for="moddotplot-k" class="form-label"
                      >k-mer length</label
                    ><input
                      id="moddotplot-k"
                      v-model.number="k"
                      type="number"
                      min="1"
                      max="65535"
                      step="1"
                      class="form-control"
                      required
                    />
                  </div>
                  <div class="col-sm-6">
                    <label for="moddotplot-sketch" class="form-label"
                      >Target sketch size</label
                    ><input
                      id="moddotplot-sketch"
                      v-model.number="sketchSize"
                      type="number"
                      min="1"
                      max="1000000"
                      step="1"
                      class="form-control"
                      required
                    />
                  </div>
                  <div class="col-sm-6">
                    <label for="moddotplot-delta" class="form-label"
                      >Neighbor expansion (fraction of window)</label
                    ><input
                      id="moddotplot-delta"
                      v-model.number="delta"
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      class="form-control"
                      required
                    />
                  </div>
                </div>
              </div>
              <div v-if="alignment" class="row g-3">
                <div
                  class="col-sm-6"
                  v-for="option in primaryAlignmentOptions"
                  :key="option.key"
                >
                  <label :for="'dotplot-' + option.key" class="form-label">{{
                    option.label
                  }}</label
                  ><input
                    :id="'dotplot-' + option.key"
                    v-model.number="alignmentSettings[option.key]"
                    type="number"
                    :min="option.min ?? 1"
                    :max="option.max"
                    step="1"
                    class="form-control"
                    required
                  /><small v-if="option.key === 'threads'" class="form-text"
                    >-1 uses all allocated CPUs; 0 chooses automatically.</small
                  >
                </div>
              </div>
              <div v-if="alignment" class="mt-3">
                <SequenceGapSettings
                  :request-manager="
                    props.mapManager.networkManager.requestManager
                  "
                />

                <div class="row g-3 mt-0">
                  <div
                    class="col-sm-6"
                    v-for="option in advancedAlignmentOptions"
                    :key="option.key"
                  >
                    <label :for="'dotplot-' + option.key" class="form-label">{{
                      option.label
                    }}</label
                    ><input
                      :id="'dotplot-' + option.key"
                      v-model.number="alignmentSettings[option.key]"
                      type="number"
                      :min="option.min ?? 1"
                      :max="option.max"
                      step="1"
                      class="form-control"
                      required
                    /><small v-if="option.key === 'threads'" class="form-text"
                      >-1 uses all allocated CPUs; 0 chooses
                      automatically.</small
                    >
                  </div>
                </div>
              </div>
              <div class="form-check mt-3">
                <input
                  id="analysis-save-data"
                  v-model="saveReusable"
                  type="checkbox"
                  class="form-check-input"
                />
                <label for="analysis-save-data" class="form-check-label"
                  >Save a reusable copy in the data folder</label
                >
              </div>
              <div v-if="saveReusable" class="row g-3 mt-0">
                <div class="col-sm-9">
                  <label for="analysis-output" class="form-label"
                    >Output path</label
                  ><input
                    id="analysis-output"
                    v-model.trim="outputFilename"
                    class="form-control"
                    required
                    :placeholder="defaultOutputFilename"
                  /><small class="form-text"
                    >Relative to DATA_DIR; parent folders are created.</small
                  >
                </div>
                <div class="col-sm-3 form-check align-self-end pb-2">
                  <input
                    id="analysis-overwrite"
                    v-model="overwrite"
                    type="checkbox"
                    class="form-check-input"
                  /><label for="analysis-overwrite" class="form-check-label"
                    >Overwrite</label
                  >
                </div>
              </div>
              <label class="form-check mt-3"
                ><input
                  v-model="mergeCompatible"
                  type="checkbox"
                  class="form-check-input"
                />Accumulate compatible regions; replace scores within this
                rectangle</label
              >
              <p class="small">
                Different settings create a separate overlay. After a successful
                update, the superseded matrix is removed once detached. Logs and
                provenance are retained. Cancellation or failure retains the
                previous matrix.
              </p>
              <details class="small mb-3">
                <summary>How the scores are calculated</summary>
                <p>
                  {{
                    alignment
                      ? "Align sequence from the linked FASTA"
                      : "Estimate sequence identity from the linked FASTA"
                  }}
                  in the current assembly order, preserving AGP gaps and adding
                  the configured separator between scaffolds. Debris and
                  excluded sequence are omitted.
                </p>
                <p class="small">
                  Scores are anchored to contact bins and follow assembly edits.
                  They describe the captured sequence: new joins need
                  recomputation. Each selected resolution is computed
                  independently.
                </p>
              </details>
              <details class="small">
                <summary>How this works</summary>
                <p class="small">
                  Attaching replaces the current secondary source. To keep the
                  current secondary map, choose “Don’t link” and attach the
                  saved result later.
                </p>
                <p v-if="!alignment" class="small">
                  Uses Observed display. The ModDotPlot identity colormap runs
                  from blue through yellow to red at 100%; zero/uncomputed cells
                  are transparent. Coverage and provenance are saved in the
                  sidecar.
                </p>
                <p v-if="alignment" class="small">
                  Uses Observed display with sampled alignment counts. Counts
                  are not identity percentages. The active minimap2/mm2-plus
                  aligner is used; zeros are transparent.
                </p>
              </details>
            </AdvancedSection>
          </fieldset>
          <div
            v-if="job?.status === 'finished' && job.outputFile"
            class="alert alert-success mt-3"
            role="status"
          >
            Generation completed. Saved overlay:
            <code class="text-break">{{ job.outputFile }}</code>
            <p class="mb-0">
              You can display this result without generating it again. A dotplot
              is a secondary matrix layer; sequence-search and annotation tracks
              are separate 1D layers.
            </p>
          </div>
          <div
            v-if="pendingCompatibility"
            class="alert alert-warning"
            role="alert"
          >
            <strong>Review overlay compatibility</strong>
            <ul>
              <li
                v-for="warning in pendingCompatibility.warnings"
                :key="warning"
              >
                {{ warning }}
              </li>
            </ul>
            <p>
              The current secondary layer is retained until you confirm. Missing
              areas may show only the background.
            </p>
            <button
              type="button"
              class="btn btn-outline-warning"
              :disabled="busy"
              @click="displaySavedResult(true)"
            >
              Attach despite differences
            </button>
          </div>
          <div v-if="job" class="mt-3" role="status" aria-live="polite">
            <span
              v-if="busy"
              class="spinner-border spinner-border-sm me-2"
            ></span
            >{{ job.status
            }}<span v-if="job.effectiveThreads">
              · {{ job.effectiveThreads }} worker{{
                job.effectiveThreads === 1 ? "" : "s"
              }}</span
            >
          </div>
          <details v-if="job?.logs.length" class="analysis-log-details">
            <summary>Show log</summary>
            <pre class="analysis-logs" aria-label="ModDotPlot log">{{
              job.logs.slice(-40).join("\n")
            }}</pre>
          </details>
        </div>
        <footer class="modal-footer">
          <button
            v-if="busy && job && !displaying"
            type="button"
            class="btn btn-outline-danger"
            @click="cancel"
          >
            Cancel generation
          </button>
          <button
            type="button"
            class="btn btn-outline-secondary"
            @click="emit('dismissed')"
          >
            Close
          </button>
          <button
            v-if="
              job?.status === 'finished' &&
              job.outputFile &&
              !pendingCompatibility
            "
            type="button"
            class="btn btn-outline-primary"
            :disabled="busy"
            @click="displaySavedResult()"
          >
            {{
              displayMode === "none"
                ? "Keep saved result"
                : "Display saved result"
            }}
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="!!generateDisabledReason"
            :title="generateDisabledReason || undefined"
          >
            Generate
          </button>
        </footer>
      </form>
    </section>
  </Teleport>
</template>
<script setup lang="ts">
import SequenceEstimateCallout from "./SequenceEstimateCallout.vue";
import AdvancedSection from "@/app/ui/components/common/AdvancedSection.vue";
import { useModalFocus } from "@/app/ui/modalFocus";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";
import { showFailure } from "@/app/ui/reportFailure";
import { watch, ref, computed, onBeforeUnmount } from "vue";
import { useSequenceReadiness } from "./useSequenceReadiness";
import SequenceGapSettings from "./SequenceGapSettings.vue";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import {
  SequenceAnalysisRequest,
  type SequenceAnalysisJob,
  type SequenceAnalysisEstimate,
} from "@/app/core/net/api/SequenceAnalysisRequest";
import type { SecondarySourceStatusResponse } from "@/app/core/net/api/RequestManager";
import { SequenceOverlayRequest, type SequenceOverlayOptions } from "@/app/core/net/api/request";
import { formatEstimateBytes } from "@/app/core/sequence/formatEstimateBytes";
import { dotplotResolutionLevels } from "@/app/core/sequence/generationDefaults";
import { displaySequenceOverlay } from "@/app/core/sequence/displaySequenceOverlay";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
import { useNotificationCenterStore } from "@/app/stores/notificationCenterStore";
import { formatLength } from "@/app/core/format/formatSignal";
const props = defineProps<{
  mapManager: ContactMapManager;
  kind?: "moddotplot" | "dotplot";
}>();
const alignment = props.kind === "dotplot";
const kind = alignment ? "dotplot" : "moddotplot";
const title = alignment ? "Dotplot from current assembly" : "ModDotPlot";
const alignmentSettings = ref({
  k: 15,
  window: 10,
  chainScore: 40,
  sampleBp: 100,
  minAlignmentLength: 100,
  threads: -1,
});
const alignmentOptions: {
  key: keyof typeof alignmentSettings.value;
  label: string;
  min?: number;
  max: number;
}[] = [
  { key: "k", label: "Minimizer k", max: 28 },
  { key: "window", label: "Minimizer window", max: 255 },
  { key: "chainScore", label: "Minimum chain score", max: 1000000 },
  { key: "sampleBp", label: "Sample every (bp)", max: 1000000 },
  {
    key: "minAlignmentLength",
    label: "Minimum alignment length (bp)",
    max: 100000000,
  },
  { key: "threads", label: "Alignment threads", min: -1, max: 256 },
];
const advancedAlignmentKeys: string[] = ["sampleBp", "threads"];
const primaryAlignmentOptions = alignmentOptions.filter(
  (option) => !advancedAlignmentKeys.includes(option.key)
);
const advancedAlignmentOptions = alignmentOptions.filter((option) =>
  advancedAlignmentKeys.includes(option.key)
);
const emit = defineEmits<{ (e: "dismissed"): void; (e: "linkFasta"): void }>();
// The dialog is mounted per use (v-if) and bound to one map, so these reads never go stale.
// eslint-disable-next-line vue/no-setup-props-destructure
const api = props.mapManager.networkManager.requestManager,
  notifications = useNotificationCenterStore();
const readiness = useSequenceReadiness(api);
const unavailableReason = computed(() =>
  readiness.reason(alignment ? "dotplot" : "hict-moddotplot")
);
// eslint-disable-next-line vue/no-setup-props-destructure
const view = props.mapManager.viewAndLayersManager;
const entityRange = view.getSelectedEntityRange();
const selection = view.getRegionBounds() ?? (entityRange ? {
  rowStart: entityRange.startBP,
  rowEnd: entityRange.endBP,
  columnStart: entityRange.startBP,
  columnEnd: entityRange.endBP,
} : null);
const currentView = view.regionFromExtent(
  props.mapManager.getView().calculateExtent(props.mapManager.getMap().getSize())
);
function regionDimensions(region: NonNullable<typeof selection>): string {
  return `${formatLength(region.rowEnd - region.rowStart)} × ${formatLength(region.columnEnd - region.columnStart)}`;
}
const k = ref(21);
const suggested = computed(() =>
  dotplotResolutionLevels(
    view.resolutions,
    alignment ? alignmentSettings.value.k : k.value,
    alignment ? 1 : k.value
  )
);
const initialResolution = view.currentViewState.resolutionDesciptor.bpResolution;
function closestDetail(levels: number[]): number {
  return levels.reduce((best, next) =>
    Math.abs(next - initialResolution) < Math.abs(best - initialResolution) ? next : best,
    levels[0] ?? 1000
  );
}
const detail = ref<number | "custom">(closestDetail(suggested.value));
const resolutionList = ref(String(detail.value));
watch(suggested, (levels) => {
  if (detail.value !== "custom" && !levels.includes(detail.value))
    detail.value = closestDetail(levels);
});
watch(detail, (size) => {
  if (size !== "custom") resolutionList.value = String(size);
});
const resolutionTokens = computed(() => resolutionList.value.split(/[,\s]+/).filter(Boolean));
function asResolution(token: string): number {
  const value = Number(token);
  return /^\d+$/.test(token) && Number.isSafeInteger(value) && value > 0 ? value : NaN;
}
const resolutions = computed(() => {
  if (detail.value !== "custom") return [detail.value];
  return [...new Set(resolutionTokens.value.map(asResolution).filter(Number.isFinite))].sort((a, b) => a - b);
});
const scope = ref<"assembly" | "selection" | "view">(selection ? "selection" : "assembly");
const identity = ref(80),
  sketchSize = ref(1000),
  delta = ref(0.5);
const resolutionError = computed(() => {
  if (
    resolutionTokens.value.some(
      (token) => !Number.isFinite(asResolution(token))
    )
  )
    return "Use positive whole numbers in base pairs.";
  if (!alignment && resolutions.value.some((value) => value < k.value))
    return "Each ModDotPlot window must be at least as long as its k-mer size.";
  return "";
});
const uiSettings = useUiSettingsStore();
const threads = ref(uiSettings.modDotPlotThreads);
const saveReusable = ref(false),
  overwrite = ref(false),
  outputFilename = ref("");
const defaultOutputFilename = `sequence-analysis/${kind}.hict.hdf5`;
const mergeCompatible = ref(true),
  displayMode = ref<"overlay" | "below" | "above" | "none">(
    scope.value === "assembly" ? "below" : "overlay"
  ),
  submitting = ref(false),
  error = ref("");
const jobOptions = computed<SequenceOverlayOptions>(() => ({
  gapLengthBp: uiSettings.sequenceGapLengthBp,
  scope: scope.value === "assembly" ? "assembly" : "selection",
  displayMode: displayMode.value,
  region: (scope.value === "view" ? currentView : scope.value === "selection" ? selection : null) ?? undefined,
  resolutions: resolutions.value,
  mergeCompatible: mergeCompatible.value,
  ...(alignment
    ? alignmentSettings.value
    : {
        identity: identity.value,
        k: k.value,
        sketchSize: sketchSize.value,
        delta: delta.value,
        threads: threads.value,
      }),
  ...(saveReusable.value
    ? {
        outputFilename: outputFilename.value || defaultOutputFilename,
        overwrite: overwrite.value,
      }
    : {}),
}));
const cost = ref<SequenceAnalysisEstimate | null>(null);
const costError = ref("");
const acceptLargeOutput = ref(false);
const findingFittingSizes = ref(false);
const estimates = ref(new Map<string, SequenceAnalysisEstimate>());
const pendingEstimates = new Map<string, Promise<SequenceAnalysisEstimate>>();
const estimateContext = computed(() => JSON.stringify([
  scope.value, jobOptions.value.region, uiSettings.sequenceGapLengthBp,
  alignmentSettings.value, k.value, identity.value, sketchSize.value, delta.value,
]));
function estimateKey(context: string, sizes: number[]): string {
  return `${context}:${sizes.join(",")}`;
}
function detailEstimate(size: number): SequenceAnalysisEstimate | undefined {
  return estimates.value.get(estimateKey(estimateContext.value, [size]));
}
function detailLabel(size: number): string {
  const estimate = detailEstimate(size);
  return `${size.toLocaleString()} bp${estimate
    ? ` · ≈ ${formatEstimateBytes(estimate.expectedBytes)}${estimate.warningLevel ? " ⚠" : ""}`
    : ""}`;
}
const overviewLabel = computed(() => {
  const levels = cost.value?.overviewLevels ?? [];
  return levels.length <= 3
    ? levels.map(formatLength).join(", ")
    : `${formatLength(levels[0])} … ${formatLength(levels[levels.length - 1])}`;
});
function estimateCost(
  context: string,
  options: SequenceOverlayOptions
): Promise<SequenceAnalysisEstimate> {
  const key = estimateKey(context, options.resolutions);
  const cached = estimates.value.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = pendingEstimates.get(key);
  if (pending) return pending;
  const requested = api.estimateSequenceOverlay(kind, options).then((estimate) => {
    estimates.value.set(key, estimate);
    return estimate;
  }).finally(() => pendingEstimates.delete(key));
  pendingEstimates.set(key, requested);
  return requested;
}
let loadingContext = "";
async function loadDetailEstimates(): Promise<void> {
  const context = estimateContext.value;
  if (loadingContext === context || unavailableReason.value) return;
  loadingContext = context;
  const options = jobOptions.value;
  try {
    for (const size of suggested.value) {
      if (disposed || estimateContext.value !== context) return;
      await estimateCost(context, { ...options, resolutions: [size] }).catch(() => undefined);
    }
  } finally {
    if (loadingContext === context) loadingContext = "";
  }
}
async function useSizesThatFit(): Promise<void> {
  const context = estimateContext.value;
  const options = jobOptions.value;
  findingFittingSizes.value = true;
  costError.value = "";
  try {
    const minSize = options.resolutions[0];
    const candidates = [...new Set([...options.resolutions, ...suggested.value])]
      .sort((a, b) => a - b)
      .filter((size) => size > minSize);
    for (const size of candidates) {
      const estimate = await estimateCost(context, { ...options, resolutions: [size] });
      if (disposed || estimateContext.value !== context) return;
      if (estimate.limitingLevel || estimate.warningLevel) continue;
      if (suggested.value.includes(size)) detail.value = size;
      else {
        detail.value = "custom";
        resolutionList.value = String(size);
      }
      return;
    }
    costError.value = "Select a smaller region or choose a coarser resolution.";
  } catch (failure) {
    if (!disposed && estimateContext.value === context) costError.value = extractErrorMessage(failure);
  } finally {
    findingFittingSizes.value = false;
  }
}
watch(
  [estimateContext, resolutions, resolutionError, unavailableReason],
  ([context, sizes, invalid, unavailable], _, cleanup) => {
    cost.value = null;
    costError.value = "";
    acceptLargeOutput.value = false;
    if (invalid || unavailable || !sizes.length) return;
    const options = jobOptions.value;
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const estimate = await estimateCost(context, options);
        if (active) cost.value = estimate;
      } catch (failure) {
        if (active) costError.value = extractErrorMessage(failure);
      }
    }, 200);
    cleanup(() => {
      active = false;
      window.clearTimeout(timer);
    });
  },
  { immediate: true, flush: "sync" }
);
watch(scope, (value) => {
  displayMode.value = value === "assembly" ? "below" : "overlay";
});
const job = ref<SequenceAnalysisJob | null>(null);
let delivered = false;
function deferResult(): void {
  if (!job.value || delivered || displayMode.value === "none") return;
  const id = job.value.jobId;
  api.backgroundResultDelivery.defer(
    "sequence/" + id,
    () => !props.mapManager.isDisposed && !delivered,
    async () => {
      const jobs: SequenceAnalysisJob[] = (
        await api.sendRequest(
          new SequenceAnalysisRequest("/sequence/jobs/list")
        )
      ).data;
      const current = jobs.find((item) => item.jobId === id);
      if (!current) return;
      job.value = current;
      session = api.history.applied?.session;
      await displaySavedResult();
    }
  );
}
const displaying = ref(false);
const pendingCompatibility = ref<SecondarySourceStatusResponse | null>(null);
const busy = computed(
  () =>
    findingFittingSizes.value ||
    submitting.value ||
    displaying.value ||
    (!!job.value &&
      ["submitted", "preparing", "running"].includes(job.value.status))
);
const generateDisabledReason = computed(() => {
  if (busy.value) return "Analysis is in progress.";
  if (unavailableReason.value) return unavailableReason.value;
  if (resolutionError.value) return resolutionError.value;
  if (!resolutions.value.length) return "Choose at least one resolution.";
  if (costError.value) return costError.value;
  if (!cost.value) return "Estimating analysis size…";
  if (cost.value.limitingLevel) return cost.value.hardLimitReason ?? "This size cannot run here.";
  if (cost.value.warningLevel && !acceptLargeOutput.value)
    return "Tick Generate anyway to accept the large worst case";
  return "";
});
let disposed = false,
  openingResult = false,
  timer: number | undefined,
  session: string | undefined;
useEscDismissableDialog({
  priority: 1070,
  isOpen: () => true,
  requestClose: () => emit("dismissed"),
});
onBeforeUnmount(() => {
  disposed = true;
  window.clearTimeout(timer);
  deferResult();
});
async function start() {
  if (generateDisabledReason.value) return;
  submitting.value = true;
  error.value = "";
  pendingCompatibility.value = null;
  openingResult = false;
  delivered = false;
  session = api.history.applied?.session;
  try {
    job.value = (
      await api.sendRequest(
        new SequenceOverlayRequest(kind, "jobs", {
          ...jobOptions.value,
          ...(acceptLargeOutput.value ? { acceptLargeOutput: true } : {}),
        })
      )
    ).data;
    if (disposed) deferResult();
    if (!alignment) uiSettings.modDotPlotThreads = threads.value;
    notifications.add(
      "info",
      `${title} submitted. The captured assembly is used throughout the calculation.`
    );
    timer = window.setTimeout(poll, 300);
  } catch (failure) {
    error.value = extractErrorMessage(failure);
    if (disposed) notifications.add("error", error.value);
  } finally {
    submitting.value = false;
  }
}
async function poll() {
  if (disposed || !job.value) return;
  try {
    const jobs: SequenceAnalysisJob[] = (
      await api.sendRequest(new SequenceAnalysisRequest("/sequence/jobs/list"))
    ).data;
    const current = jobs.find((item) => item.jobId === job.value?.jobId);
    if (!current) {
      error.value =
        "The server no longer has this job; its saved files remain under processed/sequence-analysis.";
      job.value = null;
      return;
    }
    job.value = current;
    if (current.status === "finished" && !openingResult) {
      openingResult = true;
      if (!current.outputFile) {
        error.value = "The completed job has no output file.";
        return;
      }
      await displaySavedResult();
      return;
    }
    if (current.status === "failed") {
      const title = alignment
        ? "The dotplot could not finish."
        : "ModDotPlot could not finish.";
      const stopped = current.error?.startsWith("Stopped:") ? current.error : undefined;
      const description = stopped ?? "The bundled tool reported an error.";
      error.value = stopped ?? `${title} ${description}`;
      showFailure(title, description, current.logs.slice(-40).join("\n"));
      return;
    }
    if (current.status === "cancelled") {
      notifications.add(
        "info",
        `${title} cancelled; previous overlay retained.`
      );
      return;
    }
  } catch (failure) {
    error.value = `Progress refresh failed: ${extractErrorMessage(
      failure
    )}. Retrying…`;
  }
  if (!disposed) timer = window.setTimeout(poll, 1000);
}
async function displaySavedResult(allowMismatch = false) {
  const current = job.value;
  if (displaying.value || !current?.outputFile || current.status !== "finished")
    return;
  displaying.value = true;
  error.value = "";
  try {
    if (displayMode.value !== "none") {
      if (session !== api.history.applied?.session) {
        throw new Error(
          "The active map session changed. Open the original map before attaching this saved overlay."
        );
      }
      const response = await api.openSecondarySource(
        current.outputFile,
        allowMismatch
      );
      if (response.requiresConfirmation) {
        pendingCompatibility.value = response;
        if (disposed)
          notifications.add(
            "warning",
            "The overlay is saved but needs compatibility review. Open its result from Jobs on the original map."
          );
        return;
      }
      pendingCompatibility.value = null;
      // Attachment starts a new history session. A later display retry must use it.
      session = api.history.applied?.session;
      await displaySequenceOverlay(
        props.mapManager,
        displayMode.value,
        kind,
        response,
        identity.value
      );
    }
    try {
      await api.sendRequest(new SequenceAnalysisRequest("/sequence/cleanup"));
    } catch (failure) {
      notifications.add(
        "warning",
        `Overlay saved, but superseded-file cleanup needs retry: ${extractErrorMessage(
          failure
        )}`
      );
    }
    delivered = true;
    notifications.add("success", `${title} completed: ${current.outputFile}.`);
    emit("dismissed");
  } catch (failure) {
    error.value = `The overlay was saved, but could not be displayed: ${extractErrorMessage(
      failure
    )}`;
    notifications.add("warning", error.value);
  } finally {
    displaying.value = false;
  }
}
async function cancel() {
  if (!job.value) return;
  try {
    await api.sendRequest(
      new SequenceAnalysisRequest(`/sequence/jobs/${job.value.jobId}/stop`)
    );
  } catch (failure) {
    error.value = extractErrorMessage(failure);
  }
}

const modalFocusElement = ref<HTMLElement | null>(null);
useModalFocus(modalFocusElement);
</script>
<style scoped>
.analysis-backdrop {
  position: fixed;
  inset: 0;
  background: #0007;
  z-index: 1065;
}
.analysis-modal {
  position: fixed;
  inset: 3vh auto auto 50%;
  transform: translateX(-50%);
  width: min(850px, 96vw);
  z-index: 1070;
}
.moddotplot-modal {
  width: min(760px, 96vw);
}
.analysis-modal .modal-body {
  max-height: 77vh;
  overflow-y: auto;
}
.analysis-estimate-action {
  padding: 0;
  margin-inline-start: 6px;
  font-size: inherit;
  font-weight: 600;
}
.analysis-logs {
  margin-top: 0.8rem;
  max-height: 12rem;
  overflow: auto;
  padding: 0.8rem;
  background: #eef2f7;
  color: #172b42;
  white-space: pre-wrap;
}

.analysis-modal {
  font-family: system-ui, sans-serif;
  color: var(--hict-surface-fg, #172033);
}
.analysis-modal .modal-content {
  border: 1px solid #cbd5e1;
  border-radius: 0.6rem;
  box-shadow: 0 12px 40px #0003;
  background: var(--hict-surface-bg, #fff);
  overflow: hidden;
}
.analysis-modal .modal-header,
.analysis-modal .modal-footer {
  padding: 1rem 1.4rem;
  display: flex;
  align-items: center;
  gap: 0.8rem;
}
.analysis-modal .modal-header {
  justify-content: space-between;
  border-bottom: 1px solid #cbd5e1;
}
.analysis-modal .modal-footer {
  justify-content: flex-end;
  border-top: 1px solid #cbd5e1;
}
.analysis-modal .modal-body {
  padding: 1.2rem 1.4rem;
}
.analysis-modal .form-check {
  padding-left: 1.7rem;
}
</style>
