<!--
 Copyright (c) 2021-2024 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis, Zakhar Lobanov, Nikita Zheleznov and Computer Technologies Laboratory ITMO University team.

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
    <div id="left-header-block" class="input-group">
      <div id="search-container">
        <div id="search-input-group" class="input-group input-group-sm mb-3">
          <input
            id="global-search-input"
            class="form-control form-control-sm m-0"
            placeholder="I'm looking for..."
            type="text"
          />
          <button
            id="global-search-button"
            class="btn btn-sm btn-outline-light"
            type="button"
          >
            Go to
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
    <div id="right-header-block" class="input-group">
      <button
        id="reload-tiles-button"
        class="btn-sm btn-outline-primary"
        type="button"
        @click="props.mapManager?.reloadTiles()"
      >
        Reload tiles
      </button>
      <button
        id="export-png-button"
        class="btn-sm btn-outline-primary"
        type="button"
        @click="props.mapManager?.exportCurrentMapSvg()"
      >
        <i class="bi bi-box-arrow-up"></i>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import NormalizationSelector from "./NormalizationSelector.vue";
import { Ref, ref } from "vue";

const props = defineProps<{
  mapManager?: ContactMapManager;
}>();

const rowContigId: Ref<number | null> = ref(null);
const columnContigId: Ref<number | null> = ref(null);

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

#left-header-block {
  /* left block */

  /* Auto layout */
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  padding: 0px;
  gap: 16px;

  width: calc(100% - 150px);
  height: 29px;

  /* Inside auto layout */
  flex: none;
  order: 0;
  flex-grow: 0;
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

#right-header-block {
  /* right block */

  /* Auto layout */
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  padding: 0px;
  gap: 16px;

  width: 150px;
  height: 29px;

  /* Inside auto layout */
  flex: none;
  order: 1;
  flex-grow: 0;
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

#export-png-button {
  /* _base */

  box-sizing: border-box;

  /* Auto layout */
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 4px 8px;

  width: 37px;
  height: 29px;

  /* Global/07. Light */
  border: 1px solid #f8f9fa;
  border-radius: 4px;

  /* Inside auto layout */
  flex: none;
  order: 1;
  flex-grow: 0;
}
</style>
