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
            </div>
            <div v-else class="row g-3">
              <div class="col-sm-6" v-for="option in alignmentOptions" :key="option.key"><label :for="'dotplot-' + option.key" class="form-label">{{ option.label }}</label><input :id="'dotplot-' + option.key" v-model.number="alignmentSettings[option.key]" type="number" :min="1" :max="option.max" step="1" class="form-control" required /></div>
            </div>
            <label class="form-check mt-3"><input v-model="mergeCompatible" type="checkbox" class="form-check-input" />Accumulate compatible regions; replace scores within this rectangle</label>
            <p class="small">Different settings create a separate overlay. After a successful update, the superseded matrix is removed once detached. Logs and provenance are retained. Cancellation or failure retains the previous matrix.</p>
            <label class="form-check"><input v-model="displayResult" type="checkbox" class="form-check-input" />Show result below the diagonal, replacing the current secondary overlay</label>
            <p class="small">Attaching a secondary map starts a new edit journal. To retain the current journal, leave this unchecked and attach the saved sidecar later.</p>
            <p v-if="!alignment" class="small">Uses Observed display: Hi-C above, identity below. Identity colours run from blue at the threshold to red at 100%; zero/uncomputed cells are transparent. Coverage and provenance are saved in the sidecar.</p>
            <p v-if="alignment" class="small">Uses Observed display: Hi-C above, sampled alignment counts below. Counts are not identity percentages. The active minimap2/mm2-plus aligner is used; zeros are transparent.</p>
          </fieldset>
          <div v-if="job" class="mt-3" role="status" aria-live="polite"><span v-if="busy" class="spinner-border spinner-border-sm me-2"></span>{{ job.status }}</div>
          <pre v-if="job?.logs.length" class="analysis-logs" aria-label="ModDotPlot log">{{ job.logs.join('\n') }}</pre>
        </div>
        <footer class="modal-footer">
          <button v-if="busy && job" type="button" class="btn btn-outline-danger" @click="cancel">Cancel generation</button>
          <button v-if="!busy" type="button" class="btn btn-outline-secondary" @click="emit('dismissed')">Close</button>
          <button type="submit" class="btn btn-primary" :disabled="busy || !resolutions.length">{{ title }}</button>
        </footer>
      </form>
    </section>
  </Teleport>
</template>
<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from "vue";
import SequenceGapSettings from "./SequenceGapSettings.vue";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { SequenceAnalysisRequest, type SequenceAnalysisJob } from "@/app/core/net/api/SequenceAnalysisRequest";
import { SetVisualizationOptionsRequest } from "@/app/core/net/api/request";
import { modDotPlotLowerExpression } from "@/app/core/sequence/modDotPlot";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
import { useNotificationCenterStore } from "@/app/stores/notificationCenterStore";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
const props = defineProps<{ mapManager: ContactMapManager; initialSelection?: boolean; kind?: "moddotplot" | "dotplot" }>();
const alignment = props.kind === "dotplot";
const kind = alignment ? "dotplot" : "moddotplot";
const title = alignment ? "Generate dotplot from active assembly" : "Generate ModDotPlot";
const alignmentSettings = ref({ k: 15, window: 10, chainScore: 40, sampleBp: 100, minAlignmentLength: 100, threads: 4 });
const alignmentOptions: {key: keyof typeof alignmentSettings.value; label: string; max: number}[] = [
  {key:"k", label:"Minimizer k", max:28}, {key:"window",label:"Minimizer window",max:255},
  {key:"chainScore",label:"Minimum chain score",max:1000000}, {key:"sampleBp",label:"Sample every (bp)",max:1000000},
  {key:"minAlignmentLength",label:"Minimum alignment length (bp)",max:100000000}, {key:"threads",label:"Alignment threads",max:256},
];
const emit = defineEmits<{ (e: "dismissed"): void }>();
const api = props.mapManager.networkManager.requestManager, notifications = useNotificationCenterStore();
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
const mergeCompatible = ref(true), displayResult = ref(true), submitting = ref(false), error = ref("");
const job = ref<SequenceAnalysisJob | null>(null);
const busy = computed(() => submitting.value || !!job.value && ["submitted", "preparing", "running"].includes(job.value.status));
let disposed = false, openingResult = false, timer: number | undefined, session: string | undefined;
useEscDismissableDialog({ priority: 1070, isOpen: () => true, canClose: () => !busy.value, requestClose: () => emit("dismissed") });
onBeforeUnmount(() => { disposed = true; window.clearTimeout(timer); });
async function start() {
  if (busy.value) return;
  submitting.value = true; error.value = ""; openingResult = false; session = api.history.applied?.session;
  try {
    job.value = (await api.sendRequest(new SequenceAnalysisRequest(`/sequence/${kind}/jobs`, {
      gapLengthBp: useUiSettingsStore().sequenceGapLengthBp,
      scope: scope.value, region: scope.value === "selection" ? selection : undefined,
      resolutions: resolutions.value, identity: identity.value, k: k.value, sketchSize: sketchSize.value,
      delta: delta.value, mergeCompatible: mergeCompatible.value,
      ...(alignment ? alignmentSettings.value : {}),
    }))).data;
    notifications.add("info", `${title} submitted. The captured assembly is used throughout the calculation.`);
    timer = window.setTimeout(poll, 300);
  } catch (failure) { error.value = String(failure); }
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
      if (displayResult.value) {
        if (session !== api.history.applied?.session) { error.value = `The map changed. Overlay saved at ${current.outputFile}; attach it to its original map.`; notifications.add("warning", error.value); return; }
        try {
          const response = await api.openSecondarySource(current.outputFile);
          if (response.requiresConfirmation) throw new Error("Overlay compatibility needs review in the Tracks dialog");
          view.setSecondaryResolutionModel(response.compatibility);
          const options = useVisualizationOptionsStore();
          if (options.signalDisplayMode !== "OBSERVED") {
            options.signalDisplayMode = "OBSERVED";
            await api.setVisualizationOptions(new SetVisualizationOptionsRequest({ options: options.asVisualizationOptions(), preserveRenderPipeline: true }));
          }
          const pipeline = await api.getRenderPipelineConfig();
          await api.setRenderPipelineConfig({ ...pipeline, enabled: true, swapUpperLower: false,
            lowerExpression: alignment ? { type: "colormap", mode: "LINEAR", input: { type: "source", source: "SECONDARY" },
              startColor: "#00008000", endColor: "#000080ff", minSignal: 0, maxSignal: 20 } : modDotPlotLowerExpression(identity.value) });
          await props.mapManager.reloadTilesFromBackend();
        } catch (failure) { error.value = `Saved at ${current.outputFile}, but could not display it: ${String(failure)}`; notifications.add("error", error.value); return; }
      }
      try { await api.sendRequest(new SequenceAnalysisRequest("/sequence/cleanup")); }
      catch (failure) { notifications.add("warning", `Overlay saved, but superseded-file cleanup needs retry: ${String(failure)}`); }
      notifications.add("success", `${title} completed: ${current.outputFile}. Superseded matrices are reclaimed after successful publication and detach.`);
      emit("dismissed"); return;
    }
    if (current.status === "failed") { error.value = current.error ?? `${title} failed`; notifications.add("error", error.value); return; }
    if (current.status === "cancelled") { notifications.add("info", `${title} cancelled; previous overlay retained.`); return; }
  } catch (failure) { error.value = `Progress refresh failed: ${String(failure)}. Retrying…`; }
  if (!disposed) timer = window.setTimeout(poll, 1000);
}
async function cancel() {
  if (!job.value) return;
  try { await api.sendRequest(new SequenceAnalysisRequest(`/sequence/jobs/${job.value.jobId}/stop`)); }
  catch (failure) { error.value = String(failure); }
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
