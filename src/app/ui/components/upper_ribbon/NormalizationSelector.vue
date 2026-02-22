<!--
 Copyright (c) 2021-2024 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis, Zakhar Lobanov, Nikita Zheleznov and Computer Technologies Laboratory ITMO University team.

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
      aria-expanded="false"
    >
      Normalization settings
    </button>
    <ul id="normalization-dropdown-menu" class="dropdown-menu p-3">
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
        <div class="btn-group" role="group" id="normalization-apply-group">
          <button type="button" class="btn btn-success" @click="applySettings">
            Apply
          </button>
          <button type="button" class="btn btn-danger" @click="resetAttributes">
            Reset
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { Ref, ref, watch } from "vue";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import { storeToRefs } from "pinia";
import { toast } from "vue-sonner";
const visualizationOptionsStore = useVisualizationOptionsStore();
const {
  preLogBase,
  applyCoolerWeights,
  resolutionScaling,
  resolutionLinearScaling,
  postLogBase,
  colormap,
} = storeToRefs(visualizationOptionsStore);

const props = defineProps<{
  mapManager?: ContactMapManager;
}>();

const applyPreLog: Ref<boolean> = ref(false);

// const applyCoolerWeights: Ref<boolean> = ref(false);

const applyPostLog: Ref<boolean> = ref(true);

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
  applySettings();
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
  // props.mapManager?.eventManager.onNormalizationChanged({
  //   applyCoolerWeights: applyCoolerWeights.value,
  //   preLogBase: applyPreLog.value ? preLogBase.value : -1,
  //   postLogBase: applyPostLog.value ? postLogBase.value : -1,
  // });
  props.mapManager?.visualizationManager
    .sendVisualizationOptionsToServer()
    .then(() => props.mapManager?.reloadTiles());
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
</script>

<style scoped>
#normalization-dropdown-menu {
  white-space: nowrap;
}

.number-input {
  width: 100px;
  float: right;
}

#normalization-apply-group {
  width: 100%;
}
</style>
