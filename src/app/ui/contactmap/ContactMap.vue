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
  <div class="map-shell">
    <div id="hic-contact-map" :style="mapContainerStyle" ref="mapTarget"></div>
    <div
      class="zoom-slider-overlay"
      v-if="props.mapManager && customZoomSliderEnabled"
    >
      <ZoomSlider :map-manager="props.mapManager" />
    </div>
  </div>
</template>

<script setup lang="ts">
import "ol/ol.css";
import { useStyleStore } from "@/app/stores/styleStore";
import { ref, computed, Ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { usehtmlElementReferencesStore } from "@/app/stores/htmlElementReferencesStore";
import ZoomSlider from "@/app/ui/components/toolbar/upper_blocks/ZoomSlider.vue";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";

const stylesStore = useStyleStore();

const htmlElementReferencesStore = usehtmlElementReferencesStore();

const { mapTarget, miniMapTarget } = storeToRefs(htmlElementReferencesStore);

const hicContactMap: Ref<HTMLElement | null> = ref(null);

watch(
  () => hicContactMap.value,
  () => (mapTarget.value = hicContactMap.value)
);

const mapContainerStyle = ref({
  width: "100%",
  height: "100%",
  "padding-right": "15px",
});

const props = defineProps<{
  mapManager?: ContactMapManager;
}>();

const uiSettingsStore = useUiSettingsStore();
const { customZoomSliderEnabled } = storeToRefs(uiSettingsStore);
</script>

<style scoped>
.map-shell {
  position: relative;
  width: 100%;
  height: 100%;
}

.zoom-slider-overlay {
  position: absolute;
  left: 8px;
  top: 140px;
  z-index: 20;
  pointer-events: auto;
}
</style>
