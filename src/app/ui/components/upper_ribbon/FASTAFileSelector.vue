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
    id="openFASTAModal"
    ref="openFASTAModal"
    tabindex="-1"
    data-keyboard="false"
    data-backdrop="static"
  >
    <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Select FASTA file</h5>
          <button
            type="button"
            class="btn-close"
            @click="onDismissClicked"
          ></button>
        </div>
        <div class="modal-body">
          <div class="d-flex align-items-center" v-if="errorMessage">
            Error: {{ errorMessage }}
          </div>
          <div class="d-flex align-items-center" v-if="loading">
            <strong>Loading...</strong>
            <div class="spinner-border ms-auto" role="status"></div>
          </div>
          <div v-if="!loading">
            <FileSelectionTable
              v-model:selected-path="selectedFASTAFilename"
              :entries="fileEntries"
              empty-message="No FASTA files found"
              scroll-height="45vh"
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
              Link FASTA
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
import { LinkFASTARequest } from "@/app/core/net/api/request";
import FileSelectionTable from "@/app/ui/components/common/FileSelectionTable.vue";
import type { FileSelectionTableEntry } from "@/app/ui/components/common/FileSelectionTableTypes";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";

const emit = defineEmits<{
  (e: "selected", fastaFilename: string): void;
  (e: "dismissed"): void;
}>();

const props = defineProps<{
  networkManager: NetworkManager;
}>();

const selectedFASTAFilename: Ref<string | null> = ref(null);
const filenames: Ref<string[] | null> = ref(null);
const loading: Ref<boolean> = ref(true);
const errorMessage: Ref<unknown | null> = ref(null);
const modal: Ref<Modal | null> = ref(null);

const openFASTAModal = ref<HTMLElement | null>(null);

useEscDismissableDialog({
  priority: 1080,
  isOpen: () => true,
  requestClose: () => {
    onDismissClicked();
  },
});

const fileEntries = computed<FileSelectionTableEntry[]>(() =>
  (filenames.value ?? []).map((filename) => ({
    path: filename,
  }))
);

function getFASTAFilenamesList(): void {
  loading.value = true;
  props.networkManager.requestManager
    .listFASTAFiles()
    .then((lst) => {
      filenames.value = lst;
    })
    .catch((e) => {
      errorMessage.value = e;
    })
    .finally(() => {
      loading.value = false;
    });
}

function resetState(): void {
  modal.value?.dispose();
  modal.value = null;
  errorMessage.value = null;
  loading.value = false;
  filenames.value = null;
  selectedFASTAFilename.value = null;
}

function onDismissClicked(): void {
  emit("dismissed");
  resetState();
}

function onSelectClicked(): void {
  const selectedFASTAFilenameString = selectedFASTAFilename.value;
  if (!selectedFASTAFilenameString) {
    // throw new Error("Selected FASTA filename was null?");
    errorMessage.value = "Please, select valid FASTA file";
    return;
  }
  props.networkManager.requestManager
    .linkFASTA(
      new LinkFASTARequest({ fastaFilename: selectedFASTAFilenameString })
    )
    .then(() => {
      emit("selected", selectedFASTAFilenameString);
      resetState();
    })
    .catch((e) => {
      errorMessage.value = e;
    });
}

function onTableActivated(filename: string): void {
  selectedFASTAFilename.value = filename;
  onSelectClicked();
}

onMounted(() => {
  const fns = filenames.value;
  if (fns) {
    fns.length = 0;
  }
  loading.value = true;
  modal.value = new Modal(openFASTAModal.value ?? "openFASTAModal", {
    backdrop: "static",
    keyboard: false,
  });
  modal.value.show();
  getFASTAFilenamesList();
});
</script>

<style scoped></style>
