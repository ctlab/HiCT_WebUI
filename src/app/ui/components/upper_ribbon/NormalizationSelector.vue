<!--
 Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis, Zakhar Lobanov, Nikita Zheleznov and Computer Technologies Laboratory ITMO University team.

 Permission is hereby granted, free of charge, to any person obtaining a copy of
 this software and associated documentation files (the "Software"), to deal in
 the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 -->

<template>
  <section
    id="normalization-settings-dropdown"
    class="signal-processing"
    aria-label="Signal processing"
  >
    <p
      v-if="!signalEditable"
      id="custom-signal-graph"
      class="small text-muted mb-2"
      role="status"
    >
      This layer uses a custom processing graph. Edit it in Rendering pipeline.
    </p>
    <p
      v-if="contactUnavailable"
      id="contact-normalization-unavailable"
      class="small text-muted"
    >
      {{ capabilities?.contactNormalization.reason }}
    </p>
    <p
      v-if="weightsUnavailable && !contactUnavailable"
      id="imported-weights-unavailable"
      class="small text-muted"
    >
      {{ weightsAvailability?.reason }}
    </p>

    <div class="signal-row">
      <span id="signal-transform-label" class="signal-label">
        Signal transform
      </span>
      <div
        class="scale-choice"
        role="group"
        aria-labelledby="signal-transform-label"
        title="Changes the displayed matrix values: log(1 + x) / log(base)"
      >
        <button
          id="signal-transform-linear"
          type="button"
          :aria-pressed="!logEnabled"
          :disabled="!signalEditable"
          @click="setTransform(false)"
        >
          Linear
        </button>
        <button
          id="signal-transform-log"
          type="button"
          :aria-pressed="logEnabled"
          :disabled="!signalEditable"
          @click="setTransform(true)"
        >
          {{ logButtonLabel }}
        </button>
      </div>
    </div>

    <div class="signal-row">
      <label
        id="normalization-mode-label"
        for="normalization-mode"
        class="signal-label"
      >
        Normalization
      </label>
      <select
        id="normalization-mode"
        class="form-select form-select-sm normalization-select"
        :value="choice"
        :disabled="preparing || contactUnavailable || !signalEditable"
        :aria-describedby="normalizationHelpId"
        @change="onChoose(($event.target as HTMLSelectElement).value)"
      >
        <option value="none">None</option>
        <option value="sqrt">Square-root coverage</option>
        <option value="file" :disabled="weightsUnavailable">
          Weights from file
        </option>
      </select>
    </div>
    <p
      v-if="choice === 'sqrt' && !preparing"
      id="normalization-help"
      class="small text-muted mb-0"
    >
      Total contacts means the sum of a bin’s row (or column) over the whole
      map, counting its diagonal entry once. Use this normalization to reduce
      uneven contact coverage.
    </p>
    <details
      v-if="choice === 'sqrt' && !preparing"
      class="coverage-explanation small"
    >
      <summary>How coverage is calculated</summary>
      <p class="mb-1 mt-2">
        For raw contact M between bins i and j, with row sums r:
        <span class="coverage-formula">M / √(rᵢ × rⱼ) × C</span>. C is one scale
        factor per source and resolution that preserves the whole-map contact
        total. That total counts off-diagonal entries in both symmetric halves
        of the matrix.
      </p>
      <p class="mb-0">
        Coverage includes contacts between contigs and stays fixed as you pan.
        Bins without contacts have no coverage weight. Selected signal
        transforms also contribute to the displayed values.
      </p>
    </details>
    <div
      v-if="preparing"
      id="normalization-progress"
      class="normalization-progress"
      role="status"
      aria-live="polite"
    >
      <progress
        :value="prepareProgress"
        max="1"
        aria-labelledby="normalization-mode-label"
      ></progress>
      <span class="small"
        >{{ prepareMessage }} {{ Math.round(prepareProgress * 100) }}%</span
      >
      <button
        id="normalization-cancel"
        type="button"
        class="btn btn-sm btn-outline-secondary"
        @click="cancelPreparation"
      >
        Cancel
      </button>
    </div>
    <p
      v-if="prepareError"
      id="normalization-error"
      class="small text-danger mb-0"
      role="alert"
    >
      {{ prepareError }}
    </p>
    <p
      v-if="choice === 'sqrt' && status && !status.consistent"
      id="normalization-inconsistent"
      class="small text-warning-emphasis mb-0"
      role="status"
    >
      A source was attached after this was chosen and still uses file weights.
      <button type="button" class="link-button" @click="reapplyCoverage">
        Apply to both sources
      </button>
    </p>

    <p
      v-if="signalEditable && (legacyPreLog || autoThresholdEnabled)"
      id="legacy-signal-summary"
      class="small text-muted legacy-summary"
      role="status"
    >
      <template v-if="legacyPreLog">
        This preset applies a log (base {{ preLogBase }}) before scaling.
        <button type="button" class="link-button" @click="removePreLog">
          Remove it
        </button>
      </template>
      <template v-if="autoThresholdEnabled">
        The upper threshold follows the viewport.
        <button type="button" class="link-button" @click="stopAutoThreshold">
          Keep it fixed
        </button>
      </template>
    </p>

    <details class="signal-advanced" id="signal-advanced">
      <summary>Advanced</summary>
      <div class="signal-advanced-body">
        <div class="base-row">
          <label for="normalization-post-log-base">Log base</label>
          <input
            id="normalization-post-log-base"
            v-model="baseDraft"
            class="form-control form-control-sm number-input"
            type="text"
            inputmode="decimal"
            :disabled="!logEnabled || !signalEditable"
            :aria-invalid="baseError ? 'true' : undefined"
            :aria-describedby="baseError ? 'log-base-error' : undefined"
            @change="commitBase"
            @keydown.enter="commitBase"
          />
        </div>
        <p
          v-if="baseError"
          id="log-base-error"
          class="small text-danger mb-0"
          role="alert"
        >
          {{ baseError }}
        </p>

        <div class="base-row">
          <label for="scaling-across-zoom">Scaling across zoom</label>
          <select
            id="scaling-across-zoom"
            v-model="scalingMode"
            class="form-select form-select-sm scaling-select"
            :disabled="contactUnavailable || !signalEditable"
            :aria-describedby="
              contactUnavailable
                ? 'contact-normalization-unavailable'
                : 'scaling-help'
            "
          >
            <option value="none">None</option>
            <option value="linear">Linear scaling</option>
            <option value="quadratic">Quadratic scaling</option>
            <option v-if="scalingMode === 'both'" value="both" disabled>
              Linear and quadratic (legacy)
            </option>
          </select>
        </div>
        <p id="scaling-help" class="small text-muted mb-0">
          Compensates for bin size when the zoom level changes: linear divides
          by the resolution ratio, quadratic by its square.
        </p>

        <slot name="excluded-bins" />
        <div class="d-flex gap-2 mt-1">
          <button
            type="button"
            class="btn btn-sm btn-outline-primary flex-grow-1"
            @click="openRenderingPipeline"
          >
            Rendering pipeline...
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary"
            title="Log2, no scaling, no weights. Colors and thresholds are kept."
            @click="resetAttributes"
          >
            Reset
          </button>
        </div>
      </div>
    </details>
  </section>
  <RenderingPipelineModal
    v-if="pipelineModalOpen"
    :map-manager="props.mapManager"
    @dismissed="pipelineModalOpen = false"
  />
</template>

<script setup lang="ts">
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { toast } from "vue-sonner";
import type { CoolerWeightsNaNPolicy } from "@/app/core/visualization/VisualizationOptions";
import { prepareCoverage } from "@/app/core/visualization/coverageNormalization";
import type { CoverageNormalizationStatus } from "@/app/core/net/api/RequestManager";
import { useMatrixViewStore } from "@/app/stores/matrixViewStore";
import { importedWeightsAvailability } from "@/app/core/net/SourceCapabilities";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import { isValidLogBase } from "@/app/core/visualization/signalProfile";
import { storeToRefs } from "pinia";
const RenderingPipelineModal = defineAsyncComponent(
  () => import("./RenderingPipelineModal.vue")
);
const visualizationOptionsStore = useVisualizationOptionsStore();
const {
  preLogBase,
  applyCoolerWeights,
  resolutionScaling,
  resolutionLinearScaling,
  postLogBase,
  autoThresholdEnabled,
  autoThresholdQuantile,
  signalEditable,
  coolerWeightsNaNPolicy,
} = storeToRefs(visualizationOptionsStore);

const props = defineProps<{
  mapManager?: ContactMapManager;
}>();

const matrixViewStore = useMatrixViewStore();
const capabilities = computed(
  () =>
    props.mapManager?.networkManager.requestManager.sourceCapabilities[
      matrixViewStore.activeVisualizationSource
    ]
);
const contactUnavailable = computed(
  () => capabilities.value?.contactNormalization.state === "UNAVAILABLE"
);
const weightsAvailability = computed(() =>
  importedWeightsAvailability(
    capabilities.value,
    capabilities.value
      ? props.mapManager?.viewAndLayersManager.getNativeResolutionDescriptor(
          matrixViewStore.activeVisualizationSource
        ).bpResolution
      : undefined
  )
);
const weightsUnavailable = computed(
  () => weightsAvailability.value?.state === "UNAVAILABLE"
);

const emit = defineEmits<{ (e: "apply"): void }>();

const DEFAULT_BASE = 2;
const MAX_BASE = 1000;
const pipelineModalOpen = ref(false);

/** A positive, valid base means the transform is on. The sign of the stored value is only the on/off marker. */
const logEnabled = computed(
  () => postLogBase.value > 0 && isValidLogBase(postLogBase.value)
);
// The base to come back to when the transform is switched on again. Never 1 or invalid.
const rememberedBase = ref(
  isValidLogBase(postLogBase.value) ? postLogBase.value : DEFAULT_BASE
);
watch(
  () => postLogBase.value,
  (value) => {
    if (isValidLogBase(value) && value > 0) rememberedBase.value = value;
  }
);
const logButtonLabel = computed(() =>
  logEnabled.value && Math.abs(rememberedBase.value - DEFAULT_BASE) >= 1e-9
    ? "Log"
    : "Log2"
);
function formatBase(base: number): string {
  return String(Number(base.toPrecision(10)));
}
const baseDraft = ref(formatBase(rememberedBase.value));
const baseError = ref("");
watch(rememberedBase, (base) => {
  baseDraft.value = formatBase(base);
  baseError.value = "";
});

function setTransform(on: boolean): void {
  if (!signalEditable.value) return;
  baseError.value = "";
  // Off is a separate state: the remembered base is kept, never negated into something else.
  if (on) rememberedBase.value = DEFAULT_BASE;
  postLogBase.value = on ? DEFAULT_BASE : -rememberedBase.value;
  props.mapManager?.visualizationManager.noteVisualizationDraft({
    postLogBase: postLogBase.value,
  });
}

function commitBase(): void {
  const text = baseDraft.value.trim().replace(",", ".");
  const value = text === "" ? Number.NaN : Number(text);
  if (!isValidLogBase(value) || value > MAX_BASE) {
    baseError.value = `Log base must be a number above 0 and up to ${MAX_BASE}, other than 1. Kept ${formatBase(
      rememberedBase.value
    )}.`;
    baseDraft.value = formatBase(rememberedBase.value);
    return;
  }
  baseError.value = "";
  rememberedBase.value = value;
  baseDraft.value = formatBase(value);
  if (logEnabled.value) {
    postLogBase.value = value;
    props.mapManager?.visualizationManager.noteVisualizationDraft({
      postLogBase: value,
    });
  }
}

type ScalingMode = "none" | "linear" | "quadratic" | "both";
const scalingMode = computed<ScalingMode>({
  get: () =>
    resolutionScaling.value && resolutionLinearScaling.value
      ? "both"
      : resolutionScaling.value
      ? "quadratic"
      : resolutionLinearScaling.value
      ? "linear"
      : "none",
  set: (mode) => {
    // Mutually exclusive: choosing one clears the other. The legacy "both" is only ever shown.
    if (mode === "both") return;
    resolutionLinearScaling.value = mode === "linear";
    resolutionScaling.value = mode === "quadratic";
    props.mapManager?.visualizationManager.noteVisualizationDraft({
      resolutionScaling: resolutionScaling.value,
      resolutionLinearScaling: resolutionLinearScaling.value,
    });
  },
});

const legacyPreLog = computed(
  () => preLogBase.value > 0 && isValidLogBase(preLogBase.value)
);
function removePreLog(): void {
  preLogBase.value = -1;
  props.mapManager?.visualizationManager.noteVisualizationDraft({
    preLogBase: -1,
  });
}
function stopAutoThreshold(): void {
  autoThresholdEnabled.value = false;
  props.mapManager?.visualizationManager.noteVisualizationDraft({
    autoThresholdEnabled: false,
  });
}

function resetAttributes(): void {
  preLogBase.value = -1;
  rememberedBase.value = DEFAULT_BASE;
  postLogBase.value = DEFAULT_BASE;
  applyCoolerWeights.value = false;
  resolutionScaling.value = false;
  resolutionLinearScaling.value = false;
  autoThresholdEnabled.value = false;
  autoThresholdQuantile.value = 0.995;
  props.mapManager?.visualizationManager.noteVisualizationDraft({
    preLogBase: -1,
    postLogBase: DEFAULT_BASE,
    applyCoolerWeights: false,
    resolutionScaling: false,
    resolutionLinearScaling: false,
    autoThresholdEnabled: false,
    autoThresholdQuantile: 0.995,
  });
  emit("apply");
}

// ---- Normalization --------------------------------------------------------------------------
const status = ref<CoverageNormalizationStatus | null>(null);
const preparing = ref(false);
const prepareProgress = ref(0);
const prepareMessage = ref("");
const prepareError = ref("");
let disposed = false;

type NormalizationChoice = "none" | "sqrt" | "file";
/** What is shown is what tiles use: weights off, the file's weights, or computed coverage. */
const choice = computed<NormalizationChoice>(() =>
  !applyCoolerWeights.value ||
  coolerWeightsNaNPolicy.value === "DISABLE_WEIGHTS"
    ? "none"
    : requests()?.normalizationWeightsMode === "SQRT_COVERAGE"
    ? "sqrt"
    : "file"
);
const normalizationHelpId = computed(() =>
  contactUnavailable.value
    ? "contact-normalization-unavailable"
    : choice.value === "sqrt"
    ? "normalization-help"
    : undefined
);

type ChoiceAttempt = {
  manager: ContactMapManager;
  context: import("@/app/core/visualization/visualizationDrafts").VisualizationContext;
  current: () => boolean;
};
const choiceGenerations = new Map<string, number>();
let vectorGeneration = 0;
let statusGeneration = 0;
function beginChoice(next: NormalizationChoice): ChoiceAttempt | undefined {
  const manager = props.mapManager;
  if (!manager || manager.isDisposed) return;
  const context = manager.visualizationManager.captureVisualizationContext();
  const key = JSON.stringify([
    context.source,
    context.targetId,
    context.source === "PRIMARY" ? context.mode : "OBSERVED",
  ]);
  const generation = (choiceGenerations.get(key) ?? 0) + 1;
  choiceGenerations.set(key, generation);
  if (next !== "none") ++vectorGeneration;
  const vectors = vectorGeneration;
  return {
    manager,
    context,
    current: () =>
      !disposed &&
      !manager.isDisposed &&
      props.mapManager?.getMap() === manager.getMap() &&
      choiceGenerations.get(key) === generation &&
      (next === "none" || vectors === vectorGeneration),
  };
}

const requests = () => props.mapManager?.networkManager.requestManager;

async function refreshStatus(): Promise<void> {
  const manager = props.mapManager;
  const generation = ++statusGeneration;
  const rm = manager?.networkManager.requestManager;
  if (!rm) {
    status.value = null;
    return;
  }
  try {
    const response = await rm.coverageNormalizationStatus();
    if (
      generation !== statusGeneration ||
      manager?.getMap() !== props.mapManager?.getMap()
    )
      return;
    status.value = response;
    if (status.value.state === "RUNNING" && !preparing.value)
      void waitForPreparation(false);
  } catch (error) {
    console.debug("Normalization status unavailable", error);
    if (generation === statusGeneration) status.value = null;
  }
}

/** Follows the background job until it ends. Returns true when the vectors are ready. */
async function waitForPreparation(
  start: boolean,
  attempt?: ChoiceAttempt
): Promise<boolean> {
  const rm = attempt?.manager.networkManager.requestManager ?? requests();
  if (!rm) return false;
  preparing.value = true;
  prepareError.value = "";
  try {
    const outcome = await prepareCoverage(
      rm,
      (current) => {
        if (attempt && !attempt.current()) return;
        status.value = current;
        prepareProgress.value = current.progress;
        prepareMessage.value = current.message || "Preparing";
      },
      {
        start,
        shouldStop: () => disposed || Boolean(attempt && !attempt.current()),
      }
    );
    if (attempt && !attempt.current()) return false;
    if (!outcome.ok && !outcome.cancelled) prepareError.value = outcome.message;
    return outcome.ok;
  } finally {
    preparing.value = false;
  }
}

async function cancelPreparation(): Promise<void> {
  try {
    await requests()?.cancelCoverageNormalization();
  } catch (error) {
    console.debug("Cancel failed", error);
  }
}

async function switchWeights(
  mode: "FILE" | "SQRT_COVERAGE",
  attempt: ChoiceAttempt
): Promise<boolean> {
  if (!attempt.current()) return false;
  const rm = attempt.manager.networkManager.requestManager;
  if (!rm) return false;
  try {
    await rm.selectNormalizationWeights(mode);
    if (!attempt.current()) return false;
    await refreshStatus();
    return true;
  } catch (error) {
    console.debug("Switching weights failed", error);
    prepareError.value =
      "The weights could not be switched. Nothing was changed.";
    return false;
  }
}

/**
 * Applies the choice through the one routine that rewrites the pipeline, the options and the color
 * range together. A change of normalization changes the scale of the values, so the range is refitted;
 * keeping the old one would leave the map blank or saturated.
 */
async function applyChoice(
  useWeights: boolean,
  attempt: ChoiceAttempt
): Promise<void> {
  if (!attempt.current()) return;
  const manager = attempt.manager;
  const policy: CoolerWeightsNaNPolicy = !useWeights
    ? "DISABLE_WEIGHTS"
    : coolerWeightsNaNPolicy.value === "DISABLE_WEIGHTS"
    ? "REPLACE_NANS_WITH_ZERO"
    : coolerWeightsNaNPolicy.value;
  try {
    await manager.visualizationManager.applyCoolerWeightsPolicy(
      policy,
      useWeights,
      attempt.context
    );
  } catch (error) {
    console.debug("Applying the normalization failed", error);
    if (attempt.current())
      prepareError.value = "The normalization could not be applied.";
  }
}

async function useCoverage(attempt: ChoiceAttempt): Promise<void> {
  if (!(await waitForPreparation(true, attempt)) || !attempt.current()) return;
  if (!(await switchWeights("SQRT_COVERAGE", attempt))) return;
  await applyChoice(true, attempt);
}

async function onChoose(value: string): Promise<void> {
  prepareError.value = "";
  const next = value as NormalizationChoice;
  if (next === choice.value) return;
  const attempt = beginChoice(next);
  if (!attempt) return;
  if (next === "none") {
    await applyChoice(false, attempt);
  } else if (next === "file") {
    if (!(await switchWeights("FILE", attempt))) return;
    await applyChoice(true, attempt);
  } else {
    await useCoverage(attempt);
  }
  if (!attempt.current()) return;
  // A refused or cancelled change leaves the control showing what is really in use.
  const element = document.getElementById(
    "normalization-mode"
  ) as HTMLSelectElement | null;
  if (element) element.value = choice.value;
}

async function reapplyCoverage(): Promise<void> {
  toast.message("Preparing square-root coverage for the attached source…");
  const attempt = beginChoice("sqrt");
  if (attempt) await useCoverage(attempt);
}

onMounted(() => void refreshStatus());
watch(
  () => props.mapManager,
  () => {
    choiceGenerations.clear();
    ++vectorGeneration;
    void refreshStatus();
  }
);
onBeforeUnmount(() => {
  disposed = true;
});

function openRenderingPipeline(): void {
  pipelineModalOpen.value = true;
}
</script>

<style scoped>
.signal-processing {
  min-width: 0;
  margin: 0.5rem 0 0.75rem;
  font-size: 0.875rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.coverage-explanation {
  color: var(--hict-ui-muted, #64748b);
  overflow-wrap: anywhere;
}
.coverage-explanation summary {
  cursor: pointer;
}
.coverage-formula {
  white-space: nowrap;
}

.signal-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.signal-label {
  font-weight: 600;
}

.scale-choice {
  display: inline-flex;
  padding: 3px;
  border-radius: 7px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
}

.scale-choice button {
  padding: 3px 10px;
  background: transparent;
  border: 0;
  border-radius: 4px;
  color: #475569;
  font-size: 0.8rem;
}

.scale-choice button[aria-pressed="true"] {
  background: white;
  color: #1d4ed8;
  box-shadow: 0 1px 3px #0f172a20;
  font-weight: 600;
}

.scale-choice button:disabled {
  opacity: 0.55;
}

.signal-advanced > summary {
  cursor: pointer;
  font-weight: 600;
}

.signal-advanced-body {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.4rem;
}

.base-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.number-input {
  width: 6.5rem;
  max-width: 100%;
}

.scaling-select {
  width: 11rem;
  flex: 1 1 11rem;
  min-width: 0;
  max-width: 100%;
}

.normalization-select {
  width: 13rem;
  flex: 1 1 13rem;
  min-width: 0;
  max-width: 100%;
}

.normalization-progress {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.normalization-progress progress {
  flex: 1;
  min-width: 0;
}

.legacy-summary {
  margin: 0;
}

.link-button {
  border: 0;
  background: none;
  padding: 0;
  color: #0d6efd;
  text-decoration: underline;
  font-size: inherit;
}
</style>
