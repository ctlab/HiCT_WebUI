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
  <div class="minimap-target-div" ref="miniMap"></div>
</template>

<script setup lang="ts">
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { usehtmlElementReferencesStore } from "@/app/stores/htmlElementReferencesStore";
import { View } from "ol";
import { storeToRefs } from "pinia";
import { Ref, onMounted, ref, watch } from "vue";
import { OverviewMap } from "ol/control";

const htmlElementReferencesStore = usehtmlElementReferencesStore();

const { mapTarget, miniMapTarget } = storeToRefs(htmlElementReferencesStore);

const miniMap: Ref<HTMLElement | null> = ref(null);

watch(
  () => miniMap.value,
  () => (mapTarget.value = miniMap.value)
);

const props = defineProps<{
  mapManager?: ContactMapManager;
}>();
/*
onMounted(() => {
  const minimapElement = miniMap.value;
  if (minimapElement) {
    console.log("minimapElement value", miniMap.value);
    const mapManager = props.mapManager;
    if (mapManager) {
      console.log("MinMap rendering is disabled in MiniMap.vue");
      if (mapManager === undefined) {
        const map = mapManager.getMap();
        const minimap = new OverviewMap({
          collapsed: false,
          collapsible: false,
          rotateWithView: false,
          target: minimapElement,
          className: "ol-overviewmap",
          view: new View({
            maxZoom: 1,
            center: map.getView().getCenter(),
            enableRotation: false,
            projection: map.getView().getProjection(),
            showFullExtent: true,
          }),
          layers: [
            mapManager.viewAndLayersManager.layersHolder.hicDataLayers[0],
          ],
        });
        map.addControl(minimap);
        // minimap.setMap(map);
        mapManager.minimap = minimap;
      }
    } else {
      console.log("No map manager to set minimap target");
    }
  } else {
    console.log("No minimap target");
  }
  //   const custom-overviewmapTarget = document.getElementById("minimap-target-div");
  //   console.log("Custom-overviewmapTarget: ", custom-overviewmapTarget);
  //   if (custom-overviewmapTarget) {
  //     props.mapManager?.addCustom-overviewmapTarget(custom-overviewmapTarget);
  //   }
});
*/
</script>

<style scoped>
.minimap-target-div {
  width: 100%;
  height: 100%;
  /* background-color: aqua; */
  position: relative;
}
</style>
