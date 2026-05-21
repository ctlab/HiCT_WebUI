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
    id="loadAGPModal"
    ref="convertCoolerModal"
    tabindex="-1"
    data-keyboard="false"
    data-backdrop="static"
  >
    <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable converter-dialog">
        <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Convert matrix files for HiCT</h5>
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
          <div class="toolchain-card" v-if="toolchainStatus || toolchainLoading">
            <div class="toolchain-header">
              <strong>.hic conversion</strong>
              <span
                class="status-pill"
                :class="hictkAvailabilityClass"
                v-if="toolchainStatus"
              >
                {{ hictkAvailabilityLabel }}
              </span>
              <span v-else>loading…</span>
            </div>
            <p class="toolchain-summary">
              .hic files are handled by
              <a href="https://github.com/paulsengroup/hictk" target="_blank" rel="noopener noreferrer">hictk</a>.
              Availability depends on whether hictk was bundled into this HiCT package or configured externally.
            </p>
            <details v-if="toolchainStatus" class="toolchain-details">
              <summary>Toolchain details</summary>
              <p>{{ toolchainStatus.summary }}</p>
              <p v-if="toolchainStatus.hictkCommand">
                <strong>hictk:</strong> {{ toolchainStatus.hictkCommand }}
              </p>
              <p v-if="toolchainStatus.source">
                <strong>source:</strong> {{ toolchainStatus.source }}
              </p>
              <p
                v-for="(limitation, index) in toolchainStatus.limitations"
                :key="'limitation-' + index"
                class="toolchain-limitation"
              >
                {{ limitation }}
              </p>
              <p
                v-for="(notice, index) in toolchainStatus.notices"
                :key="'notice-' + index"
                class="toolchain-note"
              >
                {{ notice }}
              </p>
              <p
                v-for="(citation, index) in toolchainStatus.citations"
                :key="'citation-' + index"
                class="toolchain-note"
              >
                {{ citation }}
              </p>
            </details>
          </div>
          <div v-if="mode === 'single'">
            <div v-if="!jobId" class="convert-section">
              <CoolerFileSelector
                :network-manager="networkManager"
                :initial-filename="initialCoolerFilename"
                @selected="onCoolerFileSelected"
              />
              <p v-if="selectedCoolerFilename" class="helper-text">
                Output: {{ deriveOutputFilename(selectedCoolerFilename) }}
              </p>
              <p v-if="singleBlockedMessage" class="error-message">
                {{ singleBlockedMessage }}
              </p>
              <div class="mt-3 d-flex gap-2">
                <button
                  type="button"
                  class="btn btn-primary"
                  :disabled="!canConvertSelectedFile || converting"
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
                    @click.stop="toggleSelection(file, index, $event)"
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
                <button
                  class="btn btn-primary"
                  @click="proceedBatchSettings"
                  :disabled="batchSelection.size === 0 || Boolean(batchBlockedMessage)"
                >
                  Continue
                </button>
                <button class="btn btn-secondary" @click="onDismissClicked">
                  Dismiss
                </button>
              </div>
              <p v-if="batchBlockedMessage" class="error-message mt-2">
                {{ batchBlockedMessage }}
              </p>
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
                <button
                  class="btn btn-primary"
                  @click="startBatchConversion"
                  :disabled="Boolean(batchBlockedMessage)"
                >
                  Start
                </button>
                <button class="btn btn-secondary" @click="batchStep = 'select'">
                  Back
                </button>
              </div>
              <p v-if="batchBlockedMessage" class="error-message mt-2">
                {{ batchBlockedMessage }}
              </p>
            </div>
            <div v-if="batchStep === 'progress'">
              <h6>Batch progress</h6>
              <div class="overall-status">
                <span class="status-pill" :class="overallBatchStatusClass">
                  {{ overallBatchStatusLabel }}
                </span>
              </div>
              <div class="batch-progress-list">
                <ConverterStatusChecker
                  v-for="job in batchJobIds"
                  :key="job"
                  :network-manager="networkManager"
                  :job-id="job"
                  :show-stop="true"
                  @status-update="onBatchStatusUpdate"
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
        <div v-if="overwriteConfirmVisible" class="overwrite-confirm-backdrop">
          <div class="overwrite-confirm card shadow">
            <div class="card-body">
              <h6 class="card-title mb-2">Overwrite converted output?</h6>
              <p class="card-text mb-3">{{ overwriteConfirmMessage }}</p>
              <div class="d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-outline-secondary" @click="resolveOverwriteConfirm(false)">
                  Cancel
                </button>
                <button type="button" class="btn btn-danger" @click="resolveOverwriteConfirm(true)">
                  Overwrite
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type Ref, ref, onMounted, computed } from "vue";
import { Modal } from "bootstrap";
import type { NetworkManager } from "@/app/core/net/NetworkManager.js";
import {
  StartBatchConversionJobsRequest,
  StartConversionJobRequest,
} from "@/app/core/net/api/request";
import {
  ConversionJobResponse,
  ConversionToolchainStatusResponse,
} from "@/app/core/net/api/response";
import CoolerFileSelector from "./converter/CoolerFileSelector.vue";
import ConverterStatusChecker from "./converter/ConverterStatusChecker.vue";

const emit = defineEmits<{
  (e: "dismissed"): void;
}>();

const props = defineProps<{
  networkManager: NetworkManager;
  initialCoolerFilename?: string;
}>();

const selectedCoolerFilename: Ref<string | null> = ref(null);
const converting: Ref<boolean> = ref(false);
const errorMessage: Ref<unknown | null> = ref(null);
const modal: Ref<Modal | null> = ref(null);
const convertCoolerModal = ref<HTMLElement | null>(null);
const jobId: Ref<string | null> = ref(null);
const jobs: Ref<ConversionJobResponse[]> = ref([]);
const mode: Ref<"single" | "batch"> = ref("batch");
const batchStep: Ref<"select" | "settings" | "progress"> = ref("select");
const batchFiles: Ref<string[]> = ref([]);
const batchSelection: Ref<Set<string>> = ref(new Set<string>());
const batchParallelJobs: Ref<number> = ref(2);
const batchParallelism: Ref<number> = ref(4);
const batchJobIds: Ref<string[]> = ref([]);
const batchStatusMap: Ref<Map<string, string>> = ref(new Map());
const batchProgressMap: Ref<Map<string, number>> = ref(new Map());
const allFiles: Ref<Set<string>> = ref(new Set<string>());
const lastSelectedIndex: Ref<number | null> = ref(null);
const overwriteConfirmVisible: Ref<boolean> = ref(false);
const overwriteConfirmMessage: Ref<string> = ref("");
const toolchainStatus: Ref<ConversionToolchainStatusResponse | null> = ref(null);
const toolchainLoading: Ref<boolean> = ref(true);
let overwriteConfirmResolver: ((approved: boolean) => void) | null = null;

function cancelPendingOverwriteConfirm(): void {
  overwriteConfirmVisible.value = false;
  overwriteConfirmMessage.value = "";
  if (overwriteConfirmResolver) {
    overwriteConfirmResolver(false);
    overwriteConfirmResolver = null;
  }
}

function askOverwriteConfirmation(message: string): Promise<boolean> {
  cancelPendingOverwriteConfirm();
  overwriteConfirmMessage.value = message;
  overwriteConfirmVisible.value = true;
  return new Promise((resolve) => {
    overwriteConfirmResolver = resolve;
  });
}

function resolveOverwriteConfirm(approved: boolean): void {
  overwriteConfirmVisible.value = false;
  overwriteConfirmMessage.value = "";
  if (overwriteConfirmResolver) {
    overwriteConfirmResolver(approved);
    overwriteConfirmResolver = null;
  }
}

function resetState(): void {
  cancelPendingOverwriteConfirm();
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
    mode.value = "batch";
    batchStep.value = "select";
    batchFiles.value = [];
    batchSelection.value = new Set<string>();
    batchJobIds.value = [];
    batchStatusMap.value.clear();
    batchProgressMap.value.clear();
    allFiles.value = new Set<string>();
    lastSelectedIndex.value = null;
    toolchainStatus.value = null;
    toolchainLoading.value = true;
  }
}

function onDismissClicked(): void {
  resetState();
  emit("dismissed");
}

function onCoolerFileSelected(coolerFilename: string): void {
  selectedCoolerFilename.value = coolerFilename;
}

function requiresHicToolchain(filename: string | null | undefined): boolean {
  return filename?.toLowerCase().endsWith(".hic") ?? false;
}

function deriveDirection(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".hic")) {
    return "hic-to-hict";
  }
  if (lower.endsWith(".hict") || lower.endsWith(".hict.hdf5")) {
    return "hict-to-mcool";
  }
  return "mcool-to-hict";
}

async function convertCooler(): Promise<void> {
  const filename = selectedCoolerFilename.value;
  if (!filename) {
    return;
  }
  const overwriteExisting = isConverted(filename);
  if (overwriteExisting) {
    const output = deriveOutputFilename(filename);
    const approved = await askOverwriteConfirmation(
      `Converted file already exists (${output}). Overwrite it with a new conversion?`
    );
    if (!approved) {
      return;
    }
  }
  converting.value = true;
  props.networkManager.requestManager
    .startConversionJob(
      new StartConversionJobRequest({
        filename: filename,
        direction: deriveDirection(filename),
        overwrite: overwriteExisting,
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
}

onMounted(() => {
  converting.value = false;
  if (props.initialCoolerFilename && props.initialCoolerFilename.trim().length > 0) {
    selectedCoolerFilename.value = props.initialCoolerFilename;
  }
  mode.value = "batch";
  batchStep.value = "select";
  loadToolchainStatus();
  loadBatchFiles();
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
    props.networkManager.requestManager.listConvertibleMatrices(),
    props.networkManager.requestManager.listFiles(),
  ])
    .then(([coolers, files]) => {
      batchFiles.value = coolers;
      allFiles.value = new Set(files);
      if (
        props.initialCoolerFilename &&
        coolers.includes(props.initialCoolerFilename)
      ) {
        batchSelection.value = new Set<string>([props.initialCoolerFilename]);
      } else {
        batchSelection.value = new Set<string>();
      }
    })
    .catch((e) => {
      errorMessage.value = e;
    });
}

function loadToolchainStatus(): void {
  toolchainLoading.value = true;
  props.networkManager.requestManager
    .getConversionToolchainStatus()
    .then((status) => {
      toolchainStatus.value = status;
    })
    .catch((e) => {
      errorMessage.value = e;
      toolchainStatus.value = null;
    })
    .finally(() => {
      toolchainLoading.value = false;
    });
}

function isConverted(file: string): boolean {
  const output = deriveOutputFilename(file);
  return allFiles.value.has(output);
}

function deriveOutputFilename(file: string): string {
  const lower = file.toLowerCase();
  if (lower.endsWith(".hic")) {
    return file.slice(0, -".hic".length) + ".hict.hdf5";
  }
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

async function startBatchConversion(): Promise<void> {
  const files = Array.from(batchSelection.value);
  const alreadyConverted = files.filter((file) => isConverted(file));
  const overwriteExisting = alreadyConverted.length > 0;
  if (overwriteExisting) {
    const approved = await askOverwriteConfirmation(
      `${alreadyConverted.length} selected file(s) already have converted outputs. Overwrite existing outputs?`
    );
    if (!approved) {
      return;
    }
  }
  batchStatusMap.value.clear();
  batchProgressMap.value.clear();
  props.networkManager.requestManager
    .startBatchConversionJobs(
      new StartBatchConversionJobsRequest({
        files,
        parallelJobs: batchParallelJobs.value,
        parallelism: batchParallelism.value,
        overwrite: overwriteExisting,
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

function onBatchStatusUpdate(payload: {
  jobId: string;
  status: string;
  overallProgress: number;
}): void {
  batchStatusMap.value.set(payload.jobId, payload.status);
  batchProgressMap.value.set(payload.jobId, payload.overallProgress);
}

const overallBatchStatusLabel = computed(() => {
  const statuses = Array.from(batchStatusMap.value.values());
  if (!statuses.length) return "Running";
  if (statuses.some((s) => s === "failed")) return "Failed";
  if (statuses.some((s) => s === "cancelled")) return "Cancelled";
  if (statuses.every((s) => s === "finished")) return "Finished";
  if (statuses.some((s) => s === "running")) return "Running";
  if (statuses.some((s) => s === "queued")) return "Queued";
  return "Running";
});

const overallBatchStatusClass = computed(() => {
  switch (overallBatchStatusLabel.value) {
    case "Finished":
      return "finished";
    case "Failed":
      return "failed";
    case "Cancelled":
      return "cancelled";
    case "Queued":
      return "queued";
    default:
      return "running";
  }
});

const selectedRequiresHicToolchain = computed(() =>
  requiresHicToolchain(selectedCoolerFilename.value)
);

const canConvertSelectedFile = computed(() => {
  if (!selectedCoolerFilename.value) {
    return false;
  }
  if (!selectedRequiresHicToolchain.value) {
    return true;
  }
  return toolchainStatus.value?.hicConversionAvailable === true;
});

const singleBlockedMessage = computed(() => {
  if (!selectedRequiresHicToolchain.value) {
    return "";
  }
  if (toolchainLoading.value) {
    return "Inspecting .hic conversion toolchain...";
  }
  if (toolchainStatus.value?.hicConversionAvailable) {
    return "";
  }
  return (
    toolchainStatus.value?.summary ??
    "No external .hic conversion toolchain is available in this build."
  );
});

const batchBlockedMessage = computed(() => {
  const hasHicSelection = Array.from(batchSelection.value).some((file) =>
    requiresHicToolchain(file)
  );
  if (!hasHicSelection) {
    return "";
  }
  if (toolchainLoading.value) {
    return "Inspecting .hic conversion toolchain...";
  }
  if (toolchainStatus.value?.hicConversionAvailable) {
    return "";
  }
  return (
    toolchainStatus.value?.summary ??
    "No external .hic conversion toolchain is available in this build."
  );
});

const hictkAvailabilityLabel = computed(() =>
  toolchainStatus.value?.hicConversionAvailable ? "hictk available" : "hictk unavailable"
);

const hictkAvailabilityClass = computed(() =>
  toolchainStatus.value?.hicConversionAvailable ? "finished" : "failed"
);
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
  max-height: 180px;
  overflow: auto;
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
.toolchain-card {
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: var(--hict-surface-bg-muted, #f8fafc);
  color: var(--hict-surface-fg, #111827);
}
.toolchain-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.toolchain-summary {
  margin-bottom: 6px;
}
.toolchain-details {
  margin-top: 6px;
}
.toolchain-details summary {
  cursor: pointer;
  color: #2563eb;
  font-weight: 600;
}
.toolchain-note {
  margin-bottom: 4px;
  color: var(--hict-surface-muted, #374151);
}
.toolchain-limitation {
  margin-bottom: 4px;
  color: #991b1b;
}
.helper-text {
  margin-top: 8px;
  margin-bottom: 0;
  color: var(--hict-surface-muted, #4b5563);
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
  max-height: 360px;
  overflow: auto;
  padding-right: 6px;
}

.overall-status {
  margin-bottom: 8px;
}

.status-pill.finished {
  background: #d1fae5;
  color: #065f46;
}
.status-pill.running {
  background: #bfdbfe;
  color: #1e3a8a;
}
.status-pill.queued {
  background: #fef3c7;
  color: #92400e;
}
.status-pill.failed {
  background: #fee2e2;
  color: #991b1b;
}
.status-pill.cancelled {
  background: #e5e7eb;
  color: #374151;
}

.modal-content {
  position: relative;
}

.converter-dialog .modal-content {
  max-height: min(92vh, 980px);
}

.overwrite-confirm-backdrop {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(17, 24, 39, 0.45);
}

.overwrite-confirm {
  width: min(460px, calc(100% - 32px));
  border: 1px solid #d1d5db;
}
</style>
