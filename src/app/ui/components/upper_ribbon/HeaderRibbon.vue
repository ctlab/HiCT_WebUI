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
          v-if="searchResults.length > 0 && searchQuery.length >= 3"
          class="search-dropdown"
        >
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
      <div class="mb-3">
        <select
          class="form-select form-select-sm"
          v-model.lazy="rowContigId"
          @change="checkOptionsAndSnapToContigIntersection"
        >
          <option selected value="null">All Rows</option>
          <option
            v-for="cd in mapManager?.getContigDimensionHolder()
              .contigDescriptors"
            :key="cd.contigId"
            :value="cd.contigId"
          >
            {{ cd.contigName }}
          </option>
        </select>
      </div>
      <div class="mb-3">
        <select
          class="form-select form-select-sm"
          v-model.lazy="columnContigId"
          @change="checkOptionsAndSnapToContigIntersection"
        >
          <option selected value="null">All Columns</option>
          <option
            v-for="cd in mapManager?.getContigDimensionHolder()
              .contigDescriptors"
            :key="cd.contigId"
            :value="cd.contigId"
          >
            {{ cd.contigName }}
          </option>
        </select>
      </div>
      <div class="mb-3">
        <select class="form-select form-select-sm">
          <option selected value="0">Show Observed</option>
          <option value="1">Show Expected</option>
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
        class="btn-sm btn-outline-primary"
        type="button"
        @click="reloadTiles"
      >
        Reload tiles
      </button>
      <div class="export-group">
        <button
          id="export-svg-button"
          class="btn-sm btn-outline-primary"
          type="button"
          :disabled="exportingType !== null"
          @click="exportSvg"
          title="Export full map as SVG"
        >
          <span v-if="exportingType !== 'svg'"><i class="bi bi-box-arrow-up"></i> SVG</span>
          <span v-else>
            <span class="spinner-border spinner-border-sm me-2"></span>
            {{ Math.round(svgProgress * 100) }}%
          </span>
        </button>
        <button
          id="export-png-button"
          class="btn-sm btn-outline-primary"
          type="button"
          :disabled="exportingType !== null"
          @click="exportPng"
          title="Export full map as PNG"
        >
          <span v-if="exportingType !== 'png'"><i class="bi bi-box-arrow-up"></i> PNG</span>
          <span v-else>
            <span class="spinner-border spinner-border-sm me-2"></span>
            {{ Math.round(svgProgress * 100) }}%
          </span>
        </button>
        <button
          id="export-pdf-button"
          class="btn-sm btn-outline-primary"
          type="button"
          :disabled="exportingType !== null"
          @click="exportPdf"
          title="Export full map as PDF"
        >
          <span v-if="exportingType !== 'pdf'"><i class="bi bi-box-arrow-up"></i> PDF</span>
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
import NormalizationSelector from "./NormalizationSelector.vue";
import { Ref, ref } from "vue";
import { toast } from "vue-sonner";
import { useStyleStore } from "@/app/stores/styleStore";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import { storeToRefs } from "pinia";
import SimpleLinearGradient from "@/app/core/visualization/colormap/SimpleLinearGradient";

const props = defineProps<{
  mapManager?: ContactMapManager;
}>();

const rowContigId: Ref<number | null> = ref(null);
const columnContigId: Ref<number | null> = ref(null);
const exportingType = ref<"svg" | "png" | "pdf" | null>(null);
const svgProgress = ref(0);
const searchQuery = ref("");
const searchResults = ref<
  {
    key: string;
    type: "Contig" | "Scaffold";
    id: number;
    name: string;
    originalName?: string;
  }[]
>([]);
const selectedIndex = ref(0);
const stylesStore = useStyleStore();
const visualizationOptionsStore = useVisualizationOptionsStore();
const { mapBackgroundColor } = storeToRefs(stylesStore);
const {
  preLogBase,
  postLogBase,
  applyCoolerWeights,
  resolutionScaling,
  resolutionLinearScaling,
  colormap,
} = storeToRefs(visualizationOptionsStore);

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
  searchResults.value = results.slice(0, 50);
  selectedIndex.value = 0;
}

function onSearchInput(): void {
  buildSearchResults();
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
  const item = searchResults.value[selectedIndex.value] ?? searchResults.value[0];
  if (!item) return;
  if (item.type === "Contig") {
    const contig =
      props.mapManager
        .getContigDimensionHolder()
        .contigDescriptors.find((c) => c.contigId === item.id) ?? null;
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
  } else {
    const scaffold = props.mapManager.scaffoldHolder.getScaffoldById(item.id);
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
  }
}

function checkOptionsAndSnapToContigIntersection() {
  // alert("Row " + rowContigId.value + " Column " + columnContigId.value);
  const rowCtgId = rowContigId.value;
  const colCtgId = columnContigId.value;
  if (rowCtgId && colCtgId && props.mapManager) {
    const mapManager = props.mapManager;
    const map = props.mapManager?.getMap();
    const view = map?.getView();
    if (mapManager && map && view) {
      const mapSize = map.getSize() ?? [100, 100];
      const rowContigSizes =
        mapManager.getContigDimensionHolder().contigDescriptors[rowCtgId]
          .contigLengthBins;
      const colContigSizes =
        mapManager.getContigDimensionHolder().contigDescriptors[colCtgId]
          .contigLengthBins;
      const minWidth = Math.min(200, mapSize[0]);
      const minHeight = Math.min(200, mapSize[1]);
      let bpResolutionToSnapAt: number = rowContigSizes.keys().next().value;
      for (const [res, rowCtgLen] of rowContigSizes) {
        const colCtgLen = colContigSizes.get(res) ?? 1;
        if (
          minWidth < colCtgLen &&
          colCtgLen < mapSize[0] &&
          minHeight < rowCtgLen &&
          rowCtgLen < mapSize[1]
        ) {
          bpResolutionToSnapAt = res;
          break;
        }
      }
      const [lu_x, lu_y] =
        mapManager.viewAndLayersManager.bpCoordinatesToGlobalCoordinates(
          [
            mapManager.getContigDimensionHolder().prefix_sum_bp[
              mapManager.getContigDimensionHolder().contigIdToOrd[colCtgId]
            ],
            mapManager.getContigDimensionHolder().prefix_sum_bp[
              mapManager.getContigDimensionHolder().contigIdToOrd[rowCtgId]
            ],
          ],
          bpResolutionToSnapAt
        );
      const [br_x, br_y] =
        mapManager.viewAndLayersManager.bpCoordinatesToGlobalCoordinates(
          [
            mapManager.getContigDimensionHolder().prefix_sum_bp[
              mapManager.getContigDimensionHolder().contigIdToOrd[1 + colCtgId]
            ],
            mapManager.getContigDimensionHolder().prefix_sum_bp[
              mapManager.getContigDimensionHolder().contigIdToOrd[1 + rowCtgId]
            ],
          ],
          bpResolutionToSnapAt
        );
      const centerCoordiate = [(lu_x + br_x) / 2, (lu_y + br_y) / 2];
      view.animate({
        center: centerCoordiate,
        resolution:
          mapManager.viewAndLayersManager.resolutionToPixelResolution.get(
            bpResolutionToSnapAt
          ),
      });

      //([lu_x, lu_y, br_x, br_y], {minResolution: bpResolutionToSnapAt})
    }
  }
}

async function reloadTiles() {
  try {
    await props.mapManager?.reloadTilesFromBackend();
  } catch (e) {
    toast.error("Failed to reload tiles");
    console.error(e);
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
  flex-wrap: nowrap;
  padding: 12px 16px;
  gap: 16px;

  width: 100%;
  height: 53px;

  /* Global/02. Secondary */
  background: #6c757d;

  /* Inside auto layout */
  flex: none;
  order: 1;
  flex-grow: 0;
}

.header-ribbon .mb-3 {
  margin-bottom: 0 !important;
}

#left-header-block,
#right-header-block {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16px;
  flex-wrap: nowrap;
}

#left-header-block {
  /* left block */

  /* Auto layout */
  align-items: center;
  padding: 0px;
  gap: 16px;

  width: auto;
  height: 29px;

  /* Inside auto layout */
  flex: 1 1 auto;
  min-width: 0;
  order: 0;
  flex-grow: 1;
}

#right-header-block {
  gap: 12px;
  margin-left: auto;
  flex: 0 0 auto;
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
  height: 29px;

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
  height: 29px;

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
  background: #ffffff;
  border: 1px solid #ced4da;
  border-radius: 6px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.12);
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
  background: #f1f3f5;
}

.search-type {
  font-size: 11px;
  color: #6c757d;
  min-width: 52px;
}

.search-name {
  font-weight: 600;
  color: #212529;
}

.search-original {
  font-size: 11px;
  color: #6c757d;
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

  font-family: "Roboto", ui-sans-serif;
  font-style: normal;
  font-weight: 100;
  font-size: 14px;
  line-height: 21px;

  text-align: center;

  width: 90px;
  height: 29px;

  /* Global/07. Light */
  border: 1px solid #f8f9fa;
  border-radius: 4px;

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
  height: 29px;

  /* Global/07. Light */
  border: 1px solid #f8f9fa;
  border-radius: 4px;

  /* Inside auto layout */
  flex: none;
  order: 1;
  flex-grow: 0;
}

.export-group {
  display: flex;
  gap: 6px;
}
</style>
