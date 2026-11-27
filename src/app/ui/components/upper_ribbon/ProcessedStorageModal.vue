<template>
  <Teleport to="body">
    <div class="modal-backdrop fade show"></div>
    <div
      ref="modalElement"
      class="modal fade show d-block storage-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="processed-storage-title"
      tabindex="-1"
      :inert="!!confirmation"
    >
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 id="processed-storage-title" class="modal-title">Processed data manager</h5>
            <button type="button" class="btn-close" aria-label="Close" :disabled="cleaning" @click="close" />
          </div>

          <div class="modal-body" :aria-busy="loading || cleaning">
            <p v-if="loading" class="d-flex align-items-center gap-2" role="status">
              <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
              Reading processed storage…
            </p>
            <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>
            <div v-if="result" class="alert alert-info" role="status">
              Removed {{ result.deleted.toLocaleString() }} {{ result.deleted === 1 ? "file" : "files" }}
              ({{ formatBytes(result.bytes) }}).
              <span v-if="result.changedOrMissing">
                {{ result.changedOrMissing.toLocaleString() }} changed or missing and skipped.
              </span>
              <ul v-if="result.skipped.length" class="mb-0 mt-2">
                <li v-for="item in result.skipped" :key="item.path">{{ item.path }} — {{ item.reason }}</li>
              </ul>
            </div>

            <template v-if="inventory">
              <div class="d-flex align-items-baseline justify-content-between gap-2 flex-wrap mb-2">
                <div><strong class="fs-5">{{ formatBytes(totalBytes) }}</strong>
                  <span class="text-body-secondary"> across {{ inventory.files.length.toLocaleString() }} files</span>
                </div>
                <button class="btn btn-sm btn-outline-secondary" type="button" :disabled="busy" @click="refresh">
                  Refresh
                </button>
              </div>
              <details class="small mb-3">
                <summary>Storage folders</summary>
                <ul class="mb-1 ps-4">
                  <li v-for="root in inventory.roots" :key="root"><code class="file-path">{{ root }}</code></li>
                </ul>
                <p class="mb-0">The list also includes outputs recorded by matrix conversions.</p>
              </details>
              <p v-if="inventory.unreadable" class="text-warning-emphasis small" role="status">
                Some paths or conversion records could not be read.
              </p>
              <p v-if="inventory.jobsActive" class="alert alert-secondary">
                Cleanup is available once background jobs finish. Refresh to check again.
              </p>

              <div v-if="groups.length" class="storage-chart mb-3" role="group" aria-label="Storage by file type">
                <button
                  v-for="group in groups"
                  :key="group.category"
                  type="button"
                  class="chart-row"
                  :aria-pressed="filter === group.category"
                  :aria-label="`${group.label}, ${formatBytes(group.bytes)}, ${group.count} files`"
                  @click="filter = filter === group.category ? null : group.category"
                >
                  <span>{{ group.label }}</span>
                  <span class="chart-track" aria-hidden="true">
                    <span class="chart-bar" :style="{ width: group.percent + '%', backgroundColor: group.color }"></span>
                  </span>
                  <span class="text-end text-nowrap">{{ formatBytes(group.bytes) }}</span>
                </button>
              </div>

              <div class="d-flex align-items-center gap-2 flex-wrap mb-2">
                <button type="button" class="btn btn-sm btn-outline-secondary" :aria-pressed="filter === null" @click="filter = null">
                  All files
                </button>
                <span class="text-body-secondary small">{{ filteredFiles.length.toLocaleString() }} shown in {{ filter ? categories[filter].label.toLowerCase() : "all types" }}</span>
                <button
                  v-if="visibleMaps.length"
                  type="button"
                  class="btn btn-sm btn-outline-secondary ms-auto"
                  :disabled="busy"
                  @click="toggleVisible"
                >
                  {{ allVisibleSelected ? "Clear selection on this page" : "Select removable maps on this page" }}
                </button>
              </div>
              <div v-if="pageFiles.length" class="table-responsive">
                <table class="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th scope="col"><span class="visually-hidden">Select map for removal</span></th>
                      <th scope="col">File</th>
                      <th scope="col">Type</th>
                      <th scope="col" class="text-end">Size</th>
                      <th scope="col" class="text-nowrap">Last modified</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="file in pageFiles" :key="file.id">
                      <td>
                        <input
                          v-if="isRemovableMap(file)"
                          v-model="selectedMaps"
                          type="checkbox"
                          class="form-check-input"
                          :value="file.id"
                          :aria-label="`Select ${file.path} for removal`"
                          :disabled="busy"
                        />
                      </td>
                      <td>
                        <code class="file-path">{{ file.path }}</code>
                        <small v-if="file.protectedReason" class="d-block text-body-secondary">{{ file.protectedReason }}</small>
                      </td>
                      <td>{{ categories[file.category].label }}</td>
                      <td class="text-end text-nowrap">{{ formatBytes(file.bytes) }}</td>
                      <td class="text-nowrap">
                        {{ formatDate(file.modifiedAtMs) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="text-body-secondary mb-0">No processed files found.</p>
              <div v-if="pageCount > 1" class="d-flex align-items-center gap-2 justify-content-end mt-3">
                <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="page === 1" @click="page--">Previous</button>
                <span aria-live="polite">Page {{ page }} of {{ pageCount }}</span>
                <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="page === pageCount" @click="page++">Next</button>
              </div>
            </template>
          </div>

          <div class="modal-footer justify-content-between">
            <div v-if="inventory" class="d-flex gap-2 flex-wrap">
              <button type="button" class="btn btn-outline-secondary" :disabled="cleanupDisabled || !caches.length" @click="confirmCleanup('cache', caches)">
                Prune caches ({{ caches.length.toLocaleString() }})
              </button>
              <button type="button" class="btn btn-outline-secondary" :disabled="cleanupDisabled || !oldFiles.length" @click="confirmCleanup('old', oldFiles)">
                Remove old temporary files ({{ oldFiles.length.toLocaleString() }})
              </button>
              <button type="button" class="btn btn-outline-danger" :disabled="cleanupDisabled || !maps.length" @click="confirmCleanup('maps', maps)">
                Remove selected maps ({{ maps.length.toLocaleString() }})
              </button>
            </div>
            <button v-else-if="error" type="button" class="btn btn-outline-secondary" :disabled="busy" @click="refresh">Retry</button>
            <button type="button" class="btn btn-secondary ms-auto" :disabled="cleaning" @click="close">Close</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type {
  RequestManager,
  ProcessedStorage,
  ProcessedStorageCategory,
  ProcessedStorageCleanup,
  ProcessedStorageFile,
} from "@/app/core/net/api/RequestManager";
import type { ProcessedStorageAction } from "@/app/core/net/api/request";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";
import { askForConfirmation, confirmation } from "@/app/ui/confirmAction";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
import { useModalFocus } from "@/app/ui/modalFocus";

const props = defineProps<{ requests: RequestManager }>();
const emit = defineEmits<{ (event: "dismissed"): void }>();

const categories = {
  maps: { label: "Processed maps", color: "#2563eb" },
  cache: { label: "Regenerable caches", color: "#0e7490" },
  coverage: { label: "Square-root coverage", color: "#047857" },
  scratch: { label: "Temporary files", color: "#9a530b" },
  sequence: { label: "Sequence analysis files", color: "#6d28d9" },
  metadata: { label: "Job and conversion records", color: "#3f6212" },
  other: { label: "Other files", color: "#475569" },
};
const pageSize = 75;
const inventory = ref<ProcessedStorage>();
const result = ref<ProcessedStorageCleanup>();
const loading = ref(false);
const cleaning = ref(false);
const error = ref("");
const page = ref(1);
const filter = ref<ProcessedStorageCategory | null>(null);
const selectedMaps = ref(new Set<string>());
const modalElement = ref<HTMLElement | null>(null);

const files = computed(() => inventory.value?.files ?? []);
const totalBytes = computed(() => sizeOf(files.value));
const groups = computed(() => {
  const counts = new Map<ProcessedStorageCategory, { bytes: number; count: number }>();
  for (const file of files.value) {
    const group = counts.get(file.category) ?? { bytes: 0, count: 0 };
    group.count++;
    group.bytes += file.bytes;
    counts.set(file.category, group);
  }
  return Array.from(counts, ([category, group]) => ({
    category,
    ...categories[category],
    ...group,
    percent: totalBytes.value ? group.bytes / totalBytes.value * 100 : 0,
  })).sort((a, b) => b.bytes - a.bytes || a.label.localeCompare(b.label));
});
const filteredFiles = computed(() => filter.value === null
  ? files.value : files.value.filter((file) => file.category === filter.value));
const pageCount = computed(() => Math.max(1, Math.ceil(filteredFiles.value.length / pageSize)));
const pageFiles = computed(() => filteredFiles.value.slice((page.value - 1) * pageSize, page.value * pageSize));
const visibleMaps = computed(() => pageFiles.value.filter(isRemovableMap));
const allVisibleSelected = computed(() => visibleMaps.value.every((file) => selectedMaps.value.has(file.id)));
const maps = computed(() => files.value.filter((file) => isRemovableMap(file) && selectedMaps.value.has(file.id)));
const caches = computed(() => files.value.filter((file) => file.action === "cache" && !file.protectedReason));
const oldFiles = computed(() => files.value.filter((file) => file.action === "old" && !file.protectedReason));
const busy = computed(() => loading.value || cleaning.value);
const cleanupDisabled = computed(() => busy.value || inventory.value?.jobsActive);
watch(filter, () => { page.value = 1; });
watch(pageCount, (count) => { page.value = Math.min(count, page.value); });

function isRemovableMap(file: ProcessedStorageFile): boolean {
  return file.action === "maps" && !file.protectedReason;
}

function toggleVisible(): void {
  const next = new Set(selectedMaps.value);
  for (const file of visibleMaps.value) {
    if (allVisibleSelected.value) next.delete(file.id);
    else next.add(file.id);
  }
  selectedMaps.value = next;
}

function sizeOf(entries: ProcessedStorageFile[]): number {
  return entries.reduce((sum, file) => sum + file.bytes, 0);
}

function formatBytes(bytes: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  let unit = 0;
  while (bytes >= 1024 && unit < units.length - 1) {
    bytes /= 1024;
    unit++;
  }
  return `${bytes.toLocaleString(undefined, { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString();
}

async function refresh(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const latest = await props.requests.getProcessedStorage();
    inventory.value = latest;
    selectedMaps.value = new Set(latest.files.filter((file) =>
      isRemovableMap(file) && selectedMaps.value.has(file.id)).map((file) => file.id));
    if (filter.value && !latest.files.some((file) => file.category === filter.value)) filter.value = null;
  } catch (failure) {
    error.value = extractErrorMessage(failure, "Could not read processed storage.");
  } finally {
    loading.value = false;
  }
}

async function confirmCleanup(action: ProcessedStorageAction, entries: ProcessedStorageFile[]): Promise<void> {
  const text = {
    cache: { title: "Prune caches?", help: "HiCT rebuilds these files when needed." },
    old: { title: "Remove old temporary files?", help: `This removes temporary files older than ${inventory.value?.oldDays} days.` },
    maps: { title: "Remove selected HiCT maps?", help: "Re-converting or regenerating these .hict.hdf5 maps can take a long time." },
  }[action];
  const summary = `${entries.length.toLocaleString()} ${entries.length === 1 ? "file" : "files"} · ${formatBytes(sizeOf(entries))}`;
  const details = entries.slice(0, 12).map((file) => file.path);
  if (entries.length > details.length) details.push(`… and ${entries.length - details.length} more`);
  const decision = await askForConfirmation({
    title: text.title,
    body: `${summary}. ${text.help}`,
    tone: "danger",
    icon: "bi-trash3",
    confirmLabel: "Remove files",
    details,
  });
  if (decision !== "confirm") return;
  cleaning.value = true;
  result.value = undefined;
  error.value = "";
  try {
    result.value = await props.requests.cleanupProcessedStorage(action, entries.map((file) => file.id));
    await refresh();
  } catch (failure) {
    await refresh();
    error.value = extractErrorMessage(failure, "Could not clean up processed storage.");
  } finally {
    cleaning.value = false;
  }
}

function close(): void {
  emit("dismissed");
}

useModalFocus(modalElement, () => !confirmation.value);
useEscDismissableDialog({
  priority: 1060,
  isOpen: () => true,
  canClose: () => !cleaning.value && !confirmation.value,
  requestClose: close,
});
onMounted(refresh);
</script>

<style scoped>
.storage-modal {
  --bs-modal-zindex: 1054;
}

.storage-chart {
  display: grid;
  gap: 0.25rem;
}

.chart-row {
  display: grid;
  grid-template-columns: minmax(8rem, 1fr) minmax(3rem, 3fr) minmax(5.25rem, auto);
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  padding: 0.35rem 0.5rem;
  border: 1px solid transparent;
  border-radius: var(--bs-border-radius);
  color: inherit;
  background: transparent;
  text-align: left;
}

.chart-row:hover,
.chart-row[aria-pressed="true"] {
  border-color: var(--bs-primary);
  background: var(--bs-tertiary-bg);
}

.chart-track {
  display: block;
  height: 0.65rem;
  border-radius: 0.35rem;
  background: var(--bs-secondary-bg);
  overflow: hidden;
}

.chart-bar {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.file-path {
  overflow-wrap: anywhere;
}
</style>
