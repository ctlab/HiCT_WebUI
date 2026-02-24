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
import { Ref, ref, shallowRef, triggerRef, onMounted, watch } from "vue";
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
import { useSessionStore } from "@/app/stores/sessionStore";
const visualizationOptionsStore = useVisualizationOptionsStore();
const { preLogBase, applyCoolerWeights, postLogBase, colormap } = storeToRefs(
  visualizationOptionsStore
);


onMounted(() => {
  importJSONResults(defaultOptions);
});

const stylesStore = useStyleStore();
const { mapBackgroundColor } = storeToRefs(stylesStore);
const sessionStore = useSessionStore();

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
  syncSessionStore();
}

function nextOptionId(): number {
  let maxId = -1;
  savedOptions.value.forEach((v) => {
    if (v.option_id > maxId) maxId = v.option_id;
  });
  return maxId + 1;
}

function colorToString(c: ColorTranslator): string {
  return c.RGBA;
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
      signalThresholds: extractSignalThresholds(v.options),
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

function syncSessionStore() {
  const values: {
    option_id: number;
    options: Record<string, unknown>;
    backgroundColor: string;
    name: string;
    trackStyles?: TrackStylePresetBundle;
    signalThresholds?: { min: number; max: number };
  }[] = [];
  savedOptions.value.forEach((v) =>
    values.push({
      option_id: v.option_id,
      options: serializeVisualizationOptions(v.options),
      name: v.name,
      backgroundColor: colorToString(v.backgroundColor),
      trackStyles: v.trackStyles,
      signalThresholds: extractSignalThresholds(v.options),
    })
  );
  sessionStore.setSavedVisualizationPresets(values);
}

function loadFromSessionStore() {
  const presets = sessionStore.savedVisualizationPresets;
  savedOptions.value.clear();
  presets.forEach((opt, idx) => {
    const backgroundColor = new ColorTranslator(
      opt.backgroundColor ?? "rgba(255,255,255,1.0)",
      { legacyCSS: true }
    );
    savedOptions.value.set(idx, {
      option_id: idx,
      name: opt.name ?? `Preset ${idx}`,
      options: deserializeVisualizationOptions(opt.options ?? {}),
      backgroundColor,
      trackStyles: opt.trackStyles as TrackStylePresetBundle | undefined,
    });
  });
  bumpSavedOptions();
}

watch(
  () => sessionStore.savedVisualizationPresets,
  () => {
    const current = Array.from(savedOptions.value.values()).map((v) => ({
      option_id: v.option_id,
      options: serializeVisualizationOptions(v.options),
      backgroundColor: colorToString(v.backgroundColor),
      name: v.name,
      trackStyles: v.trackStyles,
    }));
    const next = sessionStore.savedVisualizationPresets;
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      loadFromSessionStore();
    }
  },
  { deep: true }
);

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
        signalThresholds?: {
          lowerSignalBound?: number;
          upperSignalBound?: number;
        };
      }[];
      savedVisualizationPresets?: {
        option_id: number;
        options: Record<string, unknown>;
        backgroundColor?: string | ColorTranslator;
        name?: string;
        trackStyles?: TrackStylePresetBundle;
        signalThresholds?: {
          lowerSignalBound?: number;
          upperSignalBound?: number;
        };
      }[];
    };
  };

  const arr =
    jsonResult.data.savedVisualizationPresets ??
    jsonResult.data.savedLocations ??
    [];

  const existingKeys = new Set<string>();
  savedOptions.value.forEach((opt) => {
    existingKeys.add(buildPresetKey(opt));
  });

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
      try {
        backgroundColor = new ColorTranslator(b, { legacyCSS: true });
      } catch {
        backgroundColor = new ColorTranslator("rgba(255,255,255,1.0)", {
          legacyCSS: true,
        });
      }
    }

    const newOption = {
      option_id: newId,
      options: deserializeVisualizationOptions(option.options),
      backgroundColor,
      trackStyles: option.trackStyles,
      name: option.name ?? `Imported preset ${newId}`,
    };
    const key = buildPresetKey(newOption);
    if (!existingKeys.has(key)) {
      savedOptions.value.set(newOption.option_id, newOption);
      existingKeys.add(key);
      bumpSavedOptions();
      applySignalThresholds(option);
    }
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
        startColorRGBAString: cmap.startColorRGBA.RGBA,
        endColorRGBAString: cmap.endColorRGBA.RGBA,
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
    let startCt: ColorTranslator;
    let endCt: ColorTranslator;
    try {
      startCt = new ColorTranslator(startColor, { legacyCSS: true });
    } catch {
      startCt = new ColorTranslator("rgba(0,255,0,0.0)", { legacyCSS: true });
    }
    try {
      endCt = new ColorTranslator(endColor, { legacyCSS: true });
    } catch {
      endCt = new ColorTranslator("rgba(0,96,0,1.0)", { legacyCSS: true });
    }
    cmap = new SimpleLinearGradient(startCt, endCt, minSignal, maxSignal);
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

function extractSignalThresholds(options: VisualizationOptions): {
  lowerSignalBound?: number;
  upperSignalBound?: number;
} {
  const cmap = options.colormap;
  if (cmap instanceof SimpleLinearGradient) {
    return {
      lowerSignalBound: cmap.minSignal,
      upperSignalBound: cmap.maxSignal,
    };
  }
  return {};
}

function applySignalThresholds(option: {
  signalThresholds?: { lowerSignalBound?: number; upperSignalBound?: number };
}) {
  const thresholds = option.signalThresholds;
  if (!thresholds) return;
  const lower = thresholds.lowerSignalBound;
  const upper = thresholds.upperSignalBound;
  if (typeof lower === "number" && colormap.value instanceof SimpleLinearGradient) {
    const cmap = colormap.value as SimpleLinearGradient;
    colormap.value = new SimpleLinearGradient(
      cmap.startColorRGBA,
      cmap.endColorRGBA,
      lower,
      typeof upper === "number" ? upper : cmap.maxSignal
    );
  }
}

function buildPresetKey(opt: {
  name: string;
  options: VisualizationOptions;
  backgroundColor: ColorTranslator;
  trackStyles?: TrackStylePresetBundle;
}): string {
  const payload = {
    name: opt.name,
    options: serializeVisualizationOptions(opt.options),
    backgroundColor: colorToString(opt.backgroundColor),
    trackStyles: opt.trackStyles ?? null,
  };
  return stableStringify(payload);
}

function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return String(obj);
  if (Array.isArray(obj)) {
    return `[${obj.map((v) => stableStringify(v)).join(",")}]`;
  }
  if (typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(obj);
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
