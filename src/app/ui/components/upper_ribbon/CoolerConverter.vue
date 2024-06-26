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
    class="modal fade in"
    id="loadAGPModal"
    ref="convertCoolerModal"
    tabindex="-1"
    data-keyboard="false"
    data-backdrop="static"
  >
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Convert Coolers for HiCT</h5>
          <button
            type="button"
            class="btn-close"
            @click="onDismissClicked"
          ></button>
        </div>
        <div class="modal-body">
          <div class="d-flex align-items-center" v-if="errorMessage">
            <p class="error-message">Error: {{ errorMessage }}</p>
          </div>
          <CoolerFileSelector
            v-if="!selectedCoolerFilename"
            :network-manager="networkManager"
            @selected="onCoolerFileSelected"
          />
          <ConverterStatusChecker
            v-if="converting"
            :network-manager="networkManager"
            @finished="onConverterFinished"
          ></ConverterStatusChecker>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-secondary"
            @click="onDismissClicked"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type Ref, ref, onMounted } from "vue";
import { Modal } from "bootstrap";
import type { NetworkManager } from "@/app/core/net/NetworkManager.js";
import { ConvertCoolerRequest } from "@/app/core/net/api/request";
import CoolerFileSelector from "./converter/CoolerFileSelector.vue";
import ConverterStatusChecker from "./converter/ConverterStatusChecker.vue";

const emit = defineEmits<{
  (e: "dismissed"): void;
}>();

const props = defineProps<{
  networkManager: NetworkManager;
}>();

const selectedCoolerFilename: Ref<string | null> = ref(null);
const filenames: Ref<string[] | null> = ref(null);
const converting: Ref<boolean> = ref(false);
const errorMessage: Ref<unknown | null> = ref(null);
const modal: Ref<Modal | null> = ref(null);
const convertCoolerModal = ref<HTMLElement | null>(null);

function resetState(): void {
  try {
    modal.value?.dispose();
  } catch (e: unknown) {
    // Expected
  } finally {
    modal.value = null;
    errorMessage.value = null;
    converting.value = false;
    filenames.value = null;
    selectedCoolerFilename.value = null;
  }
}

function onDismissClicked(): void {
  resetState();
  emit("dismissed");
}

function onCoolerFileSelected(coolerFilename: string): void {
  selectedCoolerFilename.value = coolerFilename;
  convertCooler();
}

function convertCooler(): void {
  const filename = selectedCoolerFilename.value;
  if (filename) {
    props.networkManager.requestManager
      .convertCooler(
        new ConvertCoolerRequest({
          cooler_filename: filename,
        })
      )
      .catch((e) => {
        errorMessage.value = e;
      })
      .finally(() => {
        converting.value = false;
      });

    converting.value = true;
  }
}

onMounted(() => {
  const fns = filenames.value;
  if (fns) {
    fns.length = 0;
  }
  converting.value = false;
  modal.value = new Modal(convertCoolerModal.value ?? "loadAGPModal", {
    backdrop: "static",
    keyboard: false,
  });
  modal.value.show();
});

function onConverterFinished(): void {
  converting.value = false;
  selectedCoolerFilename.value = null;
}
</script>

<style scoped>
.error-message {
  color: red;
}
</style>
