<template>
  <Teleport to="body">
    <div class="analysis-backdrop"></div>
    <section class="analysis-modal" role="dialog" aria-modal="true" aria-labelledby="moddotplot-title">
      <form class="modal-content" @submit.prevent="start">
        <header class="modal-header">
          <h5 id="moddotplot-title" class="modal-title">{{ title }}</h5>
          <button type="button" class="btn-close" aria-label="Close" :disabled="busy" @click="emit('dismissed')"></button>
        </header>
        <div class="modal-body">
          <p>{{ alignment ? "Align sequence from the linked FASTA" : "Estimate sequence identity from the linked FASTA" }} in the current assembly order, preserving AGP gaps and adding the configured separator between scaffolds. Debris and excluded sequence are omitted.</p>
          <p class="small">Scores are anchored to contact bins and follow assembly edits. They describe the captured sequence: new joins need recomputation. Each selected resolution is computed independently.</p>
          <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>
          <div v-if="unavailableReason" class="alert alert-warning" role="status">{{ unavailableReason }} <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="readiness.checking.value || busy" @click="readiness.refresh">Check again</button></div>
          <fieldset :disabled="busy">
            <SequenceGapSettings :request-manager="props.mapManager.networkManager.requestManager" />
            <label for="moddotplot-scope" class="form-label">Analysis scope</label>
            <select id="moddotplot-scope" v-model="scope" class="form-select mb-3">
              <option value="assembly">Whole active assembly</option>
              <option value="selection" :disabled="!selection">Selected rectangle</option>
            </select>
            <p v-if="scope === 'selection' && selection" class="small">Rows {{ selection.rowStart.toLocaleString() }}–{{ selection.rowEnd.toLocaleString() }}; columns {{ selection.columnStart.toLocaleString() }}–{{ selection.columnEnd.toLocaleString() }} bp (zero-based, end excluded). Boundary bins{{ alignment ? "" : " and neighboring sketch context" }} are included.</p>
            <label class="form-label">Window sizes / map resolutions</label>
            <div class="resolution-options mb-3">
              <label v-for="resolution in availableResolutions" :key="resolution" class="form-check">
                <input v-model="resolutions" class="form-check-input" type="checkbox" :value="resolution" />
                {{ resolution.toLocaleString() }} bp
              </label>
            </div>
            <p class="form-text">Fine windows over a whole genome can require many comparisons. Select a rectangle for a shorter calculation; other regions can be added later.</p>
            <div v-if="!alignment" class="row g-3">
              <div class="col-sm-6"><label for="moddotplot-identity" class="form-label">Minimum identity (%)</label><input id="moddotplot-identity" v-model.number="identity" type="number" min="0" max="100" step="0.1" class="form-control" required /></div>
              <div class="col-sm-6"><label for="moddotplot-k" class="form-label">k-mer length</label><input id="moddotplot-k" v-model.number="k" type="number" min="1" max="65535" step="1" class="form-control" required /></div>
              <div class="col-sm-6"><label for="moddotplot-sketch" class="form-label">Target sketch size</label><input id="moddotplot-sketch" v-model.number="sketchSize" type="number" min="1" max="1000000" step="1" class="form-control" required /></div>
              <div class="col-sm-6"><label for="moddotplot-delta" class="form-label">Neighbor expansion (fraction of window)</label><input id="moddotplot-delta" v-model.number="delta" type="number" min="0" max="1" step="0.1" class="form-control" required /></div>
              <div class="col-sm-6"><label for="moddotplot-threads" class="form-label">Worker threads</label><input id="moddotplot-threads" v-model.number="threads" type="number" min="-1" max="256" step="1" class="form-control" required /><small class="form-text">-1 uses all allocated logical CPUs; 0 chooses automatically; 1 is single-threaded.</small></div>
            </div>
            <div v-else class="row g-3">
              <div class="col-sm-6" v-for="option in alignmentOptions" :key="option.key"><label :for="'dotplot-' + option.key" class="form-label">{{ option.label }}</label><input :id="'dotplot-' + option.key" v-model.number="alignmentSettings[option.key]" type="number" :min="option.min ?? 1" :max="option.max" step="1" class="form-control" required /><small v-if="option.key === 'threads'" class="form-text">-1 uses all allocated CPUs; 0 chooses automatically.</small></div>
            </div>
            <div class="form-check mt-3">
              <input id="analysis-save-data" v-model="saveReusable" type="checkbox" class="form-check-input" />
              <label for="analysis-save-data" class="form-check-label">Save a reusable copy under DATA_DIR</label>
            </div>
            <div v-if="saveReusable" class="row g-3 mt-0">
              <div class="col-sm-9"><label for="analysis-output" class="form-label">Output path</label><input id="analysis-output" v-model.trim="outputFilename" class="form-control" required :placeholder="defaultOutputFilename" /><small class="form-text">Relative to DATA_DIR; parent folders are created.</small></div>
              <div class="col-sm-3 form-check align-self-end pb-2"><input id="analysis-overwrite" v-model="overwrite" type="checkbox" class="form-check-input" /><label for="analysis-overwrite" class="form-check-label">Overwrite</label></div>
            </div>
            <label class="form-check mt-3"><input v-model="mergeCompatible" type="checkbox" class="form-check-input" />Accumulate compatible regions; replace scores within this rectangle</label>
            <p class="small">Different settings create a separate overlay. After a successful update, the superseded matrix is removed once detached. Logs and provenance are retained. Cancellation or failure retains the previous matrix.</p>
            <label for="dotplot-display" class="form-label">Display completed result</label>
            <select id="dotplot-display" v-model="displayMode" class="form-select mb-2">
              <option value="overlay">Overlay on the Hi-C map</option>
              <option value="below">Below diagonal</option>
              <option value="none">Do not link now</option>
            </select>
            <p class="small">Attaching replaces the current secondary source and starts a new edit journal. To retain the current journal, choose “Do not link now” and attach the saved sidecar later.</p>
            <p v-if="!alignment" class="small">Uses Observed display. The ModDotPlot identity colormap runs from blue through yellow to red at 100%; zero/uncomputed cells are transparent. Coverage and provenance are saved in the sidecar.</p>
            <p v-if="alignment" class="small">Uses Observed display with sampled alignment counts. Counts are not identity percentages. The active minimap2/mm2-plus aligner is used; zeros are transparent.</p>
          </fieldset>
          <div v-if="job?.status === 'finished' && job.outputFile" class="alert alert-success mt-3" role="status">
            Generation completed. Saved overlay: <code class="text-break">{{ job.outputFile }}</code>
            <p class="mb-0">You can display this result without generating it again. A dotplot is a secondary matrix layer; sequence-search and annotation tracks are separate 1D layers.</p>
          </div>
          <div v-if="pendingCompatibility" class="alert alert-warning" role="alert">
            <strong>Review overlay compatibility</strong>
            <ul><li v-for="warning in pendingCompatibility.warnings" :key="warning">{{ warning }}</li></ul>
            <p>The current secondary layer is retained until you confirm. Missing areas may show only the background.</p>
            <button type="button" class="btn btn-outline-warning" :disabled="busy" @click="displaySavedResult(true)">Attach despite differences</button>
          </div>
          <div v-if="job" class="mt-3" role="status" aria-live="polite"><span v-if="busy" class="spinner-border spinner-border-sm me-2"></span>{{ job.status }}<span v-if="job.effectiveThreads"> · {{ job.effectiveThreads }} worker{{ job.effectiveThreads === 1 ? '' : 's' }}</span></div>
          <pre v-if="job?.logs.length" class="analysis-logs" aria-label="ModDotPlot log">{{ job.logs.join('\n') }}</pre>
        </div>
        <footer class="modal-footer">
          <button v-if="busy && job && !displaying" type="button" class="btn btn-outline-danger" @click="cancel">Cancel generation</button>
          <button v-if="!busy" type="button" class="btn btn-outline-secondary" @click="emit('dismissed')">Close</button>
          <button v-if="job?.status === 'finished' && job.outputFile && !pendingCompatibility" type="button" class="btn btn-outline-primary" :disabled="busy" @click="displaySavedResult()">{{ displayMode === 'none' ? 'Keep saved result' : 'Display saved result' }}</button>
          <button type="submit" class="btn btn-primary" :disabled="busy || !!unavailableReason || !resolutions.length">{{ title }}</button>
        </footer>
      </form>
    </section>
  </Teleport>
</template>
<script setup lang="ts">
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";
import { ref, computed, onBeforeUnmount } from "vue";
import { useSequenceReadiness } from "./useSequenceReadiness";
import SequenceGapSettings from "./SequenceGapSettings.vue";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { SequenceAnalysisRequest, type SequenceAnalysisJob } from "@/app/core/net/api/SequenceAnalysisRequest";
import type { SecondarySourceStatusResponse } from "@/app/core/net/api/RequestManager";
import { displaySequenceOverlay } from "@/app/core/sequence/displaySequenceOverlay";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
import { useNotificationCenterStore } from "@/app/stores/notificationCenterStore";
const props = defineProps<{ mapManager: ContactMapManager; initialSelection?: boolean; kind?: "moddotplot" | "dotplot" }>();
const alignment = props.kind === "dotplot";
const kind = alignment ? "dotplot" : "moddotplot";
const title = alignment ? "Generate dotplot from active assembly" : "Generate ModDotPlot";
const alignmentSettings = ref({ k: 15, window: 10, chainScore: 40, sampleBp: 100, minAlignmentLength: 100, threads: -1 });
const alignmentOptions: {key: keyof typeof alignmentSettings.value; label: string; min?: number; max: number}[] = [
  {key:"k", label:"Minimizer k", max:28}, {key:"window",label:"Minimizer window",max:255},
  {key:"chainScore",label:"Minimum chain score",max:1000000}, {key:"sampleBp",label:"Sample every (bp)",max:1000000},
  {key:"minAlignmentLength",label:"Minimum alignment length (bp)",max:100000000}, {key:"threads",label:"Alignment threads",min:-1,max:256},
];
const emit = defineEmits<{ (e: "dismissed"): void }>();
const api = props.mapManager.networkManager.requestManager, notifications = useNotificationCenterStore();
const readiness = useSequenceReadiness(api);
const unavailableReason = computed(() => readiness.reason(alignment ? "dotplot" : "hict-moddotplot"));
const view = props.mapManager.viewAndLayersManager;
const borders = view.currentViewState.selectionBorders;
const selection = borders.leftBP && borders.rightBP ? {
  rowStart: Math.min(borders.leftBP[1], borders.rightBP[1]), rowEnd: Math.max(borders.leftBP[1], borders.rightBP[1]),
  columnStart: Math.min(borders.leftBP[0], borders.rightBP[0]), columnEnd: Math.max(borders.leftBP[0], borders.rightBP[0]),
} : null;
const availableResolutions = [...view.resolutions].sort((a, b) => a - b);
const resolutions = ref([view.currentViewState.resolutionDesciptor.bpResolution]);
const scope = ref(props.initialSelection && selection ? "selection" : "assembly");
const identity = ref(80), k = ref(21), sketchSize = ref(1000), delta = ref(0.5);
const uiSettings = useUiSettingsStore();
const threads = ref(uiSettings.modDotPlotThreads);
const saveReusable = ref(false), overwrite = ref(false), outputFilename = ref("");
const defaultOutputFilename = `sequence-analysis/${kind}.hict.hdf5`;
const mergeCompatible = ref(true), displayMode = ref<"overlay" | "below" | "none">("below"), submitting = ref(false), error = ref("");
const job = ref<SequenceAnalysisJob | null>(null);
const displaying = ref(false);
const pendingCompatibility = ref<SecondarySourceStatusResponse | null>(null);
const busy = computed(() => submitting.value || displaying.value || !!job.value && ["submitted", "preparing", "running"].includes(job.value.status));
let disposed = false, openingResult = false, timer: number | undefined, session: string | undefined;
useEscDismissableDialog({ priority: 1070, isOpen: () => true, canClose: () => !busy.value, requestClose: () => emit("dismissed") });
onBeforeUnmount(() => { disposed = true; window.clearTimeout(timer); });
async function start() {
  if (busy.value || unavailableReason.value) return;
  submitting.value = true; error.value = ""; pendingCompatibility.value = null; openingResult = false; session = api.history.applied?.session;
  try {
    job.value = (await api.sendRequest(new SequenceAnalysisRequest(`/sequence/${kind}/jobs`, {
      gapLengthBp: uiSettings.sequenceGapLengthBp,
      scope: scope.value, region: scope.value === "selection" ? selection : undefined,
      resolutions: resolutions.value, mergeCompatible: mergeCompatible.value,
      ...(alignment ? alignmentSettings.value : { identity: identity.value, k: k.value,
        sketchSize: sketchSize.value, delta: delta.value, threads: threads.value }),
      ...(saveReusable.value ? { outputFilename: outputFilename.value || defaultOutputFilename, overwrite: overwrite.value } : {}),
    }))).data;
    if (!alignment) uiSettings.modDotPlotThreads = threads.value;
    notifications.add("info", `${title} submitted. The captured assembly is used throughout the calculation.`);
    timer = window.setTimeout(poll, 300);
  } catch (failure) { error.value = extractErrorMessage(failure); }
  finally { submitting.value = false; }
}
async function poll() {
  if (disposed || !job.value) return;
  try {
    const jobs: SequenceAnalysisJob[] = (await api.sendRequest(new SequenceAnalysisRequest("/sequence/jobs/list"))).data;
    const current = jobs.find(item => item.jobId === job.value?.jobId);
    if (!current) { error.value = "The server no longer has this job; its saved files remain under processed/sequence-analysis."; job.value = null; return; }
    job.value = current;
    if (current.status === "finished" && !openingResult) {
      openingResult = true;
      if (!current.outputFile) { error.value = "The completed job has no output file."; return; }
      await displaySavedResult(); return;
    }
    if (current.status === "failed") { error.value = current.error ?? `${title} failed`; notifications.add("error", error.value); return; }
    if (current.status === "cancelled") { notifications.add("info", `${title} cancelled; previous overlay retained.`); return; }
  } catch (failure) { error.value = `Progress refresh failed: ${extractErrorMessage(failure)}. Retrying…`; }
  if (!disposed) timer = window.setTimeout(poll, 1000);
}
async function displaySavedResult(allowMismatch = false) {
  const current = job.value;
  if (displaying.value || !current?.outputFile || current.status !== "finished") return;
  displaying.value = true; error.value = "";
  try {
    if (displayMode.value !== "none") {
      if (session !== api.history.applied?.session) {
        throw new Error("The active map session changed. Open the original map before attaching this saved overlay.");
      }
      const response = await api.openSecondarySource(current.outputFile, allowMismatch);
      if (response.requiresConfirmation) { pendingCompatibility.value = response; return; }
      pendingCompatibility.value = null;
      // Attachment starts a new history session. A later display retry must use it.
      session = api.history.applied?.session;
      await displaySequenceOverlay(props.mapManager, displayMode.value, kind, response, identity.value);
    }
    try { await api.sendRequest(new SequenceAnalysisRequest("/sequence/cleanup")); }
    catch (failure) { notifications.add("warning", `Overlay saved, but superseded-file cleanup needs retry: ${extractErrorMessage(failure)}`); }
    notifications.add("success", `${title} completed: ${current.outputFile}.`);
    emit("dismissed");
  } catch (failure) {
    error.value = `The overlay was saved, but could not be displayed: ${extractErrorMessage(failure)}`;
    notifications.add("warning", error.value);
  } finally { displaying.value = false; }
}
async function cancel() {
  if (!job.value) return;
  try { await api.sendRequest(new SequenceAnalysisRequest(`/sequence/jobs/${job.value.jobId}/stop`)); }
  catch (failure) { error.value = extractErrorMessage(failure); }
}
</script>
<style scoped>
.analysis-backdrop { position: fixed; inset: 0; background: #0007; z-index: 1065; }
.analysis-modal { position: fixed; inset: 3vh auto auto 50%; transform: translateX(-50%); width: min(850px, 96vw); z-index: 1070; }
.analysis-modal .modal-body { max-height: 77vh; overflow-y: auto; }
.resolution-options { display: flex; flex-wrap: wrap; gap: 0.5rem 2rem; padding-left: 1.5rem; }
.analysis-logs { margin-top: 0.8rem; max-height: 12rem; overflow: auto; padding: 0.8rem; background: #eef2f7; color: #172b42; white-space: pre-wrap; }

.analysis-modal { font-family: system-ui, sans-serif; color: var(--hict-surface-fg, #172033); }
.analysis-modal .modal-content { border: 1px solid #cbd5e1; border-radius: 0.6rem; box-shadow: 0 12px 40px #0003; background: var(--hict-surface-bg, #fff); overflow: hidden; }
.analysis-modal .modal-header, .analysis-modal .modal-footer { padding: 1rem 1.4rem; display: flex; align-items: center; gap: 0.8rem; }
.analysis-modal .modal-header { justify-content: space-between; border-bottom: 1px solid #cbd5e1; }
.analysis-modal .modal-footer { justify-content: flex-end; border-top: 1px solid #cbd5e1; }
.analysis-modal .modal-body { padding: 1.2rem 1.4rem; }
.analysis-modal .form-check { padding-left: 1.7rem; }
</style>
