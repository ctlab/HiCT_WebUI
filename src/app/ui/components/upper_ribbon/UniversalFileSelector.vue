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
  <div class="file-selector-root">
    <div class="modal-backdrop fade show"></div>
    <div
      class="modal fade show"
      tabindex="-1"
      style="display: block"
      role="dialog"
    >
      <div class="modal-dialog modal-xl modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ props.title ?? "Select file" }}</h5>
            <button type="button" class="btn-close" @click="onDismissClicked"></button>
          </div>
          <div class="modal-body">
            <div v-if="props.errorMessage || errorMessage" class="alert alert-danger py-2">
              {{ props.errorMessage ?? errorMessage }}
            </div>

            <div class="d-flex align-items-center gap-2 mb-2">
              <input
                v-model.trim="searchTerm"
                class="form-control form-control-sm"
                type="text"
                placeholder="Search by file name or path"
              />
              <div v-if="hasPredicate" class="form-check form-switch m-0">
                <input
                  id="toggle-show-all-files"
                  v-model="showAllFiles"
                  class="form-check-input"
                  type="checkbox"
                />
                <label class="form-check-label small" for="toggle-show-all-files">
                  Show all files
                </label>
              </div>
              <div class="btn-group btn-group-sm ms-auto" role="group" aria-label="Selector mode">
                <button
                  type="button"
                  class="btn"
                  :class="selectorMode === 'explorer' ? 'btn-primary' : 'btn-outline-primary'"
                  @click="selectorMode = 'explorer'"
                >
                  Explorer
                </button>
                <button
                  type="button"
                  class="btn"
                  :class="selectorMode === 'tree' ? 'btn-primary' : 'btn-outline-primary'"
                  @click="selectorMode = 'tree'"
                >
                  Tree
                </button>
              </div>
            </div>
            <small v-if="fileFilterHint" class="text-muted d-block mb-2">{{ fileFilterHint }}</small>

            <div v-if="loading" class="d-flex align-items-center gap-2 py-3">
              <strong>Loading files…</strong>
              <div class="spinner-border spinner-border-sm ms-auto" role="status"></div>
            </div>

            <div v-else-if="selectorMode === 'explorer'" class="table-host">
              <table class="table table-sm table-hover align-middle mb-0 file-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Path</th>
                    <th class="text-end">Size</th>
                    <th class="text-end">Modified</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="entry in filteredEntries"
                    :key="entry.path"
                    :class="{ selected: selectedFilename === entry.path }"
                    @click="onRowClicked(entry.path)"
                    @dblclick="onSelectClicked"
                  >
                    <td>
                      <i :class="getIconForEntry(entry.path, false)" aria-hidden="true"></i>
                      <span class="ms-2">{{ entry.name }}</span>
                    </td>
                    <td><code>{{ entry.path }}</code></td>
                    <td class="text-end">{{ formatBytes(entry.sizeBytes) }}</td>
                    <td class="text-end">{{ formatTimestamp(entry.modifiedAtMs) }}</td>
                  </tr>
                  <tr v-if="filteredEntries.length === 0">
                    <td colspan="4" class="text-muted">No files found for current filter</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="tree-host">
              <Tree
                v-if="treeNodes.length > 0"
                :value="treeNodes"
                selectionMode="single"
                v-model:selectionKeys="treeSelectionKeys"
                @nodeSelect="onTreeNodeSelect"
                class="legacy-tree"
              >
                <template #default="slotProps">
                  <div
                    class="tree-node-content"
                    @dblclick="onTreeNodeDoubleClick(slotProps.node)"
                  >
                    <i
                      :class="
                        slotProps.node.icon ??
                        getIconForEntry(slotProps.node.data?.path ?? slotProps.node.key, !slotProps.node.leaf)
                      "
                      aria-hidden="true"
                    ></i>
                    <span class="ms-2">{{ slotProps.node.label }}</span>
                    <small
                      v-if="slotProps.node.data?.meta"
                      class="text-muted ms-2"
                    >
                      {{ slotProps.node.data.meta }}
                    </small>
                  </div>
                </template>
              </Tree>
              <div v-else class="text-muted">No files found for current filter</div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="onDismissClicked">
              Dismiss
            </button>
            <button
              type="button"
              class="btn btn-primary"
              @click="onSelectClicked"
              :disabled="!selectedFilename"
            >
              Load
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FileEntryResponse } from "@/app/core/net/api/response";
import type { NetworkManager } from "@/app/core/net/NetworkManager.js";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import { storeToRefs } from "pinia";
import Tree from "primevue/tree";
import { computed, onMounted, ref, watch } from "vue";

const emit = defineEmits<{
  (e: "selected", filename: string): void;
  (e: "dismissed"): void;
}>();

const props = defineProps<{
  networkManager: NetworkManager;
  fileNamePredicate?: (name: string) => boolean;
  title?: string;
  fileType?: string;
  errorMessage?: unknown;
}>();

const loading = ref(true);
const errorMessage = ref<string>("");
const selectedFilename = ref<string | null>(null);
const allEntries = ref<FileEntryResponse[]>([]);
const searchTerm = ref("");
const showAllFiles = ref(false);
const treeSelectionKeys = ref<Record<string, boolean>>({});
const uiSettingsStore = useUiSettingsStore();
const { fileSelectorMode } = storeToRefs(uiSettingsStore);
const selectorMode = ref<"explorer" | "tree">(fileSelectorMode.value);

const hasPredicate = computed(() => typeof props.fileNamePredicate === "function");
const fileFilterHint = computed(() => {
  if (!hasPredicate.value) {
    return "";
  }
  if (props.fileType && props.fileType.trim().length > 0) {
    return `Showing ${props.fileType} by default (toggle "Show all files" to browse everything).`;
  }
  return "File type filter is active (toggle \"Show all files\" to browse everything).";
});

watch(selectorMode, (mode) => {
  fileSelectorMode.value = mode;
});

const filteredEntries = computed(() => {
  const predicate = props.fileNamePredicate;
  const query = searchTerm.value.trim().toLowerCase();
  return allEntries.value.filter((entry) => {
    const allowed =
      showAllFiles.value || !predicate ? true : predicate(entry.path);
    if (!allowed) {
      return false;
    }
    if (!query) {
      return true;
    }
    return (
      entry.name.toLowerCase().includes(query) ||
      entry.path.toLowerCase().includes(query)
    );
  });
});

type PrimeTreeNode = {
  key: string;
  label: string;
  icon?: string;
  selectable?: boolean;
  leaf?: boolean;
  expanded?: boolean;
  data?: {
    path?: string;
    meta?: string;
  };
  children?: PrimeTreeNode[];
};

type MutableTreeNode = {
  key: string;
  label: string;
  children: Map<string, MutableTreeNode>;
  path?: string;
  meta?: string;
};

const treeNodes = computed<PrimeTreeNode[]>(() => {
  const rootNodes = new Map<string, MutableTreeNode>();
  for (const entry of filteredEntries.value) {
    const chunks = entry.path.split("/").filter((chunk) => chunk.length > 0);
    if (chunks.length === 0) {
      continue;
    }
    let currentLevel = rootNodes;
    let keyPath = "";
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      keyPath = keyPath.length > 0 ? `${keyPath}/${chunk}` : chunk;
      let node = currentLevel.get(chunk);
      if (!node) {
        node = {
          key: keyPath,
          label: chunk,
          children: new Map<string, MutableTreeNode>(),
        };
        currentLevel.set(chunk, node);
      }
      const isLeaf = i === chunks.length - 1;
      if (isLeaf) {
        node.path = entry.path;
        node.meta = `${formatBytes(entry.sizeBytes)}, ${formatTimestamp(entry.modifiedAtMs)}`;
      }
      currentLevel = node.children;
    }
  }
  return [...rootNodes.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((node) => mutableToPrimeNode(node));
});

const mutableToPrimeNode = (node: MutableTreeNode): PrimeTreeNode => {
  const children = [...node.children.values()]
    .sort((a, b) => {
      const aLeaf = a.children.size === 0;
      const bLeaf = b.children.size === 0;
      if (aLeaf !== bLeaf) {
        return aLeaf ? 1 : -1;
      }
      return a.label.localeCompare(b.label);
    })
    .map((child) => mutableToPrimeNode(child));
  const leaf = children.length === 0;
  return {
    key: node.key,
    label: node.label,
    icon: getIconForEntry(node.path ?? node.key, !leaf),
    selectable: !!node.path,
    leaf,
    expanded: node.key.split("/").length <= 2,
    data: node.path
      ? {
          path: node.path,
          meta: node.meta,
        }
      : undefined,
    children: leaf ? undefined : children,
  };
};

const getIconForEntry = (path: string, isDirectory: boolean): string => {
  if (isDirectory) {
    return "pi pi-fw pi-folder-open";
  }
  const normalized = path.toLowerCase();
  if (normalized.endsWith(".hict") || normalized.endsWith(".hict.hdf5") || normalized.endsWith(".hdf5")) {
    return "pi pi-fw pi-map";
  }
  if (normalized.endsWith(".cool") || normalized.endsWith(".mcool")) {
    return "pi pi-fw pi-table";
  }
  if (
    normalized.endsWith(".fasta") ||
    normalized.endsWith(".fa") ||
    normalized.endsWith(".fna") ||
    normalized.endsWith(".fai")
  ) {
    return "pi pi-fw pi-book";
  }
  if (normalized.endsWith(".agp")) {
    return "pi pi-fw pi-sitemap";
  }
  if (normalized.endsWith(".bw") || normalized.endsWith(".bigwig")) {
    return "pi pi-fw pi-chart-line";
  }
  if (normalized.endsWith(".bed") || normalized.endsWith(".bed.gz") || normalized.endsWith(".bam")) {
    return "pi pi-fw pi-list";
  }
  if (normalized.endsWith(".gff") || normalized.endsWith(".gtf") || normalized.endsWith(".gff3")) {
    return "pi pi-fw pi-file-edit";
  }
  return "pi pi-fw pi-file";
};

const formatBytes = (sizeBytes: number): string => {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return "n/a";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = sizeBytes;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx++;
  }
  return `${value.toFixed(value >= 10 || unitIdx === 0 ? 0 : 1)} ${units[unitIdx]}`;
};

const formatTimestamp = (timestampMs: number): string => {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    return "n/a";
  }
  return new Date(timestampMs).toLocaleString();
};

const onDismissClicked = (): void => {
  emit("dismissed");
};

const onSelectClicked = (): void => {
  if (!selectedFilename.value) {
    errorMessage.value = "Please select a file";
    return;
  }
  emit("selected", selectedFilename.value);
};

const onRowClicked = (path: string): void => {
  selectedFilename.value = path;
};

const onTreeNodeSelect = (event: { node?: PrimeTreeNode }): void => {
  const path = event?.node?.data?.path;
  if (!path) {
    return;
  }
  selectedFilename.value = path;
};

const onTreeNodeDoubleClick = (node: { data?: { path?: string } }): void => {
  const path = node?.data?.path;
  if (!path) {
    return;
  }
  selectedFilename.value = path;
  onSelectClicked();
};

watch(filteredEntries, (entries) => {
  if (entries.length === 0) {
    selectedFilename.value = null;
    treeSelectionKeys.value = {};
    return;
  }
  if (selectedFilename.value && entries.some((entry) => entry.path === selectedFilename.value)) {
    const currentPath = selectedFilename.value;
    treeSelectionKeys.value = currentPath ? { [currentPath]: true } : {};
    return;
  }
  selectedFilename.value = entries[0]?.path ?? null;
  const firstPath = selectedFilename.value;
  treeSelectionKeys.value = firstPath ? { [firstPath]: true } : {};
});

onMounted(async () => {
  showAllFiles.value = !hasPredicate.value;
  loading.value = true;
  errorMessage.value = "";
  try {
    const entries = await props.networkManager.requestManager.listFilesDetailed();
    allEntries.value = entries.slice().sort((a, b) => a.path.localeCompare(b.path));
    const firstAllowed = filteredEntries.value[0];
    if (firstAllowed) {
      selectedFilename.value = firstAllowed.path;
      treeSelectionKeys.value = { [firstAllowed.path]: true };
    }
  } catch (error: unknown) {
    errorMessage.value = String(error);
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.file-selector-root .modal {
  z-index: 1055;
}

.table-host {
  max-height: 58vh;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  text-align: left;
}

.tree-host {
  max-height: 58vh;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 0.5rem;
}

.legacy-tree {
  border: none;
}

.tree-node-content {
  display: flex;
  align-items: center;
  min-height: 1.4rem;
}

.file-table td,
.file-table th {
  white-space: nowrap;
  vertical-align: middle;
  text-align: left;
}

.file-table td:nth-child(2),
.file-table th:nth-child(2) {
  width: 56%;
}

.file-table tr.selected {
  background: rgba(56, 132, 255, 0.14);
}
</style>
