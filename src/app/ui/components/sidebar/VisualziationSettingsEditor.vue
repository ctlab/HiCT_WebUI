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
    <div class="w-100">
      <button
        type="button"
        id="gradient-apply-button"
        class="btn m-1"
        :style="gradstyle"
        @click="applySettings"
      >
        Apply
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Ref, onMounted, ref, unref, watch } from "vue";
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import ColorPickerRectangle from "./ColorPickerRectangle.vue";
import { toast } from "vue-sonner";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import { storeToRefs } from "pinia";
import SimpleLinearGradient from "@/app/core/visualization/colormap/SimpleLinearGradient";
import { ColorTranslator } from "colortranslator";
const visualizationOptionsStore = useVisualizationOptionsStore();
const { preLogBase, applyCoolerWeights, postLogBase, colormap } = storeToRefs(
  visualizationOptionsStore
);

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
      // console.log("Colormap type changed and simple linear gradient, was: ", fromColor.value, toColor.value);
      const cmap = colormap.value as SimpleLinearGradient;
      fromColor.value = cmap.startColorRGBA;
      toColor.value = cmap.endColorRGBA;
      fromColorFn.value = () => fromColor.value;
      toColorFn.value = () => toColor.value;
      // console.log("Now: ", fromColor.value, toColor.value);
    }
  }
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
    gradstyle.value["background-image"] =
      "linear-gradient(to right," +
      fromColor.value +
      " , " +
      toColor.value +
      ")";
    fromColorFn.value = () => fromColor.value;
    toColorFn.value = () => toColor.value;
    colormap.value = new SimpleLinearGradient(
      fromColor.value,
      toColor.value,
      lowerBound.value,
      upperBound.value
    );
    // console.log("UpperBound", upperBound.value);
  }
);

watch(
  () => props.mapManager,
  () => {
    if (props.mapManager) {
      props.mapManager?.visualizationManager
        .fetchVisualizationOptions()
        .then(() => updateFromStore());
    }
  }
);

onMounted(() => {
  props.mapManager?.visualizationManager
    .fetchVisualizationOptions()
    .then(() => updateFromStore());
});

function updateFromStore() {
  // props.mapManager?.visualizationManager.fetchVisualizationOptions();
  const cmap = colormap.value;
  if (cmap) {
    switch (true) {
      case cmap instanceof SimpleLinearGradient: {
        const grad = cmap as SimpleLinearGradient;
        fromColor.value = grad.startColorRGBA;
        toColor.value = grad.endColorRGBA;
        console.log("Updated: ", fromColor.value, toColor.value);
        break;
      }
      default:
        throw Error("Unknown colormap type");
    }
  }
}

function applySettings() {
  props.mapManager?.visualizationManager
    .sendVisualizationOptionsToServer()
    .then(() => {
      props.mapManager?.reloadTiles();
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
</style>
