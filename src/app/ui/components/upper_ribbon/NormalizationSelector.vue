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
  <details class="signal-processing" id="normalization-settings-dropdown">
    <summary>Signal processing</summary>
    <div class="signal-processing-body">
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
      <div class="form-check">
        <input
          class="form-check-input"
          type="checkbox"
          value=""
          id="checkbox-normalization-pre-log"
          v-model="applyPreLog"
          @change="preLogCheckChange"
        />
        <label class="form-check-label" for="checkbox-normalization-pre-log">
          Apply pre log-normalization
        </label>
      </div>
      <div v-if="applyPreLog" class="base-row">
        <label for="normalization-pre-log-base">Logarithm base:</label>
        <input
          class="form-control form-control-sm number-input"
          type="number"
          id="normalization-pre-log-base"
          min="0.00000001"
          max="1000.0"
          step="0.1"
          v-model.number="preLogBase"
        />
      </div>
      <div class="form-check form-switch">
        <input
          class="form-check-input"
          type="checkbox"
          role="switch"
          value=""
          id="checkbox-normalization-resolution-scaling"
          :disabled="contactUnavailable"
          :aria-describedby="
            contactUnavailable ? 'contact-normalization-unavailable' : undefined
          "
          v-model="resolutionScaling"
        />
        <label
          class="form-check-label"
          for="checkbox-normalization-resolution-scaling"
        >
          Apply resolution scaling
        </label>
      </div>
      <div class="form-check form-switch">
        <input
          class="form-check-input"
          type="checkbox"
          role="switch"
          value=""
          id="checkbox-normalization-resolution-linear-scaling"
          :disabled="contactUnavailable"
          :aria-describedby="
            contactUnavailable ? 'contact-normalization-unavailable' : undefined
          "
          v-model="resolutionLinearScaling"
        />
        <label
          class="form-check-label"
          for="checkbox-normalization-resolution-linear-scaling"
        >
          Apply linear resolution scaling
        </label>
      </div>
      <div class="form-check form-switch">
        <input
          class="form-check-input"
          type="checkbox"
          role="switch"
          value=""
          id="checkbox-normalization-cooler-weights"
          :disabled="weightsUnavailable"
          :aria-describedby="
            weightsUnavailable
              ? contactUnavailable
                ? 'contact-normalization-unavailable'
                : 'imported-weights-unavailable'
              : undefined
          "
          v-model="applyCoolerWeights"
        />
        <label
          class="form-check-label"
          for="checkbox-normalization-cooler-weights"
        >
          Apply weights from Cooler
        </label>
      </div>
      <div class="form-check">
        <input
          class="form-check-input"
          type="checkbox"
          value=""
          id="checkbox-normalization-post-log"
          v-model="applyPostLog"
          @change="postLogCheckChange"
        />
        <label class="form-check-label" for="checkbox-normalization-post-log">
          Apply post log-normalization
        </label>
      </div>
      <div v-if="applyPostLog" class="base-row">
        <label for="normalization-post-log-base">Logarithm base:</label>
        <input
          class="form-control form-control-sm number-input"
          type="number"
          id="normalization-post-log-base"
          min="0.00000001"
          max="1000.0"
          step="0.1"
          v-model.number="postLogBase"
        />
      </div>
      <div class="form-check">
        <input
          id="checkbox-normalization-auto-threshold"
          v-model="autoThresholdEnabled"
          class="form-check-input"
          type="checkbox"
        />
        <label
          class="form-check-label"
          for="checkbox-normalization-auto-threshold"
        >
          Auto upper threshold
        </label>
      </div>
      <div v-if="autoThresholdEnabled" class="base-row">
        <label for="normalization-auto-threshold-quantile">
          Visible quantile:
        </label>
        <input
          id="normalization-auto-threshold-quantile"
          v-model.number="autoThresholdQuantile"
          class="form-control form-control-sm number-input"
          type="number"
          min="0.5"
          max="0.999999"
          step="0.001"
        />
        <small class="text-muted d-block w-100">
          Recomputes the colormap upper bound from the current viewport.
        </small>
      </div>
      <div class="d-flex gap-2 mt-2">
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
          @click="resetAttributes"
        >
          Reset
        </button>
      </div>
    </div>
  </details>
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
  onMounted,
  Ref,
  ref,
  watch,
} from "vue";
import { useMatrixViewStore } from "@/app/stores/matrixViewStore";
import { importedWeightsAvailability } from "@/app/core/net/SourceCapabilities";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
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

const applyPreLog: Ref<boolean> = ref(false);
const applyPostLog: Ref<boolean> = ref(true);
const pipelineModalOpen = ref(false);

function resetAttributes(): void {
  applyPreLog.value = false;
  preLogBase.value = 10;
  applyPostLog.value = true;
  postLogBase.value = 10;
  applyCoolerWeights.value = false;
  resolutionScaling.value = false;
  resolutionLinearScaling.value = false;
  autoThresholdEnabled.value = false;
  autoThresholdQuantile.value = 0.995;
  emit("apply");
}

function syncLocalLogFlags(): void {
  applyPreLog.value = preLogBase.value > 0;
  applyPostLog.value = postLogBase.value > 0;
}

watch(
  () => preLogBase.value,
  (value) => {
    applyPreLog.value = value > 0;
  }
);

watch(
  () => postLogBase.value,
  (value) => {
    applyPostLog.value = value > 0;
  }
);

function preLogCheckChange() {
  if (!applyPreLog.value) {
    preLogBase.value = Math.min(-preLogBase.value, -1e-6);
  } else {
    preLogBase.value = Math.max(-preLogBase.value, 1e-6);
  }
}

function postLogCheckChange() {
  if (!applyPostLog.value) {
    postLogBase.value = Math.min(-postLogBase.value, -1e-6);
  } else {
    postLogBase.value = Math.max(-postLogBase.value, 1e-6);
  }
}

function openRenderingPipeline(): void {
  pipelineModalOpen.value = true;
}

onMounted(() => {
  syncLocalLogFlags();
});
</script>

<style scoped>
.signal-processing {
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
}

.signal-processing > summary {
  cursor: pointer;
  font-weight: 600;
  margin-bottom: 0.4rem;
}

.signal-processing-body {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.base-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
  padding-left: 1.5rem;
}

.number-input {
  width: 6.5rem;
  max-width: 100%;
}
</style>
