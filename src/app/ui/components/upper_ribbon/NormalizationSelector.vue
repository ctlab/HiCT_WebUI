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

    <p
      v-if="legacyPreLog || autoThresholdEnabled"
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

        <div class="form-check form-switch">
          <input
            id="checkbox-normalization-cooler-weights"
            v-model="applyCoolerWeights"
            class="form-check-input"
            type="checkbox"
            role="switch"
            :disabled="weightsUnavailable || !signalEditable"
            :aria-describedby="
              weightsUnavailable
                ? contactUnavailable
                  ? 'contact-normalization-unavailable'
                  : 'imported-weights-unavailable'
                : undefined
            "
          />
          <label
            class="form-check-label"
            for="checkbox-normalization-cooler-weights"
          >
            Apply weights from Cooler
          </label>
        </div>

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
            title="Log10, no scaling, no weights. Colors and thresholds are kept."
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
import { computed, defineAsyncComponent, ref, watch } from "vue";
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
    props.mapManager?.viewAndLayersManager.currentViewState.resolutionDesciptor
      .bpResolution
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
  isValidLogBase(Math.abs(postLogBase.value))
    ? Math.abs(postLogBase.value)
    : DEFAULT_BASE
);
watch(
  () => postLogBase.value,
  (value) => {
    if (isValidLogBase(value) && value > 0) rememberedBase.value = value;
    else if (isValidLogBase(Math.abs(value)))
      rememberedBase.value = Math.abs(value);
  }
);
const logButtonLabel = computed(() => {
  const base = rememberedBase.value;
  return Math.abs(base - 2) < 1e-9
    ? "Log2"
    : Math.abs(base - 10) < 1e-9
    ? "Log10"
    : "Log";
});
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
  postLogBase.value = on ? rememberedBase.value : -rememberedBase.value;
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
  if (logEnabled.value) postLogBase.value = value;
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
  },
});

const legacyPreLog = computed(
  () => preLogBase.value > 0 && isValidLogBase(preLogBase.value)
);
function removePreLog(): void {
  preLogBase.value = -1;
}
function stopAutoThreshold(): void {
  autoThresholdEnabled.value = false;
}

function resetAttributes(): void {
  preLogBase.value = -1;
  rememberedBase.value = 10;
  postLogBase.value = 10;
  applyCoolerWeights.value = false;
  resolutionScaling.value = false;
  resolutionLinearScaling.value = false;
  autoThresholdEnabled.value = false;
  autoThresholdQuantile.value = 0.995;
  emit("apply");
}

function openRenderingPipeline(): void {
  pipelineModalOpen.value = true;
}
</script>

<style scoped>
.signal-processing {
  margin: 0.5rem 0 0.75rem;
  font-size: 0.875rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.signal-row {
  display: flex;
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
  max-width: 100%;
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
