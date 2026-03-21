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
  <div class="saved-locations">
    <div class="input-group">
      <input
        type="text"
        class="form-control m-0"
        placeholder="Preset name"
        aria-label="Name of visualization preset"
        v-model="name"
        @change="() => (showRenameButton = true)"
      />
      <button
        class="btn btn-outline-success"
        type="button"
        title="Rename preset"
        data-bs-toggle="tooltip"
        data-bs-placement="bottom"
        v-if="showRenameButton"
        @click="renamePreset"
      >
        <i class="bi bi-check-square-fill"></i>
      </button>
      <button
        class="btn btn-outline-primary"
        type="button"
        title="Load visualization preset"
        data-bs-toggle="tooltip"
        data-bs-placement="bottom"
        @click="setOptionsPreset"
      >
        <i class="bi bi-brush"></i>
      </button>
      <button
        class="btn btn-outline-danger"
        type="button"
        title="Remove visualization preset"
        data-bs-toggle="tooltip"
        data-bs-placement="bottom"
        @click="$emit('remove', props.option_id)"
      >
        <i class="bi bi-x-square-fill"></i>
      </button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import VisualizationOptions from "@/app/core/visualization/VisualizationOptions";
import type { TrackStylePresetBundle } from "@/app/core/tracks/TrackStylePreset";
import { ref } from "vue";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import { storeToRefs } from "pinia";
import { useStyleStore } from "@/app/stores/styleStore";
import SimpleLinearGradient from "@/app/core/visualization/colormap/SimpleLinearGradient";
import { ColorTranslator } from "colortranslator";

const visualizationOptionsStore = useVisualizationOptionsStore();
const { preLogBase, applyCoolerWeights, postLogBase, colormap } = storeToRefs(
  visualizationOptionsStore
);

const stylesStore = useStyleStore();
const { mapBackgroundColor } = storeToRefs(stylesStore);

const props = defineProps<{
  mapManager?: ContactMapManager;
  option_id: number;
  name: string;
  visualizationOptions: VisualizationOptions;
  backgroundColor: ColorTranslator;
  trackStyles?: TrackStylePresetBundle;
  signalThresholds?: { lowerSignalBound?: number; upperSignalBound?: number };
}>();

const emits = defineEmits<{
  (e: "remove", option_id: number): void;
  (e: "rename", option_id: number, new_name: string): void;
  // (
  //   e: "apply",
  //   option_id: number,
  //   visualizationOptions: VisualizationOptions
  // ): void;
}>();

const showRenameButton = ref(false);

const name = ref(props.name);

function setOptionsPreset() {
  if (props.mapManager) {
    // console.log("Setting preset: ", props.visualizationOptions);
    visualizationOptionsStore.setVisualizationOptions(
      props.visualizationOptions
    );
    if (
      props.signalThresholds &&
      colormap.value instanceof SimpleLinearGradient
    ) {
      const lower = props.signalThresholds.lowerSignalBound;
      const upper = props.signalThresholds.upperSignalBound;
      if (typeof lower === "number") {
        const cmap = colormap.value as SimpleLinearGradient;
        colormap.value = new SimpleLinearGradient(
          cmap.startColorRGBA,
          cmap.endColorRGBA,
          lower,
          typeof upper === "number" ? upper : cmap.maxSignal
        );
      }
    }
    stylesStore.setMapBackground(props.backgroundColor);
    if (props.trackStyles) {
      props.mapManager.getLayersManager().applyTrackStylePreset(props.trackStyles);
    }
    props.mapManager?.visualizationManager
      .sendVisualizationOptionsToServer()
      .then(() => props.mapManager?.reloadTiles());
  }
}

function renamePreset() {
  showRenameButton.value = false;
  emits("rename", props.option_id, name.value);
}
</script>
<style scoped>
.saved-locations {
  /* layer */

  /* Auto layout */
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-start;
  padding: 0px;
  /* gap: 20px; */

  width: 100%;
  height: 40px;
  margin-left: 10px;
  margin-right: 10px;

  /* Inside auto layout */
  flex: none;
  order: 0;
  flex-grow: 0;
}
</style>
