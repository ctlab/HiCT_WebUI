<template>
  <Teleport to="body">
    <div class="modal-backdrop fade show"></div>
    <div ref="dialog" class="modal fade show d-block" role="dialog" aria-modal="true"
      aria-labelledby="dotplot-results-title" tabindex="-1" :inert="picker || !!confirmation">
      <div class="modal-dialog modal-dialog-scrollable results-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <div>
              <h5 id="dotplot-results-title" class="modal-title">Dotplot results</h5>
              <div class="results-muted">
                For the open map {{ session.openMapFilename }}. Results follow your edits; joins changed after a run are not recomputed.
              </div>
            </div>
            <button type="button" class="btn-close" aria-label="Close" @click="emit('dismissed')" />
          </div>
          <div class="modal-body results-body" :aria-busy="busy">
            <p v-if="busy && !results.length" role="status" class="results-muted mb-0">Loading dotplot results…</p>
            <p v-if="error" class="results-error mb-0" role="alert">
              <strong v-if="mismatch">{{ mismatchHeading }}</strong>{{ mismatch ? error.slice(mismatchHeading.length) : error }}
            </p>
            <p v-if="!busy && !results.length && !error" class="results-muted mb-0">No dotplot results for this map.</p>
            <article v-for="result in results" :key="result.id" class="result-set" :aria-label="result.name">
              <header class="result-header">
                <i class="bi bi-grid-3x3" aria-hidden="true"></i>
                <strong>{{ result.name }}</strong>
                <span class="results-muted">{{ result.regions.length }} {{ result.regions.length === 1 ? 'region' : 'regions' }} · {{ sizes(result.resolutions) }} · {{ formatEstimateBytes(result.sizeBytes) }}</span>
                <label class="visibility-switch ms-auto">
                  <input type="checkbox" class="form-check-input" role="switch" :checked="result.shown"
                    :aria-label="`Show ${result.name}`" :disabled="busy" @change="toggle(result, $event)" />
                  {{ result.shown ? shownText[result.displayMode] : 'Hidden' }}
                </label>
              </header>
              <template v-if="result.shown">
                <div class="result-file">
                  <i class="bi bi-file-earmark" aria-hidden="true"></i>
                  <code :title="result.file">{{ result.file }}</code>
                  <button type="button" class="btn btn-sm btn-link text-nowrap ms-auto" @click="copyPath(result.file)">
                    <i class="bi bi-clipboard" aria-hidden="true"></i> Copy path
                  </button>
                </div>
                <div class="table-responsive">
                  <table class="result-regions">
                    <thead><tr><th scope="col">#</th><th scope="col">Rows</th><th scope="col">Columns</th><th scope="col">Sizes</th><th scope="col">Added</th><th scope="col"><span class="visually-hidden">Go to region</span></th></tr></thead>
                    <tbody>
                      <tr v-for="region in result.regions" :key="region.index">
                        <td>{{ region.index }}</td>
                        <td>{{ describeBounds(region.rows) }}<span v-if="region.split" class="results-muted"> · split</span></td>
                        <td>{{ sameBounds(region) ? 'same' : describeBounds(region.columns) }}</td>
                        <td>{{ sizes(region.levels) }}</td>
                        <td>{{ formatDate(region.addedAt) }}</td>
                        <td><button type="button" class="btn btn-sm result-button" :disabled="busy || !hasArea(region)" @click="goTo(region)">Go to</button></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div class="result-actions">
                  <button type="button" class="btn btn-sm result-button" :disabled="busy" @click="save(result)">
                    <i class="bi bi-download" aria-hidden="true"></i> Save a copy…
                  </button>
                  <label class="btn btn-sm result-button mb-0">
                    <input v-model="settings.showOutlines" type="checkbox" class="form-check-input me-1" /> Show region outlines
                  </label>
                  <button type="button" class="btn btn-sm btn-outline-danger ms-auto" :disabled="busy" @click="confirmation = result">
                    <i class="bi bi-trash" aria-hidden="true"></i> Delete…
                  </button>
                </div>
              </template>
            </article>
            <div v-if="results.length" class="results-muted">One result set is shown at a time. Turning one on hides the others.</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary me-auto" :disabled="busy" @click="picker = true">
              <i class="bi bi-folder2-open" aria-hidden="true"></i> Open dotplot file…
            </button>
            <button type="button" class="btn btn-outline-secondary" @click="emit('dismissed')">Close</button>
          </div>
        </div>
      </div>
    </div>
    <UniversalFileSelector v-if="picker" :network-manager="props.mapManager.networkManager" require-selection
      title="Open dotplot file" file-type=".hict.hdf5" :file-name-predicate="isDotplotFilename"
      :z-index="1100" @selected="open" @dismissed="picker = false" />
    <ConfirmActionDialog v-if="confirmation" title="Delete this result set?" confirm-label="Delete" tone="danger" icon="bi-trash"
      :busy="busy" @cancel="confirmation = null" @confirm="remove">
      Its file is removed from the processed data folder. Saved copies are not affected.
    </ConfirmActionDialog>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import type { DotplotRegion, DotplotResult } from "@/app/core/net/api/RequestManager";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";
import { formatLength } from "@/app/core/format/formatSignal";
import { formatEstimateBytes } from "@/app/core/sequence/formatEstimateBytes";
import { applyDotplotResult, formatDotplotSizes, saveDotplotResult } from "@/app/core/sequence/dotplotResults";
import { useSessionStore } from "@/app/stores/sessionStore";
import { useDotplotResultsStore } from "@/app/stores/dotplotResultsStore";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
import { useModalFocus } from "@/app/ui/modalFocus";
import ConfirmActionDialog from "@/app/ui/components/common/ConfirmActionDialog.vue";
import UniversalFileSelector from "./UniversalFileSelector.vue";

const props = defineProps<{ mapManager: ContactMapManager }>();
const emit = defineEmits<{ (event: "dismissed"): void }>();
const session = useSessionStore();
const settings = useDotplotResultsStore();
const api = props.mapManager.networkManager.requestManager;
const dialog = ref<HTMLElement | null>(null);
const results = ref<DotplotResult[]>([]);
const busy = ref(false);
const picker = ref(false);
const confirmation = ref<DotplotResult | null>(null);
useModalFocus(dialog, () => !picker.value && !confirmation.value);
const error = ref("");
const mismatchHeading = "This dotplot file belongs to a different map.";
const mismatch = computed(() => error.value.startsWith(mismatchHeading));
const shownText = { overlay: "Shown over the map", above: "Shown above diagonal", below: "Shown below diagonal" };
const sizes = (levels: number[]) => formatDotplotSizes(levels, formatLength);
const isDotplotFilename = (filename: string) => filename.toLowerCase().endsWith(".hict.hdf5");

function formatDate(value: string): string {
  const date = new Date(value);
  return `${date.toLocaleDateString("en-GB", {day: "numeric", month: "short"})} ${
    date.toLocaleTimeString("en-GB", {hour: "2-digit", minute: "2-digit"})}`;
}

function describeBounds(bounds: DotplotRegion["rows"]): string {
  if (bounds.start === bounds.end) return "—";
  const holder = props.mapManager.contigDimensionHolder;
  const first = holder.getContigLocusByBp(bounds.start);
  const last = holder.getContigLocusByBp(bounds.end - 1);
  return first.contigId === last.contigId
    ? `${first.contigName}: ${formatLength(first.inContigBp)}–${formatLength(last.inContigBp + 1)}`
    : `${first.contigName} ${formatLength(first.inContigBp)}–${last.contigName} ${formatLength(last.inContigBp + 1)}`;
}

function sameBounds(region: DotplotRegion): boolean {
  return region.rows.start === region.columns.start && region.rows.end === region.columns.end;
}

function hasArea(region: DotplotRegion): boolean {
  return region.rows.start < region.rows.end && region.columns.start < region.columns.end;
}

async function run(action: () => Promise<void>): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try { await action(); }
  catch (failure) { error.value = extractErrorMessage(failure); }
  finally { busy.value = false; }
}

async function refresh(): Promise<void> {
  results.value = await api.listDotplotResults();
}

function toggle(result: DotplotResult, event: Event): void {
  const shown = (event.target as HTMLInputElement).checked;
  (event.target as HTMLInputElement).checked = result.shown;
  void run(async () => {
    await applyDotplotResult(props.mapManager, await api.showDotplotResult(result.id, shown));
    await refresh();
  });
}

function open(filename: string): void {
  picker.value = false;
  void run(async () => {
    await applyDotplotResult(props.mapManager, await api.openDotplotResult(filename));
    await refresh();
  });
}

function remove(): void {
  const result = confirmation.value;
  if (!result) return;
  confirmation.value = null;
  void run(async () => {
    await applyDotplotResult(props.mapManager, await api.deleteDotplotResult(result.id));
    await refresh();
  });
}

function save(result: DotplotResult): void {
  void run(() => saveDotplotResult(api, result.id, result.downloadFilename));
}

function copyPath(path: string): void {
  void run(() => navigator.clipboard.writeText(path));
}

function goTo(region: DotplotRegion): void {
  props.mapManager.viewAndLayersManager.goToDotplotRegion(region);
  emit("dismissed");
}

useEscDismissableDialog({ priority: 1100, isOpen: () => true,
  canClose: () => !picker.value && !confirmation.value, requestClose: () => emit("dismissed") });
onMounted(() => void run(refresh));
</script>

<style scoped>
.results-dialog { max-width: 700px; }
.results-body { display: flex; flex-direction: column; gap: 12px; padding: 14px 22px; }
.results-muted { font-size: 12.5px; color: #667085; }
.result-set { border: 1px solid #eaecf0; border-radius: 8px; overflow: hidden; }
.result-header, .result-file, .result-actions { display: flex; align-items: center; gap: 8px; padding: 10px 12px; flex-wrap: wrap; }
.result-header { background: #f9fafb; border-bottom: 1px solid #eaecf0; font-size: 14px; }
.visibility-switch { display: flex; align-items: center; gap: 6px; font-size: 13px; white-space: nowrap; }
.visibility-switch .form-check-input { width: 30px; height: 16px; margin: 0; border-radius: 8px; background: #d0d5dd; border: 0; position: relative; }
.visibility-switch .form-check-input:checked { background: var(--bs-primary); }
.visibility-switch .form-check-input::after { content: ""; position: absolute; width: 12px; height: 12px; border-radius: 50%; background: white; top: 2px; left: 2px; }
.visibility-switch .form-check-input:checked::after { left: 16px; }
.result-file { color: #475467; flex-wrap: nowrap; padding-block: 6px; border-bottom: 1px solid #f2f4f7; }
.result-file code { background: #f2f4f7; color: #344054; border-radius: 4px; padding: 1px 6px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.result-regions { width: 100%; font-size: 12.5px; font-variant-numeric: tabular-nums; }
.result-regions th, .result-regions td { padding: 6px 12px; border-bottom: 1px solid #f2f4f7; white-space: nowrap; }
.result-regions th { color: #667085; font-weight: 600; }
.result-button { border-color: #d0d5dd; color: #344054; font-size: 12.5px; white-space: nowrap; }
.result-button:hover { border-color: #98a2b3; }
.results-error { background: #fef3f2; border: 1px solid #fecdca; border-radius: 8px; padding: 10px 12px; color: #7a271a; font-size: 13px; }
</style>
