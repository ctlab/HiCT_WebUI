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
    class="modal fade show export-matrix-shell"
    tabindex="-1"
    ref="modalFocusElement"
    role="dialog"
    aria-modal="true"
    aria-labelledby="matrix-export-title"
  >
    <div
      class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable"
    >
      <div class="modal-content">
        <div class="modal-header">
          <div>
            <h5 id="matrix-export-title" class="modal-title">
              Export matrix to Cooler
            </h5>
            <p class="mb-0 small text-muted">
              Writes a .cool or .mcool you can open in other Hi-C tools.
            </p>
          </div>
          <button
            type="button"
            class="btn-close"
            aria-label="Close dialog"
            @click="emit('dismissed')"
          ></button>
        </div>
        <div class="modal-body">
          <div v-if="errorMessage" class="alert alert-danger py-2">
            {{ errorMessage }}
          </div>

          <div class="mb-3">
            <label class="form-label" for="export-source-map">Map</label>
            <div class="input-group">
              <input
                id="export-source-map"
                class="form-control"
                type="text"
                readonly
                :value="sourceFilename || 'Select .hict.hdf5 matrix'"
              />
              <button
                class="btn btn-outline-secondary"
                type="button"
                @click="selectorKind = 'source'"
              >
                Browse…
              </button>
            </div>
          </div>

          <fieldset class="mb-3">
            <legend class="form-label fs-6">Assembly order</legend>
            <div
              v-for="option in assemblyOrderOptions"
              :key="option.value"
              class="form-check"
            >
              <label class="form-check-label">
                <input
                  v-model="assemblyOrder"
                  class="form-check-input"
                  name="export-assembly-order"
                  type="radio"
                  :value="option.value"
                />
                {{ option.label }}
              </label>
            </div>
          </fieldset>

          <div v-if="assemblyOrder === 'agp'" class="mb-3">
            <label class="form-label" for="export-matrix-agp">Assembly file</label>
            <div class="input-group">
              <input
                id="export-matrix-agp"
                class="form-control"
                type="text"
                readonly
                :value="customAgpFilename"
                placeholder="Select an AGP file"
              />
              <button
                class="btn btn-outline-secondary"
                type="button"
                @click="selectorKind = 'agp'"
              >
                Browse…
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

          <div class="mb-3">
            <label class="form-label" for="export-matrix-filename">Save as</label>
            <input
              id="export-matrix-filename"
              v-model="outputFilename"
              class="form-control"
              type="text"
              placeholder="matrix.mcool"
              @input="outputFilenameTouched = true"
            />
            <small class="text-muted">
              Relative to the HiCT data directory. Use .cool for one selected
              resolution, or .mcool for multiple resolutions.
            </small>
          </div>

          <p
            v-if="useCurrentAssembly && hasSequenceCuts"
            class="small text-muted mb-3"
          >
            This assembly contains sequence cuts. Enable approximate rebinning
            under Advanced to export its current layout.
          </p>
          <AdvancedSection
            dialog-id="matrix-export"
            hint="engine, compression, threads, resolutions, balancing"
          >
            <div class="row g-2 mb-3">
              <div class="col-md-4">
                <label class="form-label" for="export-matrix-mode">Export mode</label>
                <select
                  id="export-matrix-mode"
                  v-model="exportModeModel"
                  class="form-select"
                  :disabled="effectiveApproximateRebin"
                >
                  <option value="auto">auto (prefer hictk-assisted)</option>
                  <option value="hictk">hictk-assisted</option>
                  <option value="internal">direct internal exporter</option>
                </select>
              </div>
              <div class="col-md-4">
                <label class="form-label" for="export-matrix-compression">Compression</label>
                <select
                  id="export-matrix-compression"
                  v-model="compressionAlgorithm"
                  class="form-select"
                >
                  <option value="deflate">deflate</option>
                  <option value="zstd" disabled>zstd (unavailable)</option>
                  <option value="lzf" disabled>lzf (unavailable)</option>
                </select>
                <small class="text-muted">
                  Cooler export supports Deflate. Level 0 leaves interaction
                  data uncompressed.
                </small>
              </div>
              <div class="col-md-2">
                <label class="form-label" for="export-matrix-level">Level</label>
                <input
                  id="export-matrix-level"
                  v-model.number="compression"
                  class="form-control"
                  type="number"
                  min="0"
                  max="9"
                />
              </div>
              <div class="col-md-2">
                <label class="form-label" for="export-matrix-threads">Threads</label>
                <input
                  id="export-matrix-threads"
                  v-model.number="parallelism"
                  class="form-control"
                  type="number"
                  min="-1"
                  title="-1: automatic server CPU allocation"
                />
              </div>
            </div>

            <div class="form-check form-switch mb-2">
              <input
                id="export-all-resolutions"
                v-model="exportAllResolutions"
                class="form-check-input"
                type="checkbox"
                role="switch"
              />
              <label class="form-check-label" for="export-all-resolutions">
                Export all resolutions present in .hict.hdf5
              </label>
            </div>
            <small class="text-muted d-block mb-3">
              Disabled by default: only the finest resolution is exported, so
              you can zoomify later if needed.
            </small>

            <div class="form-check form-switch mb-2">
              <input
                id="export-balance-coolers"
                v-model="exportBalanceModel"
                :disabled="
                  exportMode === 'internal' || effectiveApproximateRebin
                "
                class="form-check-input"
                type="checkbox"
                role="switch"
              />
              <label class="form-check-label" for="export-balance-coolers">
                Balance exported Cooler with hictk
              </label>
            </div>
            <small
              v-if="exportMode === 'internal' || effectiveApproximateRebin"
              class="text-muted d-block mb-3"
            >
              {{
                effectiveApproximateRebin
                  ? "Approximate rebinning exports unbalanced fractional counts with the internal exporter."
                  : "Balancing requires auto or hictk-assisted export."
              }}
            </small>
            <small v-else class="text-muted d-block mb-3">
              Enabled by default. Auto and hictk-assisted modes run ICE
              balancing so downstream Cooler tools can use generated weights.
            </small>

            <div class="form-check mb-3">
              <input
                id="export-overwrite"
                v-model="overwrite"
                class="form-check-input"
                type="checkbox"
              />
              <label class="form-check-label" for="export-overwrite">
                Overwrite existing output
              </label>
            </div>
            <div
              v-if="useCurrentAssembly || assemblyOrder === 'agp'"
              class="mb-3"
            >
              <div class="form-check">
                <input
                  id="export-approximate-rebin"
                  v-model="approximateRebin"
                  class="form-check-input"
                  type="checkbox"
                />
                <label class="form-check-label" for="export-approximate-rebin"
                  >Approximate rebinning for sequence cuts</label
                >
              </div>
              <small class="text-muted"
                >Distribute contacts by sequence overlap. Exported counts can be
                fractional estimates; the original HiCT data stays
                unchanged.</small
              >
            </div>

            <div class="job-history-panel mb-3">
              <div
                class="d-flex flex-wrap align-items-center justify-content-between gap-2"
              >
                <div>
                  <strong>Conversion jobs</strong>
                  <small class="text-muted d-block">
                    Reopen this window and use this list to check exports started
                    earlier.
                  </small>
                </div>
                <button
                  class="btn btn-sm btn-outline-secondary"
                  type="button"
                  :disabled="jobsLoading"
                  @click="loadConversionJobs"
                >
                  <span
                    v-if="jobsLoading"
                    class="spinner-border spinner-border-sm me-1"
                  ></span>
                  Refresh jobs
                </button>
              </div>
              <div v-if="recentJobs.length" class="job-history-list mt-2">
                <button
                  v-for="job in recentJobs"
                  :key="job.jobId"
                  class="job-history-item"
                  :class="{ active: job.jobId === jobId }"
                  type="button"
                  @click="jobId = job.jobId"
                >
                  <span class="job-history-main">
                    {{ job.outputFilename || job.sourceFilename }}
                  </span>
                  <span class="job-history-meta">
                    {{ job.direction }} · {{ job.status }} ·
                    {{ Math.round((job.overallProgress ?? 0) * 100) }}%
                  </span>
                </button>
              </div>
            </div>
          </AdvancedSection>

          <ConverterStatusChecker
            v-if="jobId"
            :network-manager="props.networkManager"
            :job-id="jobId"
          />
        </div>
        <div class="modal-footer hict-modal-footer">
          <span v-if="numericError" role="alert" class="text-danger small me-auto">{{
            numericError
          }}</span>
          <button
            class="btn btn-outline-secondary"
            type="button"
            @click="emit('dismissed')"
          >
            Cancel
          </button>
          <button
            class="btn btn-primary"
            type="button"
            :disabled="
              submitting || !sourceFilename || missingAgp || !!numericError
            "
            @click="startExport"
          >
            <span
              v-if="submitting"
              class="spinner-border spinner-border-sm me-2"
            ></span>
            Export
          </button>
        </div>
      </div>
    </div>
  </div>

  <UniversalFileSelector
    v-if="selectorKind"
    :network-manager="props.networkManager"
    :z-index="1070"
    :title="
      selectorKind === 'source'
        ? 'Select source .hict.hdf5'
        : 'Select custom AGP'
    "
    :file-type="selectorKind === 'source' ? '.hict.hdf5' : '.agp'"
    :file-name-predicate="
      selectorKind === 'source' ? isHictFilename : isAgpFilename
    "
    @selected="onFileSelected"
    @dismissed="selectorKind = null"
  />
</template>

<script setup lang="ts">
import AdvancedSection from "@/app/ui/components/common/AdvancedSection.vue";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
import { useModalFocus } from "@/app/ui/modalFocus";
import { computed, onMounted, ref, watch } from "vue";
import type { NetworkManager } from "@/app/core/net/NetworkManager";
import { StartConversionJobRequest } from "@/app/core/net/api/request";
import type { ConversionJobResponse } from "@/app/core/net/api/response";
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
const assemblyOrderOptions = [
  { value: "current", label: "Current edited assembly" },
  { value: "original", label: "Original order in the file" },
  { value: "agp", label: "From an AGP file…" },
] as const;
const assemblyOrder = ref<"current" | "original" | "agp">("current");
const useCurrentAssembly = computed(() => assemblyOrder.value === "current");
const exportAgpFilename = computed(() =>
  assemblyOrder.value === "agp" ? customAgpFilename.value : ""
);
const missingAgp = computed(
  () => assemblyOrder.value === "agp" && !exportAgpFilename.value
);
const approximateRebin = ref(false);
const hasSequenceCuts = computed(
  () =>
    props.networkManager.mapManager?.contigDimensionHolder.contigDescriptors.some(
      (d) => d.contigSharedBinSlice
    ) ?? false
);
const overwrite = ref(false);
const compressionAlgorithm = ref("deflate");
const compression = ref(6);
const parallelism = ref(-1);
const numericError = computed(() => {
  if (
    !Number.isInteger(compression.value) ||
    compression.value < 0 ||
    compression.value > 9
  )
    return "Compression level must be a whole number from 0 to 9.";
  if (
    !Number.isInteger(parallelism.value) ||
    parallelism.value < -1 ||
    parallelism.value > 2147483647
  )
    return "Threads must be a whole number from -1 to 2147483647.";
  return "";
});
const exportMode = ref("auto");
const exportAllResolutions = ref(false);
const balanceExportedCoolers = ref(true);
const effectiveApproximateRebin = computed(
  () =>
    approximateRebin.value &&
    (useCurrentAssembly.value || !!exportAgpFilename.value)
);
const exportModeModel = computed({
  get: () => (effectiveApproximateRebin.value ? "internal" : exportMode.value),
  set: (value: string) => {
    exportMode.value = value;
  },
});
const exportBalanceModel = computed({
  get: () =>
    !effectiveApproximateRebin.value &&
    exportMode.value !== "internal" &&
    balanceExportedCoolers.value,
  set: (value: boolean) => {
    balanceExportedCoolers.value = value;
  },
});
watch(
  [
    effectiveApproximateRebin,
    assemblyOrder,
    exportAgpFilename,
    sourceFilename,
  ],
  () => {
    errorMessage.value = "";
  }
);
const outputFilename = ref("");
const outputFilenameTouched = ref(false);
const selectorKind = ref<"source" | "agp" | null>(null);
const submitting = ref(false);
const errorMessage = ref("");
const jobId = ref("");
const jobsLoading = ref(false);
const recentJobs = ref<ConversionJobResponse[]>([]);

watch(
  () => props.initialSourceFilename,
  (filename) => {
    if (!sourceFilename.value && filename) {
      sourceFilename.value = filename;
    }
  }
);

watch(
  [sourceFilename, exportAllResolutions],
  () => {
    if (!outputFilenameTouched.value) {
      outputFilename.value = defaultOutputFilename(
        sourceFilename.value,
        exportAllResolutions.value
      );
    }
  },
  { immediate: true }
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
    if (!outputFilenameTouched.value) {
      outputFilename.value = defaultOutputFilename(
        filename,
        exportAllResolutions.value
      );
    }
  } else if (selectorKind.value === "agp") {
    customAgpFilename.value = filename;
  }
  selectorKind.value = null;
}

function defaultOutputFilename(
  filename: string,
  allResolutions: boolean
): string {
  if (!filename) {
    return "";
  }
  const extension = allResolutions ? ".mcool" : ".cool";
  const stripped = filename
    .replace(/\.hict\.hdf5$/i, "")
    .replace(/\.hict$/i, "");
  return `${stripped}${extension}`;
}

function loadConversionJobs(): void {
  jobsLoading.value = true;
  props.networkManager.requestManager
    .listConversionJobs()
    .then((jobs) => {
      recentJobs.value = jobs
        .filter(
          (job) =>
            job.direction === "hict-to-mcool" ||
            ["queued", "running"].includes((job.status ?? "").toLowerCase())
        )
        .sort((a, b) => {
          const aRunning = ["queued", "running"].includes(
            (a.status ?? "").toLowerCase()
          )
            ? 1
            : 0;
          const bRunning = ["queued", "running"].includes(
            (b.status ?? "").toLowerCase()
          )
            ? 1
            : 0;
          return bRunning - aRunning;
        });
    })
    .catch((error: unknown) => {
      errorMessage.value =
        error instanceof Error ? error.message : String(error);
    })
    .finally(() => {
      jobsLoading.value = false;
    });
}

async function startExport(): Promise<void> {
  if (numericError.value || missingAgp.value) return;
  if (!sourceFilename.value) {
    errorMessage.value = "Select a .hict.hdf5 source matrix first.";
    return;
  }
  if (
    useCurrentAssembly.value &&
    hasSequenceCuts.value &&
    !effectiveApproximateRebin.value
  ) {
    errorMessage.value =
      "Enable approximate rebinning under Advanced to export the edited assembly, or choose Original order in the file.";
    return;
  }
  submitting.value = true;
  errorMessage.value = "";
  jobId.value = "";
  try {
    const response =
      await props.networkManager.requestManager.startConversionJob(
        new StartConversionJobRequest({
          filename: sourceFilename.value,
          direction: "hict-to-mcool",
          outputFilename:
            outputFilename.value ||
            defaultOutputFilename(
              sourceFilename.value,
              exportAllResolutions.value
            ),
          useCurrentAssembly: useCurrentAssembly.value,
          assemblyFilename: exportAgpFilename.value || undefined,
          overwrite: overwrite.value,
          compression: compression.value,
          compressionAlgorithm: compressionAlgorithm.value,
          parallelism: parallelism.value,
          exportMode: exportModeModel.value,
          approximateRebin: effectiveApproximateRebin.value,
          exportAllResolutions: exportAllResolutions.value,
          balanceExportedCoolers: exportBalanceModel.value,
        })
      );
    jobId.value = response.jobId;
    loadConversionJobs();
  } catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  loadConversionJobs();
});

const modalFocusElement = ref<HTMLElement | null>(null);
useModalFocus(modalFocusElement);
useEscDismissableDialog({
  priority: 1055,
  isOpen: () => true,
  requestClose: () => emit("dismissed"),
});
</script>

<style scoped>
.export-matrix-shell {
  display: block;
  z-index: 1055;
}

.modal-backdrop {
  z-index: 1050;
}

.job-history-panel {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 0.5rem;
  padding: 0.75rem;
}

.job-history-list {
  display: grid;
  gap: 0.35rem;
  max-height: 10rem;
  overflow: auto;
}

.job-history-item {
  background: #fff;
  border: 1px solid #ced4da;
  border-radius: 0.35rem;
  color: #212529;
  display: grid;
  padding: 0.45rem 0.55rem;
  text-align: left;
}

.job-history-item.active {
  border-color: #0d6efd;
  box-shadow: 0 0 0 0.15rem rgba(13, 110, 253, 0.15);
}

.job-history-main {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-history-meta {
  color: #6c757d;
  font-size: 0.82rem;
}
</style>
