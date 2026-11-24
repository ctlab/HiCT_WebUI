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
  <div
    class="modal fade show converter-shell"
    id="loadAGPModal"
    ref="convertCoolerModal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="matrix-converter-title"
    tabindex="-1"
  >
    <div
      class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable converter-dialog"
    >
      <div class="modal-content">
        <div class="modal-header">
          <h5 id="matrix-converter-title" class="modal-title">
            Convert matrices for HiCT
          </h5>
          <button
            type="button"
            class="btn-close"
            aria-label="Close dialog"
            @click="onDismissClicked"
          ></button>
        </div>
        <div class="modal-body">
          <div class="d-flex align-items-center" v-if="errorMessage">
            <p class="error-message">Error: {{ errorMessage }}</p>
          </div>
          <div>
            <div v-if="batchStep === 'select'">
              <div class="d-flex align-items-center gap-2 mb-2">
                <nav
                  class="d-flex align-items-center flex-wrap gap-1"
                  aria-label="Conversion folders"
                >
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary"
                    :disabled="filesLoading"
                    @click="loadBatchFiles('')"
                  >
                    Data folder
                  </button>
                  <template v-for="folder in folderTrail" :key="folder.path">
                    <span aria-hidden="true">/</span>
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-secondary"
                      :disabled="filesLoading"
                      @click="loadBatchFiles(folder.path)"
                    >
                      {{ folder.name }}
                    </button>
                  </template>
                  <span v-if="recursiveList">/ All folders</span>
                  <button
                    v-else
                    type="button"
                    class="btn btn-sm btn-outline-secondary"
                    :disabled="filesLoading"
                    @click="loadBatchFiles('', true)"
                  >
                    All folders
                  </button>
                </nav>
                <span v-if="filesLoading" role="status">Loading files…</span>
                <span v-if="batchSelection.size"
                  >{{ batchSelection.size }} selected</span
                >
              </div>
              <div class="dropdown mb-2">
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary dropdown-toggle"
                  data-bs-toggle="dropdown"
                >
                  Select
                </button>
                <ul class="dropdown-menu">
                  <li>
                    <button
                      type="button"
                      class="dropdown-item"
                      @click="selectAll"
                    >
                      All
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      class="dropdown-item"
                      @click="selectNone"
                    >
                      None
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      class="dropdown-item"
                      @click="invertSelection"
                    >
                      Invert
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      class="dropdown-item"
                      @click="selectConvertedStatus(false)"
                    >
                      All not converted
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      class="dropdown-item"
                      @click="selectConvertedStatus(true)"
                    >
                      All converted
                    </button>
                  </li>
                </ul>
              </div>
              <FileSelectionTable
                v-if="!filesLoading"
                :entries="batchFileEntries"
                :multi-select="true"
                :selected-path="null"
                :selected-paths="batchSelectedPaths"
                :show-modified="false"
                :show-size="false"
                :show-status="true"
                :status-class="batchFileStatusClass"
                :status-label="batchFileStatusLabel"
                empty-message="No convertible matrix files found"
                scroll-height="44vh"
                @activate="onBatchEntryActivated"
                @update:selected-paths="onBatchSelectionUpdated"
              />
              <div v-if="showPairsBinSize" class="mt-3">
                <label for="converter-bin-size" class="form-label"
                  >Bin size for .pairs files</label
                >
                <input
                  id="converter-bin-size"
                  type="number"
                  class="form-control"
                  v-model.number="batchBinSize"
                  placeholder="1,000 bp"
                  min="1"
                  step="1"
                />
              </div>
              <AdvancedSection dialog-id="convert-matrices" class="mt-3">
                <div class="mb-3">
                  <label class="form-label"
                    >Optional .assembly for selected .hic files</label
                  >
                  <div class="input-group">
                    <input
                      class="form-control"
                      type="text"
                      readonly
                      :value="batchAssemblyFilename || 'No .assembly selected'"
                    />
                    <button
                      class="btn btn-outline-secondary"
                      @click="assemblySelectorOpen = true"
                    >
                      Browse…
                    </button>
                    <button
                      class="btn btn-outline-danger"
                      :disabled="!batchAssemblyFilename"
                      @click="batchAssemblyFilename = ''"
                    >
                      Clear
                    </button>
                  </div>
                  <small class="text-muted">
                    The assembly file is passed only to .hic conversions. Leave
                    empty to keep the sealed single-contig conversion layout.
                  </small>
                </div>
                <div class="mb-3">
                  <label class="form-label">Optional BED3+ bin table</label>
                  <div class="input-group">
                    <input
                      class="form-control"
                      type="text"
                      readonly
                      :value="
                        batchBinTableFilename ||
                        'Auto-detect same-stem .bed when possible'
                      "
                    />
                    <button
                      class="btn btn-outline-secondary"
                      @click="sidecarSelectorKind = 'bin-table'"
                    >
                      Browse…
                    </button>
                    <button
                      class="btn btn-outline-danger"
                      :disabled="!batchBinTableFilename"
                      @click="batchBinTableFilename = ''"
                    >
                      Clear
                    </button>
                  </div>
                  <small class="text-muted">
                    Used by Hi-C Pro .matrix and generic COO conversions. Leave
                    empty for auto-discovery or synthetic COO bins.
                  </small>
                </div>
                <div class="row g-2 mb-3">
                  <div class="col-md-8">
                    <label class="form-label">Optional chrom sizes</label>
                    <div class="input-group">
                      <input
                        class="form-control"
                        type="text"
                        readonly
                        :value="
                          batchChromSizesFilename ||
                          'Required for BEDPE/bedGraph2 and validPairs'
                        "
                      />
                      <button
                        class="btn btn-outline-secondary"
                        @click="sidecarSelectorKind = 'chrom-sizes'"
                      >
                        Browse…
                      </button>
                      <button
                        class="btn btn-outline-danger"
                        :disabled="!batchChromSizesFilename"
                        @click="batchChromSizesFilename = ''"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div v-if="!showPairsBinSize" class="col-md-4">
                    <label for="converter-other-bin-size" class="form-label"
                      >Bin size</label
                    >
                    <input
                      id="converter-other-bin-size"
                      type="number"
                      class="form-control"
                      v-model.number="batchBinSize"
                      min="1"
                      step="1"
                    />
                  </div>
                </div>
                <div class="mb-3">
                  <label class="form-label">Parallel jobs</label>
                  <input
                    type="number"
                    class="form-control"
                    v-model.number="batchParallelJobs"
                    min="1"
                  />
                </div>
                <div class="mb-3">
                  <label class="form-label">Parallelism per file</label>
                  <input
                    type="number"
                    class="form-control"
                    v-model.number="batchParallelism"
                    min="-1"
                    title="-1: automatic server CPU allocation"
                  />
                </div>
                <label class="form-check">
                  <input
                    v-model="forceConversion"
                    type="checkbox"
                    class="form-check-input"
                  />
                  Re-convert even if converted
                </label>
                <div
                  class="toolchain-card"
                  v-if="toolchainStatus || toolchainLoading"
                >
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
                    <a
                      href="https://github.com/paulsengroup/hictk"
                      target="_blank"
                      rel="noopener noreferrer"
                      >hictk</a
                    >.
                    <span :class="hictkAvailabilityClass">
                      {{ hictkAvailabilityLabel }}.
                    </span>
                  </p>
                  <details v-if="toolchainStatus" class="toolchain-details">
                    <summary>Notices, attribution and diagnostics</summary>
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
              </AdvancedSection>
              <p v-if="batchBlockedMessage" class="error-message mt-2">
                {{ batchBlockedMessage }}
              </p>
            </div>
            <div v-if="batchStep === 'progress'">
              <h6>Batch progress</h6>
              <p v-if="batchJobIds.length === 0" class="text-muted">
                No active conversion jobs.
              </p>
              <div v-else class="overall-status">
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
            v-if="batchStep === 'select'"
            type="button"
            class="btn btn-link me-auto"
            @click="viewCurrentJobs"
          >
            View conversion jobs
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            @click="onDismissClicked"
          >
            {{ batchStep === "select" ? "Cancel" : "Close" }}
          </button>
          <button
            v-if="batchStep === 'select'"
            type="button"
            class="btn btn-primary"
            :disabled="
              submitting ||
              filesLoading ||
              !batchSelection.size ||
              Boolean(batchBlockedMessage)
            "
            @click="startBatchConversion"
          >
            Convert {{ batchSelection.size }}
            {{ batchSelection.size === 1 ? "file" : "files" }}
          </button>
        </div>
        <div v-if="overwriteConfirmVisible" class="overwrite-confirm-backdrop">
          <div class="overwrite-confirm card shadow">
            <div class="card-body">
              <h6 class="card-title mb-2">Overwrite converted output?</h6>
              <p class="card-text mb-3">{{ overwriteConfirmMessage }}</p>
              <div class="d-flex justify-content-end gap-2">
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  @click="resolveOverwriteConfirm(false)"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="btn btn-danger"
                  @click="resolveOverwriteConfirm(true)"
                >
                  Overwrite
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <UniversalFileSelector
    v-if="assemblySelectorOpen"
    :network-manager="networkManager"
    :z-index="1070"
    title="Select optional .assembly file"
    file-type=".assembly"
    note="Used for selected .hic conversions only. Non-.hic conversions ignore this field."
    :file-name-predicate="isAssemblyFilename"
    @selected="onAssemblySelected"
    @dismissed="assemblySelectorOpen = false"
  />
  <UniversalFileSelector
    v-if="sidecarSelectorKind !== null"
    :network-manager="networkManager"
    :z-index="1070"
    :title="
      sidecarSelectorKind === 'bin-table'
        ? 'Select BED bin table'
        : 'Select chrom sizes file'
    "
    :file-type="sidecarSelectorKind === 'bin-table' ? '.bed' : '.chrom.sizes'"
    :note="
      sidecarSelectorKind === 'bin-table'
        ? 'BED3+ bin table for hictk load.'
        : 'Chrom sizes for hictk load.'
    "
    :file-name-predicate="
      sidecarSelectorKind === 'bin-table'
        ? isBinTableFilename
        : isChromSizesFilename
    "
    @selected="onSidecarSelected"
    @dismissed="sidecarSelectorKind = null"
  />
</template>

<script setup lang="ts">
import AdvancedSection from "@/app/ui/components/common/AdvancedSection.vue";
import { type Ref, ref, onBeforeUnmount, onMounted, computed } from "vue";
import { useModalFocus } from "@/app/ui/modalFocus";
import type { NetworkManager } from "@/app/core/net/NetworkManager.js";
import { StartBatchConversionJobsRequest } from "@/app/core/net/api/request";
import { ConversionToolchainStatusResponse } from "@/app/core/net/api/response";
import ConverterStatusChecker from "./converter/ConverterStatusChecker.vue";
import FileSelectionTable from "@/app/ui/components/common/FileSelectionTable.vue";
import type { FileSelectionTableEntry } from "@/app/ui/components/common/FileSelectionTableTypes";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
import UniversalFileSelector from "./UniversalFileSelector.vue";

const emit = defineEmits<{
  (e: "dismissed"): void;
}>();

const props = defineProps<{
  networkManager: NetworkManager;
  initialCoolerFilename?: string;
}>();

const errorMessage: Ref<unknown | null> = ref(null);
const convertCoolerModal = ref<HTMLElement | null>(null);
useModalFocus(convertCoolerModal);
const forceConversion = ref(false);
const submitting = ref(false);
const folderTrail = computed(() => {
  const parts = currentFolder.value.split("/").filter(Boolean);
  return parts.map((name, index) => ({
    name,
    path: parts.slice(0, index + 1).join("/"),
  }));
});
const showPairsBinSize = computed(() =>
  [...batchFiles.value, ...batchSelection.value].some((path) =>
    /\.pairs(?:\.(?:gz|bgz|xz|zst|zstd|bz2|lz4|lzo))?$/i.test(path)
  )
);
const batchStep: Ref<"select" | "progress"> = ref("select");
const batchFileEntries = ref<FileSelectionTableEntry[]>([]);
const batchFiles = computed(() =>
  batchFileEntries.value
    .filter((e) => e.type !== "directory")
    .map((e) => e.path)
);
const currentFolder = ref("");
const filesLoading = ref(false);
const recursiveList = ref(false);
let listingRequest = 0;
const parentFolder = (file: string) =>
  file.replaceAll("\\", "/").split("/").slice(0, -1).join("/");
const batchSelection: Ref<Set<string>> = ref(new Set<string>());
const batchAssemblyFilename: Ref<string> = ref("");
const assemblySelectorOpen: Ref<boolean> = ref(false);
const batchBinTableFilename: Ref<string> = ref("");
const batchChromSizesFilename: Ref<string> = ref("");
const batchBinSize: Ref<number | null> = ref(null);
const sidecarSelectorKind: Ref<"bin-table" | "chrom-sizes" | null> = ref(null);
const batchParallelJobs: Ref<number> = ref(2);
const batchParallelism: Ref<number> = ref(-1);
const batchJobIds: Ref<string[]> = ref([]);
const batchStatusMap: Ref<Map<string, string>> = ref(new Map());
const batchProgressMap: Ref<Map<string, number>> = ref(new Map());
const existingOutputs: Ref<Set<string>> = ref(new Set<string>());
const overwriteConfirmVisible: Ref<boolean> = ref(false);
const overwriteConfirmMessage: Ref<string> = ref("");
const toolchainStatus: Ref<ConversionToolchainStatusResponse | null> =
  ref(null);
const toolchainLoading: Ref<boolean> = ref(true);
let overwriteConfirmResolver: ((approved: boolean) => void) | null = null;

useEscDismissableDialog({
  priority: 1060,
  isOpen: () => true,
  requestClose: () => {
    onDismissClicked();
  },
});

useEscDismissableDialog({
  priority: 1075,
  isOpen: () => overwriteConfirmVisible.value,
  requestClose: () => {
    cancelPendingOverwriteConfirm();
  },
});

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

onBeforeUnmount(() => {
  cancelPendingOverwriteConfirm();
  listingRequest++;
});

function onDismissClicked(): void {
  emit("dismissed");
}

function requiresHicToolchain(filename: string | null | undefined): boolean {
  const lowered = filename?.toLowerCase() ?? "";
  return lowered.endsWith(".hic") || isHictkLoadFilename(lowered);
}

function isAssemblyFilename(name: string): boolean {
  return name.toLowerCase().endsWith(".assembly");
}

function onAssemblySelected(filename: string): void {
  batchAssemblyFilename.value = filename;
  assemblySelectorOpen.value = false;
}

function onSidecarSelected(filename: string): void {
  if (sidecarSelectorKind.value === "bin-table") {
    batchBinTableFilename.value = filename;
  } else if (sidecarSelectorKind.value === "chrom-sizes") {
    batchChromSizesFilename.value = filename;
  }
  sidecarSelectorKind.value = null;
}

onMounted(() => {
  batchStep.value = "select";
  loadToolchainStatus();
  const initial = props.initialCoolerFilename;
  if (initial) batchSelection.value = new Set([initial]);
  void loadBatchFiles(parentFolder(initial ?? ""));
});

function viewCurrentJobs(): void {
  props.networkManager.requestManager
    .listConversionJobs()
    .then((items) => {
      const active = items.filter((job) =>
        ["queued", "running"].includes((job.status ?? "").toLowerCase())
      );
      batchJobIds.value = active.map((job) => job.jobId);
      batchStep.value = "progress";
    })
    .catch((e) => {
      errorMessage.value = e;
    });
}

function convertible(file: string) {
  return /\.(hic|m?cool)$/i.test(file) || isHictkLoadFilename(file);
}
async function loadBatchFiles(folder: string, recursive = false) {
  const request = ++listingRequest;
  filesLoading.value = true;
  errorMessage.value = null;
  try {
    const api = props.networkManager.requestManager;
    const entries: FileSelectionTableEntry[] = recursive
      ? (await api.listFiles()).map((path) => ({ path, type: "file" }))
      : await api.listDirectory(folder);
    if (request !== listingRequest) return;
    currentFolder.value = folder;
    recursiveList.value = recursive;
    for (const entry of entries) {
      if (entry.type !== "directory" && convertible(entry.path))
        existingOutputs.value.delete(deriveOutputFilename(entry.path));
    }
    for (const entry of entries) {
      if (entry.path.toLowerCase().endsWith(".hict.hdf5"))
        existingOutputs.value.add(entry.path);
    }
    batchFileEntries.value = entries.filter(
      (e) => e.type === "directory" || convertible(e.path)
    );
  } catch (error) {
    if (request === listingRequest) errorMessage.value = error;
  } finally {
    if (request === listingRequest) filesLoading.value = false;
  }
}
function onBatchEntryActivated(path: string) {
  if (
    batchFileEntries.value.some(
      (e) => e.path === path && e.type === "directory"
    )
  )
    void loadBatchFiles(path);
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
  return existingOutputs.value.has(output);
}

const batchSelectedPaths = computed(() => Array.from(batchSelection.value));

const batchFileStatusLabel = (filename: string): string =>
  !convertible(filename)
    ? ""
    : isConverted(filename)
    ? "Converted"
    : "Unconverted";

const batchFileStatusClass = (filename: string): string =>
  isConverted(filename) ? "converted" : "unconverted";

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
  const withoutCompression = file.replace(
    /\.(gz|bgz|xz|zst|zstd|bz2|lz4|lzo)$/i,
    ""
  );
  const stripped = withoutCompression.replace(
    /\.(coo\.tsv|coo\.csv|bedgraph2|validpairs|matrix|pairs|bedpe|coo|bg2|tsv|csv)$/i,
    ""
  );
  if (stripped !== withoutCompression) {
    return stripped + ".hict.hdf5";
  }
  return file + ".hict.hdf5";
}

function onBatchSelectionUpdated(files: string[]): void {
  batchSelection.value = new Set(files);
}

function selectAll(): void {
  batchSelection.value = new Set([
    ...batchSelection.value,
    ...batchFiles.value,
  ]);
}

function selectNone(): void {
  batchSelection.value = new Set<string>();
}

function invertSelection(): void {
  const next = new Set(batchSelection.value);
  for (const file of batchFiles.value) {
    if (!next.delete(file)) next.add(file);
  }
  batchSelection.value = next;
}

function selectConvertedStatus(converted: boolean): void {
  const next = new Set(batchSelection.value);
  for (const file of batchFiles.value) {
    if (isConverted(file) === converted) next.add(file);
    else next.delete(file);
  }
  batchSelection.value = next;
}

async function startBatchConversion(): Promise<void> {
  if (
    submitting.value ||
    batchBlockedMessage.value ||
    !batchSelection.value.size
  )
    return;
  submitting.value = true;
  const files = Array.from(batchSelection.value);
  const alreadyConverted = files.filter((file) => isConverted(file));
  const overwriteExisting = alreadyConverted.length > 0;
  if (overwriteExisting) {
    const approved = await askOverwriteConfirmation(
      `${alreadyConverted.length} selected file(s) already have converted outputs. Overwrite existing outputs?`
    );
    if (!approved) {
      submitting.value = false;
      return;
    }
  }
  batchStatusMap.value.clear();
  batchProgressMap.value.clear();
  props.networkManager.requestManager
    .startBatchConversionJobs(
      new StartBatchConversionJobsRequest({
        files,
        assemblyFilename: batchAssemblyFilename.value || undefined,
        parallelJobs: batchParallelJobs.value,
        parallelism: batchParallelism.value,
        overwrite: overwriteExisting || forceConversion.value,
        binTableFilename: batchBinTableFilename.value || undefined,
        chromSizesFilename: batchChromSizesFilename.value || undefined,
        binSize:
          typeof batchBinSize.value === "number"
            ? batchBinSize.value
            : undefined,
      })
    )
    .then((resp) => {
      batchJobIds.value = resp.jobIds;
      batchStep.value = "progress";
    })
    .catch((e) => {
      errorMessage.value = e;
    })
    .finally(() => {
      submitting.value = false;
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

const batchBlockedMessage = computed(() => {
  if (
    typeof batchBinSize.value === "number" &&
    (!Number.isSafeInteger(batchBinSize.value) || batchBinSize.value < 1)
  ) {
    return "Enter a positive whole number for the bin size.";
  }
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
  toolchainStatus.value?.hicConversionAvailable
    ? "hictk available"
    : "hictk unavailable"
);

const hictkAvailabilityClass = computed(() =>
  toolchainStatus.value?.hicConversionAvailable ? "finished" : "failed"
);

function stripCompressionSuffix(name: string): string {
  return name.replace(/\.(gz|bgz|xz|zst|zstd|bz2|lz4|lzo)$/i, "");
}

function isHictkLoadFilename(name: string): boolean {
  const lowered = stripCompressionSuffix(name.toLowerCase());
  return (
    lowered.endsWith(".matrix") ||
    lowered.endsWith(".coo") ||
    lowered.endsWith(".coo.tsv") ||
    lowered.endsWith(".coo.csv") ||
    lowered.endsWith(".tsv") ||
    lowered.endsWith(".csv") ||
    lowered.endsWith(".bg2") ||
    lowered.endsWith(".bedgraph2") ||
    lowered.endsWith(".bedpe") ||
    lowered.endsWith(".pairs") ||
    lowered.endsWith(".validpairs")
  );
}

function isBinTableFilename(name: string): boolean {
  return name.toLowerCase().endsWith(".bed");
}

function isChromSizesFilename(name: string): boolean {
  const lowered = name.toLowerCase();
  return (
    lowered.endsWith(".chrom.sizes") ||
    lowered.endsWith(".chromsizes") ||
    lowered.endsWith(".chrom_sizes.txt")
  );
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
.toolchain-summary .finished {
  color: #047857;
  font-weight: 700;
}
.toolchain-summary .failed {
  color: #b91c1c;
  font-weight: 700;
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

.converter-shell {
  display: block;
}

.converter-dialog {
  max-width: 80vw;
  width: 80vw;
}

.converter-dialog .modal-content {
  max-height: min(92vh, 980px);
}

@media (max-width: 768px) {
  .converter-dialog {
    max-width: calc(100vw - 1rem);
    width: calc(100vw - 1rem);
  }
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
