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
    <AssemblyContextMenu
      v-if="props.mapManager"
      :key="managerKey"
      :map-manager="props.mapManager"
    />
    <div
      v-if="props.mapManager?.viewAndLayersManager.overlayStatus.loading.value"
      class="overlay-loading"
      role="status"
    >
      Loading overlay…
    </div>
    <aside
      v-if="props.mapManager?.alignmentDetail?.state.visible.value"
      class="alignment-legend"
      aria-label="Automatic FASTA alignment legend"
    >
      <strong>Automatic FASTA alignment</strong>
      <p>Horizontal × vertical FASTA regions · updates with navigation</p>
      <ul>
        <li v-for="marker in alignmentMarkers" :key="marker.id">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              :d="marker.path"
              :fill="marker.filled ? marker.color : 'none'"
              stroke="white"
              stroke-width="4"
              stroke-linejoin="round"
            />
            <path
              :d="marker.path"
              :fill="marker.filled ? marker.color : 'none'"
              :stroke="marker.color"
              stroke-width="2"
              stroke-linejoin="round"
            />
          </svg>
          {{ marker.label }}
        </li>
      </ul>
      <p
        v-if="props.mapManager.alignmentDetail.state.message.value"
        role="status"
        class="alignment-status"
      >
        {{ props.mapManager.alignmentDetail.state.message.value }}
      </p>
    </aside>
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
import { alignmentMarkers } from "@/app/core/visualization/alignmentMarkers";
import AssemblyContextMenu from "./AssemblyContextMenu.vue";
import { useStyleStore } from "@/app/stores/styleStore";
import { ref, computed, Ref, toRaw, watch } from "vue";
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
});

const props = defineProps<{
  mapManager?: ContactMapManager;
}>();

const uiSettingsStore = useUiSettingsStore();
const { customZoomSliderEnabled } = storeToRefs(uiSettingsStore);

// The context menu binds to its map's viewport once, when it is created. Replacing the manager
// directly (open another map, restore a session) must therefore re-create it.
const managerIds = new WeakMap<object, number>();
let nextManagerId = 1;
const managerKey = computed(() => {
  const manager = props.mapManager ? toRaw(props.mapManager) : undefined;
  if (!manager) return 0;
  let id = managerIds.get(manager);
  if (id === undefined) {
    id = nextManagerId++;
    managerIds.set(manager, id);
  }
  return id;
});
</script>

<style scoped>
.alignment-legend {
  position: absolute;
  z-index: 10;
  bottom: 0.75rem;
  right: 0.75rem;
  width: 20rem;
  max-width: calc(100% - 1.5rem);
  max-height: calc(100% - 1.5rem);
  overflow: auto;
  padding: 0.65rem 0.8rem;
  border: 1px solid #ffffff80;
  border-radius: 0.5rem;
  background: rgba(15, 23, 42, 0.86);
  color: white;
  font-size: 0.75rem;
  box-shadow: 0 2px 8px #0003;
  pointer-events: none;
}
.alignment-legend p {
  margin: 0.25rem 0 0;
}
.alignment-legend ul {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.2rem 0.6rem;
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
}
.alignment-legend li {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.alignment-legend svg {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
}
.alignment-status {
  border-top: 1px solid #ffffff50;
  padding-top: 0.35rem;
}

.overlay-loading {
  position: absolute;
  z-index: 2;
  top: 0.5rem;
  right: 0.5rem;
  padding: 0.2rem 0.5rem;
  border-radius: 0.25rem;
  color: var(--bs-body-color);
  background: var(--bs-body-bg);
  pointer-events: none;
}

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
