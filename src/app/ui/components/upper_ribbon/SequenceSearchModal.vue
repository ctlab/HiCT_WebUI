<template>
  <Teleport to="body">
    <div class="sequence-backdrop"></div>
    <section class="sequence-modal" role="dialog" aria-modal="true" aria-labelledby="sequence-search-title">
      <form class="modal-content" @submit.prevent="start">
        <header class="modal-header">
          <h5 id="sequence-search-title" class="modal-title">Find sequences in the linked FASTA</h5>
          <button type="button" class="btn-close" aria-label="Close" :disabled="busy" @click="emit('dismissed')"></button>
        </header>
        <div class="modal-body">
          <p>The active assembly is searched in its current order and orientation, preserving AGP gaps and using the configured default between scaffolds. Excluded regions and debris are omitted. Searches do not cross positive-length gaps.</p>
          <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>
          <div v-if="unavailableReason" class="alert alert-warning" role="status">{{ unavailableReason }} <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="readiness.checking.value || busy" @click="readiness.refresh">Check again</button></div>
          <fieldset :disabled="busy">
            <SequenceGapSettings :request-manager="props.mapManager.networkManager.requestManager" />
            <label class="form-label" for="search-sequences">FASTA records, or one DNA sequence per line</label>
            <textarea id="search-sequences" v-model="queries" class="form-control sequence-input" rows="7" required spellcheck="false" placeholder=">my motif&#10;ACGTACGT&#10;>another motif&#10;TTGCAACC"></textarea>
            <p class="form-text">FASTA descriptions appear in hit tooltips. Plain sequences receive query_1, query_2, … IDs. Input is case-insensitive.</p>
            <p v-if="!blastAvailable && !readiness.prerequisite.value" class="alert alert-info">{{ blastUnavailableReason }}</p>
            <div class="row g-3">
              <div class="col-sm-6">
                <label for="search-scope" class="form-label">Search scope</label>
                <select id="search-scope" v-model="scope" class="form-select">
                  <option value="assembly">Whole active assembly</option>
                  <option value="selection" :disabled="!selection">Selected assembly interval</option>
                </select>
                <small v-if="scope === 'selection' && selection" class="form-text">Bases {{ selection.startBp.toLocaleString() }}–{{ selection.endBp.toLocaleString() }} (zero-based, end excluded). This is the bounding interval of the selection.</small>
              </div>
              <div class="col-sm-6">
                <label for="search-strands" class="form-label">DNA strands</label>
                <select id="search-strands" v-model="bothStrands" class="form-select">
                  <option :value="true">Both strands</option>
                  <option :value="false">Forward assembly strand only</option>
                </select>
              </div>
              <div class="col-sm-6">
                <label for="search-mode" class="form-label">Matching</label>
                <select id="search-mode" v-model="mode" class="form-select">
                  <option value="exact" :disabled="!readiness.available('seqkit')">Exact match</option>
                  <option value="substitutions" :disabled="!readiness.available('seqkit')">Allow substitutions (SeqKit)</option>
                  <option value="blast" :disabled="!blastAvailable">Gapped local alignment (BLAST+)</option>
                </select>
                <small class="form-text">SeqKit finds exact/full-length substitution matches. BLAST finds similar subsequences with insertions and deletions; a hit is an alignment, not an exact occurrence. Both run locally.</small>
              </div>
              <div v-if="mode === 'substitutions'" class="col-sm-6">
                <label for="search-mismatches" class="form-label">Maximum substitutions per match</label>
                <input id="search-mismatches" v-model.number="mismatches" type="number" min="1" step="1" class="form-control" required />
              </div>
              <div v-else-if="mode === 'exact'" class="col-sm-6 form-check align-self-center ps-4">
                <input id="search-degenerate" v-model="degenerate" type="checkbox" class="form-check-input" />
                <label for="search-degenerate" class="form-check-label">Expand IUPAC ambiguity codes in queries</label>
                <small class="form-text d-block">Otherwise letters such as N are matched literally.</small>
              </div>
              <template v-if="mode === 'blast'">
                <div class="col-sm-6"><label class="form-label">Maximum E-value<input v-model.number="evalue" type="number" min="1e-100" step="any" required class="form-control" /></label></div>
                <div class="col-sm-6"><label class="form-label">Minimum identity (%)<input v-model.number="identity" type="number" min="0" max="100" step="any" required class="form-control" /></label></div>
                <div class="col-sm-6"><label class="form-label">Minimum query coverage per alignment (%)<input v-model.number="coverage" type="number" min="0" max="100" step="any" required class="form-control" /></label></div>
                <div class="col-sm-6"><label class="form-label">Maximum subject records per query<input v-model.number="maxTargets" type="number" min="1" max="1000000" step="1" required class="form-control" /></label></div>
                <small class="form-text">Uses blastn-short if any query is shorter than 50 bases, otherwise blastn. Low-complexity masking is off. Separate gap-free scaffold segments are searched as independent subjects; the target limit can omit weaker matches.</small>
              </template>
              <div class="col-sm-6">
                <label for="search-forward-color" class="form-label">Forward strand color</label>
                <input id="search-forward-color" v-model="forwardColor" type="color" class="form-control form-control-color" />
              </div>
              <div class="col-sm-6">
                <label for="search-reverse-color" class="form-label">Reverse strand color</label>
                <input id="search-reverse-color" v-model="reverseColor" type="color" class="form-control form-control-color" />
              </div>
            </div>
            <div class="form-check mt-3"><input id="search-save-data" v-model="saveReusable" type="checkbox" class="form-check-input" /><label for="search-save-data" class="form-check-label">Save reusable BED under DATA_DIR</label></div>
            <div v-if="saveReusable" class="row g-3 mt-0">
              <div class="col-sm-9"><label for="search-output" class="form-label">BED output path</label><input id="search-output" v-model.trim="outputFilename" class="form-control" required placeholder="sequence-analysis/search-results.bed" /><small class="form-text">Relative to DATA_DIR; parent folders are created.</small></div>
              <div class="col-sm-3 form-check align-self-end pb-2"><input id="search-overwrite" v-model="overwrite" type="checkbox" class="form-check-input" /><label for="search-overwrite" class="form-check-label">Overwrite</label></div>
            </div>
          </fieldset>
          <div v-if="job" class="mt-3" role="status" aria-live="polite">
            <span v-if="busy" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
            {{ job.status }}<span v-if="job.status === 'finished'">: {{ job.hits }} matches</span>
          </div>
          <pre v-if="job?.logs.length" class="sequence-logs mt-2" aria-label="Sequence search log">{{ job.logs.join('\n') }}</pre>
        </div>
        <footer class="modal-footer">
          <button v-if="busy && job" type="button" class="btn btn-outline-danger" @click="cancel">Cancel search</button>
          <button v-if="!busy" type="button" class="btn btn-outline-secondary" @click="emit('dismissed')">Close</button>
          <button type="submit" class="btn btn-primary" :disabled="busy || !!unavailableReason || !queries.trim()">Find sequences</button>
        </footer>
      </form>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";
import { ref, computed, onBeforeUnmount, onMounted } from "vue";
import { useSequenceReadiness } from "./useSequenceReadiness";
import SequenceGapSettings from "./SequenceGapSettings.vue";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { SequenceAnalysisRequest, type SequenceAnalysisJob, type SequenceSearchSettings } from "@/app/core/net/api/SequenceAnalysisRequest";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
import { useNotificationCenterStore } from "@/app/stores/notificationCenterStore";

const props = defineProps<{ mapManager: ContactMapManager; initialSelection?: boolean }>();
const emit = defineEmits<{ (e: "dismissed"): void }>();
const manager = props.mapManager.networkManager.requestManager;
const notifications = useNotificationCenterStore();
const borders = props.mapManager.viewAndLayersManager.currentViewState.selectionBorders;
const selection = borders.leftBP && borders.rightBP ? {
  startBp: Math.min(...borders.leftBP, ...borders.rightBP),
  endBp: Math.max(...borders.leftBP, ...borders.rightBP),
} : null;
const queries = ref("");
const scope = ref<"assembly" | "selection">(props.initialSelection && selection ? "selection" : "assembly");
const bothStrands = ref(true), degenerate = ref(false), mismatches = ref(1);
const mode = ref<"exact" | "substitutions" | "blast">("exact");
const evalue = ref(10), identity = ref(70), coverage = ref(50), maxTargets = ref(500);
const uiSettings = useUiSettingsStore();
const forwardColor = ref(uiSettings.sequenceForwardColor), reverseColor = ref(uiSettings.sequenceReverseColor);
const saveReusable = ref(false), overwrite = ref(false), outputFilename = ref("");
const readiness = useSequenceReadiness(manager);
const blastAvailable = computed(() => readiness.available("blastn"));
const blastUnavailableReason = computed(() => readiness.reason("blastn"));
const unavailableReason = computed(() => readiness.reason(mode.value === "blast" ? "blastn" : "seqkit"));
const submitting = ref(false), error = ref("");
const job = ref<SequenceAnalysisJob | null>(null);
const busy = computed(() => submitting.value || !!job.value && ["submitted", "preparing", "running"].includes(job.value.status));
let timer: number | undefined;
let disposed = false;
let openingResult = false;
let sourceSession: string | undefined;
useEscDismissableDialog({ priority: 1070, isOpen: () => true, canClose: () => !busy.value, requestClose: () => emit("dismissed") });
onBeforeUnmount(() => { disposed = true; window.clearTimeout(timer); });

async function start() {
  if (busy.value || unavailableReason.value) return;
  error.value = ""; submitting.value = true; openingResult = false;
  sourceSession = manager.history.applied?.session;
  const settings: SequenceSearchSettings = {
    gapLengthBp: uiSettings.sequenceGapLengthBp,
    queries: queries.value, scope: scope.value, mode: mode.value,
    bothStrands: bothStrands.value, degenerate: mode.value === "exact" && degenerate.value,
    mismatches: mismatches.value, threads: -1,
    evalue: evalue.value, identity: identity.value, coverage: coverage.value, maxTargets: maxTargets.value,
    forwardColor: forwardColor.value, reverseColor: reverseColor.value,
    ...(saveReusable.value ? { outputFilename: outputFilename.value || "sequence-analysis/search-results.bed", overwrite: overwrite.value } : {}),
    ...(scope.value === "selection" && selection ? selection : {}),
  };
  uiSettings.sequenceForwardColor = forwardColor.value;
  uiSettings.sequenceReverseColor = reverseColor.value;
  try {
    job.value = (await manager.sendRequest(new SequenceAnalysisRequest("/sequence/search/jobs", settings))).data;
    notifications.add("info", `Sequence search submitted (${scope.value}, ${bothStrands.value ? 'both strands' : 'forward strand'}, ${mode.value}).`);
    timer = window.setTimeout(poll, 300);
  } catch (failure) { error.value = extractErrorMessage(failure); }
  finally { submitting.value = false; }
}

async function poll() {
  if (disposed || !job.value) return;
  try {
    const jobs: SequenceAnalysisJob[] = (await manager.sendRequest(new SequenceAnalysisRequest("/sequence/jobs/list"))).data;
    const current = jobs.find(item => item.jobId === job.value?.jobId);
    if (!current) { error.value = "The server no longer has this job. Its files may be retained in processed/sequence-analysis."; job.value = null; return; }
    job.value = current;
    if (current.status === "finished" && !openingResult) {
      openingResult = true;
      if (sourceSession !== manager.history.applied?.session) {
        error.value = `The map changed while searching. Result saved at ${current.outputFile}; open it on the original map.`;
        notifications.add("warning", error.value); return;
      }
      if (current.hits > 0 && current.outputFile) {
        try { await props.mapManager.linearTrackManager.openTrack(current.outputFile, `Sequence search (${current.hits} matches)`); }
        catch (failure) {
          error.value = `Search finished, but the track could not be opened: ${extractErrorMessage(failure)}. The result is saved at ${current.outputFile}.`;
          notifications.add("error", error.value); return;
        }
      }
      notifications.add("success", `Sequence search completed: ${current.hits} matches. ${current.hits > 0 ? 'The track follows assembly edits; disrupted matches are marked.' : 'No matching sequence found.'}`);
      emit("dismissed"); return;
    }
    if (current.status === "failed") { error.value = current.error ?? "Sequence analysis failed"; notifications.add("error", error.value); return; }
    if (current.status === "cancelled") { notifications.add("info", "Sequence search cancelled."); return; }
  } catch (failure) { error.value = `Could not refresh search progress: ${extractErrorMessage(failure)}. Retrying…`; }
  if (!disposed) timer = window.setTimeout(poll, 1000);
}

async function cancel() {
  if (!job.value) return;
  try { await manager.sendRequest(new SequenceAnalysisRequest(`/sequence/jobs/${job.value.jobId}/stop`)); }
  catch (failure) { error.value = extractErrorMessage(failure); }
}
</script>

<style scoped>
.sequence-backdrop { position: fixed; inset: 0; background: #0007; z-index: 1065; }
.sequence-modal { position: fixed; inset: 4vh auto auto 50%; transform: translateX(-50%); width: min(900px, 96vw); z-index: 1070; }
.sequence-modal .modal-body { max-height: 75vh; overflow-y: auto; }
.sequence-input { font-family: ui-monospace, monospace; }
.sequence-logs { max-height: 13rem; overflow: auto; padding: 0.8rem; background: #eef2f7; color: #172b42; white-space: pre-wrap; }

.sequence-modal { font-family: system-ui, sans-serif; color: var(--hict-surface-fg, #172033); }
.sequence-modal .modal-content { border: 1px solid #cbd5e1; border-radius: 0.6rem; box-shadow: 0 12px 40px #0003; background: var(--hict-surface-bg, #fff); overflow: hidden; }
.sequence-modal .modal-header, .sequence-modal .modal-footer { padding: 1rem 1.4rem; display: flex; align-items: center; gap: 0.8rem; }
.sequence-modal .modal-header { justify-content: space-between; border-bottom: 1px solid #cbd5e1; }
.sequence-modal .modal-footer { justify-content: flex-end; border-top: 1px solid #cbd5e1; }
.sequence-modal .modal-body { padding: 1.2rem 1.4rem; }
.sequence-modal .form-check { padding-left: 1.7rem; }
</style>
