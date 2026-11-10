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
        v-if="editingName"
        ref="nameInput"
        type="text"
        class="form-control form-control-sm m-0"
        placeholder="Preset name"
        aria-label="Name of visualization preset"
        v-model="name"
        @keydown.enter.prevent="renamePreset"
        @keydown.escape.prevent="cancelRename"
      />
      <button
        v-else
        type="button"
        class="form-control form-control-sm m-0 preset-apply-button"
        :title="`Apply preset “${name}”`"
        @click="setOptionsPreset"
      >
        {{ name }}
      </button>
      <button
        v-if="editingName"
        class="btn btn-sm btn-outline-success"
        type="button"
        title="Save new name (Enter)"
        aria-label="Save preset name"
        @click="renamePreset"
      >
        <i class="bi bi-check-lg"></i>
      </button>
      <button
        v-else
        class="btn btn-sm btn-outline-secondary"
        type="button"
        title="Rename preset"
        aria-label="Rename preset"
        @click="startRename"
      >
        <i class="bi bi-pencil"></i>
      </button>
      <button
        class="btn btn-sm btn-outline-danger"
        type="button"
        title="Remove visualization preset"
        aria-label="Remove visualization preset"
        @click="$emit('remove', props.option_id)"
      >
        <i class="bi bi-x-lg"></i>
      </button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import VisualizationOptions from "@/app/core/visualization/VisualizationOptions";
import type { TrackStylePresetBundle } from "@/app/core/tracks/TrackStylePreset";
import { nextTick, ref } from "vue";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import { storeToRefs } from "pinia";
import { useStyleStore } from "@/app/stores/styleStore";
import SimpleLinearGradient from "@/app/core/visualization/colormap/SimpleLinearGradient";
import { ColorTranslator } from "colortranslator";
import { useMatrixViewStore } from "@/app/stores/matrixViewStore";
import type { VisualizationPresetAction } from "@/app/stores/sessionStore";
import { displaySequenceOverlay } from "@/app/core/sequence/displaySequenceOverlay";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";
import { useNotificationCenterStore } from "@/app/stores/notificationCenterStore";

const visualizationOptionsStore = useVisualizationOptionsStore();
const { preLogBase, applyCoolerWeights, postLogBase, colormap } = storeToRefs(
  visualizationOptionsStore
);

const stylesStore = useStyleStore();
const { mapBackgroundColor } = storeToRefs(stylesStore);
const matrixViewStore = useMatrixViewStore();
const {
  presentationMode,
  activeVisualizationSource,
  activeVisualizationTargetId,
} = storeToRefs(matrixViewStore);

const props = defineProps<{
  mapManager?: ContactMapManager;
  option_id: number;
  name: string;
  visualizationOptions: VisualizationOptions;
  backgroundColor: ColorTranslator;
  trackStyles?: TrackStylePresetBundle;
  signalThresholds?: { lowerSignalBound?: number; upperSignalBound?: number };
  action?: VisualizationPresetAction;
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
const editingName = ref(false);
const nameInput = ref<HTMLInputElement | null>(null);

function startRename(): void {
  editingName.value = true;
  void nextTick(() => {
    nameInput.value?.focus();
    nameInput.value?.select();
  });
}

function cancelRename(): void {
  name.value = props.name;
  editingName.value = false;
}

const name = ref(props.name);

async function setOptionsPreset() {
  if (props.mapManager) {
    if (props.action?.type === "sequence-overlay") {
      try {
        await displaySequenceOverlay(
          props.mapManager,
          props.action.mode,
          props.action.kind
        );
      } catch (error) {
        useNotificationCenterStore().add("warning", extractErrorMessage(error));
      }
      return;
    }
    if (props.action?.type === "active-source-palette") {
      const current = visualizationOptionsStore.asVisualizationOptions();
      const active =
        current.colormap instanceof SimpleLinearGradient
          ? current.colormap
          : null;
      visualizationOptionsStore.setVisualizationOptions(
        new VisualizationOptions(
          current.preLogBase,
          current.postLogBase,
          current.applyCoolerWeights,
          current.resolutionScaling,
          current.resolutionLinearScaling,
          new SimpleLinearGradient(
            new ColorTranslator(props.action.startColor, { legacyCSS: true }),
            new ColorTranslator(props.action.endColor, { legacyCSS: true }),
            active?.minSignal ?? 0,
            active?.maxSignal ?? 1
          ),
          current.autoThresholdEnabled,
          current.autoThresholdQuantile,
          current.signalDisplayMode,
          current.coolerWeightsNaNPolicy,
          current.coolerWeightsHaveNaNs,
          current.coolerWeightsNaNCount
        )
      );
      try {
        await props.mapManager.visualizationManager.applyVisualizationSettingsForSourceAndReload(
          activeVisualizationSource.value,
          activeVisualizationTargetId.value
        );
      } catch (error) {
        useNotificationCenterStore().add("warning", extractErrorMessage(error));
      }
      return;
    }
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
      props.mapManager
        .getLayersManager()
        .applyTrackStylePreset(props.trackStyles);
    }
    const source =
      presentationMode.value === "single"
        ? undefined
        : activeVisualizationSource.value;
    const action = source
      ? props.mapManager?.visualizationManager.applyVisualizationSettingsForSourceAndReload(
          source,
          activeVisualizationTargetId.value
        )
      : props.mapManager
      ? props.mapManager.visualizationManager
          .sendVisualizationOptionsToServer()
          .then(() => props.mapManager?.reloadTiles())
      : undefined;
    action?.catch((error) => {
      console.error("Failed to apply visualization preset", error);
    });
  }
}

defineExpose({ apply: setOptionsPreset });

function renamePreset() {
  showRenameButton.value = false;
  editingName.value = false;
  name.value = name.value.trim() || props.name;
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

  width: calc(100% - 16px);
  height: 32px;
  margin-left: 8px;
  margin-right: 8px;

  /* Inside auto layout */
  flex: none;
  order: 0;
  flex-grow: 0;
}

.saved-locations > .input-group {
  width: 100%;
  flex-wrap: nowrap;
}

.preset-apply-button {
  flex: 1 1 auto;
  width: 1%;
  min-width: 0;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.preset-apply-button:hover,
.preset-apply-button:focus-visible {
  background: #eef4ff;
  border-color: #86b7fe;
}
</style>
