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
          :getLabelSize="layer.getLabelSize"
          :getLabelOffsetMultiplier="layer.getLabelOffsetMultiplier"
          :getLabelBold="layer.getLabelBold"
          :getLabelOutline="layer.getLabelOutline"
          :getLabelOutlineWidth="layer.getLabelOutlineWidth"
          :getIncludeInSvg="layer.getIncludeInSvg"
          :enableStyleEditor="layer.enableStyleEditor"
          @onColorChanged="onColorChanged"
          @onBorderStyleChanged="onBorderStyleChanged"
          @onStyleChanged="onStyleChanged"
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
    public layer_manager?: unknown,
    public enableStyleEditor: boolean = false,
    public getLabelSize?: () => number,
    public getLabelOffsetMultiplier?: () => number,
    public getLabelBold?: () => boolean,
    public getLabelOutline?: () => boolean,
    public getLabelOutlineWidth?: () => number,
    public getIncludeInSvg?: () => boolean
  ) {}
}

const layers: Ref<LayerDescriptor[]> = ref([
  new LayerDescriptor(
    "Contigs",
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getStyle(),
    undefined,
    true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getLabelSize() ?? 12,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getLabelOffsetMultiplier() ?? 1.25
    ,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getLabelBold() ?? true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getLabelOutline() ?? true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getLabelOutlineWidth() ?? 2,
    () => props.mapManager?.getLayersManager().getExportTrackFlags().contigBorders ?? true
  ),
  new LayerDescriptor(
    "Scaffolds",
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getStyle(),
    undefined,
    true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getLabelSize() ?? 12,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getLabelOffsetMultiplier() ?? 1.25
    ,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getLabelBold() ?? true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getLabelOutline() ?? true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getLabelOutlineWidth() ?? 2,
    () => props.mapManager?.getLayersManager().getExportTrackFlags().scaffoldBorders ?? true
  ),
  new LayerDescriptor(
    "Cnames",
    () => {
      const color =
        props.mapManager?.getLayersManager().track2DHolder.contigBordersTrack.getLabelColor() ??
        props.mapManager?.getLayersManager().track2DHolder.contigBordersTrack.options.borderColor;
      return new Style({
        stroke: new Stroke({
          color: color as string,
        }),
      });
    },
    undefined,
    true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getLabelSize() ?? 12,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getLabelOffsetMultiplier() ?? 1.25
    ,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getLabelBold() ?? true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getLabelOutline() ?? true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getLabelOutlineWidth() ?? 2,
    () => props.mapManager?.getLayersManager().getExportTrackFlags().contigNames ?? true
  ),
  new LayerDescriptor(
    "Snames",
    () => {
      const color =
        props.mapManager?.getLayersManager().track2DHolder.scaffoldBordersTrack.getLabelColor() ??
        props.mapManager?.getLayersManager().track2DHolder.scaffoldBordersTrack.options.borderColor;
      return new Style({
        stroke: new Stroke({
          color: color as string,
        }),
      });
    },
    undefined,
    true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getLabelSize() ?? 12,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getLabelOffsetMultiplier() ?? 1.25
    ,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getLabelBold() ?? true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getLabelOutline() ?? true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getLabelOutlineWidth() ?? 2,
    () => props.mapManager?.getLayersManager().getExportTrackFlags().scaffoldNames ?? true
  ),
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
    case "Cnames":
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.setLabelColor(newColor.RGBA);
      getEventManager()?.reloadTracks();
      break;
    case "Snames":
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.setLabelColor(newColor.RGBA);
      getEventManager()?.reloadTracks();
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
    case "Cnames":
      getEventManager()?.onContigNamePlacementChanged(style);
      break;
    case "Snames":
      getEventManager()?.onScaffoldNamePlacementChanged(style);
      break;
    default:
      // alert(`Method for ${layerName} is undefined`);
      toast.error(`Method for ${layerName} is undefined`);
      console.error(`Method for ${layerName} is undefined`);
  }
}

function onStyleChanged(
  layerName: string,
  borderWidth: number,
  fillColor: ColorTranslator,
  labelSize: number,
  labelOffsetMultiplier: number,
  labelBold: boolean,
  labelOutline: boolean,
  labelOutlineWidth: number,
  includeInSvg: boolean
) {
  switch (layerName) {
    case "Contigs":
      getEventManager()?.onContigBorderWidthChanged(borderWidth);
      getEventManager()?.onContigFillColorChanged(fillColor.RGBA);
      getEventManager()?.onContigLabelSizeChanged(labelSize);
      getEventManager()?.onContigLabelOffsetMultiplierChanged(
        labelOffsetMultiplier
      );
      getEventManager()?.onContigLabelBoldChanged(labelBold);
      getEventManager()?.onContigLabelOutlineChanged(labelOutline);
      getEventManager()?.onContigLabelOutlineWidthChanged(labelOutlineWidth);
      getEventManager()?.onContigExportEnabledChanged(includeInSvg);
      break;
    case "Scaffolds":
      getEventManager()?.onScaffoldBorderWidthChanged(borderWidth);
      getEventManager()?.onScaffoldFillColorChanged(fillColor.RGBA);
      getEventManager()?.onScaffoldLabelSizeChanged(labelSize);
      getEventManager()?.onScaffoldLabelOffsetMultiplierChanged(
        labelOffsetMultiplier
      );
      getEventManager()?.onScaffoldLabelBoldChanged(labelBold);
      getEventManager()?.onScaffoldLabelOutlineChanged(labelOutline);
      getEventManager()?.onScaffoldLabelOutlineWidthChanged(labelOutlineWidth);
      getEventManager()?.onScaffoldExportEnabledChanged(includeInSvg);
      break;
    case "Cnames":
      getEventManager()?.onContigLabelSizeChanged(labelSize);
      getEventManager()?.onContigLabelOffsetMultiplierChanged(
        labelOffsetMultiplier
      );
      getEventManager()?.onContigLabelBoldChanged(labelBold);
      getEventManager()?.onContigLabelOutlineChanged(labelOutline);
      getEventManager()?.onContigLabelOutlineWidthChanged(labelOutlineWidth);
      getEventManager()?.onContigNamesExportEnabledChanged(includeInSvg);
      break;
    case "Snames":
      getEventManager()?.onScaffoldLabelSizeChanged(labelSize);
      getEventManager()?.onScaffoldLabelOffsetMultiplierChanged(
        labelOffsetMultiplier
      );
      getEventManager()?.onScaffoldLabelBoldChanged(labelBold);
      getEventManager()?.onScaffoldLabelOutlineChanged(labelOutline);
      getEventManager()?.onScaffoldLabelOutlineWidthChanged(labelOutlineWidth);
      getEventManager()?.onScaffoldNamesExportEnabledChanged(includeInSvg);
      break;
    default:
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
  top: 0px;

  background: var(--hict-surface-bg-muted, #f8f9fa);
  color: var(--hict-surface-fg, #1f2937);
  border-left: 1px solid #000000;
  /* background-color: green; */

  /* Shadows/02. Regular */
  box-shadow: 0px 8px 16px rgba(0, 0, 0, 0.15);
}

.sidebar :deep(*) {
  text-shadow: 0 0 1px var(--hict-ui-outline, rgba(255, 255, 255, 0.9));
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
  width: 100%;
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

  background: var(--hict-surface-bg, #ffffff);

  /* Shadows/01. Small */
  box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.075);

  /* Inside auto layout */
  flex: none;
  order: 0;
  flex-grow: 0;
  width: 100%;
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

  background: var(--hict-surface-bg, #ffffff);

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

  background: var(--hict-surface-bg, #ffffff);

  /* Shadows/01. Small */
  box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.075);
}
</style>
