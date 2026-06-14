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
  <div class="file-selection-table">
    <DataTable
      :value="tableRows"
      data-key="path"
      class="p-datatable-sm file-selection-datatable"
      column-resize-mode="fit"
      removable-sort
      resizable-columns
      responsive-layout="scroll"
      row-hover
      scrollable
      :scroll-height="scrollHeight"
      :row-class="rowClass"
      @row-click="onRowClick"
      @row-dblclick="onRowDoubleClick"
      @value-change="onValueChange"
    >
      <Column
        header=""
        body-class="selection-cell"
        header-class="selection-cell"
        style="width: 3rem; min-width: 3rem"
      >
        <template #body="{ data }">
          <input
            :aria-label="`Select ${data.name}`"
            :checked="isSelected(data.path)"
            class="form-check-input file-row-checkbox"
            type="checkbox"
            @click.stop="selectPath(data.path, $event)"
            @keydown.space.stop.prevent="selectPath(data.path)"
          />
        </template>
      </Column>
      <Column field="name" header="Name" sortable style="min-width: 14rem; width: 24%">
        <template #body="{ data }">
          <span class="file-name-cell">
            <i :class="data.iconClass" aria-hidden="true"></i>
            <span :title="data.name">{{ data.name }}</span>
          </span>
        </template>
      </Column>
      <Column
        v-if="showPath"
        field="path"
        header="Path"
        sortable
        style="min-width: 18rem; width: 48%"
      >
        <template #body="{ data }">
          <code class="file-path-cell" :title="data.path">{{ data.path }}</code>
        </template>
      </Column>
      <Column
        v-if="showStatus"
        field="statusLabel"
        header="Status"
        sortable
        style="min-width: 10rem; width: 14%"
      >
        <template #body="{ data }">
          <span class="file-status-pill" :class="data.statusClass">
            {{ data.statusLabel }}
          </span>
        </template>
      </Column>
      <Column
        v-if="showSize"
        field="sizeBytes"
        header="Size"
        sortable
        body-class="numeric-cell"
        header-class="numeric-cell"
        style="min-width: 7rem; width: 12%"
      >
        <template #body="{ data }">
          {{ data.sizeLabel }}
        </template>
      </Column>
      <Column
        v-if="showModified"
        field="modifiedAtMs"
        header="Modified"
        sortable
        body-class="numeric-cell"
        header-class="numeric-cell"
        style="min-width: 12rem; width: 16%"
      >
        <template #body="{ data }">
          {{ data.modifiedLabel }}
        </template>
      </Column>
      <template #empty>
        <div class="file-selection-empty">{{ emptyMessage }}</div>
      </template>
    </DataTable>
  </div>
</template>

<script setup lang="ts">
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import { computed, ref } from "vue";
import type { FileSelectionTableEntry } from "./FileSelectionTableTypes";

type FileSelectionTableRow = {
  path: string;
  name: string;
  sizeBytes: number;
  modifiedAtMs: number;
  sizeLabel: string;
  modifiedLabel: string;
  extension: string;
  iconClass: string;
  statusLabel: string;
  statusClass: string;
};

const emit = defineEmits<{
  (e: "update:selectedPath", path: string): void;
  (e: "update:selectedPaths", paths: string[]): void;
  (e: "activate", path: string): void;
}>();

const props = withDefaults(
  defineProps<{
    entries: FileSelectionTableEntry[];
    selectedPath: string | null;
    selectedPaths?: string[];
    multiSelect?: boolean;
    emptyMessage?: string;
    scrollHeight?: string;
    showPath?: boolean;
    showStatus?: boolean;
    showSize?: boolean;
    showModified?: boolean;
    statusLabel?: (path: string) => string;
    statusClass?: (path: string) => string;
  }>(),
  {
    multiSelect: false,
    emptyMessage: "No files found",
    scrollHeight: "58vh",
    showPath: true,
    showStatus: false,
    showSize: true,
    showModified: true,
  }
);

const renderedRows = ref<FileSelectionTableRow[]>([]);
const lastSelectedPath = ref<string | null>(null);

const tableRows = computed<FileSelectionTableRow[]>(() =>
  props.entries.map((entry) => {
    const path = entry.path;
    const name = entry.name && entry.name.trim().length > 0 ? entry.name : basename(path);
    const extension = entry.extension ?? extensionOf(path);
    return {
      path,
      name,
      sizeBytes: entry.sizeBytes ?? -1,
      modifiedAtMs: entry.modifiedAtMs ?? 0,
      sizeLabel: formatBytes(entry.sizeBytes ?? -1),
      modifiedLabel: formatTimestamp(entry.modifiedAtMs ?? 0),
      extension,
      iconClass: entry.iconClass ?? iconClassForPath(path, extension),
      statusLabel: props.statusLabel?.(path) ?? "",
      statusClass: props.statusClass?.(path) ?? "",
    };
  })
);

const rowClass = (row: FileSelectionTableRow): Record<string, boolean> => ({
  "file-selection-row-selected": isSelected(row.path),
});

const activeRows = computed(() =>
  renderedRows.value.length > 0 ? renderedRows.value : tableRows.value
);

const isSelected = (path: string): boolean =>
  props.multiSelect
    ? (props.selectedPaths ?? []).includes(path)
    : path === props.selectedPath;

const selectPath = (path: string, event?: MouseEvent): void => {
  if (props.multiSelect) {
    togglePath(path, event);
    return;
  }
  emit("update:selectedPath", path);
};

const togglePath = (path: string, event?: MouseEvent): void => {
  const selected = new Set(props.selectedPaths ?? []);
  if (event?.shiftKey && lastSelectedPath.value) {
    const rows = activeRows.value;
    const start = rows.findIndex((row) => row.path === lastSelectedPath.value);
    const end = rows.findIndex((row) => row.path === path);
    if (start >= 0 && end >= 0) {
      const shouldSelect = !selected.has(path);
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      for (let i = min; i <= max; i++) {
        const rowPath = rows[i]?.path;
        if (!rowPath) {
          continue;
        }
        if (shouldSelect) {
          selected.add(rowPath);
        } else {
          selected.delete(rowPath);
        }
      }
      emitSelectedPaths(selected);
      lastSelectedPath.value = path;
      return;
    }
  }
  if (selected.has(path)) {
    selected.delete(path);
  } else {
    selected.add(path);
  }
  emitSelectedPaths(selected);
  lastSelectedPath.value = path;
};

const emitSelectedPaths = (selected: Set<string>): void => {
  const knownOrder = tableRows.value.map((row) => row.path);
  const ordered = knownOrder.filter((path) => selected.has(path));
  for (const path of selected) {
    if (!knownOrder.includes(path)) {
      ordered.push(path);
    }
  }
  emit("update:selectedPaths", ordered);
};

const onRowClick = (event: { data?: FileSelectionTableRow; originalEvent?: Event }): void => {
  if (event.data?.path) {
    selectPath(event.data.path, event.originalEvent as MouseEvent | undefined);
  }
};

const onRowDoubleClick = (event: { data?: FileSelectionTableRow }): void => {
  if (event.data?.path) {
    if (!props.multiSelect) {
      selectPath(event.data.path);
    }
    emit("activate", event.data.path);
  }
};

const onValueChange = (rows: FileSelectionTableRow[]): void => {
  renderedRows.value = rows;
};

const basename = (path: string): string => {
  const normalized = path.replaceAll("\\", "/");
  return normalized.split("/").filter(Boolean).pop() ?? normalized;
};

const extensionOf = (path: string): string => {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
};

const iconClassForPath = (path: string, extension: string): string => {
  const normalized = path.toLowerCase();
  if (normalized.endsWith(".hict") || normalized.endsWith(".hict.hdf5") || normalized.endsWith(".hdf5")) {
    return "pi pi-fw pi-map";
  }
  if (
    normalized.endsWith(".cool") ||
    normalized.endsWith(".mcool") ||
    normalized.endsWith(".hic") ||
    isTextMatrixPath(normalized)
  ) {
    return "pi pi-fw pi-table";
  }
  if (["fasta", "fa", "fna", "fai"].includes(extension)) {
    return "pi pi-fw pi-book";
  }
  if (extension === "agp") {
    return "pi pi-fw pi-sitemap";
  }
  if (normalized.endsWith(".bw") || normalized.endsWith(".bigwig")) {
    return "pi pi-fw pi-chart-line";
  }
  if (normalized.endsWith(".bed") || normalized.endsWith(".bed.gz") || normalized.endsWith(".bam")) {
    return "pi pi-fw pi-list";
  }
  if (["gff", "gtf", "gff3"].includes(extension)) {
    return "pi pi-fw pi-file-edit";
  }
  return "pi pi-fw pi-file";
};

const isTextMatrixPath = (normalized: string): boolean => {
  const stripped = normalized.replace(/\.(gz|bgz|xz|zst|zstd|bz2|lz4|lzo)$/i, "");
  return (
    stripped.endsWith(".matrix") ||
    stripped.endsWith(".coo") ||
    stripped.endsWith(".coo.tsv") ||
    stripped.endsWith(".coo.csv") ||
    stripped.endsWith(".tsv") ||
    stripped.endsWith(".csv") ||
    stripped.endsWith(".bg2") ||
    stripped.endsWith(".bedgraph2") ||
    stripped.endsWith(".bedpe") ||
    stripped.endsWith(".pairs") ||
    stripped.endsWith(".validpairs")
  );
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
</script>

<style scoped>
.file-selection-table {
  border: 1px solid var(--hict-surface-border, #e5e7eb);
  border-radius: 0.5rem;
  overflow: hidden;
  text-align: left;
}

.file-selection-datatable :deep(.p-datatable-thead > tr > th) {
  background: var(--hict-control-bg, #f8fafc);
  color: var(--hict-surface-fg, #1f2937);
  font-weight: 700;
}

.file-selection-datatable :deep(.p-datatable-tbody > tr) {
  cursor: pointer;
}

.file-selection-datatable :deep(.p-datatable-tbody > tr.file-selection-row-selected > td) {
  background: rgba(56, 132, 255, 0.16);
}

.file-selection-datatable :deep(.p-datatable-tbody > tr:hover > td) {
  background: rgba(56, 132, 255, 0.08);
}

.file-selection-datatable :deep(.selection-cell) {
  text-align: center;
}

.file-row-checkbox {
  cursor: pointer;
}

.file-name-cell {
  align-items: center;
  display: inline-flex;
  gap: 0.45rem;
  max-width: 100%;
}

.file-name-cell span,
.file-path-cell {
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-path-cell {
  display: block;
  max-width: 100%;
  white-space: nowrap;
}

.file-status-pill {
  border-radius: 999px;
  display: inline-block;
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1;
  padding: 0.25rem 0.55rem;
  white-space: nowrap;
}

.file-status-pill.converted {
  background: #d1fae5;
  color: #065f46;
}

.file-status-pill.unconverted {
  background: #fef3c7;
  color: #92400e;
}

.file-selection-datatable :deep(.numeric-cell) {
  text-align: right;
}

.file-selection-empty {
  color: var(--hict-surface-muted, #6b7280);
  padding: 0.75rem;
}
</style>
