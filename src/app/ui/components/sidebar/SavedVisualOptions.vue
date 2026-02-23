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
  <p class="w-100 m-0"><b>Visualization presets:</b></p>
  <div
    class="btn-group w-100 p-2"
    role="group"
    aria-label="Visualization presets"
  >
    <button
      type="button"
      class="btn btn-outline-primary"
      data-bs-toggle="tooltip"
      data-bs-placement="bottom"
      title="Save current visualization options"
      @click="saveOptions"
    >
      <i class="bi bi-bookmark-plus"></i> Save
    </button>
    <button
      type="button"
      class="btn btn-outline-primary"
      @click="exportOptions"
    >
      Export
    </button>
    <button
      type="button"
      class="btn btn-outline-primary"
      @click="importFileBtn?.click()"
    >
      Import
      <input
        type="file"
        ref="importFileBtn"
        v-on:change="importOptionsFromFile()"
        hidden
      />
    </button>
  </div>
  <div class="saved-visualization-options-div">
    <div v-for="[id, opt] of savedOptions" :key="id">
      <SavedVisualOptionsElement
        v-if="opt"
        :map-manager="props.mapManager"
        :option_id="opt.option_id"
        :visualization-options="opt.options"
        :background-color="opt.backgroundColor"
        :track-styles="opt.trackStyles"
        :name="opt.name"
        @remove="removeOption"
        @rename="renameOption"
      ></SavedVisualOptionsElement>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { Ref, ref, shallowRef, triggerRef, onMounted } from "vue";
import SavedVisualOptionsElement from "./SavedVisualOptionsElement.vue";
import VisualizationOptions from "@/app/core/visualization/VisualizationOptions";
import SimpleLinearGradient from "@/app/core/visualization/colormap/SimpleLinearGradient";
import Colormap from "@/app/core/visualization/colormap/Colormap";
import type { TrackStylePresetBundle } from "@/app/core/tracks/TrackStylePreset";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import { storeToRefs } from "pinia";
import { toast } from "vue-sonner";
import { useStyleStore } from "@/app/stores/styleStore";
import { ColorTranslator } from "colortranslator";
import defaultOptions from "@/app/core/visualization/colormap/default_options.json";
const visualizationOptionsStore = useVisualizationOptionsStore();
const { preLogBase, applyCoolerWeights, postLogBase, colormap } = storeToRefs(
  visualizationOptionsStore
);


onMounted(() => {
  importJSONResults(defaultOptions);
});

const stylesStore = useStyleStore();
const { mapBackgroundColor } = storeToRefs(stylesStore);

const props = defineProps<{
  mapManager?: ContactMapManager;
}>();

const savedOptions = shallowRef(
  new Map<
    number,
    {
      option_id: number;
      name: string;
      options: VisualizationOptions;
      backgroundColor: ColorTranslator;
      trackStyles?: TrackStylePresetBundle;
    }
  >()
);

function bumpSavedOptions() {
  triggerRef(savedOptions);
}

function nextOptionId(): number {
  let maxId = -1;
  savedOptions.value.forEach((v) => {
    if (v.option_id > maxId) maxId = v.option_id;
  });
  return maxId + 1;
}

function colorToString(c: ColorTranslator): string {
  return c.toString();
}

const importFileBtn: Ref<HTMLInputElement | null> = ref(null);

const optionsCount = ref(0);

function saveOptions() {
  if (!props.mapManager) return;

  const id = nextOptionId();
  savedOptions.value.set(id, {
    option_id: id,
    name: `Preset ${id}`,
    options: visualizationOptionsStore.asVisualizationOptions(),
    backgroundColor: mapBackgroundColor.value as ColorTranslator,
    trackStyles: props.mapManager.getLayersManager().getTrackStylePreset(),
  });
  bumpSavedOptions();
}

function removeOption(option_id: number) {
  savedOptions.value.delete(option_id);
  bumpSavedOptions();
}

function renameOption(option_id: number, name: string) {
  const opt = savedOptions.value.get(option_id);
  if (!opt) return;

  savedOptions.value.set(option_id, { ...opt, name });
  bumpSavedOptions();
}

function exportOptions() {
  const values: {
    option_id: number;
    options: Record<string, unknown>;
    backgroundColor: string; // <-- stable
    name: string;
    trackStyles?: TrackStylePresetBundle;
  }[] = [];

  savedOptions.value.forEach((v) =>
    values.push({
      option_id: v.option_id,
      options: serializeVisualizationOptions(v.options),
      name: v.name,
      backgroundColor: colorToString(v.backgroundColor),
      trackStyles: v.trackStyles,
    })
  );

  const data = JSON.stringify({
    exportType: "visualizationOptions",
    data: {
      filename: props.mapManager?.getOptions().filename,
      savedVisualizationPresets: values,
    },
  });

  const blob = new Blob([data], { type: "application/json" });

  const a = document.createElement("a");
  a.download =
    "visualizationOptionsPresets." +
    props.mapManager?.getOptions().filename +
    ".hict.json";
  a.href = URL.createObjectURL(blob);
  a.click();
  URL.revokeObjectURL(a.href);
}

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null;
}

function getDataField(v: unknown): UnknownRecord | undefined {
  if (!isRecord(v)) return undefined;
  const d = (v as UnknownRecord).data;
  return isRecord(d) ? d : undefined;
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

function importJSONResults(jsonPreResult: unknown) {
  const data = getDataField(jsonPreResult);

  // If no valid "data" block, nothing to import
  if (!data) {
    toast.error("Cannot import visualization options: invalid JSON format");
    return;
  }

  // Compatibility with old saved visualization presets:
  const savedVisualizationPresets = data.savedVisualizationPresets;
  if (isArray(savedVisualizationPresets) && savedVisualizationPresets.length > 0) {
    savedVisualizationPresets.forEach((sl) => {
      if (!isRecord(sl)) return;

      if (typeof sl.backgroundColor === "string") {
        sl.backgroundColor = new ColorTranslator(sl.backgroundColor);
      }

      const opt = sl.options;
      if (isRecord(opt) && isRecord(opt.colormap)) {
        const cm = opt.colormap;

        if (typeof cm.startColorRGBAString === "string") {
          cm.startColorRGBA = new ColorTranslator(cm.startColorRGBAString as string);
        }
        if (typeof cm.endColorRGBAString === "string") {
          cm.endColorRGBA = new ColorTranslator(cm.endColorRGBAString as string);
        }
      }
    });
  }

  const savedLocations = data.savedLocations;
  if (isArray(savedLocations) && savedLocations.length > 0) {
    savedLocations.forEach((sl) => {
      if (!isRecord(sl)) return;

      if (typeof sl.backgroundColor === "string") {
        sl.backgroundColor = new ColorTranslator(sl.backgroundColor);
      }

      const opt = sl.options;
      if (isRecord(opt) && isRecord(opt.colormap)) {
        const cm = opt.colormap;

        if (typeof cm.startColorRGBAString === "string") {
          cm.startColorRGBA = new ColorTranslator(cm.startColorRGBAString as string);
        }
        if (typeof cm.endColorRGBAString === "string") {
          cm.endColorRGBA = new ColorTranslator(cm.endColorRGBAString as string);
        }
      }
    });
  }

  // Now parse into your expected (new) format safely
  const jsonResult = jsonPreResult as {
    exportType: "visualizationOptions";
    data: {
      filename: string;
      savedLocations?: {
        option_id: number;
        options: Record<string, unknown>;
        backgroundColor?: string | ColorTranslator;
        name?: string;
        trackStyles?: TrackStylePresetBundle;
      }[];
      savedVisualizationPresets?: {
        option_id: number;
        options: Record<string, unknown>;
        backgroundColor?: string | ColorTranslator;
        name?: string;
        trackStyles?: TrackStylePresetBundle;
      }[];
    };
  };

  const arr =
    jsonResult.data.savedVisualizationPresets ??
    jsonResult.data.savedLocations ??
    [];

  arr.forEach((option) => {
    const newId = nextOptionId();

    let backgroundColor: ColorTranslator = new ColorTranslator(
      "rgba(255,255,255,255)",
      { legacyCSS: true }
    );

    const b = option.backgroundColor;
    if (b instanceof ColorTranslator) {
      backgroundColor = b;
    } else if (typeof b === "string") {
      backgroundColor = new ColorTranslator(b);
    }

    const newOption = {
      option_id: newId,
      options: deserializeVisualizationOptions(option.options),
      backgroundColor,
      trackStyles: option.trackStyles,
      name: option.name ?? `Imported preset ${newId}`,
    };
    savedOptions.value.set(newOption.option_id, newOption);
    bumpSavedOptions();
  });
}

function serializeVisualizationOptions(options: VisualizationOptions): Record<string, unknown> {
  const cmap = options.colormap;
  if (cmap instanceof SimpleLinearGradient) {
    return {
      preLogBase: options.preLogBase,
      postLogBase: options.postLogBase,
      applyCoolerWeights: options.applyCoolerWeights ?? false,
      resolutionScaling: options.resolutionScaling ?? false,
      resolutionLinearScaling: options.resolutionLinearScaling ?? false,
      colormap: {
        colormapType: cmap.colormapType,
        startColorRGBAString: cmap.startColorRGBA.toString(),
        endColorRGBAString: cmap.endColorRGBA.toString(),
        minSignal: cmap.minSignal,
        maxSignal: cmap.maxSignal,
      },
    };
  }
  return {
    preLogBase: options.preLogBase,
    postLogBase: options.postLogBase,
    applyCoolerWeights: options.applyCoolerWeights ?? false,
    resolutionScaling: options.resolutionScaling ?? false,
    resolutionLinearScaling: options.resolutionLinearScaling ?? false,
    colormap: {
      colormapType: options.colormap?.colormapType ?? "Unknown",
    },
  };
}

function deserializeVisualizationOptions(raw: Record<string, unknown>): VisualizationOptions {
  const preLogBase = typeof raw.preLogBase === "number" ? raw.preLogBase : -1;
  const postLogBase = typeof raw.postLogBase === "number" ? raw.postLogBase : 10;
  const applyCoolerWeights =
    typeof raw.applyCoolerWeights === "boolean" ? raw.applyCoolerWeights : false;
  const resolutionScaling =
    typeof raw.resolutionScaling === "boolean" ? raw.resolutionScaling : false;
  const resolutionLinearScaling =
    typeof raw.resolutionLinearScaling === "boolean" ? raw.resolutionLinearScaling : false;
  const cmapRaw = isRecord(raw.colormap) ? raw.colormap : {};
  const cmapType =
    typeof cmapRaw.colormapType === "string"
      ? cmapRaw.colormapType
      : "Unknown";
  let cmap: Colormap;
  if (cmapType === "SimpleLinearGradient") {
    const startColor =
      typeof cmapRaw.startColorRGBAString === "string"
        ? cmapRaw.startColorRGBAString
        : "rgba(0,255,0,0.0)";
    const endColor =
      typeof cmapRaw.endColorRGBAString === "string"
        ? cmapRaw.endColorRGBAString
        : "rgba(0,96,0,1.0)";
    const minSignal =
      typeof cmapRaw.minSignal === "number" ? cmapRaw.minSignal : 0;
    const maxSignal =
      typeof cmapRaw.maxSignal === "number" ? cmapRaw.maxSignal : 1;
    cmap = new SimpleLinearGradient(
      new ColorTranslator(startColor, { legacyCSS: true }),
      new ColorTranslator(endColor, { legacyCSS: true }),
      minSignal,
      maxSignal
    );
  } else {
    cmap = new Colormap(cmapType);
  }
  return new VisualizationOptions(
    preLogBase,
    postLogBase,
    applyCoolerWeights,
    resolutionScaling,
    resolutionLinearScaling,
    cmap
  );
}

function importOptionsFromFile() {
  try {
    if (importFileBtn.value) {
      const fileList = importFileBtn.value.files as FileList;
      if (fileList && fileList.length > 0) {
        const reader = new FileReader();
        reader.readAsText(fileList[0], "utf-8");
        // console.log(fileList);
        // console.log(reader);
        reader.onload = (evt) => {
          try {
            if (!evt.target || !evt.target.result) {
              return;
            }
            const jsonPreResult = JSON.parse(evt.target.result as string);

            importJSONResults(jsonPreResult);

            toast.success("Visualziation presets loaded");
          } catch (e) {
            toast.error("Cannot import visualization options: " + e);
          }
        };
      }
    }
  } catch (e) {
    toast.error("Cannot import visualization options: " + e);
  }
}
</script>

<style scoped>
.pills {
  /* pills */

  /* Auto layout */
  display: flex;
  flex-direction: column;
  padding: 0px 16px;
  gap: 10px;

  /* width: 80%; */
  height: 40px;
}

.save-btn-div {
  /* save btn */

  /* Auto layout */
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 8px 16px 0px;

  width: 232px;
  height: 37px;

  /* Inside auto layout */
  flex: none;
  order: 1;
  flex-grow: 0;
}

#save-button {
  /* Buttons */
  width: 232px;

  /* Inside auto layout */
  flex: none;
  order: 0;
  align-self: stretch;
  flex-grow: 0;
}

#save-btn-text {
  margin-left: 10px;
}

.saved-visualization-options-div {
  /* Auto layout */
  display: flex;
  flex-direction: column;
  align-items: flex-start;

  /* Inside auto layout */
  flex: none;
  order: 2;
  flex-grow: 0;

  height: 90%;
  max-height: 200px;
  overflow-y: scroll;
  overflow-x: hidden;
  width: 100%;
  /* padding-top: 15px; */
  padding-right: 20px;
}
</style>
