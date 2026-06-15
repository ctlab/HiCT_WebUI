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
  <div class="modal-backdrop fade show"></div>
  <div class="modal fade show export-matrix-shell" tabindex="-1" role="dialog">
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Export matrix to .mcool</h5>
          <button type="button" class="btn-close" @click="emit('dismissed')"></button>
        </div>
        <div class="modal-body">
          <div v-if="errorMessage" class="alert alert-danger py-2">
            {{ errorMessage }}
          </div>

          <div class="mb-3">
            <label class="form-label">Source .hict.hdf5 matrix</label>
            <div class="input-group">
              <input
                class="form-control"
                type="text"
                readonly
                :value="sourceFilename || 'Select .hict.hdf5 matrix'"
              />
              <button class="btn btn-outline-secondary" type="button" @click="selectorKind = 'source'">
                Browse...
              </button>
            </div>
          </div>

          <div class="mb-3">
            <div class="form-check form-switch">
              <input
                id="export-current-assembly"
                v-model="useCurrentAssembly"
                class="form-check-input"
                type="checkbox"
                role="switch"
              />
              <label class="form-check-label" for="export-current-assembly">
                Use current state of assembly for export
              </label>
            </div>
            <small class="text-muted">
              Turn this off to export the matrix exactly as saved, or to apply a custom AGP file.
            </small>
          </div>

          <div v-if="!useCurrentAssembly" class="mb-3">
            <label class="form-label">Custom assembly AGP</label>
            <div class="input-group">
              <input
                class="form-control"
                type="text"
                readonly
                :value="customAgpFilename || 'No AGP selected; export saved matrix layout'"
              />
              <button class="btn btn-outline-secondary" type="button" @click="selectorKind = 'agp'">
                Browse...
              </button>
              <button
                class="btn btn-outline-danger"
                type="button"
                :disabled="!customAgpFilename"
                @click="customAgpFilename = ''"
              >
                Clear
              </button>
            </div>
          </div>

          <div class="row g-2 mb-3">
            <div class="col-md-4">
              <label class="form-label">Compression</label>
              <select v-model="compressionAlgorithm" class="form-select">
                <option value="deflate">deflate</option>
                <option value="zstd">zstd</option>
                <option value="lzf">lzf</option>
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label">Level</label>
              <input v-model.number="compression" class="form-control" type="number" min="0" max="9" />
            </div>
            <div class="col-md-4">
              <label class="form-label">Threads</label>
              <input v-model.number="parallelism" class="form-control" type="number" min="1" />
            </div>
          </div>

          <div class="form-check mb-3">
            <input
              id="export-overwrite"
              v-model="overwrite"
              class="form-check-input"
              type="checkbox"
            />
            <label class="form-check-label" for="export-overwrite">
              Overwrite existing .mcool next to source
            </label>
          </div>

          <ConverterStatusChecker
            v-if="jobId"
            :network-manager="props.networkManager"
            :job-id="jobId"
          />
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" type="button" @click="emit('dismissed')">
            Dismiss
          </button>
          <button
            class="btn btn-primary"
            type="button"
            :disabled="submitting || !sourceFilename"
            @click="startExport"
          >
            <span v-if="submitting" class="spinner-border spinner-border-sm me-2"></span>
            Export .mcool
          </button>
        </div>
      </div>
    </div>
  </div>

  <UniversalFileSelector
    v-if="selectorKind"
    :network-manager="props.networkManager"
    :title="selectorKind === 'source' ? 'Select source .hict.hdf5' : 'Select custom AGP'"
    :file-type="selectorKind === 'source' ? '.hict.hdf5' : '.agp'"
    :file-name-predicate="selectorKind === 'source' ? isHictFilename : isAgpFilename"
    @selected="onFileSelected"
    @dismissed="selectorKind = null"
  />
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { NetworkManager } from "@/app/core/net/NetworkManager";
import { StartConversionJobRequest } from "@/app/core/net/api/request";
import UniversalFileSelector from "@/app/ui/components/upper_ribbon/UniversalFileSelector.vue";
import ConverterStatusChecker from "@/app/ui/components/upper_ribbon/converter/ConverterStatusChecker.vue";

const emit = defineEmits<{
  (e: "dismissed"): void;
}>();

const props = defineProps<{
  networkManager: NetworkManager;
  initialSourceFilename?: string;
}>();

const sourceFilename = ref(props.initialSourceFilename ?? "");
const customAgpFilename = ref("");
const useCurrentAssembly = ref(true);
const overwrite = ref(false);
const compressionAlgorithm = ref("deflate");
const compression = ref(6);
const parallelism = ref(Math.max(1, navigator.hardwareConcurrency || 1));
const selectorKind = ref<"source" | "agp" | null>(null);
const submitting = ref(false);
const errorMessage = ref("");
const jobId = ref("");

watch(
  () => props.initialSourceFilename,
  (filename) => {
    if (!sourceFilename.value && filename) {
      sourceFilename.value = filename;
    }
  }
);

function isHictFilename(filename: string): boolean {
  return filename.toLowerCase().endsWith(".hict.hdf5");
}

function isAgpFilename(filename: string): boolean {
  return filename.toLowerCase().endsWith(".agp");
}

function onFileSelected(filename: string): void {
  if (selectorKind.value === "source") {
    sourceFilename.value = filename;
  } else if (selectorKind.value === "agp") {
    customAgpFilename.value = filename;
  }
  selectorKind.value = null;
}

async function startExport(): Promise<void> {
  if (!sourceFilename.value) {
    errorMessage.value = "Select a .hict.hdf5 source matrix first.";
    return;
  }
  submitting.value = true;
  errorMessage.value = "";
  jobId.value = "";
  try {
    const response = await props.networkManager.requestManager.startConversionJob(
      new StartConversionJobRequest({
        filename: sourceFilename.value,
        direction: "hict-to-mcool",
        useCurrentAssembly: useCurrentAssembly.value,
        assemblyFilename: useCurrentAssembly.value ? undefined : customAgpFilename.value || undefined,
        overwrite: overwrite.value,
        compression: compression.value,
        compressionAlgorithm: compressionAlgorithm.value,
        parallelism: parallelism.value,
      })
    );
    jobId.value = response.jobId;
  } catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.export-matrix-shell {
  display: block;
  z-index: 1055;
}

.modal-backdrop {
  z-index: 1050;
}
</style>
