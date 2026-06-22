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
    <div class="modal-backdrop fade show" :style="backdropStyle"></div>
    <div
      class="modal fade show"
      tabindex="-1"
      :style="modalStyle"
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

            <div class="input-group input-group-sm mb-2">
              <span class="input-group-text">Look in</span>
              <input
                v-model.trim="pathInput"
                class="form-control"
                type="text"
                placeholder="Relative folder or file path under DATA_DIR"
                @keydown.enter.prevent="onPathGoClicked"
              />
              <button type="button" class="btn btn-outline-secondary" @click="onPathGoClicked">
                Go
              </button>
              <button type="button" class="btn btn-outline-secondary" @click="goToParentDirectory">
                Up
              </button>
              <button type="button" class="btn btn-outline-secondary" @click="loadDirectory('')">
                Root
              </button>
            </div>

            <div class="d-flex align-items-center gap-2 mb-2">
              <input
                v-model.trim="searchTerm"
                class="form-control form-control-sm"
                type="text"
                placeholder="Filter current folder by file name or path"
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
              <div
                v-if="!props.multiSelect"
                class="btn-group btn-group-sm ms-auto"
                role="group"
                aria-label="Selector mode"
              >
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
            <small v-if="fileFilterHint" class="text-muted d-block mb-1">{{ fileFilterHint }}</small>
            <small v-if="props.note" class="text-muted d-block mb-2">{{ props.note }}</small>

            <div v-if="loading" class="d-flex align-items-center gap-2 py-3">
              <strong>Loading {{ currentDirectory || "DATA_DIR" }}…</strong>
              <div class="spinner-border spinner-border-sm ms-auto" role="status"></div>
            </div>

            <div v-else-if="selectorMode === 'explorer'" class="table-host">
              <FileSelectionTable
                v-model:selected-path="selectedFilename"
                v-model:selected-paths="selectedFilenames"
                :entries="filteredEntries"
                :multi-select="props.multiSelect"
                empty-message="No files or folders found for current filter"
                scroll-height="58vh"
                @activate="onExplorerRowActivated"
              />
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
                    @click.stop="onTreeNodeClick(slotProps.node)"
                    @dblclick="onTreeNodeDoubleClick(slotProps.node)"
                  >
                    <i
                      :class="
                        slotProps.node.data?.iconCls ??
                        (slotProps.node.leaf ? 'pi pi-fw pi-file' : 'pi pi-fw pi-folder-open')
                      "
                      aria-hidden="true"
                    ></i>
                    <span>{{ slotProps.node.label }}</span>
                    <small
                      v-if="slotProps.node.data?.meta"
                      class="text-muted ms-2"
                    >
                      {{ slotProps.node.data.meta }}
                    </small>
                  </div>
                </template>
              </Tree>
              <div v-else class="text-muted">No files or folders found for current filter</div>
            </div>
          </div>
          <div class="modal-footer">
            <div v-if="props.multiSelect" class="me-auto small text-muted">
              {{ selectedFilenames.length }} selected
            </div>
            <button type="button" class="btn btn-secondary" @click="onDismissClicked">
              Dismiss
            </button>
            <button
              type="button"
              class="btn btn-primary"
              @click="onSelectClicked"
              :disabled="selectButtonDisabled"
            >
              {{ props.multiSelect ? "Add selected" : "Load" }}
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
import FileSelectionTable from "@/app/ui/components/common/FileSelectionTable.vue";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import { storeToRefs } from "pinia";
import Tree from "primevue/tree";
import { computed, onMounted, ref, watch, type CSSProperties } from "vue";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";

const emit = defineEmits<{
  (e: "selected", filename: string): void;
  (e: "selectedMany", filenames: string[]): void;
  (e: "dismissed"): void;
}>();

const props = defineProps<{
  networkManager: NetworkManager;
  fileNamePredicate?: (name: string) => boolean;
  title?: string;
  fileType?: string;
  note?: string;
  errorMessage?: unknown;
  zIndex?: number;
  multiSelect?: boolean;
}>();

const loading = ref(true);
const errorMessage = ref<string>("");
const selectedFilename = ref<string | null>(null);
const selectedFilenames = ref<string[]>([]);
const allEntries = ref<FileEntryResponse[]>([]);
const currentDirectory = ref("");
const pathInput = ref("");
const searchTerm = ref("");
const showAllFiles = ref(false);
const treeSelectionKeys = ref<Record<string, boolean>>({});
const uiSettingsStore = useUiSettingsStore();
const { fileSelectorMode } = storeToRefs(uiSettingsStore);
const selectorMode = ref<"explorer" | "tree">(fileSelectorMode.value);

const modalStyle = computed<CSSProperties>(() => ({
  display: "block",
  ...(props.zIndex ? { zIndex: props.zIndex } : {}),
}));
const backdropStyle = computed<CSSProperties>(() =>
  props.zIndex ? { zIndex: Math.max(0, props.zIndex - 5) } : {}
);
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

useEscDismissableDialog({
  priority: props.zIndex ?? 1055,
  isOpen: () => true,
  requestClose: () => {
    onDismissClicked();
  },
});

watch(selectorMode, (mode) => {
  if (props.multiSelect) {
    if (mode !== "explorer") {
      selectorMode.value = "explorer";
    }
    return;
  }
  fileSelectorMode.value = mode;
  if (mode === "tree") {
    const currentPath = selectedFilename.value;
    treeSelectionKeys.value = currentPath
      ? { [fileSelectionKey(currentPath)]: true }
      : {};
  }
});

watch(selectedFilename, (path) => {
  treeSelectionKeys.value = path ? { [fileSelectionKey(path)]: true } : {};
});

const filteredEntries = computed(() => {
  const predicate = props.fileNamePredicate;
  const query = searchTerm.value.trim().toLowerCase();
  const entries = currentDirectory.value ? [parentDirectoryEntry(), ...allEntries.value] : allEntries.value;
  return entries.filter((entry) => {
    if (entry.type === "directory") {
      if (!query) {
        return true;
      }
      return (
        entry.name.toLowerCase().includes(query) ||
        entry.path.toLowerCase().includes(query)
      );
    }
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

const selectedEntry = computed(() =>
  selectedFilename.value
    ? filteredEntries.value.find((entry) => entry.path === selectedFilename.value) ?? null
    : null
);

const selectButtonDisabled = computed(() =>
  props.multiSelect
    ? selectedFilenames.value.length === 0
    : !selectedFilename.value || selectedEntry.value?.type === "directory"
);

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
    iconCls?: string;
  };
  children?: PrimeTreeNode[];
};

const fileSelectionKey = (path: string): string => `file:${path}`;
const directorySelectionKey = (path: string): string => `dir:${path}`;

const treeNodes = computed<PrimeTreeNode[]>(() => {
  return filteredEntries.value.map((entry) => {
    const isDirectory = entry.type === "directory";
    return {
      key: isDirectory ? directorySelectionKey(entry.path) : fileSelectionKey(entry.path),
      label: entry.name,
      selectable: true,
      leaf: !isDirectory,
      data: {
        path: entry.path,
        meta: isDirectory
          ? (entry.symbolicLink ? "linked folder" : "folder")
          : `${formatBytes(entry.sizeBytes)}, ${formatTimestamp(entry.modifiedAtMs)}`,
        iconCls: getIconForEntry(entry.path, isDirectory),
      },
    };
  });
});

const selectedPathFromTreeKeys = (): string | null => {
  const activeKey = Object.entries(treeSelectionKeys.value).find(
    ([, selected]) => !!selected
  )?.[0];
  if (!activeKey || !activeKey.startsWith("file:")) {
    return null;
  }
  return activeKey.slice("file:".length);
};

const resolveSelectedPath = (): string | null => {
  if (selectorMode.value === "tree") {
    return selectedPathFromTreeKeys();
  }
  return selectedFilename.value;
};

const normalizeRelativePath = (path: string): string =>
  path
    .replaceAll("\\", "/")
    .split("/")
    .filter((chunk) => chunk.length > 0 && chunk !== ".")
    .join("/");

const parentDirectory = (path: string): string => {
  const normalized = normalizeRelativePath(path);
  const chunks = normalized.split("/").filter(Boolean);
  chunks.pop();
  return chunks.join("/");
};

const parentDirectoryEntry = (): FileEntryResponse => {
  const parent = parentDirectory(currentDirectory.value);
  return {
    path: parent,
    name: "..",
    sizeBytes: -1,
    modifiedAtMs: 0,
    extension: "",
    type: "directory",
    symbolicLink: false,
  };
};

const loadDirectory = async (directory: string): Promise<void> => {
  const normalizedDirectory = normalizeRelativePath(directory);
  loading.value = true;
  errorMessage.value = "";
  try {
    const entries = await props.networkManager.requestManager.listDirectory(normalizedDirectory);
    currentDirectory.value = normalizedDirectory;
    pathInput.value = normalizedDirectory;
    allEntries.value = entries.slice();
    selectedFilename.value = null;
    treeSelectionKeys.value = {};
  } catch (error: unknown) {
    errorMessage.value = String(error);
  } finally {
    loading.value = false;
  }
};

const goToParentDirectory = (): void => {
  void loadDirectory(parentDirectory(currentDirectory.value));
};

const onPathGoClicked = async (): Promise<void> => {
  const requestedPath = normalizeRelativePath(pathInput.value);
  const visibleEntry = filteredEntries.value.find((entry) => entry.path === requestedPath);
  if (visibleEntry?.type === "file") {
    selectedFilename.value = visibleEntry.path;
    treeSelectionKeys.value = { [fileSelectionKey(visibleEntry.path)]: true };
    emit("selected", visibleEntry.path);
    return;
  }
  if (visibleEntry?.type === "directory") {
    void loadDirectory(visibleEntry.path);
    return;
  }

  const currentFileCandidate = allEntries.value.find((entry) => entry.path === requestedPath && entry.type === "file");
  if (currentFileCandidate) {
    selectedFilename.value = currentFileCandidate.path;
    treeSelectionKeys.value = { [fileSelectionKey(currentFileCandidate.path)]: true };
    emit("selected", currentFileCandidate.path);
    return;
  }

  const candidateParent = parentDirectory(requestedPath);
  const candidateName = requestedPath.split("/").filter(Boolean).pop();
  if (candidateName && candidateParent !== requestedPath) {
    await loadDirectory(candidateParent);
    const candidate = allEntries.value.find((entry) => entry.name === candidateName && entry.type === "file");
    if (candidate) {
      selectedFilename.value = candidate.path;
      treeSelectionKeys.value = { [fileSelectionKey(candidate.path)]: true };
      return;
    }
  }
  await loadDirectory(requestedPath);
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
  if (props.multiSelect) {
    const selected = selectedFilenames.value.slice();
    if (selected.length === 0) {
      errorMessage.value = "Please select at least one file";
      return;
    }
    emit("selectedMany", selected);
    return;
  }
  const selectedPath = resolveSelectedPath();
  if (!selectedPath) {
    errorMessage.value = "Please select a file";
    return;
  }
  const entry = filteredEntries.value.find((candidate) => candidate.path === selectedPath);
  if (!entry) {
    errorMessage.value = "Selected file is no longer available in current filter";
    return;
  }
  if (entry.type === "directory") {
    void loadDirectory(entry.path);
    return;
  }
  selectedFilename.value = selectedPath;
  treeSelectionKeys.value = { [fileSelectionKey(selectedPath)]: true };
  emit("selected", selectedPath);
};

const onExplorerRowActivated = (path: string): void => {
  const entry = filteredEntries.value.find((candidate) => candidate.path === path);
  if (entry?.type === "directory") {
    void loadDirectory(path);
    return;
  }
  if (props.multiSelect) {
    const selected = new Set(selectedFilenames.value);
    if (selected.has(path)) {
      selected.delete(path);
    } else {
      selected.add(path);
    }
    selectedFilenames.value = Array.from(selected);
    return;
  }
  selectedFilename.value = path;
  treeSelectionKeys.value = { [fileSelectionKey(path)]: true };
  onSelectClicked();
};

const onTreeNodeSelect = (event: { node?: PrimeTreeNode }): void => {
  const path = event?.node?.data?.path;
  if (path === undefined) {
    return;
  }
  if (!event.node?.leaf) {
    void loadDirectory(path);
    return;
  }
  selectedFilename.value = path;
  treeSelectionKeys.value = { [fileSelectionKey(path)]: true };
};

const onTreeNodeDoubleClick = (node: { data?: { path?: string } }): void => {
  const path = node?.data?.path;
  if (path === undefined) {
    return;
  }
  const entry = filteredEntries.value.find((candidate) => candidate.path === path);
  if (entry?.type === "directory") {
    void loadDirectory(path);
    return;
  }
  selectedFilename.value = path;
  onSelectClicked();
};

const onTreeNodeClick = (node: { data?: { path?: string } }): void => {
  const path = node?.data?.path;
  if (path === undefined) {
    return;
  }
  const entry = filteredEntries.value.find((candidate) => candidate.path === path);
  if (entry?.type === "directory") {
    treeSelectionKeys.value = { [directorySelectionKey(path)]: true };
    return;
  }
  selectedFilename.value = path;
  treeSelectionKeys.value = { [fileSelectionKey(path)]: true };
};

watch(filteredEntries, (entries) => {
  if (props.multiSelect) {
    selectedFilename.value = null;
    treeSelectionKeys.value = {};
    return;
  }
  if (entries.length === 0) {
    selectedFilename.value = null;
    treeSelectionKeys.value = {};
    return;
  }
  const fileEntries = entries.filter((entry) => entry.type !== "directory");
  const selectedFromTree = selectedPathFromTreeKeys();
  if (
    selectedFromTree &&
    fileEntries.some((entry) => entry.path === selectedFromTree)
  ) {
    selectedFilename.value = selectedFromTree;
    return;
  }
  if (selectedFilename.value && fileEntries.some((entry) => entry.path === selectedFilename.value)) {
    const currentPath = selectedFilename.value;
    treeSelectionKeys.value = currentPath
      ? { [fileSelectionKey(currentPath)]: true }
      : {};
    return;
  }
  selectedFilename.value = fileEntries[0]?.path ?? null;
  const firstPath = selectedFilename.value;
  treeSelectionKeys.value = firstPath
    ? { [fileSelectionKey(firstPath)]: true }
    : {};
});

onMounted(async () => {
  showAllFiles.value = !hasPredicate.value;
  if (props.multiSelect) {
    selectorMode.value = "explorer";
  }
  void loadDirectory("");
});
</script>

<style scoped>
.file-selector-root .modal {
  z-index: 1055;
}

.table-host {
  text-align: left;
}

.tree-host {
  max-height: 58vh;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 0.5rem;
  text-align: left;
}

.legacy-tree {
  border: none;
}

.legacy-tree :deep(.p-tree-node-icon) {
  display: none;
}

.tree-node-content {
  display: flex;
  align-items: center;
  min-height: 1.4rem;
  gap: 0.35rem;
}

</style>
