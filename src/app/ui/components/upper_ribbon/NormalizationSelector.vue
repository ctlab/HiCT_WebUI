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
  <div
    class="dropdown dropdown-sm"
    id="normalization-settings-dropdown"
    data-bs-auto-close="false"
  >
    <button
      class="btn btn-sm btn-light dropdown-toggle"
      type="button"
      data-bs-toggle="dropdown"
      data-bs-auto-close="false"
      aria-expanded="false"
    >
      Normalization settings
    </button>
    <ul id="normalization-dropdown-menu" class="dropdown-menu p-3">
      <li v-if="hasTwoSources">
        <div class="mb-2 normalization-source-block">
          <label class="form-label small mb-1">Source selection</label>
          <div class="normalization-source-row">
            <div class="btn-group flex-grow-1" role="group" aria-label="Visualization source">
              <button
                type="button"
                class="btn btn-sm normalization-source-button"
                :class="{ 'is-active': activeVisualizationSource === 'PRIMARY' }"
                :aria-pressed="activeVisualizationSource === 'PRIMARY'"
                @click.stop.prevent="selectVisualizationSource('PRIMARY')"
              >
                PRIMARY
              </button>
              <button
                type="button"
                class="btn btn-sm normalization-source-button"
                :class="{ 'is-active': activeVisualizationSource === 'SECONDARY' }"
                :aria-pressed="activeVisualizationSource === 'SECONDARY'"
                @click.stop.prevent="selectVisualizationSource('SECONDARY')"
              >
                SECONDARY
              </button>
            </div>
            <button
              type="button"
              class="btn btn-sm layer-swap-button"
              :class="layersSwapped ? 'btn-secondary active' : 'btn-outline-secondary'"
              title="Swap Layers"
              aria-label="Swap Layers"
              @click.stop.prevent="swapLayers"
            >
              <i class="bi bi-shuffle"></i>
            </button>
          </div>
          <small class="text-muted d-block mt-1">
            Applies normalization and thresholds only to the selected layer.
          </small>
        </div>
      </li>
      <li v-if="hasTwoSources">
        <hr class="dropdown-divider" />
      </li>
      <li>
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
      </li>
      <li v-if="applyPreLog">
        <div>
          <label for="normalization-pre-log-base"> Logarithm base: </label>
          <input
            class="form-check-input number-input"
            type="number"
            id="normalization-pre-log-base"
            min="0.00000001"
            max="1000.0"
            step="0.1"
            v-model.number="preLogBase"
          />
        </div>
      </li>
      <li>
        <hr class="dropdown-divider" />
      </li>
      <li>
        <div class="form-check">
          <input
            class="form-check-input"
            type="checkbox"
            role="switch"
            value=""
            id="checkbox-normalization-resolution-scaling"
            v-model="resolutionScaling"
          />
          <label
            class="form-check-label"
            for="checkbox-normalization-resolution-scaling"
          >
            Apply resolution scaling
          </label>
        </div>
      </li>
      <li>
        <hr class="dropdown-divider" />
      </li>
      <li>
        <div class="form-check">
          <input
            class="form-check-input"
            type="checkbox"
            role="switch"
            value=""
            id="checkbox-normalization-resolution-linear-scaling"
            v-model="resolutionLinearScaling"
          />
          <label
            class="form-check-label"
            for="checkbox-normalization-resolution-linear-scaling"
          >
            Apply linear resolution scaling
          </label>
        </div>
      </li>
      <li>
        <hr class="dropdown-divider" />
      </li>
      <li>
        <div class="form-check">
          <input
            class="form-check-input"
            type="checkbox"
            role="switch"
            value=""
            id="checkbox-normalization-cooler-weigths"
            v-model="applyCoolerWeights"
          />
          <label
            class="form-check-label"
            for="checkbox-normalization-cooler-weights"
          >
            Apply weights from Cooler
          </label>
        </div>
      </li>
      <li>
        <hr class="dropdown-divider" />
      </li>
      <li>
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
      </li>
      <li v-if="applyPostLog">
        <div>
          <label for="normalization-post-log-base"> Logarithm base: </label>
          <input
            class="form-check-input number-input"
            type="number"
            id="normalization-post-log-base"
            min="0.00000001"
            max="1000.0"
            step="0.1"
            v-model.number="postLogBase"
          />
        </div>
      </li>
      <li>
        <hr class="dropdown-divider" />
      </li>
      <li>
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
      </li>
      <li v-if="autoThresholdEnabled">
        <div class="mt-1">
          <label for="normalization-auto-threshold-quantile">
            Visible quantile:
          </label>
          <input
            id="normalization-auto-threshold-quantile"
            v-model.number="autoThresholdQuantile"
            class="form-check-input number-input"
            type="number"
            min="0.5"
            max="0.999999"
            step="0.001"
          />
          <small class="text-muted d-block mt-1">
            Recomputes the colormap upper bound from the current viewport.
          </small>
        </div>
      </li>
      <li>
        <hr class="dropdown-divider" />
      </li>
      <li>
        <button type="button" class="btn btn-sm btn-outline-primary w-100" @click="openRenderingPipeline">
          Rendering pipeline...
        </button>
      </li>
      <li>
        <hr class="dropdown-divider" />
      </li>
      <li>
        <div class="btn-group" role="group" id="normalization-apply-group">
          <button type="button" class="btn btn-success normalization-action-apply" @click="applySettings">
            Apply
          </button>
          <button type="button" class="btn btn-danger normalization-action-reset" @click="resetAttributes">
            Reset
          </button>
        </div>
      </li>
    </ul>
  </div>
  <RenderingPipelineModal
    v-if="pipelineModalOpen"
    :map-manager="props.mapManager"
    @dismissed="pipelineModalOpen = false"
  />
</template>

<script setup lang="ts">
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { computed, defineAsyncComponent, onMounted, onUnmounted, Ref, ref, watch } from "vue";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import { storeToRefs } from "pinia";
import { toast } from "vue-sonner";
import type { EventsKey } from "ol/events";
import { unByKey } from "ol/Observable";
import { useMatrixViewStore } from "@/app/stores/matrixViewStore";
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
  colormap,
} = storeToRefs(visualizationOptionsStore);
const matrixViewStore = useMatrixViewStore();
const { presentationMode, activeVisualizationSource, layersSwapped } = storeToRefs(matrixViewStore);

const props = defineProps<{
  mapManager?: ContactMapManager;
}>();

const applyPreLog: Ref<boolean> = ref(false);

// const applyCoolerWeights: Ref<boolean> = ref(false);

const applyPostLog: Ref<boolean> = ref(true);
const pipelineModalOpen = ref(false);
let autoThresholdMoveEndKey: EventsKey | undefined;
let autoThresholdTimer: number | undefined;

const hasTwoSources = computed(() => presentationMode.value !== "single");

// const preLogBase: Ref<number> = ref(10);

// const postLogBase: Ref<number> = ref(10);

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
  applySettings();
}

function activeSourceForOptions(): "PRIMARY" | "SECONDARY" | undefined {
  return hasTwoSources.value ? activeVisualizationSource.value : undefined;
}

function syncLocalLogFlags(): void {
  applyPreLog.value = preLogBase.value > 0;
  applyPostLog.value = postLogBase.value > 0;
}

async function refreshOptionsForActiveSource(): Promise<void> {
  if (!props.mapManager) {
    return;
  }
  await props.mapManager.visualizationManager
    .loadVisualizationOptionsForSource(activeSourceForOptions())
    .then(syncLocalLogFlags)
    .catch(() => undefined);
}

function selectVisualizationSource(source: "PRIMARY" | "SECONDARY"): void {
  matrixViewStore.setActiveVisualizationSource(source);
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

function applySettings(): void {
  const source = hasTwoSources.value ? activeVisualizationSource.value : undefined;
  const action = source
    ? props.mapManager?.visualizationManager.applyVisualizationSettingsForSourceAndReload(
        source
      )
    : props.mapManager?.visualizationManager.applyVisualizationSettingsAndReload();
  action?.catch((error) => {
    toast.error(String(error ?? "Failed to apply normalization settings"));
  });
}

function preLogCheckChange() {
  // applyPreLog.value = !applyPreLog.value;
  if (!applyPreLog.value) {
    preLogBase.value = Math.min(-preLogBase.value, -1e-6);
  } else {
    preLogBase.value = Math.max(-preLogBase.value, 1e-6);
  }
  // toast.message(
  //   `Apply pre log: ${applyPreLog.value}, preLogBase: ${preLogBase.value}`
  // );
}

function postLogCheckChange() {
  // applyPostLog.value = !applyPostLog.value;
  if (!applyPostLog.value) {
    postLogBase.value = Math.min(-postLogBase.value, -1e-6);
  } else {
    postLogBase.value = Math.max(-postLogBase.value, 1e-6);
  }
  // toast.message(
  //   `Apply pre log: ${applyPostLog.value}, preLogBase: ${postLogBase.value}`
  // );
}

function openRenderingPipeline(): void {
  pipelineModalOpen.value = true;
}

function swapLayers(): void {
  props.mapManager?.visualizationManager
    .swapRenderPipelineLayersAndReload()
    .then((swapped) => {
      if (!swapped) {
        toast("No active two-layer rendering pipeline to swap");
        return;
      }
      matrixViewStore.toggleLayersSwapped();
    })
    .catch((error) => {
      toast.error(String(error ?? "Failed to swap rendering layers"));
    });
}

function clearAutoThresholdTimer(): void {
  if (autoThresholdTimer !== undefined) {
    window.clearTimeout(autoThresholdTimer);
    autoThresholdTimer = undefined;
  }
}

function scheduleAutoThresholdRefresh(): void {
  clearAutoThresholdTimer();
  if (!autoThresholdEnabled.value || !props.mapManager) {
    return;
  }
  autoThresholdTimer = window.setTimeout(() => {
    props.mapManager?.visualizationManager
      .refreshAutoThresholdAndReload(
        hasTwoSources.value ? activeVisualizationSource.value : undefined
      )
      .catch(() => undefined);
  }, 180);
}

function detachAutoThresholdMoveListener(): void {
  if (autoThresholdMoveEndKey) {
    unByKey(autoThresholdMoveEndKey);
    autoThresholdMoveEndKey = undefined;
  }
}

watch(
  () => props.mapManager,
  (manager) => {
    detachAutoThresholdMoveListener();
    clearAutoThresholdTimer();
    if (!manager) {
      return;
    }
    autoThresholdMoveEndKey = manager.getMap().on("moveend", () => {
      scheduleAutoThresholdRefresh();
    });
  },
  { immediate: true }
);

watch(
  () => autoThresholdEnabled.value,
  (enabled) => {
    if (enabled) {
      scheduleAutoThresholdRefresh();
    }
  }
);

watch(
  () => autoThresholdQuantile.value,
  () => {
    if (autoThresholdEnabled.value) {
      scheduleAutoThresholdRefresh();
    }
  }
);

watch(
  () => activeVisualizationSource.value,
  () => {
    void refreshOptionsForActiveSource();
    if (autoThresholdEnabled.value) {
      scheduleAutoThresholdRefresh();
    }
  }
);

watch(
  () => [props.mapManager, presentationMode.value] as const,
  () => {
    void refreshOptionsForActiveSource();
  },
  { immediate: true }
);

onMounted(() => {
  syncLocalLogFlags();
  void refreshOptionsForActiveSource();
});

onUnmounted(() => {
  detachAutoThresholdMoveListener();
  clearAutoThresholdTimer();
});
</script>

<style scoped>
#normalization-dropdown-menu {
  min-width: min(34rem, calc(100vw - 2rem));
  max-width: min(36rem, calc(100vw - 2rem));
  white-space: normal;
  overflow-wrap: anywhere;
}

.number-input {
  width: 7.25rem;
  float: right;
}

#normalization-apply-group {
  width: 100%;
}

.normalization-source-row {
  display: flex;
  align-items: stretch;
  gap: 0.5rem;
}

.normalization-source-button {
  color: #0d6efd !important;
  background: #ffffff !important;
  border-color: #0d6efd !important;
  box-shadow:
    0 0 0 2px rgba(255, 255, 255, 0.96),
    0 1px 2px rgba(0, 0, 0, 0.14);
  text-shadow:
    -1px -1px 0 rgba(255, 255, 255, 0.9),
    1px -1px 0 rgba(255, 255, 255, 0.9),
    -1px 1px 0 rgba(255, 255, 255, 0.9),
    1px 1px 0 rgba(255, 255, 255, 0.9);
}

.normalization-source-button.is-active {
  color: #ffffff !important;
  background: #0d6efd !important;
  border-color: #0d6efd !important;
  box-shadow:
    0 0 0 2px rgba(255, 255, 255, 0.96),
    inset 0 0 0 1px rgba(255, 255, 255, 0.38),
    0 1px 2px rgba(0, 0, 0, 0.18);
  text-shadow:
    -1px -1px 0 rgba(0, 0, 0, 0.65),
    1px -1px 0 rgba(0, 0, 0, 0.65),
    -1px 1px 0 rgba(0, 0, 0, 0.65),
    1px 1px 0 rgba(0, 0, 0, 0.65);
}

.layer-swap-button {
  width: 2.35rem;
  min-width: 2.35rem;
  border-radius: 0.55rem;
}

.layer-swap-button.active {
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
}

.normalization-action-apply {
  color: #ffffff !important;
  background: #198754 !important;
  border-color: #198754 !important;
  box-shadow:
    0 0 0 2px rgba(255, 255, 255, 0.96),
    inset 0 0 0 1px rgba(255, 255, 255, 0.28),
    0 1px 2px rgba(0, 0, 0, 0.18);
  text-shadow:
    -1px -1px 0 rgba(0, 0, 0, 0.7),
    1px -1px 0 rgba(0, 0, 0, 0.7),
    -1px 1px 0 rgba(0, 0, 0, 0.7),
    1px 1px 0 rgba(0, 0, 0, 0.7);
}

.normalization-action-reset {
  color: #ffffff !important;
  background: #dc3545 !important;
  border-color: #dc3545 !important;
  box-shadow:
    0 0 0 2px rgba(255, 255, 255, 0.96),
    inset 0 0 0 1px rgba(255, 255, 255, 0.28),
    0 1px 2px rgba(0, 0, 0, 0.18);
  text-shadow:
    -1px -1px 0 rgba(0, 0, 0, 0.7),
    1px -1px 0 rgba(0, 0, 0, 0.7),
    -1px 1px 0 rgba(0, 0, 0, 0.7),
    1px 1px 0 rgba(0, 0, 0, 0.7);
}
</style>
