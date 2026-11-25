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
      <span id="signal-transform-label" class="signal-label"> Signal </span>
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
        ref="normalizationSelect"
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
    <slot name="normalization-note" />
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

    <AdvancedSection
      dialog-id="sidebar-visualization"
      hint="slider scale, limits, log base, pipeline"
      class="signal-advanced"
      id="signal-advanced"
    >
      <slot name="advanced-top" />
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
        <slot name="excluded-bins" />
        <div class="base-row">
          <button
            type="button"
            class="link-button"
            @click="openRenderingPipeline"
          >
            Rendering pipeline…
          </button>
          <button
            type="button"
            class="link-button text-danger"
            title="Log2, no scaling, no weights. Colors and thresholds are kept."
            @click="resetAttributes"
          >
            Reset
          </button>
        </div>
        <p id="scaling-help" class="visually-hidden">
          Linear scaling divides by the bin-size ratio and quadratic scaling
          divides by its square.
        </p>
        <slot name="advanced-help" />
      </div>
    </AdvancedSection>
  </section>
  <RenderingPipelineModal
    v-if="pipelineModalOpen"
    :map-manager="props.mapManager"
    @dismissed="pipelineModalOpen = false"
  />
</template>

<script setup lang="ts">
import AdvancedSection from "../common/AdvancedSection.vue";
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  reactive,
  ref,
  watch,
} from "vue";
import type { CoolerWeightsNaNPolicy } from "@/app/core/visualization/VisualizationOptions";
import { prepareCoverage } from "@/app/core/visualization/coverageNormalization";
import type {
  NormalizationSource,
  NormalizationWeightMode,
} from "@/app/core/net/api/RequestManager";
import type { VisualizationContext } from "@/app/core/visualization/visualizationDrafts";
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

const activeSource = computed(() => matrixViewStore.activeVisualizationSource);
const requests = () => props.mapManager?.networkManager.requestManager;
const normalizationSelect = ref<HTMLSelectElement>();
const preparations = reactive<
  Partial<Record<NormalizationSource, { progress: number; message: string }>>
>({});
const errors = reactive<Partial<Record<NormalizationSource, string>>>({});
const preparing = computed(
  () => preparations[activeSource.value] !== undefined
);
const prepareProgress = computed(
  () => preparations[activeSource.value]?.progress ?? 0
);
const prepareMessage = computed(
  () => preparations[activeSource.value]?.message ?? ""
);
const prepareError = computed(() => errors[activeSource.value] ?? "");
let disposed = false;

type NormalizationChoice = "none" | "sqrt" | "file";
const choice = computed<NormalizationChoice>(() =>
  !applyCoolerWeights.value ||
  coolerWeightsNaNPolicy.value === "DISABLE_WEIGHTS" ||
  contactUnavailable.value
    ? "none"
    : requests()?.getNormalizationWeightsMode(activeSource.value) ===
      "SQRT_COVERAGE"
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
  context: VisualizationContext;
  policy: CoolerWeightsNaNPolicy;
  current: () => boolean;
};
const choiceGenerations = { PRIMARY: 0, SECONDARY: 0 };

function sourceCurrent(
  manager: ContactMapManager,
  source: NormalizationSource,
  revision: number
): boolean {
  return (
    !disposed &&
    !manager.isDisposed &&
    props.mapManager?.getMap() === manager.getMap() &&
    manager.networkManager.requestManager.getNormalizationSourceRevision(
      source
    ) === revision
  );
}

function beginChoice(): ChoiceAttempt | undefined {
  const manager = props.mapManager;
  if (!manager || manager.isDisposed) return;
  const context = manager.visualizationManager.captureVisualizationContext();
  const source = context.source;
  const generation = ++choiceGenerations[source];
  const revision =
    manager.networkManager.requestManager.getNormalizationSourceRevision(
      source
    );
  return {
    manager,
    context,
    policy: coolerWeightsNaNPolicy.value,
    current: () =>
      sourceCurrent(manager, source, revision) &&
      choiceGenerations[source] === generation,
  };
}

/** Follows only the selected source's job, even when the source selector changes while it runs. */
async function waitForPreparation(
  manager: ContactMapManager,
  source: NormalizationSource,
  start: boolean,
  current: () => boolean
): Promise<boolean> {
  const entry = reactive({ progress: 0, message: "Preparing coverage" });
  preparations[source] = entry;
  errors[source] = "";
  try {
    const outcome = await prepareCoverage(
      manager.networkManager.requestManager,
      (status) => {
        entry.progress = status.progress;
        entry.message = status.message || "Preparing coverage";
      },
      { source, start, shouldStop: () => !current() }
    );
    if (!current()) return false;
    if (!outcome.ok && !outcome.cancelled) errors[source] = outcome.message;
    return outcome.ok;
  } finally {
    if (preparations[source] === entry) delete preparations[source];
  }
}

async function refreshStatus(
  manager: ContactMapManager,
  source: NormalizationSource,
  revision: number
): Promise<void> {
  const rm = manager.networkManager.requestManager;
  const current = () => sourceCurrent(manager, source, revision);
  try {
    const status = await rm.coverageNormalizationStatus(source);
    if (current() && status.state === "RUNNING" && !preparations[source])
      await waitForPreparation(manager, source, false, current);
  } catch (error) {
    console.debug("Normalization status unavailable", error);
  }
}

async function cancelPreparation(): Promise<void> {
  try {
    await requests()?.cancelCoverageNormalization(activeSource.value);
  } catch (error) {
    console.debug("Cancel failed", error);
  }
}

async function switchWeights(
  mode: NormalizationWeightMode,
  attempt: ChoiceAttempt
): Promise<boolean> {
  if (!attempt.current()) return false;
  const source = attempt.context.source;
  try {
    await attempt.manager.networkManager.requestManager.selectNormalizationWeights(
      mode,
      source
    );
    return attempt.current();
  } catch (error) {
    console.debug("Switching weights failed", error);
    if (attempt.current())
      errors[source] = "The weights could not be switched.";
    return false;
  }
}

/** Applies and refits the graph for the same source that owns the normalization vectors. */
async function applyChoice(
  useWeights: boolean,
  attempt: ChoiceAttempt
): Promise<void> {
  if (!attempt.current()) return;
  const policy = !useWeights
    ? "DISABLE_WEIGHTS"
    : attempt.policy === "DISABLE_WEIGHTS"
    ? "REPLACE_NANS_WITH_ZERO"
    : attempt.policy;
  try {
    await attempt.manager.visualizationManager.applyCoolerWeightsPolicy(
      policy,
      useWeights,
      attempt.context
    );
  } catch (error) {
    console.debug("Applying the normalization failed", error);
    if (attempt.current())
      errors[attempt.context.source] =
        "The normalization could not be applied.";
  }
}

async function onChoose(value: string): Promise<void> {
  const attempt = beginChoice();
  if (!attempt) return;
  const source = attempt.context.source;
  errors[source] = "";
  try {
    if (value === choice.value) return;
    if (value === "none") {
      await applyChoice(false, attempt);
      return;
    }
    if (
      value === "sqrt" &&
      !(await waitForPreparation(
        attempt.manager,
        source,
        true,
        attempt.current
      ))
    )
      return;
    if (
      await switchWeights(value === "sqrt" ? "SQRT_COVERAGE" : "FILE", attempt)
    )
      await applyChoice(true, attempt);
  } finally {
    if (
      attempt.current() &&
      source === activeSource.value &&
      normalizationSelect.value
    )
      normalizationSelect.value.value = choice.value;
  }
}

watch(
  [
    () => props.mapManager,
    () => requests()?.getNormalizationSourceRevision("PRIMARY"),
    () => requests()?.getNormalizationSourceRevision("SECONDARY"),
  ],
  ([manager, primary, secondary], [oldManager, oldPrimary, oldSecondary]) => {
    if (manager !== oldManager || primary !== oldPrimary) {
      delete preparations.PRIMARY;
      delete errors.PRIMARY;
    }
    if (manager !== oldManager || secondary !== oldSecondary) {
      delete preparations.SECONDARY;
      delete errors.SECONDARY;
    }
  }
);
watch(
  [
    () => props.mapManager,
    activeSource,
    () => requests()?.getNormalizationSourceRevision(activeSource.value),
  ],
  ([manager, source, revision]) => {
    if (manager && revision !== undefined)
      void refreshStatus(manager, source, revision);
  },
  { immediate: true }
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
  width: 3.5rem;
  max-width: 100%;
}

.scaling-select {
  width: 9rem;
  min-width: 0;
  max-width: 100%;
}

.normalization-select {
  width: 13rem;
  flex: 1 1 13rem;
  min-width: 0;
  max-width: 100%;
  appearance: auto;
  padding-inline-end: 0.5rem;
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
