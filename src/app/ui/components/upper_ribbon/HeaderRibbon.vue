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
  <div class="header-ribbon">
    <div id="left-header-block" class="header-block">
      <div id="search-container">
        <div id="search-input-group" class="input-group input-group-sm mb-3">
          <input
            id="global-search-input"
            class="form-control form-control-sm m-0"
            placeholder="I'm looking for..."
            type="text"
            v-model="searchQuery"
            @input="onSearchInput"
          />
          <button
            id="global-search-button"
            class="btn btn-sm btn-outline-light"
            type="button"
            @click="goToSelection"
          >
            Go to
          </button>
        </div>
        <div
          v-if="
            (searchResults.length > 0 || searchLoadingRemote) &&
            searchQuery.length >= 3
          "
          class="search-dropdown"
        >
          <div v-if="searchLoadingRemote" class="search-loading">
            <span
              class="spinner-border spinner-border-sm me-2"
              role="status"
              aria-hidden="true"
            ></span>
            Searching genome features...
          </div>
          <button
            v-for="(item, idx) in searchResults"
            :key="item.key"
            type="button"
            class="search-result"
            :class="{ active: idx === selectedIndex }"
            @click="selectResult(idx)"
          >
            <span class="search-type">{{ item.type }}</span>
            <span class="search-name">{{ item.name }}</span>
            <span class="search-original" v-if="item.originalName">
              ({{ item.originalName }})
            </span>
          </button>
        </div>
      </div>
      <div class="scope-picker mb-3">
        <input
          class="form-control form-control-sm"
          type="text"
          v-model="rowScopeQuery"
          @focus="openScopePicker('row')"
          @input="onScopeInput('row')"
          @keydown.down.prevent="moveScopeHighlight('row', 1)"
          @keydown.up.prevent="moveScopeHighlight('row', -1)"
          @keydown.enter.prevent="acceptHighlightedScope('row')"
          @keydown.esc.prevent="restoreScopeQuery('row')"
          @blur="deferScopePickerClose('row')"
          aria-label="Rows scope"
        />
        <div v-if="rowScopeOpen" class="scope-dropdown">
          <button
            v-for="(option, idx) in filteredRowScopeOptions"
            :key="option.key"
            type="button"
            class="scope-result"
            :class="{ active: idx === rowScopeIndex }"
            @mousedown.prevent="selectScope('row', option)"
          >
            <span class="scope-type">{{ option.displayType }}</span>
            <span class="scope-name">{{ option.label }}</span>
          </button>
        </div>
      </div>
      <div class="scope-copy-control mb-3">
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm scope-copy-button"
          title="Copy row scope to columns"
          aria-label="Copy row scope to columns"
          @click="copyRowScopeToColumn"
        >
          <i class="bi bi-arrow-right"></i>
        </button>
      </div>
      <div class="scope-picker mb-3">
        <input
          class="form-control form-control-sm"
          type="text"
          v-model="columnScopeQuery"
          @focus="openScopePicker('column')"
          @input="onScopeInput('column')"
          @keydown.down.prevent="moveScopeHighlight('column', 1)"
          @keydown.up.prevent="moveScopeHighlight('column', -1)"
          @keydown.enter.prevent="acceptHighlightedScope('column')"
          @keydown.esc.prevent="restoreScopeQuery('column')"
          @blur="deferScopePickerClose('column')"
          aria-label="Columns scope"
        />
        <div v-if="columnScopeOpen" class="scope-dropdown">
          <button
            v-for="(option, idx) in filteredColumnScopeOptions"
            :key="option.key"
            type="button"
            class="scope-result"
            :class="{ active: idx === columnScopeIndex }"
            @mousedown.prevent="selectScope('column', option)"
          >
            <span class="scope-type">{{ option.displayType }}</span>
            <span class="scope-name">{{ option.label }}</span>
          </button>
        </div>
      </div>
      <div class="mb-3">
        <select
          v-model="signalDisplayMode"
          class="form-select form-select-sm"
          title="Expected and O/E use the standard renderer and are computed within scaffolds; if no scaffolds are present, each contig is treated as its own scaffold."
          @change="onSignalDisplayModeChanged"
        >
          <option value="OBSERVED">Show Observed</option>
          <option value="EXPECTED">Show Expected</option>
          <option value="OBSERVED_OVER_EXPECTED">Show O/E</option>
        </select>
      </div>
      <div class="mb-3">
        <!-- <select class="form-select form-select-sm" v-model="normalizationTypeInt" @change="onNormalizationChanged">
          <option selected value="0">Normalization None (Linear)</option>
          <option value="1">Normalization Log2</option>
          <option value="2">Normalization Log10</option>
          <option value="3">Normalization Cooler</option>
        </select> -->
        <NormalizationSelector :map-manager="props.mapManager" />
      </div>
    </div>
    <div id="right-header-block" class="header-block">
      <button
        id="reload-tiles-button"
        class="btn btn-sm btn-outline-primary"
        type="button"
        @click="reloadTiles"
      >
        <span><i class="bi bi-arrow-clockwise me-1"></i><span class="optional-button-label">Reload tiles</span></span>
      </button>
      <div class="export-group">
        <button
          id="toggle-osd-button"
          class="btn btn-sm btn-outline-primary"
          type="button"
          @click="osdOverlayVisible = !osdOverlayVisible"
          :title="osdOverlayVisible ? 'Hide map information overlay' : 'Show map information overlay'"
        >
          <i class="bi bi-card-text" aria-hidden="true"></i>
          <span class="optional-button-label">OSD</span>
        </button>
        <button
          id="ruler-mode-button"
          class="btn btn-sm btn-outline-primary"
          type="button"
          @click="cycleRulerMode"
          :title="`Cycle ruler coordinate mode. Current: ${rulerModeLabel}`"
        >
          <i class="bi bi-rulers me-1" aria-hidden="true"></i>
          <span class="ruler-button-label">{{ rulerModeLabel }}</span>
        </button>
        <button
          id="export-svg-button"
          class="btn btn-sm btn-outline-primary"
          type="button"
          :disabled="exportingType !== null"
          @click="exportSvg"
          title="Export full map as SVG"
        >
          <span v-if="exportingType !== 'svg'"
            ><i class="bi bi-box-arrow-up"></i><span class="export-button-label">SVG</span></span
          >
          <span v-else>
            <span class="spinner-border spinner-border-sm me-2"></span>
            {{ Math.round(svgProgress * 100) }}%
          </span>
        </button>
        <button
          id="export-png-button"
          class="btn btn-sm btn-outline-primary"
          type="button"
          :disabled="exportingType !== null"
          @click="exportPng"
          title="Export full map as PNG"
        >
          <span v-if="exportingType !== 'png'"
            ><i class="bi bi-box-arrow-up"></i><span class="export-button-label">PNG</span></span
          >
          <span v-else>
            <span class="spinner-border spinner-border-sm me-2"></span>
            {{ Math.round(svgProgress * 100) }}%
          </span>
        </button>
        <button
          id="export-pdf-button"
          class="btn btn-sm btn-outline-primary"
          type="button"
          :disabled="exportingType !== null"
          @click="exportPdf"
          title="Export full map as PDF"
        >
          <span v-if="exportingType !== 'pdf'"
            ><i class="bi bi-box-arrow-up"></i><span class="export-button-label">PDF</span></span
          >
          <span v-else>
            <span class="spinner-border spinner-border-sm me-2"></span>
            {{ Math.round(svgProgress * 100) }}%
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import type { AxisScopeSelection } from "@/app/core/mapmanagers/HiCViewAndLayersManager";
import NormalizationSelector from "./NormalizationSelector.vue";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { toast } from "vue-sonner";
import { useStyleStore } from "@/app/stores/styleStore";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import { storeToRefs } from "pinia";
import SimpleLinearGradient from "@/app/core/visualization/colormap/SimpleLinearGradient";

const props = defineProps<{
  mapManager?: ContactMapManager;
}>();

const uiSettingsStore = useUiSettingsStore();
const { osdOverlayVisible, rulerCoordinateMode } = storeToRefs(uiSettingsStore);
const exportingType = ref<"svg" | "png" | "pdf" | null>(null);
const svgProgress = ref(0);
type ScopeAxis = "row" | "column";
interface ScopeOption extends AxisScopeSelection {
  key: string;
  displayType: "All" | "Scaffold" | "Contig";
  order: number;
  searchText: string;
}
const selectedRowScope = ref<AxisScopeSelection>({
  kind: "all",
  label: "All Rows",
});
const selectedColumnScope = ref<AxisScopeSelection>({
  kind: "all",
  label: "All Columns",
});
const rowScopeQuery = ref("All Rows");
const columnScopeQuery = ref("All Columns");
const rowScopeFilterQuery = ref("");
const columnScopeFilterQuery = ref("");
const rowScopeOpen = ref(false);
const columnScopeOpen = ref(false);
const rowScopeIndex = ref(0);
const columnScopeIndex = ref(0);
const searchQuery = ref("");
const searchResults = ref<
  {
    key: string;
    type: "Contig" | "Scaffold" | "Feature";
    id: number | string;
    name: string;
    originalName?: string;
    trackId?: string;
    trackName?: string;
    featureStartBp?: number;
    featureEndBp?: number;
    featureType?: string;
    strand?: string;
  }[]
>([]);
const selectedIndex = ref(0);
const searchLoadingRemote = ref(false);
let searchRequestToken = 0;
let searchDebounceTimer: number | null = null;
const stylesStore = useStyleStore();
const visualizationOptionsStore = useVisualizationOptionsStore();
const { mapBackgroundColor } = storeToRefs(stylesStore);
const {
  preLogBase,
  postLogBase,
  applyCoolerWeights,
  resolutionScaling,
  resolutionLinearScaling,
  signalDisplayMode,
  colormap,
} = storeToRefs(visualizationOptionsStore);

const allScopeLabel = (axis: ScopeAxis) =>
  axis === "row" ? "All Rows" : "All Columns";

const allScopeOption = (axis: ScopeAxis): ScopeOption => ({
  kind: "all",
  label: allScopeLabel(axis),
  key: `${axis}-all`,
  displayType: "All",
  order: -1,
  searchText: allScopeLabel(axis).toLowerCase(),
});

function scopeToSelection(option: AxisScopeSelection): AxisScopeSelection {
  if (option.kind === "all" || option.id === undefined) {
    return { kind: "all", label: option.label };
  }
  return {
    kind: option.kind,
    id: option.id,
    label: option.label,
    startBp: option.startBp,
    endBp: option.endBp,
  };
}

function normalizeSelectionForAxis(
  selection: AxisScopeSelection,
  axis: ScopeAxis
): AxisScopeSelection {
  if (selection.kind === "all" || selection.id === undefined) {
    return { kind: "all", label: allScopeLabel(axis) };
  }
  return scopeToSelection(selection);
}

function buildScopeOptions(axis: ScopeAxis): ScopeOption[] {
  const manager = props.mapManager;
  if (!manager) {
    return [allScopeOption(axis)];
  }
  void manager.getLayersManager().axisScopeRevision;
  const options: ScopeOption[] = [allScopeOption(axis)];
  const scaffolds = manager.scaffoldHolder.scaffoldBordersSorted;
  for (let i = 0; i < scaffolds.length; i += 1) {
    const [borders, scaffoldId] = scaffolds[i];
    const descriptor = manager.scaffoldHolder.scaffoldTable.get(scaffoldId);
    if (!descriptor || !borders) {
      continue;
    }
    const label = descriptor.scaffoldName ?? `scaffold ${scaffoldId}`;
    const original = descriptor.scaffoldOriginalName ?? "";
    options.push({
      kind: "scaffold",
      id: scaffoldId,
      label,
      startBp: borders.startBP,
      endBp: borders.endBP,
      key: `${axis}-scaffold-${scaffoldId}`,
      displayType: "Scaffold",
      order: i,
      searchText: `${label} ${original}`.toLowerCase(),
    });
  }
  const contigs = manager.getContigDimensionHolder().contigDescriptors ?? [];
  const prefixes = manager.getContigDimensionHolder().prefix_sum_bp ?? [];
  const contigOffset = options.length + 100000;
  for (let i = 0; i < contigs.length; i += 1) {
    const descriptor = contigs[i];
    const label = descriptor.contigName ?? `contig ${descriptor.contigId}`;
    const original = descriptor.contigOriginalName ?? "";
    const startBp = prefixes[i] ?? 0;
    options.push({
      kind: "contig",
      id: descriptor.contigId,
      label,
      startBp,
      endBp: startBp + descriptor.contigLengthBp,
      key: `${axis}-contig-${descriptor.contigId}`,
      displayType: "Contig",
      order: contigOffset + i,
      searchText: `${label} ${original}`.toLowerCase(),
    });
  }
  return options;
}

function fuzzyScore(searchText: string, query: string): number | null {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return 0;
  }
  if (searchText.startsWith(normalized)) {
    return 0;
  }
  if (searchText.includes(normalized)) {
    return 1;
  }
  let q = 0;
  for (let i = 0; i < searchText.length && q < normalized.length; i += 1) {
    if (searchText[i] === normalized[q]) {
      q += 1;
    }
  }
  return q === normalized.length ? 2 : null;
}

function filterScopeOptions(
  options: ScopeOption[],
  query: string
): ScopeOption[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return options;
  }
  return options
    .map((option) => ({
      option,
      score: fuzzyScore(option.searchText, normalized),
    }))
    .filter((entry): entry is { option: ScopeOption; score: number } =>
      entry.score !== null
    )
    .sort((a, b) => a.score - b.score || a.option.order - b.option.order)
    .slice(0, 80)
    .map((entry) => entry.option);
}

const rowScopeOptions = computed(() => buildScopeOptions("row"));
const columnScopeOptions = computed(() => buildScopeOptions("column"));
const filteredRowScopeOptions = computed(() =>
  filterScopeOptions(rowScopeOptions.value, rowScopeFilterQuery.value)
);
const filteredColumnScopeOptions = computed(() =>
  filterScopeOptions(columnScopeOptions.value, columnScopeFilterQuery.value)
);

function selectScope(axis: ScopeAxis, option: ScopeOption): void {
  const selection = scopeToSelection(option);
  if (axis === "row") {
    selectedRowScope.value = selection;
    rowScopeQuery.value = selection.label;
    rowScopeFilterQuery.value = "";
    rowScopeOpen.value = false;
    rowScopeIndex.value = 0;
  } else {
    selectedColumnScope.value = selection;
    columnScopeQuery.value = selection.label;
    columnScopeFilterQuery.value = "";
    columnScopeOpen.value = false;
    columnScopeIndex.value = 0;
  }
  props.mapManager?.getLayersManager().setAxisScopes(
    selectedRowScope.value,
    selectedColumnScope.value
  );
}

function openScopePicker(axis: ScopeAxis): void {
  syncScopeQueriesFromManager();
  if (axis === "row") {
    rowScopeOpen.value = true;
    rowScopeFilterQuery.value = "";
    rowScopeIndex.value = 0;
  } else {
    columnScopeOpen.value = true;
    columnScopeFilterQuery.value = "";
    columnScopeIndex.value = 0;
  }
}

function onScopeInput(axis: ScopeAxis): void {
  if (axis === "row") {
    rowScopeOpen.value = true;
    rowScopeFilterQuery.value = rowScopeQuery.value;
    rowScopeIndex.value = 0;
  } else {
    columnScopeOpen.value = true;
    columnScopeFilterQuery.value = columnScopeQuery.value;
    columnScopeIndex.value = 0;
  }
}

function deferScopePickerClose(axis: ScopeAxis): void {
  window.setTimeout(() => {
    restoreScopeQuery(axis);
  }, 120);
}

function restoreScopeQuery(axis: ScopeAxis): void {
  if (axis === "row") {
    rowScopeQuery.value = selectedRowScope.value.label || "All Rows";
    rowScopeFilterQuery.value = "";
    rowScopeOpen.value = false;
    rowScopeIndex.value = 0;
  } else {
    columnScopeQuery.value = selectedColumnScope.value.label || "All Columns";
    columnScopeFilterQuery.value = "";
    columnScopeOpen.value = false;
    columnScopeIndex.value = 0;
  }
}

function copyRowScopeToColumn(): void {
  const nextColumn = normalizeSelectionForAxis(selectedRowScope.value, "column");
  selectedColumnScope.value = nextColumn;
  columnScopeQuery.value = nextColumn.label;
  columnScopeFilterQuery.value = "";
  columnScopeOpen.value = false;
  columnScopeIndex.value = 0;
  props.mapManager?.getLayersManager().setAxisScopes(
    selectedRowScope.value,
    selectedColumnScope.value
  );
}

function moveScopeHighlight(axis: ScopeAxis, delta: number): void {
  const options =
    axis === "row" ? filteredRowScopeOptions.value : filteredColumnScopeOptions.value;
  if (options.length === 0) {
    return;
  }
  const indexRef = axis === "row" ? rowScopeIndex : columnScopeIndex;
  indexRef.value =
    (indexRef.value + delta + options.length) % options.length;
}

function acceptHighlightedScope(axis: ScopeAxis): void {
  const options =
    axis === "row" ? filteredRowScopeOptions.value : filteredColumnScopeOptions.value;
  const index = axis === "row" ? rowScopeIndex.value : columnScopeIndex.value;
  const option = options[index] ?? options[0];
  if (option) {
    selectScope(axis, option);
  }
}

function syncScopeQueriesFromManager(): void {
  const scopes = props.mapManager?.getLayersManager().getAxisScopes();
  if (!scopes) {
    selectedRowScope.value = { kind: "all", label: "All Rows" };
    selectedColumnScope.value = { kind: "all", label: "All Columns" };
  } else {
    selectedRowScope.value = scopes.row;
    selectedColumnScope.value = scopes.column;
  }
  if (!rowScopeOpen.value) {
    rowScopeQuery.value = selectedRowScope.value.label || "All Rows";
    rowScopeFilterQuery.value = "";
  }
  if (!columnScopeOpen.value) {
    columnScopeQuery.value = selectedColumnScope.value.label || "All Columns";
    columnScopeFilterQuery.value = "";
  }
}

watch(
  () => props.mapManager?.getLayersManager().axisScopeRevision,
  () => syncScopeQueriesFromManager(),
  { immediate: true }
);

const rulerModeLabel = computed(() => {
  switch (rulerCoordinateMode.value) {
    case "contig":
      return "Ruler: in-ctg";
    case "scaffold":
      return "Ruler: in-scf";
    default:
      return "Ruler: Global";
  }
});

function cycleRulerMode(): void {
  rulerCoordinateMode.value =
    rulerCoordinateMode.value === "global"
      ? "contig"
      : rulerCoordinateMode.value === "contig"
        ? "scaffold"
        : "global";
  props.mapManager?.getLayersManager().scheduleRulerRender();
}

async function exportSvg() {
  if (!props.mapManager || exportingType.value) return;
  exportingType.value = "svg";
  svgProgress.value = 0;
  const cmap = colormap.value;
  const metadata: Record<string, unknown> = {
    filename: props.mapManager.getOptions().filename,
    visualization: {
      preLogBase: preLogBase.value,
      postLogBase: postLogBase.value,
      applyCoolerWeights: applyCoolerWeights.value,
      resolutionScaling: resolutionScaling.value,
      resolutionLinearScaling: resolutionLinearScaling.value,
      signalDisplayMode: signalDisplayMode.value,
      colormap:
        cmap instanceof SimpleLinearGradient
          ? {
              type: cmap.colormapType,
              startColor: cmap.startColorRGBA?.RGBA,
              endColor: cmap.endColorRGBA?.RGBA,
              minSignal: cmap.minSignal,
              maxSignal: cmap.maxSignal,
            }
          : { type: cmap?.colormapType ?? "Unknown" },
    },
  };
  try {
    await props.mapManager.exportCurrentMapSvg(
      (progress) => {
        svgProgress.value = progress;
      },
      {
        backgroundColor: mapBackgroundColor.value.RGBA,
        metadata,
      }
    );
  } catch (e) {
    toast.error((e as Error)?.message ?? "Failed to export SVG");
  } finally {
    exportingType.value = null;
  }
}

async function exportPng() {
  if (!props.mapManager || exportingType.value) return;
  exportingType.value = "png";
  svgProgress.value = 0;
  const cmap = colormap.value;
  const metadata: Record<string, unknown> = {
    filename: props.mapManager.getOptions().filename,
    visualization: {
      preLogBase: preLogBase.value,
      postLogBase: postLogBase.value,
      applyCoolerWeights: applyCoolerWeights.value,
      resolutionScaling: resolutionScaling.value,
      resolutionLinearScaling: resolutionLinearScaling.value,
      colormap:
        cmap instanceof SimpleLinearGradient
          ? {
              type: cmap.colormapType,
              startColor: cmap.startColorRGBA?.RGBA,
              endColor: cmap.endColorRGBA?.RGBA,
              minSignal: cmap.minSignal,
              maxSignal: cmap.maxSignal,
            }
          : { type: cmap?.colormapType ?? "Unknown" },
    },
  };
  try {
    await props.mapManager.exportCurrentMapPng(
      (progress) => {
        svgProgress.value = progress;
      },
      {
        backgroundColor: mapBackgroundColor.value.RGBA,
        metadata,
      }
    );
  } catch (e) {
    toast.error((e as Error)?.message ?? "Failed to export PNG");
  } finally {
    exportingType.value = null;
  }
}

async function exportPdf() {
  if (!props.mapManager || exportingType.value) return;
  exportingType.value = "pdf";
  svgProgress.value = 0;
  const cmap = colormap.value;
  const metadata: Record<string, unknown> = {
    filename: props.mapManager.getOptions().filename,
    visualization: {
      preLogBase: preLogBase.value,
      postLogBase: postLogBase.value,
      applyCoolerWeights: applyCoolerWeights.value,
      resolutionScaling: resolutionScaling.value,
      resolutionLinearScaling: resolutionLinearScaling.value,
      colormap:
        cmap instanceof SimpleLinearGradient
          ? {
              type: cmap.colormapType,
              startColor: cmap.startColorRGBA?.RGBA,
              endColor: cmap.endColorRGBA?.RGBA,
              minSignal: cmap.minSignal,
              maxSignal: cmap.maxSignal,
            }
          : { type: cmap?.colormapType ?? "Unknown" },
    },
  };
  try {
    await props.mapManager.exportCurrentMapPdf(
      (progress) => {
        svgProgress.value = progress;
      },
      {
        backgroundColor: mapBackgroundColor.value.RGBA,
        metadata,
      }
    );
  } catch (e) {
    toast.error((e as Error)?.message ?? "Failed to export PDF");
  } finally {
    exportingType.value = null;
  }
}

function buildSearchResults(): void {
  const query = searchQuery.value.trim().toLowerCase();
  if (!props.mapManager || query.length < 3) {
    searchResults.value = [];
    selectedIndex.value = 0;
    return;
  }
  const contigs =
    props.mapManager.getContigDimensionHolder().contigDescriptors ?? [];
  const scaffolds = Array.from(
    props.mapManager.scaffoldHolder.scaffoldTable.values()
  );
  const results: typeof searchResults.value = [];
  for (const ctg of contigs) {
    const name = ctg.contigName ?? "";
    const original = ctg.contigOriginalName ?? "";
    if (
      name.toLowerCase().includes(query) ||
      original.toLowerCase().includes(query)
    ) {
      results.push({
        key: `contig-${ctg.contigId}`,
        type: "Contig",
        id: ctg.contigId,
        name,
        originalName: original !== name ? original : undefined,
      });
    }
  }
  for (const sc of scaffolds) {
    const name = sc.scaffoldName ?? "";
    const original = sc.scaffoldOriginalName ?? "";
    if (
      name.toLowerCase().includes(query) ||
      original.toLowerCase().includes(query)
    ) {
      results.push({
        key: `scaffold-${sc.scaffoldId}`,
        type: "Scaffold",
        id: sc.scaffoldId,
        name,
        originalName: original !== name ? original : undefined,
      });
    }
  }
  const featureSuggestions =
    props.mapManager.linearTrackManager.searchFeatureSuggestions(query, 30);
  for (const feature of featureSuggestions) {
    results.push({
      key: `feature-${feature.key}`,
      type: "Feature",
      id: feature.key,
      name: feature.label,
      trackId: feature.trackId,
      originalName: feature.featureType ?? undefined,
      trackName: feature.trackName,
      featureStartBp: feature.startBp,
      featureEndBp: feature.endBp,
      featureType: feature.featureType ?? undefined,
      strand: feature.strand ?? undefined,
    });
  }
  searchResults.value = results.slice(0, 50);
  selectedIndex.value = 0;
}

function onSearchInput(): void {
  buildSearchResults();
  scheduleRemoteSearch();
}

function selectResult(idx: number): void {
  selectedIndex.value = idx;
  const item = searchResults.value[idx];
  if (item) {
    searchQuery.value = item.name;
  }
}

function goToSelection(): void {
  if (!props.mapManager) return;
  const item =
    searchResults.value[selectedIndex.value] ?? searchResults.value[0];
  if (!item) return;
  if (item.type === "Contig") {
    const contig =
      props.mapManager
        .getContigDimensionHolder()
        .contigDescriptors.find((c) => c.contigId === Number(item.id)) ?? null;
    if (!contig) return;
    const view = props.mapManager.getView();
    const prefix = props.mapManager.contigDimensionHolder.prefix_sum_bp;
    const ord =
      props.mapManager.contigDimensionHolder.contigIdToOrd[contig.contigId];
    if (ord === undefined || Number.isNaN(ord)) {
      toast.error("Contig is not available in the current assembly");
      return;
    }
    const startBp = prefix[ord];
    const endBp = startBp + contig.contigLengthBp;
    const midBp = (startBp + endBp) / 2;
    const res = view.getResolution() ?? 1;
    const midPx = midBp / res;
    view.animate({ center: [midPx, -midPx] });
    scheduleFeatureContextPrefetch(startBp, endBp);
  } else if (item.type === "Scaffold") {
    const scaffold = props.mapManager.scaffoldHolder.getScaffoldById(
      Number(item.id)
    );
    const borders = scaffold.scaffoldBordersBP;
    if (!borders) {
      toast.error("Scaffold has no borders in the current assembly");
      return;
    }
    const view = props.mapManager.getView();
    const midBp = (borders.startBP + borders.endBP) / 2;
    const res = view.getResolution() ?? 1;
    const midPx = midBp / res;
    view.animate({ center: [midPx, -midPx] });
    scheduleFeatureContextPrefetch(borders.startBP, borders.endBP);
  } else if (
    typeof item.featureStartBp === "number" &&
    typeof item.featureEndBp === "number"
  ) {
    props.mapManager.linearTrackManager.centerOnFeature({
      key: String(item.id),
      trackId: item.trackId ?? "",
      trackName: item.trackName ?? "",
      label: item.name,
      featureType: item.featureType ?? null,
      strand: item.strand ?? null,
      startBp: item.featureStartBp,
      endBp: item.featureEndBp,
      updatedAtMs: Date.now(),
    });
    scheduleFeatureContextPrefetch(item.featureStartBp, item.featureEndBp);
  }
}

function scheduleRemoteSearch(): void {
  if (!props.mapManager) {
    searchLoadingRemote.value = false;
    return;
  }
  const query = searchQuery.value.trim();
  if (query.length < 3) {
    if (searchDebounceTimer !== null) {
      window.clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
    searchRequestToken++;
    searchLoadingRemote.value = false;
    return;
  }
  if (searchDebounceTimer !== null) {
    window.clearTimeout(searchDebounceTimer);
  }
  const token = ++searchRequestToken;
  searchLoadingRemote.value = true;
  searchDebounceTimer = window.setTimeout(() => {
    void fetchRemoteSearchResults(query, token);
  }, 140);
}

async function fetchRemoteSearchResults(
  query: string,
  token: number
): Promise<void> {
  try {
    if (!props.mapManager) {
      return;
    }
    const remote =
      await props.mapManager.linearTrackManager.searchFeatureSuggestionsRemote(
        query,
        120
      );
    if (token !== searchRequestToken) {
      return;
    }
    if (searchQuery.value.trim().toLowerCase() !== query.trim().toLowerCase()) {
      return;
    }
    appendRemoteSearchResults(remote);
  } catch (error) {
    console.debug("Remote feature search failed", error);
  } finally {
    if (token === searchRequestToken) {
      searchLoadingRemote.value = false;
    }
  }
}

function appendRemoteSearchResults(
  remote: {
    key: string;
    label: string;
    trackId?: string;
    trackName: string;
    featureType: string | null;
    strand: string | null;
    startBp: number;
    endBp: number;
  }[]
): void {
  if (remote.length === 0) {
    return;
  }
  const merged = [...searchResults.value];
  const seen = new Set(merged.map((item) => item.key));
  for (const feature of remote) {
    const key = `feature-${feature.key}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push({
      key,
      type: "Feature",
      id: feature.key,
      name: feature.label,
      trackId: feature.trackId,
      originalName: feature.featureType ?? undefined,
      trackName: feature.trackName,
      featureStartBp: feature.startBp,
      featureEndBp: feature.endBp,
      featureType: feature.featureType ?? undefined,
      strand: feature.strand ?? undefined,
    });
  }
  searchResults.value = merged.slice(0, 120);
}

function scheduleFeatureContextPrefetch(startBp: number, endBp: number): void {
  if (!props.mapManager) {
    return;
  }
  window.setTimeout(() => {
    void props.mapManager?.linearTrackManager.prefetchFeatureContextAround(
      startBp,
      endBp
    );
  }, 220);
}

onBeforeUnmount(() => {
  searchRequestToken++;
  if (searchDebounceTimer !== null) {
    window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
});

async function reloadTiles() {
  try {
    await props.mapManager?.reloadTilesFromBackend();
  } catch (e) {
    toast.error("Failed to reload tiles");
    console.error(e);
  }
}

async function onSignalDisplayModeChanged() {
  try {
    await props.mapManager?.visualizationManager.sendVisualizationOptionsAndReload();
  } catch (error) {
    toast.error("Failed to update signal display mode");
    console.error(error);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
// const emit = defineEmits<{
//   (e: "reloadTiles"): void;
//   // (e: "normalizationChanged", normalizationType: NormalizationType): void;
// }>();

// const normalizationTypeInt: Ref<number> = ref(0);

/*
function onNormalizationChanged() {
  let normalizationType: NormalizationType;
  switch (Number(unref(normalizationTypeInt))) {
    case 0:
      normalizationType = NormalizationType.LINEAR;
      break;
    case 1:
      normalizationType = NormalizationType.LOG2;
      break;
    case 2:
      normalizationType = NormalizationType.LOG10;
      break;
    case 3:
      normalizationType = NormalizationType.COOLER_BALANCE;
      break;
    default:
      throw new Error(
        `Unknown Normalization Type requested: ${normalizationTypeInt.value}`
      );
  }
  emit("normalizationChanged", normalizationType);
}
*/
</script>

<style scoped>
.header-ribbon {
  /* header */

  /* Auto layout */
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  padding: 8px 12px;
  gap: 8px 12px;

  width: 100%;
  min-height: 53px;
  height: auto;

  background: linear-gradient(180deg, #909aa4 0%, #7f8993 42%, #6d7781 100%);
  color: rgba(24, 30, 38, 0.95);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.32),
    inset 0 -1px 0 rgba(0, 0, 0, 0.28);

  /* Inside auto layout */
  flex: none;
  order: 1;
  flex-grow: 0;
}

.header-ribbon .mb-3 {
  margin-bottom: 0 !important;
}

.header-ribbon :deep(.form-control),
.header-ribbon :deep(.form-select),
.header-ribbon :deep(.btn),
.header-ribbon :deep(.dropdown-toggle) {
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.98) 0%,
    rgba(243, 245, 247, 0.96) 100%
  );
  color: rgba(24, 30, 38, 0.95) !important;
  border-color: rgba(15, 23, 38, 0.18) !important;
  text-shadow: none;
}

.header-ribbon :deep(.form-control:focus),
.header-ribbon :deep(.form-select:focus),
.header-ribbon :deep(.btn:hover),
.header-ribbon :deep(.btn:focus-visible),
.header-ribbon :deep(.dropdown-toggle:hover),
.header-ribbon :deep(.dropdown-toggle:focus-visible) {
  background: rgba(255, 255, 255, 1);
}

#left-header-block,
#right-header-block {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  min-width: 0;
}

#left-header-block {
  /* left block */

  /* Auto layout */
  align-items: center;
  padding: 0px;
  gap: 16px;

  width: auto;
  min-height: 30px;
  height: auto;

  /* Inside auto layout */
  flex: 1 1 auto;
  min-width: 0;
  order: 0;
  flex-grow: 1;
}

#right-header-block {
  gap: 6px;
  margin-left: auto;
  flex: 0 1 auto;
  min-width: 0;
}

#search-container {
  /* search */

  /* Auto layout */
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 0px 16px 0px 0px;
  gap: 10px;

  width: 216px;
  height: 30px;

  /* Inside auto layout */
  flex: none;
  order: 0;
  flex-grow: 0;
  position: relative;
}

#search-input-group {
  /* Input group */

  box-sizing: border-box;

  /* Auto layout */
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  padding: 0px;

  width: 200px;
  height: 30px;

  /* Global/09. White */
  /*background: #FFFFFF;*/

  /* Components/Forms/Input border */
  /*border: 1px solid #CED4DA;*/
  border-radius: 4px;

  /* Inside auto layout */
  flex: none;
  order: 0;
  flex-grow: 0;
}

.search-dropdown {
  position: absolute;
  top: 36px;
  left: 0;
  width: 320px;
  max-height: 240px;
  overflow: auto;
  background: var(--hict-surface-bg, #ffffff);
  border: 1px solid var(--hict-surface-border, #ced4da);
  border-radius: 6px;
  box-shadow: var(--hict-surface-shadow, 0 8px 16px rgba(0, 0, 0, 0.12));
  z-index: 30;
  padding: 4px;
}

.search-result {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 6px 8px;
  display: flex;
  gap: 6px;
  align-items: center;
  border-radius: 4px;
}

.search-result:hover,
.search-result.active {
  background: var(--hict-surface-bg-muted, #f1f3f5);
}

.search-loading {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--hict-surface-muted, #495057);
  padding: 6px 8px;
}

.search-type {
  font-size: 11px;
  color: var(--hict-surface-muted, #6c757d);
  min-width: 52px;
}

.search-name {
  font-weight: 600;
  color: var(--hict-surface-fg, #212529);
}

.search-original {
  font-size: 11px;
  color: var(--hict-surface-muted, #6c757d);
}

.scope-picker {
  position: relative;
  width: 180px;
  flex: 0 0 180px;
}

.scope-picker .form-control {
  height: 30px;
  font-size: 13px;
}

.scope-copy-control {
  flex: 0 0 auto;
}

.scope-copy-button {
  height: 30px;
  width: 34px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.scope-dropdown {
  position: absolute;
  top: 34px;
  left: 0;
  width: 280px;
  max-height: 280px;
  overflow: auto;
  background: var(--hict-surface-bg, #ffffff);
  border: 1px solid var(--hict-surface-border, #ced4da);
  border-radius: 6px;
  box-shadow: var(--hict-surface-shadow, 0 8px 16px rgba(0, 0, 0, 0.12));
  z-index: 35;
  padding: 4px;
}

.scope-result {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 6px 8px;
  display: flex;
  gap: 8px;
  align-items: center;
  border-radius: 4px;
}

.scope-result:hover,
.scope-result.active {
  background: var(--hict-surface-bg-muted, #f1f3f5);
}

.scope-type {
  font-size: 11px;
  color: var(--hict-surface-muted, #6c757d);
  min-width: 54px;
}

.scope-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--hict-surface-fg, #212529);
}

#reload-tiles-button {
  /* _base */

  box-sizing: border-box;

  /* Auto layout */
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 4px 8px;

  font-family: var(--hict-font-sans);
  font-style: normal;
  font-weight: 100;
  font-size: 14px;
  line-height: 21px;

  text-align: center;

  width: 115px;
  height: 30px;

  /* Global/07. Light */
  border: 1px solid rgba(15, 23, 38, 0.18);
  border-radius: 4px;
  color: rgba(24, 30, 38, 0.95);
  background: rgba(255, 255, 255, 0.94);

  /* Inside auto layout */
  flex: none;
  order: 0;
  flex-grow: 0;
}

#export-png-button,
#export-svg-button,
#export-pdf-button {
  /* _base */

  box-sizing: border-box;

  /* Auto layout */
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 4px 8px;

  min-width: 140px;
  height: 30px;

  /* Global/07. Light */
  border: 1px solid rgba(15, 23, 38, 0.18);
  border-radius: 4px;
  color: rgba(24, 30, 38, 0.95);
  background: rgba(255, 255, 255, 0.94);

  /* Inside auto layout */
  flex: none;
  order: 1;
  flex-grow: 0;
}

.export-group {
  display: flex;
  flex: 0 1 auto;
  gap: 6px;
  min-width: 0;
}

.export-group .btn,
#reload-tiles-button {
  align-items: center;
  display: inline-flex;
  gap: 0.25rem;
  justify-content: center;
  min-width: 2.45rem;
  white-space: nowrap;
}

.export-button-label,
.optional-button-label,
.ruler-button-label {
  margin-left: 0.25rem;
}

@media (max-width: 1320px) {
  .export-button-label {
    display: none;
  }

  #export-svg-button,
  #export-png-button,
  #export-pdf-button {
    padding-left: 0.55rem;
    padding-right: 0.55rem;
  }
}

@media (max-width: 1120px) {
  .optional-button-label {
    display: none;
  }

  #ruler-mode-button {
    max-width: 8.75rem;
  }

  .ruler-button-label {
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

@media (max-width: 900px) {
  #left-header-block,
  #right-header-block {
    flex: 1 1 100%;
  }

  #right-header-block {
    justify-content: flex-start;
    margin-left: 0;
  }
}

#global-search-button {
  border-color: rgba(15, 23, 38, 0.18);
  color: rgba(24, 30, 38, 0.95);
  background: rgba(255, 255, 255, 0.94);
}
</style>
