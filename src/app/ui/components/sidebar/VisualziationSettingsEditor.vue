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
      <div class="threshold-card-title">
        Color range{{ percentageSignalScale ? " (%)" : "" }}
      </div>
      <div class="threshold-input-grid">
        <label class="threshold-field">
          <span>Lower</span>
          <div class="threshold-field-row">
            <input
              class="form-control form-control-sm threshold-number-input"
              type="number"
              :aria-label="'Lower signal threshold'"
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
              aria-label="Upper signal threshold"
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

      <label v-if="observedExpectedPalette" class="oe-palette-preset">
        O/E palette
        <select
          class="form-select form-select-sm"
          :value="oePalettePresetId(fromColor.HEXA, toColor.HEXA)"
          @change="chooseOePalette(($event.target as HTMLSelectElement).value)"
        >
          <option
            v-for="preset in OE_PALETTE_PRESETS"
            :key="preset.id"
            :value="preset.id"
          >
            {{ preset.label }}
          </option>
          <option value="custom" disabled>Custom colors</option>
        </select>
      </label>
      <SignalRangeControl
        :min="sliderPositionMin"
        :max="sliderPositionMax"
        :lower="lowerSliderValue"
        :upper="upperSliderValue"
        :lower-text="formatSignal(lowerBound)"
        :upper-text="formatSignal(upperBound)"
        :lower-color="fromColor.RGBA"
        :upper-color="toColor.RGBA"
        :neutral="observedExpectedPalette ? toSliderPosition(1) : undefined"
        @adjustment-start="keepAdjustmentLimits"
        @lower="onLowerRangeInput"
        @upper="onUpperRangeInput"
      >
        <template #histogram>
          <ViewportSignalHistogram
            :manager="mapManager"
            :source="activeVisualizationSource"
            :expression="activeRangeExpression"
            :derived="
              activeVisualizationSource === 'PRIMARY' &&
              visualizationOptionsStore.signalDisplayMode !== 'OBSERVED'
            "
            :oe="observedExpectedPalette"
            :context="histogramContext"
            :min="sliderPositionMin"
            :max="sliderPositionMax"
            :lower="lowerSliderValue"
            :upper="upperSliderValue"
            :position="toHistogramPosition"
            @levels="fitViewportLevels"
          />
        </template>
      </SignalRangeControl>
      <p
        v-if="visualizationOptionsStore.pendingVisualizationMutations"
        class="range-help mb-0"
        role="status"
      >
        Applying visualization changes…
      </p>
      <p
        v-else-if="visualizationOptionsStore.visualizationDraftState"
        class="range-help mb-0"
        role="status"
      >
        {{
          visualizationOptionsStore.visualizationDraftState === "scheduled"
            ? "Preview pending…"
            : "Changes pending. Apply to retry."
        }}
      </p>
      <p
        v-if="rangeValidationError"
        class="small text-danger mb-0"
        role="alert"
      >
        {{ rangeValidationError }}
      </p>
      <p v-if="observedExpectedPalette" class="range-help mb-0">
        O/E: lower color is depleted, white is 1, upper color is enriched.
        Limits must satisfy 0 &lt; lower &lt; 1 &lt; upper.
      </p>
      <div class="range-actions">
        <div class="scale-group">
          <span id="slider-scale-label" class="scale-caption"
            >Slider scale</span
          >
          <div
            class="scale-choice"
            role="group"
            aria-labelledby="slider-scale-label"
            title="Changes slider sensitivity, not matrix values"
          >
            <button
              type="button"
              :aria-pressed="!sliderLogScale"
              @click="sliderLogScale = false"
            >
              Linear
            </button>
            <button
              type="button"
              :aria-pressed="sliderLogScale"
              @click="sliderLogScale = true"
            >
              Log
            </button>
          </div>
        </div>
        <button
          type="button"
          class="range-text-button"
          @click="focusThresholds"
          title="Expand the selected range across the slider for finer adjustment"
        >
          Focus range
        </button>
      </div>
      <details class="range-details">
        <summary>
          <span>Slider limits &amp; data</span
          ><span class="range-summary-value"
            >{{ formatSignal(sliderMin) }} – {{ formatSignal(sliderMax) }}</span
          >
        </summary>
        <p class="range-help">
          Slider limits control adjustment precision. They do not change the
          selected colors or thresholds.
        </p>
        <div class="domain-inputs">
          <label
            >Minimum<input
              v-model.number="sliderLowerLimit"
              type="number"
              step="any"
              aria-label="Slider minimum signal"
              @change="onSliderLimitChanged"
          /></label>
          <label
            >Maximum<input
              v-model.number="sliderUpperLimit"
              type="number"
              step="any"
              aria-label="Slider maximum signal"
              @change="onSliderLimitChanged"
          /></label>
        </div>
        <button
          v-if="!primaryDerivedSignal"
          type="button"
          class="range-text-button"
          title="Use the exact minimum and maximum of the loaded tiles, including rare extreme pixels"
          @click="useLoadedRange"
        >
          Use full loaded range
        </button>
        <p class="range-help" role="status" data-testid="exact-range-status">
          {{ percentageSignalScale ? "Percentage scale: 0–100" : rangeStatus }}
        </p>
        <button
          v-if="!percentageSignalScale"
          type="button"
          class="range-text-button"
          :disabled="rangeScanning"
          @click="fetchExactRange"
        >
          Scan whole map
        </button>
        <button
          v-if="rangeScanning"
          type="button"
          class="range-text-button"
          @click="cancelExactRange"
        >
          Cancel scan
        </button>
        <span v-if="!percentageSignalScale" class="range-help">
          · Reads all tiles; may take time.</span
        >
        <p v-if="primaryDerivedSignal" class="range-help">
          Whole-map Expected/O/E limits use a profile fitted across this
          resolution, independently of the viewport profile. Scanning changes
          slider limits only.
        </p>
      </details>
      <p
        v-if="applyCoolerWeights && coolerWeightsHaveNaNs"
        class="small mb-1"
        :class="weightsNeedAttention ? 'text-danger' : 'text-muted'"
        role="status"
      >
        {{
          weightsNeedAttention
            ? "Excluded bins use replacement weights."
            : `${coolerWeightsNaNCount} excluded bins masked.`
        }}
      </p>
      <NormalizationSelector
        :map-manager="props.mapManager"
        @apply="applySettings"
      >
        <template #excluded-bins>
          <details v-if="coolerWeightsHaveNaNs" :class="coolerWeightsHintClass">
            <summary
              :title="
                weightsNeedAttention
                  ? 'Excluded-bin policy needs attention'
                  : 'Excluded-bin settings'
              "
            >
              <i
                v-if="weightsNeedAttention"
                class="bi bi-exclamation-triangle-fill"
              ></i>
              Cooler weights
            </summary>
            <div v-if="coolerWeightsHaveNaNs">
              Detected {{ coolerWeightsNaNCount }} non-finite Cooler balancing
              weight{{ coolerWeightsNaNCount === 1 ? "" : "s" }}. Selected
              tactic: {{ coolerWeightsNaNPolicyLabel }}.
              <label
                class="form-label small mt-2 mb-1"
                for="cooler-weights-nan-policy"
              >
                NaN weight tactic
              </label>
              <select
                id="cooler-weights-nan-policy"
                v-model="coolerWeightsNaNPolicy"
                class="form-select form-select-sm"
                @change="onCoolerWeightsNaNPolicyChanged"
              >
                <option value="DISABLE_WEIGHTS">
                  Do not use Cooler weights
                </option>
                <option value="REPLACE_NANS_WITH_ONE">
                  Replace NaNs with weight 1.0
                </option>
                <option value="REPLACE_NANS_WITH_ZERO">
                  Replace NaNs with weight 0
                </option>
              </select>
            </div>
          </details>
        </template>
      </NormalizationSelector>

      <button
        type="button"
        id="gradient-apply-button"
        class="btn btn-primary gradient-apply-button"
        @click="applySettings"
      >
        Apply
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  Ref,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import SignalRangeControl from "./SignalRangeControl.vue";
import ViewportSignalHistogram from "./ViewportSignalHistogram.vue";
import {
  OE_PALETTE_PRESETS,
  oePalettePresetId,
} from "@/app/core/visualization/oePalette";
import NormalizationSelector from "../upper_ribbon/NormalizationSelector.vue";
import ColorPickerRectangle from "./ColorPickerRectangle.vue";
import { toast } from "vue-sonner";
import { reportFailure } from "@/app/ui/reportFailure";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import { storeToRefs } from "pinia";
import SimpleLinearGradient from "@/app/core/visualization/colormap/SimpleLinearGradient";
import { ColorTranslator } from "colortranslator";
import type { CurrentSignalRangeResponse } from "@/app/core/net/api/response";
import { useMatrixViewStore } from "@/app/stores/matrixViewStore";
import { robustUpperLimit } from "@/app/core/visualization/tileSignalRange";
import {
  scanExactSignalRange,
  type ExactRange,
} from "@/app/core/visualization/exactSignalRange";
const visualizationOptionsStore = useVisualizationOptionsStore();
const {
  preLogBase,
  applyCoolerWeights,
  postLogBase,
  colormap,
  coolerWeightsNaNPolicy,
  coolerWeightsHaveNaNs,
  coolerWeightsNaNCount,
} = storeToRefs(visualizationOptionsStore);
const matrixViewStore = useMatrixViewStore();
const {
  presentationMode,
  activeVisualizationSource,
  activeVisualizationTargetId,
} = storeToRefs(matrixViewStore);

const errorMessage: Ref<string | undefined> = ref(undefined);

const props = defineProps<{
  mapManager?: ContactMapManager;
}>();

const activePaletteMode = ref("LINEAR");
const primaryDerivedSignal = computed(
  () =>
    activeVisualizationSource.value === "PRIMARY" &&
    visualizationOptionsStore.signalDisplayMode !== "OBSERVED"
);
const observedExpectedPalette = computed(
  () =>
    (activeVisualizationSource.value === "PRIMARY" &&
      visualizationOptionsStore.signalDisplayMode ===
        "OBSERVED_OVER_EXPECTED") ||
    activePaletteMode.value === "OBSERVED_OVER_EXPECTED"
);
function chooseOePalette(id: string): void {
  const preset = OE_PALETTE_PRESETS.find((p) => p.id === id);
  if (!preset) return;
  fromColor.value = new ColorTranslator(preset.startColor, { legacyCSS: true });
  toColor.value = new ColorTranslator(preset.endColor, { legacyCSS: true });
}
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
const rangeValidationError = computed(() => {
  if (!Number.isFinite(lowerBound.value) || !Number.isFinite(upperBound.value))
    return "Enter finite lower and upper thresholds.";
  if (!(upperBound.value > lowerBound.value))
    return "Lower must be below Upper. The last applied range is unchanged.";
  if (
    observedExpectedPalette.value &&
    !(lowerBound.value > 0 && lowerBound.value < 1 && upperBound.value > 1)
  )
    return "O/E limits must satisfy 0 < lower < 1 < upper.";
  return "";
});
const sliderLowerLimit: Ref<number> = ref(0);
const sliderUpperLimit: Ref<number> = ref(1);
const sliderBoundsManual: Ref<boolean> = ref(false);
const sliderLogScale: Ref<boolean> = ref(false);
const syncingFromColormap: Ref<boolean> = ref(false);
const liveApplyReady: Ref<boolean> = ref(false);
const percentageSignalScale: Ref<boolean> = ref(false);
let registeredRangeMapManager: ContactMapManager | undefined;
let optionsHydrationGeneration = 0;
let rangeController: AbortController | undefined;
let exactRangeResolution: number | undefined;
let rangeTimer: number | undefined;
let rangeGeneration = 0;
let rangeProbe = 0;
const rangeStatus = ref("Waiting for visible tile limits");
const rangeScanning = ref(false);
const activeRangeExpression = shallowRef<Record<string, unknown>>();
const histogramContext = computed(() =>
  JSON.stringify([
    activeRangeExpression.value,
    activeVisualizationSource.value,
    activeVisualizationTargetId.value,
    visualizationOptionsStore.signalDisplayMode,
    preLogBase.value,
    postLogBase.value,
    applyCoolerWeights.value,
    visualizationOptionsStore.resolutionScaling,
    visualizationOptionsStore.resolutionLinearScaling,
    coolerWeightsNaNPolicy.value,
  ])
);
function fitViewportLevels(lower: number, upper: number): void {
  lowerBound.value = lower;
  upperBound.value = upper;
  sliderBoundsManual.value = true;
  sliderLowerLimit.value = lower;
  sliderUpperLimit.value = upper;
}
let rangeDomainContext = "";
let rangeMap: ContactMapManager | undefined;
const onViewportRangeChanged = () => refreshProcessedRange();
const rangeCache = new Map<string, ExactRange>();
const LOG_SLIDER_FLOOR_FRACTION = 1e-10;

const fromColorFn: Ref<() => ColorTranslator> = ref(
  () => fromColor.value
) as Ref<() => ColorTranslator>;
const toColorFn: Ref<() => ColorTranslator> = ref(() => toColor.value) as Ref<
  () => ColorTranslator
>;

const coolerWeightsNaNPolicyLabel = computed(() => {
  switch (coolerWeightsNaNPolicy.value) {
    case "DISABLE_WEIGHTS":
      return "do not use Cooler weights";
    case "REPLACE_NANS_WITH_ZERO":
      return "replace NaNs with weight 0";
    case "REPLACE_NANS_WITH_ONE":
    default:
      return "replace NaNs with weight 1";
  }
});

const weightsNeedAttention = computed(
  () =>
    applyCoolerWeights.value &&
    coolerWeightsHaveNaNs.value &&
    coolerWeightsNaNPolicy.value !== "REPLACE_NANS_WITH_ZERO"
);
const coolerWeightsHintClass = computed(() => ({
  "cooler-weights-hint": true,
  "cooler-weights-hint_error": weightsNeedAttention.value,
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
// Capture both ends before either threshold changes. Otherwise an outlying selected
// threshold can drag the computed domain along with it on every pointer move.
function keepAdjustmentLimits() {
  const min = sliderMin.value,
    max = sliderMax.value;
  sliderBoundsManual.value = true;
  sliderLowerLimit.value = min;
  sliderUpperLimit.value = max;
}
function focusThresholds() {
  if (!(upperBound.value > lowerBound.value)) return;
  sliderBoundsManual.value = true;
  sliderLowerLimit.value = lowerBound.value;
  sliderUpperLimit.value = upperBound.value;
}
function useLoadedRange() {
  exactRangeResolution = undefined;
  fetchProcessedRange();
  sliderBoundsManual.value = false;
  sliderLowerLimit.value = signalMin.value;
  sliderUpperLimit.value =
    signalMax.value > signalMin.value ? signalMax.value : signalMin.value + 1;
}

watch(
  () => {
    if (colormap.value instanceof SimpleLinearGradient) {
      const cmap = colormap.value as SimpleLinearGradient;
      return [cmap.startColorRGBA, cmap.endColorRGBA];
    }
  },
  () => {
    if (colormap.value instanceof SimpleLinearGradient) {
      const cmap = colormap.value as SimpleLinearGradient;
      if (
        fromColor.value?.RGBA === cmap.startColorRGBA?.RGBA &&
        toColor.value?.RGBA === cmap.endColorRGBA?.RGBA
      )
        return;
      syncingFromColormap.value = true;
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
      const cmap = colormap.value as SimpleLinearGradient;
      if (
        lowerBound.value === cmap.minSignal &&
        upperBound.value === cmap.maxSignal
      )
        return;
      syncingFromColormap.value = true;
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
  () => [fromColor.value, toColor.value, lowerBound.value, upperBound.value],
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
  (next, previous) => {
    if (syncingFromColormap.value) return;
    const patch: import("@/app/core/visualization/visualizationDrafts").VisualizationDraft =
      {};
    if (next[0] !== previous[0]) patch.startColor = fromColor.value.HEXA;
    if (next[1] !== previous[1]) patch.endColor = toColor.value.HEXA;
    if (next[2] !== previous[2]) patch.minSignal = lowerBound.value;
    if (next[3] !== previous[3]) patch.maxSignal = upperBound.value;
    const valid =
      Number.isFinite(lowerBound.value) &&
      Number.isFinite(upperBound.value) &&
      upperBound.value > lowerBound.value &&
      (!observedExpectedPalette.value ||
        (lowerBound.value > 0 && lowerBound.value < 1 && upperBound.value > 1));
    props.mapManager?.visualizationManager.noteVisualizationDraft(patch, valid);
  }
);

watch(
  () => props.mapManager,
  () => {
    if (props.mapManager && !props.mapManager.isDisposed) {
      registerSignalRangeCallback(props.mapManager);
      void hydrateOptionsForActiveSource();
    }
  }
);

watch(
  () =>
    [
      activeVisualizationSource.value,
      presentationMode.value,
      activeVisualizationTargetId.value,
    ] as const,
  () => {
    if (!props.mapManager || props.mapManager.isDisposed) return;
    void hydrateOptionsForActiveSource();
  }
);

onMounted(() => {
  window.addEventListener("hict:render-pipeline-changed", onPipelineChanged);
  if (props.mapManager && !props.mapManager.isDisposed) {
    registerSignalRangeCallback(props.mapManager);
  }
  if (!props.mapManager || props.mapManager.isDisposed) return;
  void hydrateOptionsForActiveSource();
});

onBeforeUnmount(() => {
  window.removeEventListener("hict:render-pipeline-changed", onPipelineChanged);
  rangeMap?.getMap().un("moveend", onViewportRangeChanged);
  rangeMap?.getMap().un("rendercomplete", onViewportRangeChanged);
  ++rangeGeneration;
  ++rangeProbe;
  window.clearTimeout(rangeTimer);
  rangeController?.abort();
});

function activeSourceForOptions(): "PRIMARY" | "SECONDARY" | undefined {
  return activeVisualizationSource.value;
}

function onPipelineChanged(): void {
  void hydrateOptionsForActiveSource();
}

async function hydrateOptionsForActiveSource(): Promise<void> {
  const manager = props.mapManager;
  if (!manager || manager.isDisposed) return;
  ++rangeProbe;
  ++rangeGeneration;
  rangeController?.abort();
  rangeScanning.value = false;
  exactRangeResolution = undefined;
  rangeStatus.value = "Waiting for visible tile limits";
  activeRangeExpression.value = undefined;
  const generation = ++optionsHydrationGeneration;
  percentageSignalScale.value = false;
  try {
    await manager.visualizationManager.loadVisualizationOptionsForSource(
      activeSourceForOptions(),
      activeVisualizationTargetId.value
    );
    if (generation !== optionsHydrationGeneration || manager.isDisposed) return;
    const targets =
      await manager.visualizationManager.getVisualizationPipelineTargets();
    if (generation !== optionsHydrationGeneration || manager.isDisposed) return;
    const sourceTargets = targets.filter(
      (target) => target.source === activeVisualizationSource.value
    );
    const activeTarget =
      sourceTargets.find(
        (target) => target.id === activeVisualizationTargetId.value
      ) ?? sourceTargets[0];
    activePaletteMode.value = primaryDerivedSignal.value
      ? "LINEAR"
      : activeTarget?.mode ?? "LINEAR";
    percentageSignalScale.value =
      !primaryDerivedSignal.value && activeTarget?.displayUnit === "PERCENT";
    activeRangeExpression.value =
      await manager.visualizationManager.getSourceSignalExpression(
        activeVisualizationSource.value,
        activeVisualizationTargetId.value
      );
    if (generation !== optionsHydrationGeneration || manager.isDisposed) return;
    const domainContext = JSON.stringify([
      activeVisualizationSource.value,
      activeVisualizationTargetId.value,
      activeVisualizationSource.value === "PRIMARY"
        ? visualizationOptionsStore.signalDisplayMode
        : "OBSERVED",
      activeTarget?.mode ?? "LINEAR",
    ]);
    if (domainContext !== rangeDomainContext) {
      rangeDomainContext = domainContext;
      sliderBoundsManual.value = false;
      sliderLowerLimit.value = lowerBound.value;
      sliderUpperLimit.value = upperBound.value;
    }
    updateFromStore();
    exactRangeResolution = undefined;
    void refreshProcessedRange();
  } catch {
    // Keep the current draft when a source/graph refresh is temporarily unavailable.
  }
}

function registerSignalRangeCallback(mapManager: ContactMapManager): void {
  if (registeredRangeMapManager === mapManager) {
    return;
  }
  registeredRangeMapManager = mapManager;
  rangeMap?.getMap().un("moveend", onViewportRangeChanged);
  rangeMap?.getMap().un("rendercomplete", onViewportRangeChanged);
  rangeMap = mapManager;
  mapManager.getMap().on("moveend", onViewportRangeChanged);
  mapManager.getMap().on("rendercomplete", onViewportRangeChanged);
  mapManager.addContrastSliderCallback(updateSignalRange);
}

function updateSignalRange(ranges: CurrentSignalRangeResponse): void {
  if (percentageSignalScale.value) {
    signalMin.value = 0;
    signalMax.value = 100;
    if (!sliderBoundsManual.value) {
      sliderLowerLimit.value = 0;
      sliderUpperLimit.value = 100;
    }
    return;
  }
  void refreshProcessedRange();
  // Tile ranges describe the traditional renderer, not arbitrary graph inputs.
  if (props.mapManager) return;
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

function refreshProcessedRange(): void {
  window.clearTimeout(rangeTimer);
  rangeTimer = window.setTimeout(() => void fetchProcessedRange(), 250);
}

function fetchProcessedRange(): void {
  const manager = props.mapManager;
  if (rangeScanning.value) return;
  if (exactRangeResolution !== undefined) {
    if (
      exactRangeResolution ===
      manager?.viewAndLayersManager.currentViewState.resolutionDesciptor
        .bpResolution
    )
      return;
    exactRangeResolution = undefined;
    rangeStatus.value = "Resolution changed; scan again for exact limits";
  }
  if (primaryDerivedSignal.value) return;
  if (
    !manager ||
    manager.isDisposed ||
    percentageSignalScale.value ||
    !activeRangeExpression.value
  )
    return;
  const range = manager.viewAndLayersManager.loadedViewportSignalRange(
    activeVisualizationSource.value,
    activeRangeExpression.value
  );
  if (
    !range ||
    !range.processed.count ||
    range.processed.min == null ||
    range.processed.max == null
  ) {
    rangeStatus.value =
      "No visible finite tile limits yet; previous bounds retained";
    return;
  }
  signalMin.value = range.processed.min;
  signalMax.value = range.processed.max;
  // Hi-C signal is heavy-tailed: a few diagonal pixels can exceed typical
  // thresholds by orders of magnitude and would pin both handles to the left.
  const robustMax = robustUpperLimit(range.processed) ?? range.processed.max;
  if (!sliderBoundsManual.value) {
    sliderLowerLimit.value = signalMin.value;
    sliderUpperLimit.value =
      robustMax > signalMin.value ? robustMax : signalMax.value;
  }
  rangeStatus.value = `Loaded viewport tiles (${range.tiles}): ${formatSignal(
    range.processed.min
  )} – ${formatSignal(range.processed.max)}${
    robustMax < range.processed.max
      ? `; slider limited to ${formatSignal(robustMax)} (4 × 99.5th percentile)`
      : ""
  }; raw ${formatSignal(range.raw.min ?? 0)} – ${formatSignal(
    range.raw.max ?? 0
  )}`;
}

function cancelExactRange(): void {
  ++rangeProbe;
  ++rangeGeneration;
  rangeController?.abort();
  rangeScanning.value = false;
  exactRangeResolution = undefined;
  rangeStatus.value = "Scan cancelled; previous bounds retained";
}

watch(histogramContext, () => {
  exactRangeResolution = undefined;
  if (rangeScanning.value) cancelExactRange();
});

async function fetchExactRange(): Promise<void> {
  const manager = props.mapManager;
  if (!manager || manager.isDisposed || percentageSignalScale.value) return;
  const probe = ++rangeProbe,
    generation = ++rangeGeneration;
  rangeController?.abort();
  const controller = new AbortController();
  rangeController = controller;
  rangeScanning.value = true;
  rangeStatus.value = primaryDerivedSignal.value
    ? "Preparing whole-map expected profile and exact limits…"
    : "Preparing exact limits…";
  try {
    await manager.visualizationManager.waitForPendingOptionRequests();
    if (controller.signal.aborted || probe !== rangeProbe || manager.isDisposed)
      return;
    const bpResolution =
      manager.viewAndLayersManager.currentViewState.resolutionDesciptor
        .bpResolution;
    const derived = primaryDerivedSignal.value;
    const signalMode = derived ? "TRADITIONAL_NORMALIZED" : "PIPELINE_SIGNAL";
    const expression = derived
      ? undefined
      : await manager.visualizationManager.getSourceSignalExpression(
          activeVisualizationSource.value,
          activeVisualizationTargetId.value
        );
    const displayMode = visualizationOptionsStore.signalDisplayMode;
    const api = manager.networkManager.requestManager;
    const snapshot = await api.querySignalStatistics({
      bpResolution,
      signalMode,
      metadataOnly: true,
      signal: controller.signal,
    });
    if (controller.signal.aborted || probe !== rangeProbe || manager.isDisposed)
      return;
    const key = JSON.stringify([
      bpResolution,
      signalMode,
      expression,
      displayMode,
      snapshot.revision,
      snapshot.size,
    ]);
    const range =
      rangeCache.get(key) ??
      (await scanExactSignalRange(
        snapshot,
        (startRowPx, startColPx) => {
          if (
            manager.isDisposed ||
            manager.viewAndLayersManager.currentViewState.resolutionDesciptor
              .bpResolution !== bpResolution
          )
            controller.abort();
          return api.querySignalStatistics({
            bpResolution,
            signalMode,
            ...(expression ? { expression } : {}),
            revision: snapshot.revision,
            startRowPx,
            startColPx,
            signal: controller.signal,
          });
        },
        controller.signal,
        (completed, total) => {
          if (generation === rangeGeneration && !controller.signal.aborted)
            rangeStatus.value = `Exact limits: ${(
              (100 * completed) /
              total
            ).toFixed(1)}% (${completed}/${total} blocks)`;
        }
      ));
    if (controller.signal.aborted || generation !== rangeGeneration) return;
    rangeCache.set(key, range);
    const oldestKey = rangeCache.keys().next().value;
    if (rangeCache.size > 8 && oldestKey !== undefined)
      rangeCache.delete(oldestKey);
    exactRangeResolution = bpResolution;
    signalMin.value = range.min;
    signalMax.value = range.max > range.min ? range.max : range.min + 1;
    // Whole-map limits are an explicit user choice and must outlive viewport tile refreshes.
    sliderBoundsManual.value = true;
    sliderLowerLimit.value = signalMin.value;
    sliderUpperLimit.value = signalMax.value;
    rangeStatus.value = `Exact limits${
      derived
        ? " (whole-map " +
          displayMode
            .replace("OBSERVED_OVER_EXPECTED", "O/E")
            .replace("EXPECTED", "Expected") +
          ")"
        : ""
    }: ${formatSignal(range.min)} – ${formatSignal(range.max)} (${
      range.count
    } finite cells)`;
  } catch (error) {
    if (generation !== rangeGeneration || manager.isDisposed) return;
    exactRangeResolution = undefined;
    rangeStatus.value = controller.signal.aborted
      ? "Scan cancelled; previous bounds retained"
      : "Exact limits unavailable; previous bounds retained";
    if ((error as { response?: { status?: number } })?.response?.status === 409)
      rangeStatus.value = "Map changed; scan again for exact limits";
  } finally {
    if (generation === rangeGeneration) rangeScanning.value = false;
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
        if (percentageSignalScale.value) {
          signalMin.value = 0;
          signalMax.value = 100;
          sliderBoundsManual.value = false;
          sliderLowerLimit.value = 0;
          sliderUpperLimit.value = 100;
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
    toast.error(
      "Signal range must be positive: lower threshold must be below upper threshold."
    );
    return;
  }
  if (
    observedExpectedPalette.value &&
    !(lowerBound.value > 0 && lowerBound.value < 1 && upperBound.value > 1)
  ) {
    toast.error(
      "O/E limits must straddle neutral 1: choose 0 < lower < 1 < upper."
    );
    return;
  }
  const source = activeVisualizationSource.value;
  const action = source
    ? props.mapManager?.visualizationManager.applyVisualizationSettingsForSourceAndReload(
        source,
        activeVisualizationTargetId.value
      )
    : props.mapManager?.visualizationManager.applyVisualizationSettingsAndReload();
  action?.catch((error) => {
    reportFailure("Apply visualization settings", error);
  });
}

function onCoolerWeightsNaNPolicyChanged(): void {
  const keepWeights = coolerWeightsNaNPolicy.value !== "DISABLE_WEIGHTS";
  const manager = props.mapManager;
  if (!manager) {
    applyCoolerWeights.value = keepWeights;
    applySettings();
    return;
  }
  manager.visualizationManager
    .applyCoolerWeightsPolicy(coolerWeightsNaNPolicy.value, keepWeights)
    .catch((error) => {
      reportFailure("Apply Cooler weight policy", error);
    });
}

function onLowerRangeInput(value: number): void {
  if (!Number.isFinite(value)) {
    return;
  }
  const actual = fromSliderPosition(value);
  const minGap = Math.max(
    Math.abs(upperBound.value) * Number.EPSILON,
    Math.abs(sliderMin.value) * Number.EPSILON,
    Math.abs(sliderMax.value) * Number.EPSILON
  );
  lowerBound.value = observedExpectedPalette.value
    ? Math.max(
        Number.EPSILON,
        Math.min(actual, 1 - Math.max(Number.EPSILON, minGap))
      )
    : Math.min(actual, upperBound.value - minGap);
}

function onUpperRangeInput(value: number): void {
  if (!Number.isFinite(value)) {
    return;
  }
  const actual = fromSliderPosition(value);
  const minGap = Math.max(
    Math.abs(lowerBound.value) * Number.EPSILON,
    Math.abs(sliderMin.value) * Number.EPSILON,
    Math.abs(sliderMax.value) * Number.EPSILON
  );
  upperBound.value = observedExpectedPalette.value
    ? Math.max(actual, 1 + Math.max(Number.EPSILON, minGap))
    : Math.max(actual, lowerBound.value + minGap);
}

function onSliderLimitChanged(): void {
  sliderBoundsManual.value = true;
  if (!(sliderUpperLimit.value > sliderLowerLimit.value)) {
    sliderUpperLimit.value = sliderLowerLimit.value + 1;
  }
}

function toHistogramPosition(value: number): number {
  if (value < sliderMin.value) return sliderPositionMin.value - 1;
  if (value > sliderMax.value) return sliderPositionMax.value + 1;
  return toSliderPosition(value);
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
  if (
    Math.abs(value) >= 1000 ||
    (Math.abs(value) > 0 && Math.abs(value) < 0.01)
  ) {
    return value.toExponential(2);
  }
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
}
</script>

<style scoped>
.oe-palette-preset {
  display: grid;
  gap: 4px;
  font-size: 0.8rem;
  min-width: 0;
}
.threshold-compact-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  gap: 10px;
  padding: 14px 12px;
  background: var(--hict-surface-bg, #fff);
  color: var(--hict-surface-fg, #334155);
  position: relative;
  z-index: 30;
}
.threshold-card-title {
  font-size: 0.8rem;
  font-weight: 650;
  letter-spacing: 0.01em;
}
.threshold-input-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}
.threshold-field {
  display: grid;
  gap: 5px;
  margin: 0;
  font-size: 0.8rem;
  font-weight: 500;
  color: #64748b;
}
.threshold-field-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 24px;
  gap: 6px;
  align-items: center;
}
.threshold-number-input,
.domain-inputs input {
  width: 100%;
  min-width: 0;
  padding: 7px 8px;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  background: var(--hict-surface-bg, #fff);
  color: var(--hict-surface-fg, #1e293b);
  appearance: textfield;
}
.threshold-number-input::-webkit-inner-spin-button {
  appearance: none;
}
.threshold-number-input:focus,
.domain-inputs input:focus {
  outline: 2px solid #2563eb;
  outline-offset: 1px;
  box-shadow: none;
}
.range-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.scale-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.scale-caption {
  font-size: 0.8rem;
  font-weight: 600;
  color: #475569;
}
.scale-choice {
  display: inline-flex;
  padding: 3px;
  border-radius: 7px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
}
.scale-choice button {
  padding: 3px 10px;
  background: transparent;
  border: 0;
  border-radius: 4px;
  color: #475569;
  font-size: 0.8rem;
}
.scale-choice button[aria-pressed="true"] {
  background: white;
  color: #1d4ed8;
  box-shadow: 0 1px 3px #0f172a20;
  font-weight: 600;
}
.range-text-button {
  background: none;
  border: 0;
  padding: 3px 0;
  font-size: 0.8rem;
  color: #1d4ed8;
  text-align: left;
}
.range-text-button:hover {
  text-decoration: underline;
}
.range-details {
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
  font-size: 0.8rem;
}
.range-details summary {
  cursor: pointer;
  color: #475569;
}
.range-summary-value {
  float: right;
  font-variant-numeric: tabular-nums;
  color: #64748b;
  max-width: 46%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.range-help {
  font-size: 0.78rem;
  color: #64748b;
  margin: 8px 0 4px;
  line-height: 1.5;
}
.domain-inputs {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
}
.domain-inputs label {
  display: grid;
  gap: 4px;
  color: #64748b;
}
.domain-inputs input {
  font-size: 0.75rem;
}
.threshold-toolbar:empty {
  display: none;
}
.gradient-apply-button {
  width: 100%;
  min-height: 34px;
  border-radius: 7px;
  font-size: 0.8rem;
  font-weight: 600;
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

.cooler-weights-hint_error summary {
  color: #b02a37;
  font-weight: 700;
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

.cooler-weights-hint_error[open] {
  border-left-color: #dc3545;
  background: rgba(220, 53, 69, 0.12);
  color: #842029;
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
