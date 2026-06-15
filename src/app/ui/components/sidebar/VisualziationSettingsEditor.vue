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
    <div class="threshold-compact-card">
      <div class="threshold-card-title">Range / Thresholds</div>
      <div class="threshold-input-grid">
        <label class="threshold-field">
          <span>Lower</span>
          <div class="threshold-field-row">
            <input
              class="form-control form-control-sm threshold-number-input"
              type="number"
              lang="en"
              step="any"
              v-model.number="lowerBound"
              @keydown.enter="applySettings"
            />
            <ColorPickerRectangle
              :position="'left'"
              :getDefaultColor="fromColorFn"
              @onColorChanged="(nc: ColorTranslator) => (fromColor = nc)"
            />
          </div>
        </label>
        <label class="threshold-field">
          <span>Upper</span>
          <div class="threshold-field-row">
            <input
              class="form-control form-control-sm threshold-number-input"
              type="number"
              lang="en"
              step="any"
              v-model.number="upperBound"
              @keydown.enter="applySettings"
            />
            <ColorPickerRectangle
              :position="'left'"
              :getDefaultColor="toColorFn"
              @onColorChanged="(nc: ColorTranslator) => (toColor = nc)"
            />
          </div>
        </label>
      </div>

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
          <input
            v-model.number="sliderLowerLimit"
            type="number"
            class="threshold-edge-input"
            step="any"
            aria-label="Slider minimum signal"
            @change="onSliderLimitChanged"
          />
          <span>{{ formatSignal(lowerBound) }} - {{ formatSignal(upperBound) }}</span>
          <input
            v-model.number="sliderUpperLimit"
            type="number"
            class="threshold-edge-input text-end"
            step="any"
            aria-label="Slider maximum signal"
            @change="onSliderLimitChanged"
          />
        </div>
      </div>

      <div class="threshold-toolbar">
        <div class="form-check form-switch threshold-log-switch">
          <input
            id="threshold-log-scale"
            v-model="sliderLogScale"
            class="form-check-input"
            type="checkbox"
            role="switch"
          />
          <label class="form-check-label" for="threshold-log-scale">
            log10 scale
          </label>
        </div>
        <details v-if="applyCoolerWeights" class="cooler-weights-hint">
          <summary title="Cooler weights warning">
            <i class="bi bi-exclamation-triangle-fill"></i>
            Cooler weights
          </summary>
          <div>
            Bins with missing or near-zero weights can appear as white stripes;
            compare with an unweighted/raw preset before treating those regions
            as absent signal.
          </div>
        </details>
      </div>

      <button
        type="button"
        id="gradient-apply-button"
        class="btn gradient-apply-button"
        :style="gradstyle"
        @click="applySettings"
      >
        Apply
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, Ref, onBeforeUnmount, onMounted, ref, watch } from "vue";
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
  new ColorTranslator("rgba(0,255,0,0.0)", { legacyCSS: true })
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
const liveApplyReady: Ref<boolean> = ref(false);
let registeredRangeMapManager: ContactMapManager | undefined;
let liveApplyTimer: number | undefined;
const LOG_SLIDER_FLOOR_FRACTION = 1e-10;
const LIVE_APPLY_DELAY_MS = 350;

const fromColorFn: Ref<() => ColorTranslator> = ref(
  () => fromColor.value
) as Ref<() => ColorTranslator>;
const toColorFn: Ref<() => ColorTranslator> = ref(() => toColor.value) as Ref<
  () => ColorTranslator
>;

const gradstyle = computed<Record<string, string>>(() => ({
  width: "100%",
  height: "1.8rem",
  margin: "0",
  "background-image": `linear-gradient(to right, ${fromColor.value.RGBA}, ${toColor.value.RGBA})`,
  color: "#ffffff",
}));

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
  if (sliderLogScale.value) {
    return 0.001;
  }
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
  () => [
    fromColor.value?.RGBA,
    toColor.value?.RGBA,
    lowerBound.value,
    upperBound.value,
  ],
  () => {
    scheduleLiveApply();
  }
);

watch(
  () => props.mapManager,
  () => {
    if (props.mapManager) {
      liveApplyReady.value = false;
      registerSignalRangeCallback(props.mapManager);
      props.mapManager.visualizationManager
        .loadVisualizationOptionsForSource(activeSourceForOptions())
        .then(() => {
          updateFromStore();
          liveApplyReady.value = true;
        });
    }
  }
);

watch(
  () => [activeVisualizationSource.value, presentationMode.value] as const,
  () => {
    liveApplyReady.value = false;
    props.mapManager?.visualizationManager
      .loadVisualizationOptionsForSource(activeSourceForOptions())
      .then(() => {
        updateFromStore();
        liveApplyReady.value = true;
      })
      .catch(() => undefined);
  }
);

onMounted(() => {
  if (props.mapManager) {
    registerSignalRangeCallback(props.mapManager);
  }
  props.mapManager?.visualizationManager
    .loadVisualizationOptionsForSource(activeSourceForOptions())
    .then(() => {
      updateFromStore();
      liveApplyReady.value = true;
    });
});

onBeforeUnmount(() => {
  if (liveApplyTimer !== undefined) {
    window.clearTimeout(liveApplyTimer);
    liveApplyTimer = undefined;
  }
});

function activeSourceForOptions(): "PRIMARY" | "SECONDARY" | undefined {
  return presentationMode.value !== "single" ? activeVisualizationSource.value : undefined;
}

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

function scheduleLiveApply(): void {
  if (!liveApplyReady.value || syncingFromColormap.value) {
    return;
  }
  if (liveApplyTimer !== undefined) {
    window.clearTimeout(liveApplyTimer);
  }
  liveApplyTimer = window.setTimeout(() => {
    liveApplyTimer = undefined;
    applySettings();
  }, LIVE_APPLY_DELAY_MS);
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
  const span = Math.max(max - min, Number.EPSILON);
  const normalized = (clamped - min) / span;
  if (normalized <= 0) {
    return 0;
  }
  const floorLog = Math.log10(LOG_SLIDER_FLOOR_FRACTION);
  const valueLog = Math.log10(Math.max(LOG_SLIDER_FLOOR_FRACTION, normalized));
  return Math.max(0, Math.min(1, (valueLog - floorLog) / -floorLog));
}

function fromSliderPosition(value: number): number {
  const min = finiteOr(sliderMin.value, 0);
  const max = finiteOr(sliderMax.value, min + 1);
  if (!sliderLogScale.value) {
    return Math.max(min, Math.min(max, finiteOr(value, min)));
  }
  const position = Math.max(0, Math.min(1, finiteOr(value, 0)));
  if (position <= 0) {
    return min;
  }
  const span = Math.max(max - min, Number.EPSILON);
  const floorLog = Math.log10(LOG_SLIDER_FLOOR_FRACTION);
  const normalized = Math.pow(10, floorLog + position * -floorLog);
  const actual = min + normalized * span;
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
  width: 100%;
  margin: 0;
}

.gradient-apply-button {
  text-shadow:
    -1px -1px 0 rgba(0, 0, 0, 0.9),
    1px -1px 0 rgba(0, 0, 0, 0.9),
    -1px 1px 0 rgba(0, 0, 0, 0.9),
    1px 1px 0 rgba(0, 0, 0, 0.9),
    0 0 2px #000,
    0 0 1px #000;
  border: none;
  border-radius: 0.45rem;
  font-weight: 600;
  color: #ffffff !important;
}

.threshold-compact-card {
  display: grid;
  gap: 0.45rem;
  padding: 0.45rem 0.55rem 0.55rem;
  background: var(--hict-surface-bg, #ffffff);
  position: relative;
  z-index: 30;
  overflow: visible;
}

.threshold-input-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem;
  overflow: visible;
}

.threshold-card-title {
  color: #5c6773;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.1;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.threshold-field {
  display: grid;
  gap: 0.15rem;
  margin: 0;
  color: #4b5563;
  font-size: 0.72rem;
  font-weight: 600;
}

.threshold-field-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 1.45rem;
  align-items: center;
  gap: 0.25rem;
  overflow: visible;
}

.threshold-number-input {
  min-height: 1.7rem;
  padding: 0.15rem 0.35rem;
  font-size: 0.82rem;
}

.threshold-range-slider {
  position: relative;
  padding: 0.48rem 0.35rem 0;
  min-height: 2.75rem;
}

.threshold-range-track {
  position: absolute;
  left: 0.35rem;
  right: 0.35rem;
  top: 0.83rem;
  height: 0.34rem;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  pointer-events: none;
}

.threshold-range-input {
  position: absolute;
  left: 0.35rem;
  right: 0.35rem;
  top: 0.42rem;
  width: calc(100% - 0.7rem);
  pointer-events: none;
  appearance: none;
  background: transparent;
}

.threshold-range-input::-webkit-slider-thumb {
  appearance: none;
  width: 0.82rem;
  height: 0.82rem;
  border-radius: 50%;
  border: 2px solid #fff;
  background: #0d6efd;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
  pointer-events: auto;
}

.threshold-range-input::-moz-range-thumb {
  width: 0.82rem;
  height: 0.82rem;
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
  display: grid;
  grid-template-columns: 4.4rem minmax(0, 1fr) 4.4rem;
  align-items: center;
  gap: 0.35rem;
  margin-top: 1.2rem;
  font-size: 0.75rem;
  color: #5c6773;
}

.threshold-range-labels > span {
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.threshold-edge-input {
  width: 100%;
  min-width: 0;
  border: 0;
  border-bottom: 1px dotted rgba(92, 103, 115, 0.65);
  border-radius: 0;
  background: transparent;
  color: #5c6773;
  font-size: 0.75rem;
  line-height: 1.1;
  padding: 0 0.1rem;
}

.threshold-edge-input:focus {
  outline: 1px solid rgba(13, 110, 253, 0.4);
  background: rgba(13, 110, 253, 0.06);
}

.threshold-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
  min-height: 1.45rem;
}

.threshold-log-switch {
  margin: 0;
  min-height: 0;
  font-size: 0.75rem;
  white-space: nowrap;
}

.threshold-log-switch .form-check-input {
  margin-top: 0.12rem;
}

.cooler-weights-hint {
  min-width: 0;
  margin: 0;
  color: var(--hict-surface-fg, #343a40);
  font-size: 0.72rem;
  line-height: 1.2;
}

.cooler-weights-hint summary {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
  color: #8a5a05;
  list-style: none;
  white-space: nowrap;
}

.cooler-weights-hint summary::-webkit-details-marker {
  display: none;
}

.cooler-weights-hint[open] {
  padding: 0.35rem 0.45rem;
  border-left: 3px solid #f0ad4e;
  border-radius: 0.35rem;
  background: rgba(240, 173, 78, 0.12);
}

.cooler-weights-hint[open] summary {
  margin-bottom: 0.25rem;
}

:deep(.picker_wrapper) {
  z-index: 2147483000 !important;
  max-width: min(18rem, calc(100vw - 1.5rem));
  max-height: min(24rem, calc(100vh - 1.5rem));
  overflow: auto;
}

:deep(.picker_wrapper button) {
  pointer-events: auto;
}
</style>
