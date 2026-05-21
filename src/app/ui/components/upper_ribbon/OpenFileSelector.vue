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
    class="modal fade in"
    id="openFileModal"
    ref="openFileModal"
    tabindex="-1"
    data-keyboard="false"
    data-backdrop="static"
  >
    <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Select file to be opened</h5>
          <button
            type="button"
            class="btn-close"
            @click="onDismissClicked"
          ></button>
        </div>
        <div class="modal-body">
          <div class="d-flex align-items-center" v-if="loading">
            <strong>Loading...</strong>
            <div class="spinner-border ms-auto" role="status"></div>
          </div>
          <div class="d-flex align-items-center" v-if="errorMessage">
            Error: {{ errorMessage }}
          </div>
          <div v-if="!loading">
            <FileSelectionTable
              v-model:selected-path="selected_filename"
              :entries="fileEntries"
              empty-message="No files found"
              scroll-height="50vh"
              :show-size="false"
              :show-modified="false"
              @activate="onTableActivated"
            />
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-secondary"
              @click="onDismissClicked"
            >
              Dismiss
            </button>
            <button
              type="button"
              class="btn btn-primary"
              @click="onSelectClicked"
            >
              Open
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type Ref, computed, ref, onMounted } from "vue";
import { Modal } from "bootstrap";
import type { NetworkManager } from "@/app/core/net/NetworkManager.js";
import { toast } from "vue-sonner";
import FileSelectionTable from "@/app/ui/components/common/FileSelectionTable.vue";
import type { FileSelectionTableEntry } from "@/app/ui/components/common/FileSelectionTableTypes";

const emit = defineEmits<{
  (e: "selected", filename: string): void;
  (e: "dismissed"): void;
}>();

const props = defineProps<{
  networkManager: NetworkManager;
}>();

const selected_filename: Ref<string> = ref("");
const filenames: Ref<string[]> = ref([]);
const loading: Ref<boolean> = ref(true);
const modal: Ref<Modal | null> = ref(null);
const openFileModal = ref<HTMLElement | null>(null);
const errorMessage: Ref<unknown | null> = ref(null);

const fileEntries = computed<FileSelectionTableEntry[]>(() =>
  filenames.value.map((filename) => ({
    path: filename,
  }))
);

function resetState(): void {
  try {
    modal.value?.dispose();
  } catch (e: unknown) {
    // Expected
  } finally {
    modal.value = null;
    loading.value = false;
    filenames.value.length = 0;
    selected_filename.value = "";
  }
}

function onDismissClicked(): void {
  resetState();
  emit("dismissed");
}

function onSelectClicked(): void {
  const selectedFilename = selected_filename.value;
  if (!selectedFilename) {
    onDismissClicked();
    throw new Error("Selected filename was null?");
  }
  emit("selected", selectedFilename);
  resetState();
}

function onTableActivated(filename: string): void {
  selected_filename.value = filename;
  onSelectClicked();
}

onMounted(() => {
  filenames.value.length = 0;
  loading.value = true;
  modal.value = new Modal(openFileModal.value ?? "openFileModal", {
    backdrop: "static",
    keyboard: false,
  });
  modal.value.show();
  props.networkManager.requestManager
    .listFiles()
    .then((lst) => {
      filenames.value = lst;
    })
    .catch((e) => {
      toast.error(e);
      errorMessage.value = e;
    })
    .finally(() => {
      loading.value = false;
    });
});
</script>

<style scoped></style>
