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
  <div class="d-flex align-items-center" v-if="errorMessage">
    <p class="error-message">Error: {{ errorMessage }}</p>
  </div>
  <div class="d-flex align-items-center" v-if="loading">
    <strong>Loading...</strong>
    <div class="spinner-border ms-auto" role="status"></div>
  </div>
  <div v-if="!loading">
    <select
      class="form-select form-select-lg mb-3"
      v-model="selectedCoolerFilename"
    >
      <option selected>Select Cooler file from the list below...</option>
      <option v-for="(filename, idx) in filenames" :key="idx" :value="filename">
        {{ filename }}
      </option>
    </select>
  </div>
  <div>
    <button
      type="button"
      class="btn btn-primary"
      v-if="selectedCoolerFilename"
      @click="onSelectClicked"
    >
      Next
    </button>
  </div>
</template>

<script setup lang="ts">
import { type Ref, ref, onMounted } from "vue";
import type { NetworkManager } from "@/app/core/net/NetworkManager.js";

const emit = defineEmits<{
  (e: "selected", coolerFilename: string): void;
}>();

const props = defineProps<{
  networkManager: NetworkManager;
}>();

const selectedCoolerFilename: Ref<string | null> = ref(null);
const filenames: Ref<string[]> = ref([]);
const loading: Ref<boolean> = ref(true);
const errorMessage: Ref<unknown | null> = ref(null);

function onSelectClicked(): void {
  if (selectedCoolerFilename.value) {
    emit("selected", selectedCoolerFilename.value);
  }
}

onMounted(() => {
  props.networkManager.requestManager
    .listCoolers()
    .then((lst) => {
      filenames.value = lst;
    })
    .catch((e) => {
      errorMessage.value = e;
    })
    .finally(() => {
      loading.value = false;
    });
});
</script>

<style scoped>
.error-message {
  color: red;
}
</style>
