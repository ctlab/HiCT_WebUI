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
  <aside class="sidebar">
    <div id="upper-block">
      <!-- <div id="minimap">
        <MiniMap
          :map-manager="props.mapManager"
          v-if="props.mapManager"
        ></MiniMap>
      </div> -->

      <div id="layers-block" v-if="props.mapManager">
        <!-- Instantiate layer components here using v-for -->
        <LayerComponent
          v-for="layer in layers"
          v-bind:key="layer.name"
          v-bind:layer-name="layer.name"
          :getDefaultColor="layer.getStyle"
          @onColorChanged="onColorChanged"
          @onBorderStyleChanged="onBorderStyleChanged"
        >
        </LayerComponent>
      </div>

      <VisualziationSettingsEditor
        :map-manager="props.mapManager"
        v-if="props.mapManager"
      />

      <!-- <div id="color-range" v-if="props.mapManager">
        <ContrastSelector :map-manager="props.mapManager" />
      </div> -->

      <div id="saved-visual-settings">
        <SavedVisualOptions
          :map-manager="props.mapManager"
          v-if="props.mapManager"
        ></SavedVisualOptions>
      </div>

      <div id="saved-locations">
        <SavedLocations
          :map-manager="props.mapManager"
          v-if="props.mapManager"
        ></SavedLocations>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import LayerComponent from "@/app/ui/components/sidebar/LayerComponent.vue";
import SavedLocations from "@/app/ui/components/sidebar/SavedLocations.vue";
import { ref, watch, type Ref } from "vue";
import { CommonEventManager } from "@/app/core/mapmanagers/CommonEventManager";
import { BorderStyle } from "@/app/core/tracks/Track2DSymmetric";
import Style from "ol/style/Style";
import MiniMap from "@/app/ui/components/sidebar/MiniMap.vue";
import { toast } from "vue-sonner";
import Stroke from "ol/style/Stroke";
import { useStyleStore } from "@/app/stores/styleStore";
// import GradientEditor from "@/app/ui/components/sidebar/GradientEditor.vue";
import VisualziationSettingsEditor from "./VisualziationSettingsEditor.vue";
import SavedVisualOptions from "./SavedVisualOptions.vue";
import { storeToRefs } from "pinia";
import { ColorTranslator } from "colortranslator";

const stylesStore = useStyleStore();

const { mapBackgroundColor } = storeToRefs(stylesStore);
/// @ts-expect-error "Style objects are not cloneable"
const backgroundColorStyle: Ref<Style> = ref(
  new Style({
    stroke: new Stroke({
      color: "rgba(255,255,255,255)",
    }),
  })
);

watch(
  () => mapBackgroundColor.value,
  () => {
    backgroundColorStyle.value = new Style({
      stroke: new Stroke({
        color: mapBackgroundColor.value.RGBA,
      }),
    });
  }
);

const props = defineProps<{
  mapManager?: ContactMapManager;
}>();

class LayerDescriptor {
  constructor(
    public name: string,
    public getStyle?: () => Style | undefined,
    public layer_manager?: unknown
  ) {}
}

const layers: Ref<LayerDescriptor[]> = ref([
  new LayerDescriptor("Contigs", () =>
    props.mapManager
      ?.getLayersManager()
      .track2DHolder.contigBordersTrack.getStyle()
  ),
  new LayerDescriptor("Scaffolds", () =>
    props.mapManager
      ?.getLayersManager()
      .track2DHolder.scaffoldBordersTrack.getStyle()
  ),
  new LayerDescriptor("Gridlines"),
  new LayerDescriptor("Background", () => backgroundColorStyle.value),
]);

function onColorChanged(layerName: string, newColor: ColorTranslator) {
  switch (layerName) {
    case "Contigs":
      getEventManager()?.onContigBorderColorChanged(newColor.RGBA);
      break;
    case "Scaffolds":
      getEventManager()?.onScanffoldBorderColorChanged(newColor.RGBA);
      break;
    case "Background":
      stylesStore.setMapBackground(newColor);
      break;
    default:
      toast.error(`Method for ${layerName} is undefined`);
      // console.log(`Method for ${layerName} is undefined`);
      console.error(`Method for ${layerName} is undefined`);
  }

  // getEventManager()?.onContigBorderColorChanged(layerName, newColor);
  // getEventManager()[invoke](layerName, newColor);
}

function onBorderStyleChanged(layerName: string, style: BorderStyle) {
  switch (layerName) {
    case "Contigs":
      getEventManager()?.onContigBorderStyleChanged(style);
      break;
    case "Scaffolds":
      getEventManager()?.onScanffoldBorderStyleChanged(style);
      break;
    default:
      // alert(`Method for ${layerName} is undefined`);
      toast.error(`Method for ${layerName} is undefined`);
      console.error(`Method for ${layerName} is undefined`);
  }
}

function getEventManager(): CommonEventManager | undefined {
  return props.mapManager != undefined
    ? new CommonEventManager(props.mapManager)
    : undefined;
}
</script>

<style scoped>
.sidebar {
  /* sidebar */

  /* Auto layout */
  display: flex;
  flex-direction: column;
  gap: 1px;

  width: 350px;

  right: 0px;
  top: 109px;

  /* Global/07. Light */
  background: #f8f9fa;
  /* background-color: green; */

  /* Shadows/02. Regular */
  box-shadow: 0px 8px 16px rgba(0, 0, 0, 0.15);
}

#upper-block {
  /* upper block */

  /* Auto layout */
  display: flex;
  flex-direction: column;
  gap: 4px;

  /* Inside auto layout */
  flex: none;
  order: 0;
  flex-grow: 0;
}

#layers-block {
  /* layers */

  /* Auto layout */
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 16px;
  gap: 8px;

  height: fit-content;

  /* Global/09. White */
  background: #ffffff;

  /* Shadows/01. Small */
  box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.075);

  /* Inside auto layout */
  flex: none;
  order: 0;
  flex-grow: 0;
}

#minimap {
  height: 200px;
  background-color: grey;
}

#color-range {
  /* color range */

  /* Auto layout */
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 12px;

  height: fit-content;

  /* Global/09. White */
  background: #ffffff;

  /* Shadows/01. Small */
  box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.075);

  /* Inside auto layout */
  flex: none;
  order: 1;
  flex-grow: 0;
}

#saved-visual-settings {
  display: flex;
  flex-direction: column;
  padding: 16px 0px;
  gap: 8px;

  height: fit-content;

  background: #ffffff;

  box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.075);

  height: 50%;
  max-height: 350px;
  /* overflow-y: scroll; */
  overflow-x: hidden;
  width: 100%;
  padding-top: 15px;
  padding-right: 20px;
}

#saved-locations {
  /* saved locations */

  /* Auto layout */
  display: flex;
  flex-direction: column;
  padding: 16px 0px;
  gap: 8px;

  height: fit-content;

  /* Global/09. White */
  background: #ffffff;

  /* Shadows/01. Small */
  box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.075);
}
</style>
