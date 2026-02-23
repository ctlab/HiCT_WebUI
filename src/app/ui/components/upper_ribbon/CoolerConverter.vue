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
          <div class="mode-tabs">
            <button
              type="button"
              class="btn"
              :class="mode === 'single' ? 'btn-primary' : 'btn-outline-primary'"
              @click="mode = 'single'"
            >
              Single
            </button>
            <button
              type="button"
              class="btn"
              :class="mode === 'batch' ? 'btn-primary' : 'btn-outline-primary'"
              @click="switchToBatch"
            >
              Batch
            </button>
          </div>
          <div class="d-flex align-items-center" v-if="errorMessage">
            <p class="error-message">Error: {{ errorMessage }}</p>
          </div>
          <div v-if="mode === 'single'">
            <div v-if="!jobId" class="convert-section">
              <CoolerFileSelector
                :network-manager="networkManager"
                @selected="onCoolerFileSelected"
              />
              <div class="mt-3 d-flex gap-2">
                <button
                  type="button"
                  class="btn btn-primary"
                  :disabled="!selectedCoolerFilename || converting"
                  @click="convertCooler"
                >
                  Convert
                </button>
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  @click="refreshJobs"
                >
                  View current conversion jobs
                </button>
              </div>
            </div>
            <ConverterStatusChecker
              v-if="jobId"
              :network-manager="networkManager"
              :job-id="jobId"
            ></ConverterStatusChecker>
            <div v-if="jobs.length && !jobId" class="mt-3">
              <h6>Running jobs</h6>
              <ul class="job-list">
                <li v-for="job in jobs" :key="job.jobId">
                  <span>{{ job.sourceFilename }} → {{ job.outputFilename }}</span>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-primary"
                    @click="openJob(job.jobId)"
                  >
                    Open
                  </button>
                </li>
              </ul>
            </div>
          </div>
          <div v-if="mode === 'batch'">
            <div v-if="batchStep === 'select'">
              <div class="batch-actions">
                <button class="btn btn-sm btn-outline-primary" @click="selectAll">
                  Select All
                </button>
                <button class="btn btn-sm btn-outline-secondary" @click="selectNone">
                  Select None
                </button>
                <button class="btn btn-sm btn-outline-secondary" @click="invertSelection">
                  Invert Selection
                </button>
                <button class="btn btn-sm btn-outline-success" @click="selectAllConverted">
                  Select All Converted
                </button>
                <button class="btn btn-sm btn-outline-success" @click="selectAllUnconverted">
                  Select All Unconverted
                </button>
              </div>
              <div class="batch-table">
                <div class="batch-row batch-header">
                  <span></span>
                  <span>File</span>
                  <span>Status</span>
                </div>
                <div
                  v-for="(file, index) in batchFiles"
                  :key="file"
                  class="batch-row"
                  @click="toggleSelection(file, index, $event)"
                >
                  <input
                    type="checkbox"
                    :checked="batchSelection.has(file)"
                    @change="toggleSelection(file, index, $event)"
                  />
                  <span>{{ file }}</span>
                  <span
                    class="status-pill"
                    :class="isConverted(file) ? 'converted' : 'unconverted'"
                  >
                    {{ isConverted(file) ? "Converted" : "Unconverted" }}
                  </span>
                </div>
              </div>
              <div class="mt-3 d-flex gap-2">
                <button class="btn btn-primary" @click="proceedBatchSettings" :disabled="batchSelection.size === 0">
                  Continue
                </button>
                <button class="btn btn-secondary" @click="onDismissClicked">
                  Dismiss
                </button>
              </div>
            </div>
            <div v-if="batchStep === 'settings'">
              <div class="mb-3">
                <label class="form-label">Parallel jobs</label>
                <input type="number" class="form-control" v-model.number="batchParallelJobs" min="1" />
              </div>
              <div class="mb-3">
                <label class="form-label">Parallelism per file</label>
                <input type="number" class="form-control" v-model.number="batchParallelism" min="1" />
              </div>
              <div class="mt-3 d-flex gap-2">
                <button class="btn btn-primary" @click="startBatchConversion">
                  Start
                </button>
                <button class="btn btn-secondary" @click="batchStep = 'select'">
                  Back
                </button>
              </div>
            </div>
            <div v-if="batchStep === 'progress'">
              <h6>Batch progress</h6>
              <div class="batch-progress-list">
                <ConverterStatusChecker
                  v-for="job in batchJobIds"
                  :key="job"
                  :network-manager="networkManager"
                  :job-id="job"
                  :show-stop="true"
                />
              </div>
            </div>
          </div>
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
import {
  StartBatchConversionJobsRequest,
  StartConversionJobRequest,
} from "@/app/core/net/api/request";
import { ConversionJobResponse } from "@/app/core/net/api/response";
import CoolerFileSelector from "./converter/CoolerFileSelector.vue";
import ConverterStatusChecker from "./converter/ConverterStatusChecker.vue";

const emit = defineEmits<{
  (e: "dismissed"): void;
}>();

const props = defineProps<{
  networkManager: NetworkManager;
}>();

const selectedCoolerFilename: Ref<string | null> = ref(null);
const converting: Ref<boolean> = ref(false);
const errorMessage: Ref<unknown | null> = ref(null);
const modal: Ref<Modal | null> = ref(null);
const convertCoolerModal = ref<HTMLElement | null>(null);
const jobId: Ref<string | null> = ref(null);
const jobs: Ref<ConversionJobResponse[]> = ref([]);
const mode: Ref<"single" | "batch"> = ref("single");
const batchStep: Ref<"select" | "settings" | "progress"> = ref("select");
const batchFiles: Ref<string[]> = ref([]);
const batchSelection: Ref<Set<string>> = ref(new Set<string>());
const batchParallelJobs: Ref<number> = ref(2);
const batchParallelism: Ref<number> = ref(4);
const batchJobIds: Ref<string[]> = ref([]);
const allFiles: Ref<Set<string>> = ref(new Set<string>());
const lastSelectedIndex: Ref<number | null> = ref(null);

function resetState(): void {
  try {
    modal.value?.dispose();
  } catch (e: unknown) {
    // Expected
  } finally {
    modal.value = null;
    errorMessage.value = null;
    converting.value = false;
    selectedCoolerFilename.value = null;
    jobId.value = null;
    jobs.value = [];
    mode.value = "single";
    batchStep.value = "select";
    batchFiles.value = [];
    batchSelection.value = new Set<string>();
    batchJobIds.value = [];
    allFiles.value = new Set<string>();
    lastSelectedIndex.value = null;
  }
}

function onDismissClicked(): void {
  resetState();
  emit("dismissed");
}

function onCoolerFileSelected(coolerFilename: string): void {
  selectedCoolerFilename.value = coolerFilename;
}

function convertCooler(): void {
  const filename = selectedCoolerFilename.value;
  if (filename) {
    props.networkManager.requestManager
      .startConversionJob(
        new StartConversionJobRequest({
          filename: filename,
          direction: "mcool-to-hict",
        })
      )
      .then((resp) => {
        jobId.value = resp.jobId;
      })
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
  converting.value = false;
  modal.value = new Modal(convertCoolerModal.value ?? "loadAGPModal", {
    backdrop: "static",
    keyboard: false,
  });
  modal.value.show();
});

function openJob(id: string): void {
  jobId.value = id;
}

function refreshJobs(): void {
  props.networkManager.requestManager
    .listConversionJobs()
    .then((items) => {
      jobs.value = items.filter(
        (job) => job.status === "running" || job.status === "queued"
      );
    })
    .catch((e) => {
      errorMessage.value = e;
    });
}

function switchToBatch(): void {
  mode.value = "batch";
  batchStep.value = "select";
  loadBatchFiles();
}

function loadBatchFiles(): void {
  Promise.all([
    props.networkManager.requestManager.listCoolers(),
    props.networkManager.requestManager.listFiles(),
  ])
    .then(([coolers, files]) => {
      batchFiles.value = coolers;
      allFiles.value = new Set(files);
      batchSelection.value = new Set<string>();
    })
    .catch((e) => {
      errorMessage.value = e;
    });
}

function isConverted(file: string): boolean {
  const output = deriveOutputFilename(file);
  return allFiles.value.has(output);
}

function deriveOutputFilename(file: string): string {
  const lower = file.toLowerCase();
  if (lower.endsWith(".mcool")) {
    return file.slice(0, -".mcool".length) + ".hict.hdf5";
  }
  if (lower.endsWith(".cool")) {
    return file.slice(0, -".cool".length) + ".hict.hdf5";
  }
  return file + ".hict.hdf5";
}

function toggleSelection(file: string, index: number, event: Event): void {
  const isShift = (event as MouseEvent).shiftKey;
  if (isShift && lastSelectedIndex.value !== null) {
    const start = Math.min(lastSelectedIndex.value, index);
    const end = Math.max(lastSelectedIndex.value, index);
    const shouldSelect = !batchSelection.value.has(file);
    for (let i = start; i <= end; i++) {
      const name = batchFiles.value[i];
      if (shouldSelect) {
        batchSelection.value.add(name);
      } else {
        batchSelection.value.delete(name);
      }
    }
  } else {
    if (batchSelection.value.has(file)) {
      batchSelection.value.delete(file);
    } else {
      batchSelection.value.add(file);
    }
  }
  lastSelectedIndex.value = index;
}

function selectAll(): void {
  batchSelection.value = new Set(batchFiles.value);
}

function selectNone(): void {
  batchSelection.value = new Set<string>();
}

function invertSelection(): void {
  const next = new Set<string>();
  batchFiles.value.forEach((file) => {
    if (!batchSelection.value.has(file)) {
      next.add(file);
    }
  });
  batchSelection.value = next;
}

function selectAllConverted(): void {
  const next = new Set<string>();
  batchFiles.value.forEach((file) => {
    if (isConverted(file)) {
      next.add(file);
    }
  });
  batchSelection.value = next;
}

function selectAllUnconverted(): void {
  const next = new Set<string>();
  batchFiles.value.forEach((file) => {
    if (!isConverted(file)) {
      next.add(file);
    }
  });
  batchSelection.value = next;
}

function proceedBatchSettings(): void {
  batchStep.value = "settings";
}

function startBatchConversion(): void {
  const files = Array.from(batchSelection.value);
  props.networkManager.requestManager
    .startBatchConversionJobs(
      new StartBatchConversionJobsRequest({
        files,
        parallelJobs: batchParallelJobs.value,
        parallelism: batchParallelism.value,
      })
    )
    .then((resp) => {
      batchJobIds.value = resp.jobIds;
      batchStep.value = "progress";
    })
    .catch((e) => {
      errorMessage.value = e;
    });
}
</script>

<style scoped>
.error-message {
  color: red;
}
.job-list {
  list-style: none;
  padding-left: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.job-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}
.mode-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.batch-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.batch-table {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 280px;
  overflow: auto;
  border: 1px solid #e5e7eb;
  padding: 8px;
  border-radius: 6px;
}
.batch-row {
  display: grid;
  grid-template-columns: 24px 1fr 120px;
  gap: 8px;
  align-items: center;
}
.batch-header {
  font-weight: 600;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 4px;
  margin-bottom: 4px;
}
.status-pill {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  text-align: center;
}
.status-pill.converted {
  background: #d1fae5;
  color: #065f46;
}
.status-pill.unconverted {
  background: #fef3c7;
  color: #92400e;
}
.batch-progress-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
