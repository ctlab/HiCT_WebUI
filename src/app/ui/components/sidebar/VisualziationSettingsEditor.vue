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
  <div class="d-flex align-items-center" v-if="errorMessage">
    Error: {{ errorMessage }}
  </div>
  <div class="w-100">
    <!-- <div id="gradsample" :style="gradstyle"></div> -->
    <ul class="list-group list-group-horizontal w-100 m-0 p-0">
      <li class="list-group-item w-100 m-0 p-2">
        <p class="m-0 p-0 w-100"><b>Lower threshold</b></p>
        <ul class="list-group">
          <li class="list-group-item w-100 h-100">
            <input
              class="form-check-input number-input w-100 h-100 m-0"
              type="number"
              lang="en"
              v-model.number="lowerBound"
              @keydown.enter="applySettings"
            />
          </li>
          <li class="list-group-item w-100 h-100">
            <ColorPickerRectangle
              :position="'left'"
              :getDefaultColor="fromColorFn"
              @onColorChanged="(nc: ColorTranslator) => (fromColor = nc)"
            >
            </ColorPickerRectangle>
          </li>
        </ul>
      </li>
      <li class="list-group-item w-100 m-0 p-2">
        <p class="m-0 p-0 w-100"><b>Upper threshold</b></p>
        <ul class="list-group">
          <li class="list-group-item w-100 h-100">
            <input
              class="form-check-input number-input w-100 h-100 m-0"
              type="number"
              lang="en"
              v-model.number="upperBound"
              @keydown.enter="applySettings"
            />
          </li>
          <li class="list-group-item w-100 h-100">
            <ColorPickerRectangle
              :position="'left'"
              :getDefaultColor="toColorFn"
              @onColorChanged="(nc: ColorTranslator) => (toColor = nc)"
            >
            </ColorPickerRectangle>
          </li>
        </ul>
      </li>
    </ul>
    <div
      class="threshold-range-slider"
      aria-label="Threshold range"
      :style="thresholdSliderVars"
    >
      <div class="threshold-range-track" :style="thresholdTrackStyle"></div>
      <input
        class="threshold-range-input threshold-range-input_lower"
        type="range"
        :min="sliderPositionMin"
        :max="sliderPositionMax"
        :step="sliderStep"
        :value="lowerSliderValue"
        aria-label="Lower threshold"
        @input="onLowerRangeInput"
      />
      <input
        class="threshold-range-input threshold-range-input_upper"
        type="range"
        :min="sliderPositionMin"
        :max="sliderPositionMax"
        :step="sliderStep"
        :value="upperSliderValue"
        aria-label="Upper threshold"
        @input="onUpperRangeInput"
      />
      <div class="threshold-range-labels">
        <span>{{ formatSignal(sliderLowerLimit) }}</span>
        <span>{{ formatSignal(lowerBound) }} - {{ formatSignal(upperBound) }}</span>
        <span>{{ formatSignal(sliderUpperLimit) }}</span>
      </div>
    </div>
    <div class="threshold-range-options">
      <label class="threshold-range-bound">
        <span>Slider min</span>
        <input
          v-model.number="sliderLowerLimit"
          type="number"
          class="form-control form-control-sm"
          step="any"
          @change="onSliderLimitChanged"
        />
      </label>
      <label class="threshold-range-bound">
        <span>Slider max</span>
        <input
          v-model.number="sliderUpperLimit"
          type="number"
          class="form-control form-control-sm"
          step="any"
          @change="onSliderLimitChanged"
        />
      </label>
      <div class="form-check form-switch threshold-log-switch">
        <input
          id="threshold-log-scale"
          v-model="sliderLogScale"
          class="form-check-input"
          type="checkbox"
          role="switch"
        />
        <label class="form-check-label" for="threshold-log-scale">
          log2(1+x)
        </label>
      </div>
    </div>
    <div v-if="applyCoolerWeights" class="cooler-weights-hint">
      Cooler weights are active. Bins with missing or near-zero weights can
      appear as white stripes; compare with an unweighted/raw preset before
      treating those regions as absent signal.
    </div>
    <div class="w-100">
      <button
        type="button"
        id="gradient-apply-button"
        class="btn m-1 gradient-apply-button"
        :style="gradstyle"
        @click="applySettings"
      >
        Apply
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, Ref, onMounted, ref, unref, watch } from "vue";
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import ColorPickerRectangle from "./ColorPickerRectangle.vue";
import { toast } from "vue-sonner";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import { storeToRefs } from "pinia";
import SimpleLinearGradient from "@/app/core/visualization/colormap/SimpleLinearGradient";
import { ColorTranslator } from "colortranslator";
import type { CurrentSignalRangeResponse } from "@/app/core/net/api/response";
import { useMatrixViewStore } from "@/app/stores/matrixViewStore";
const visualizationOptionsStore = useVisualizationOptionsStore();
const { preLogBase, applyCoolerWeights, postLogBase, colormap } = storeToRefs(
  visualizationOptionsStore
);
const matrixViewStore = useMatrixViewStore();
const { presentationMode, activeVisualizationSource } = storeToRefs(matrixViewStore);

const errorMessage: Ref<string | undefined> = ref(undefined);

const props = defineProps<{
  mapManager?: ContactMapManager;
}>();

const signalMin: Ref<number> = ref(0);
const signalMax: Ref<number> = ref(1);
const fromColor: Ref<ColorTranslator> = ref(
  new ColorTranslator("rgba(0,255,0,0.1)", { legacyCSS: true })
) as Ref<ColorTranslator>;
const toColor = ref(
  new ColorTranslator("rgba(0,96,0,1.0)", { legacyCSS: true })
) as Ref<ColorTranslator>;
const lowerBound: Ref<number> = ref(signalMin.value);
const upperBound: Ref<number> = ref(signalMax.value);
const sliderLowerLimit: Ref<number> = ref(0);
const sliderUpperLimit: Ref<number> = ref(1);
const sliderBoundsManual: Ref<boolean> = ref(false);
const sliderLogScale: Ref<boolean> = ref(false);
const syncingFromColormap: Ref<boolean> = ref(false);
let registeredRangeMapManager: ContactMapManager | undefined;

const fromColorFn: Ref<() => ColorTranslator> = ref(
  () => fromColor.value
) as Ref<() => ColorTranslator>;
const toColorFn: Ref<() => ColorTranslator> = ref(() => toColor.value) as Ref<
  () => ColorTranslator
>;

const gradstyle = ref({
  width: "98%",
  height: "2rem",
  margin: "1%",
  "background-image":
    "linear-gradient(to right," +
    fromColor.value.RGBA +
    " , " +
    toColor.value.RGBA +
    ")",
  color: "#ffffff",
});

const sliderMin = computed(() =>
  Math.min(
    finiteOr(sliderLowerLimit.value, 0),
    finiteOr(lowerBound.value, 0),
    finiteOr(upperBound.value, 1)
  )
);
const sliderMax = computed(() => {
  const max = Math.max(
    finiteOr(sliderUpperLimit.value, 1),
    finiteOr(lowerBound.value, 0),
    finiteOr(upperBound.value, 1)
  );
  return max <= sliderMin.value ? sliderMin.value + 1 : max;
});
const sliderPositionMin = computed(() => toSliderPosition(sliderMin.value));
const sliderPositionMax = computed(() => toSliderPosition(sliderMax.value));
const lowerSliderValue = computed(() => toSliderPosition(lowerBound.value));
const upperSliderValue = computed(() => toSliderPosition(upperBound.value));
const sliderStep = computed(() => {
  const span = Math.max(
    sliderPositionMax.value - sliderPositionMin.value,
    Number.EPSILON
  );
  return Math.max(span / 1000, Number.EPSILON);
});
const thresholdSliderVars = computed<Record<string, string>>(() => ({
  "--lower-thumb-color": fromColor.value.RGBA,
  "--upper-thumb-color": toColor.value.RGBA,
}));
const thresholdTrackStyle = computed(() => {
  const span = Math.max(
    sliderPositionMax.value - sliderPositionMin.value,
    Number.EPSILON
  );
  const left =
    ((Math.min(lowerSliderValue.value, upperSliderValue.value) -
      sliderPositionMin.value) /
      span) *
    100;
  const right =
    ((Math.max(lowerSliderValue.value, upperSliderValue.value) -
      sliderPositionMin.value) /
      span) *
    100;
  return {
    "background-image": `linear-gradient(to right, #e9ecef 0%, #e9ecef ${left}%, ${fromColor.value.RGBA} ${left}%, ${toColor.value.RGBA} ${right}%, #e9ecef ${right}%, #e9ecef 100%)`,
  };
});

watch(
  () => {
    if (colormap.value instanceof SimpleLinearGradient) {
      const cmap = colormap.value as SimpleLinearGradient;
      return [cmap.startColorRGBA, cmap.endColorRGBA];
    }
  },
  () => {
    if (colormap.value instanceof SimpleLinearGradient) {
      syncingFromColormap.value = true;
      // console.log("Colormap type changed and simple linear gradient, was: ", fromColor.value, toColor.value);
      const cmap = colormap.value as SimpleLinearGradient;
      if (fromColor.value?.RGBA !== cmap.startColorRGBA?.RGBA) {
        fromColor.value = cmap.startColorRGBA;
      }
      if (toColor.value?.RGBA !== cmap.endColorRGBA?.RGBA) {
        toColor.value = cmap.endColorRGBA;
      }
      fromColorFn.value = () => fromColor.value;
      toColorFn.value = () => toColor.value;
      // console.log("Now: ", fromColor.value, toColor.value);
      queueMicrotask(() => {
        syncingFromColormap.value = false;
      });
    }
  },
  { flush: "sync" }
);

watch(
  () => colormap.value,
  () => {
    if (colormap.value instanceof SimpleLinearGradient) {
      syncingFromColormap.value = true;
      const cmap = colormap.value as SimpleLinearGradient;
      if (lowerBound.value !== cmap.minSignal) {
        lowerBound.value = cmap.minSignal;
      }
      if (upperBound.value !== cmap.maxSignal) {
        upperBound.value = cmap.maxSignal;
      }
      queueMicrotask(() => {
        syncingFromColormap.value = false;
      });
    }
  },
  { deep: false, flush: "sync" }
);

watch(
  () => [
    fromColor.value,
    toColor.value,
    lowerBound.value,
    upperBound.value,
    signalMin.value,
    signalMax.value,
  ],
  () => {
    if (syncingFromColormap.value) {
      return;
    }
    gradstyle.value["background-image"] =
      "linear-gradient(to right," +
      fromColor.value +
      " , " +
      toColor.value +
      ")";
    fromColorFn.value = () => fromColor.value;
    toColorFn.value = () => toColor.value;
    const nextMin = lowerBound.value;
    const nextMax = upperBound.value;
    const existing = colormap.value;
    const fromRGBA = fromColor.value?.RGBA ?? "";
    const toRGBA = toColor.value?.RGBA ?? "";
    if (
      !(existing instanceof SimpleLinearGradient) ||
      existing.minSignal !== nextMin ||
      existing.maxSignal !== nextMax ||
      existing.startColorRGBA?.RGBA !== fromRGBA ||
      existing.endColorRGBA?.RGBA !== toRGBA
    ) {
      colormap.value = new SimpleLinearGradient(
        fromColor.value,
        toColor.value,
        nextMin,
        nextMax
      );
    }
    // console.log("UpperBound", upperBound.value);
  }
);

watch(
  () => props.mapManager,
  () => {
    if (props.mapManager) {
      registerSignalRangeCallback(props.mapManager);
      props.mapManager?.visualizationManager
        .fetchVisualizationOptions()
        .then(() => updateFromStore());
    }
  }
);

onMounted(() => {
  if (props.mapManager) {
    registerSignalRangeCallback(props.mapManager);
  }
  props.mapManager?.visualizationManager
    .fetchVisualizationOptions()
    .then(() => updateFromStore());
});

function registerSignalRangeCallback(mapManager: ContactMapManager): void {
  if (registeredRangeMapManager === mapManager) {
    return;
  }
  registeredRangeMapManager = mapManager;
  mapManager.addContrastSliderCallback(updateSignalRange);
}

function updateSignalRange(ranges: CurrentSignalRangeResponse): void {
  const nextMin = finiteOr(ranges.globalMinSignal, signalMin.value);
  const nextMax = finiteOr(ranges.globalMaxSignal, signalMax.value);
  if (nextMax > nextMin) {
    signalMin.value = nextMin;
    signalMax.value = nextMax;
    if (!sliderBoundsManual.value) {
      sliderLowerLimit.value = nextMin;
      sliderUpperLimit.value = nextMax;
    }
  }
}

function updateFromStore() {
  // props.mapManager?.visualizationManager.fetchVisualizationOptions();
  const cmap = colormap.value;
  if (cmap) {
    switch (true) {
      case cmap instanceof SimpleLinearGradient: {
        syncingFromColormap.value = true;
        const grad = cmap as SimpleLinearGradient;
        if (fromColor.value?.RGBA !== grad.startColorRGBA?.RGBA) {
          fromColor.value = grad.startColorRGBA;
        }
        if (toColor.value?.RGBA !== grad.endColorRGBA?.RGBA) {
          toColor.value = grad.endColorRGBA;
        }
        queueMicrotask(() => {
          syncingFromColormap.value = false;
        });
        break;
      }
      default:
        throw Error("Unknown colormap type");
    }
  }
}

function applySettings() {
  if (!(upperBound.value > lowerBound.value)) {
    toast.error("Signal range must be positive: lower threshold must be below upper threshold.");
    return;
  }
  const source =
    presentationMode.value !== "single" ? activeVisualizationSource.value : undefined;
  const action = source
    ? props.mapManager?.visualizationManager.applyVisualizationSettingsForSourceAndReload(
        source
      )
    : props.mapManager?.visualizationManager.applyVisualizationSettingsAndReload();
  action?.catch((error) => {
    toast.error(String(error ?? "Failed to apply visualization settings"));
  });
}

function onLowerRangeInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) {
    return;
  }
  const actual = fromSliderPosition(value);
  const minGap = Math.max((sliderMax.value - sliderMin.value) / 1_000_000, Number.EPSILON);
  lowerBound.value = Math.min(actual, upperBound.value - minGap);
}

function onUpperRangeInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) {
    return;
  }
  const actual = fromSliderPosition(value);
  const minGap = Math.max((sliderMax.value - sliderMin.value) / 1_000_000, Number.EPSILON);
  upperBound.value = Math.max(actual, lowerBound.value + minGap);
}

function onSliderLimitChanged(): void {
  sliderBoundsManual.value = true;
  if (!(sliderUpperLimit.value > sliderLowerLimit.value)) {
    sliderUpperLimit.value = sliderLowerLimit.value + 1;
  }
}

function toSliderPosition(value: number): number {
  const min = finiteOr(sliderMin.value, 0);
  const max = finiteOr(sliderMax.value, min + 1);
  const clamped = Math.max(min, Math.min(max, finiteOr(value, min)));
  if (!sliderLogScale.value) {
    return clamped;
  }
  return Math.log2(1 + Math.max(0, clamped - min));
}

function fromSliderPosition(value: number): number {
  const min = finiteOr(sliderMin.value, 0);
  const max = finiteOr(sliderMax.value, min + 1);
  if (!sliderLogScale.value) {
    return Math.max(min, Math.min(max, finiteOr(value, min)));
  }
  const actual = min + Math.pow(2, Math.max(0, finiteOr(value, 0))) - 1;
  return Math.max(min, Math.min(max, actual));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function formatSignal(value: number): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.01)) {
    return value.toExponential(2);
  }
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
}
</script>

<style scoped>
#contrast-slider-div {
  margin-top: -20px;
  margin-bottom: -20px;
  margin-left: 0px;
  margin-right: 0px;
  width: 100%;
  text-align: left;
}

#gradient-apply-button {
  width: 250px;
  margin: 15px;
}

.gradient-apply-button {
  text-shadow:
    0 0 2px #000,
    0 0 1px #000;
  border: none;
}

.threshold-range-slider {
  position: relative;
  padding: 0.75rem 0.75rem 0.35rem;
}

.threshold-range-track {
  position: absolute;
  left: 0.75rem;
  right: 0.75rem;
  top: 1.15rem;
  height: 0.45rem;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  pointer-events: none;
}

.threshold-range-input {
  position: absolute;
  left: 0.75rem;
  right: 0.75rem;
  top: 0.75rem;
  width: calc(100% - 1.5rem);
  pointer-events: none;
  appearance: none;
  background: transparent;
}

.threshold-range-input::-webkit-slider-thumb {
  appearance: none;
  width: 0.95rem;
  height: 0.95rem;
  border-radius: 50%;
  border: 2px solid #fff;
  background: #0d6efd;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
  pointer-events: auto;
}

.threshold-range-input::-moz-range-thumb {
  width: 0.95rem;
  height: 0.95rem;
  border-radius: 50%;
  border: 2px solid #fff;
  background: #0d6efd;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
  pointer-events: auto;
}

.threshold-range-input_lower::-webkit-slider-thumb {
  background: var(--lower-thumb-color, #198754);
}

.threshold-range-input_lower::-moz-range-thumb {
  background: var(--lower-thumb-color, #198754);
}

.threshold-range-input_upper::-webkit-slider-thumb {
  background: var(--upper-thumb-color, #dc3545);
}

.threshold-range-input_upper::-moz-range-thumb {
  background: var(--upper-thumb-color, #dc3545);
}

.threshold-range-labels {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 1.35rem;
  font-size: 0.75rem;
  color: #5c6773;
}

.cooler-weights-hint {
  margin: 0.15rem 0.5rem 0.5rem;
  padding: 0.45rem 0.55rem;
  border-left: 3px solid #f0ad4e;
  border-radius: 0.35rem;
  background: rgba(240, 173, 78, 0.12);
  color: var(--hict-surface-fg, #343a40);
  font-size: 0.75rem;
  line-height: 1.25;
}

.threshold-range-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem 0.6rem;
  padding: 0 0.5rem 0.45rem;
}

.threshold-range-bound {
  display: grid;
  gap: 0.2rem;
  margin: 0;
  font-size: 0.72rem;
  color: #5c6773;
}

.threshold-log-switch {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 0.78rem;
}
</style>
