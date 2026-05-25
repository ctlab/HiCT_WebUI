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
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
 -->

<template>
  <Teleport to="body">
    <div class="modal-backdrop fade show dotplot-backdrop"></div>
    <div class="modal fade show dotplot-root" style="display: block" tabindex="-1" role="dialog">
      <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable dotplot-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <div>
              <h5 class="modal-title">Generate self-alignment dotplots</h5>
              <small class="text-muted">
                Builds self-alignment maps from FASTA files using the configured dotplot toolchain.
              </small>
            </div>
            <button type="button" class="btn-close" @click="emit('dismissed')"></button>
          </div>
          <div class="modal-body">
            <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>
            <div v-if="step === 'select'">
              <div class="batch-actions">
                <button class="btn btn-sm btn-outline-primary" @click="selectAll">Select All</button>
                <button class="btn btn-sm btn-outline-secondary" @click="selectNone">Select None</button>
                <button class="btn btn-sm btn-outline-secondary" @click="invertSelection">Invert Selection</button>
                <button class="btn btn-sm btn-outline-secondary" @click="viewCurrentJobs">View current dotplot jobs</button>
              </div>
              <FileSelectionTable
                :entries="fastaEntries"
                :multi-select="true"
                :selected-path="null"
                :selected-paths="selectedFastaPaths"
                :show-modified="false"
                :show-size="false"
                empty-message="No FASTA files found"
                scroll-height="44vh"
                @update:selected-paths="onSelectionUpdated"
              />
            </div>

            <div v-else-if="step === 'settings'" class="dotplot-settings">
              <div class="row g-3">
                <div class="col-md-4">
                  <label class="form-label">Base dotplot resolution, bp/bin</label>
                  <input v-model.number="binSize" type="number" min="1" class="form-control" />
                  <small class="text-muted">Fine values such as 25 are supported when the toolchain can handle the output size.</small>
                </div>
                <div class="col-md-8">
                  <label class="form-label">Zoom resolutions</label>
                  <input v-model.trim="resolutions" type="text" class="form-control" />
                  <small class="text-muted">Comma-separated. Leave empty to derive a pyramid up to roughly 500 px per axis.</small>
                </div>
                <div class="col-md-3">
                  <label class="form-label">Minimizer k-mer length</label>
                  <input v-model.number="minimizerK" type="number" min="5" class="form-control" />
                </div>
                <div class="col-md-3">
                  <label class="form-label">Minimizer window size</label>
                  <input v-model.number="minimizerWindow" type="number" min="1" class="form-control" />
                </div>
                <div class="col-md-3">
                  <label class="form-label">Aligner -m chain score</label>
                  <input v-model.number="minChainScore" type="number" min="0" class="form-control" />
                </div>
                <div class="col-md-3">
                  <label class="form-label">Drop near-diagonal bins</label>
                  <input v-model.number="dropNearDiagonalBins" type="number" min="0" class="form-control" />
                </div>
                <div class="col-md-3">
                  <label class="form-label">PAF sample step, bp</label>
                  <input v-model.number="sampleBp" type="number" min="1" class="form-control" />
                </div>
                <div class="col-md-3">
                  <label class="form-label">Minimum alignment length</label>
                  <input v-model.number="minAlignmentLength" type="number" min="0" class="form-control" />
                </div>
                <div class="col-md-3">
                  <label class="form-label">Aligner threads</label>
                  <input v-model.number="alignmentThreads" type="number" min="1" class="form-control" />
                </div>
                <div class="col-md-3">
                  <label class="form-label">Conversion threads</label>
                  <input v-model.number="conversionThreads" type="number" min="1" class="form-control" />
                </div>
                <div class="col-md-6">
                  <label class="form-label">Self-alignment engine</label>
                  <select v-model="alignerPreference" class="form-select">
                    <option value="auto">Auto (mm2-plus AVX-512 -> AVX2 -> minimap2)</option>
                    <option value="mm2plus">mm2-plus best available</option>
                    <option value="mm2plus-avx512">mm2-plus AVX-512</option>
                    <option value="mm2plus-avx2">mm2-plus AVX2</option>
                    <option value="minimap2">minimap2</option>
                  </select>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Extra aligner arguments</label>
                  <input v-model.trim="extraMinimap2Args" type="text" class="form-control" placeholder="e.g. -f 0.0002" />
                  <small class="text-muted">Passed as separate arguments without a shell; leave empty for HiCT defaults.</small>
                </div>
                <div class="col-md-3 d-flex align-items-end">
                  <div class="form-check form-switch">
                    <input id="dotplot-skip-diag" v-model="skipDiagonal" class="form-check-input" type="checkbox" />
                    <label class="form-check-label" for="dotplot-skip-diag">Skip exact diagonal</label>
                  </div>
                </div>
                <div class="col-md-3 d-flex align-items-end">
                  <div class="form-check form-switch">
                    <input id="dotplot-overwrite" v-model="overwrite" class="form-check-input" type="checkbox" />
                    <label class="form-check-label" for="dotplot-overwrite">Overwrite outputs</label>
                  </div>
                </div>
              </div>
              <div class="alert alert-info mt-3 mb-0">
                Packaged builds use mm2-plus or minimap2 for self-alignment, HiCT's integrated Java/native PAF writer, and hictk for <code>load</code>/<code>zoomify</code>.
              </div>
            </div>

            <div v-else>
              <h6>Dotplot jobs</h6>
              <div v-if="jobs.length === 0" class="alert alert-light border">No dotplot jobs are currently known.</div>
              <div v-else class="dotplot-job-list">
                <div v-for="job in jobs" :key="job.jobId" class="dotplot-job card">
                  <div class="card-body">
                    <div class="d-flex justify-content-between gap-3">
                      <div>
                        <strong>{{ job.sourceFilename }}</strong>
                        <div class="text-muted">{{ job.outputFilename }}</div>
                      </div>
                      <span class="status-pill" :class="job.status">{{ job.status }}</span>
                    </div>
                    <div class="progress mt-2" style="height: 8px">
                      <div
                        class="progress-bar progress-bar-striped"
                        :class="{ 'progress-bar-animated': job.status === 'running' || job.status === 'queued' }"
                        :style="{ width: `${Math.round((job.overallProgress || 0) * 100)}%` }"
                      ></div>
                    </div>
                    <small class="d-block mt-2">{{ job.currentStageLabel || job.stageDetail || job.toolchainSummary }}</small>
                    <pre v-if="job.error" class="dotplot-error mt-2">{{ job.error }}</pre>
                    <details v-if="job.logs.length" class="mt-2">
                      <summary>Logs</summary>
                      <pre class="dotplot-logs">{{ job.logs.join("\n") }}</pre>
                    </details>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="step === 'select' ? emit('dismissed') : (step = 'select')">
              {{ step === "select" ? "Dismiss" : "Back" }}
            </button>
            <button v-if="step === 'select'" class="btn btn-primary" :disabled="selection.size === 0" @click="step = 'settings'">
              Continue
            </button>
            <button v-else-if="step === 'settings'" class="btn btn-success" :disabled="submitting" @click="startDotplots">
              Start
            </button>
            <button v-else class="btn btn-outline-primary" @click="refreshJobs">Refresh</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, type Ref } from "vue";
import type { NetworkManager } from "@/app/core/net/NetworkManager";
import { StartDotplotJobsRequest } from "@/app/core/net/api/request";
import type { ConversionJobResponse } from "@/app/core/net/api/response";
import FileSelectionTable from "@/app/ui/components/common/FileSelectionTable.vue";
import type { FileSelectionTableEntry } from "@/app/ui/components/common/FileSelectionTableTypes";

const emit = defineEmits<{
  (e: "dismissed"): void;
}>();

const props = defineProps<{
  networkManager: NetworkManager;
  initialFastaFilename?: string;
}>();

const step: Ref<"select" | "settings" | "progress"> = ref("select");
const fastaFiles: Ref<string[]> = ref([]);
const selection: Ref<Set<string>> = ref(new Set<string>());
const jobs: Ref<ConversionJobResponse[]> = ref([]);
const errorMessage: Ref<string> = ref("");
const submitting = ref(false);

const binSize = ref(1000);
const resolutions = ref("");
const minimizerK = ref(17);
const minimizerWindow = ref(5);
const minChainScore = ref(40);
const skipDiagonal = ref(false);
const dropNearDiagonalBins = ref(0);
const sampleBp = ref(250);
const minAlignmentLength = ref(50);
const extraMinimap2Args = ref("");
const alignerPreference = ref("auto");
const alignmentThreads = ref(Math.max(1, Math.min(12, navigator.hardwareConcurrency || 4)));
const conversionThreads = ref(Math.max(1, Math.min(12, navigator.hardwareConcurrency || 4)));
const overwrite = ref(false);

const fastaEntries = computed<FileSelectionTableEntry[]>(() =>
  fastaFiles.value.map((path) => ({ path }))
);
const selectedFastaPaths = computed(() => Array.from(selection.value));

function onSelectionUpdated(files: string[]): void {
  selection.value = new Set(files);
}

function selectAll(): void {
  selection.value = new Set(fastaFiles.value);
}

function selectNone(): void {
  selection.value = new Set<string>();
}

function invertSelection(): void {
  const next = new Set<string>();
  fastaFiles.value.forEach((file) => {
    if (!selection.value.has(file)) {
      next.add(file);
    }
  });
  selection.value = next;
}

async function refreshJobs(): Promise<void> {
  try {
    jobs.value = await props.networkManager.requestManager.listDotplotJobs();
  } catch (error) {
    errorMessage.value = String(error);
  }
}

async function viewCurrentJobs(): Promise<void> {
  await refreshJobs();
  step.value = "progress";
}

async function startDotplots(): Promise<void> {
  submitting.value = true;
  errorMessage.value = "";
  try {
    await props.networkManager.requestManager.startDotplotJobs(
      new StartDotplotJobsRequest({
        fastaFiles: Array.from(selection.value),
        binSize: Math.max(1, Math.trunc(binSize.value || 1000)),
        resolutions: resolutions.value.trim() || undefined,
        minimizerK: Math.max(1, Math.trunc(minimizerK.value || 17)),
        minimizerWindow: Math.max(1, Math.trunc(minimizerWindow.value || 5)),
        minChainScore: Math.max(0, Math.trunc(minChainScore.value || 40)),
        skipDiagonal: skipDiagonal.value,
        dropNearDiagonalBins: Math.max(0, Math.trunc(dropNearDiagonalBins.value || 0)),
        sampleBp: Math.max(1, Math.trunc(sampleBp.value || 250)),
        minAlignmentLength: Math.max(0, Math.trunc(minAlignmentLength.value || 50)),
        extraMinimap2Args: extraMinimap2Args.value.trim() || undefined,
        alignerPreference: alignerPreference.value,
        alignmentThreads: Math.max(1, Math.trunc(alignmentThreads.value || 1)),
        conversionThreads: Math.max(1, Math.trunc(conversionThreads.value || 1)),
        overwrite: overwrite.value,
      })
    );
    await refreshJobs();
    step.value = "progress";
  } catch (error) {
    errorMessage.value = String(error);
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  try {
    fastaFiles.value = await props.networkManager.requestManager.listFASTAFiles();
    if (props.initialFastaFilename && fastaFiles.value.includes(props.initialFastaFilename)) {
      selection.value = new Set([props.initialFastaFilename]);
    }
    await refreshJobs();
  } catch (error) {
    errorMessage.value = String(error);
  }
});
</script>

<style scoped>
.dotplot-root {
  z-index: 1060;
}

.dotplot-backdrop {
  pointer-events: none;
  z-index: 1050;
}

.dotplot-dialog {
  max-width: min(1120px, 92vw);
  position: relative;
  z-index: 1061;
}

.batch-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.dotplot-settings code {
  font-size: 0.9em;
}

.dotplot-job-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 58vh;
  overflow: auto;
}

.status-pill {
  align-self: flex-start;
  border-radius: 999px;
  padding: 2px 8px;
  background: #e5e7eb;
  color: #374151;
}

.status-pill.running {
  background: #bfdbfe;
  color: #1e3a8a;
}

.status-pill.finished {
  background: #d1fae5;
  color: #065f46;
}

.status-pill.failed {
  background: #fee2e2;
  color: #991b1b;
}

.dotplot-error,
.dotplot-logs {
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
}
</style>
