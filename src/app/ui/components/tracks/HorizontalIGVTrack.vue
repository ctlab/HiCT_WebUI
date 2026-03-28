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
  <div
    id="horizontal-igv-track-div"
    class="horizontal-track-canvas-host"
    :style="trackHostStyle"
  >
    <canvas ref="trackCanvas"></canvas>
    <div ref="statusOverlay" class="track-status-overlay"></div>
  </div>
</template>

<script setup lang="ts">
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { useStyleStore } from "@/app/stores/styleStore";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import { storeToRefs } from "pinia";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  mapManager?: ContactMapManager;
}>();

const trackCanvas = ref<HTMLCanvasElement | null>(null);
const statusOverlay = ref<HTMLDivElement | null>(null);
let unsubscribeRenderState: (() => void) | undefined;

const styleStore = useStyleStore();
const uiSettingsStore = useUiSettingsStore();
const { mapBackgroundColor } = storeToRefs(styleStore);
const { inheritTrackBackgroundFromMap, trackBackgroundColor } =
  storeToRefs(uiSettingsStore);
const trackHostStyle = computed(() => ({
  background: inheritTrackBackgroundFromMap.value
    ? mapBackgroundColor.value.RGB
    : trackBackgroundColor.value,
}));

const bindCanvas = () => {
  props.mapManager?.linearTrackManager.registerCanvas(
    "horizontal",
    trackCanvas.value
  );
};

const bindSubscriptions = () => {
  unsubscribeRenderState?.();
  if (statusOverlay.value) {
    statusOverlay.value.textContent = props.mapManager ? "No tracks loaded" : "";
  }
  if (!props.mapManager) {
    return;
  }
  unsubscribeRenderState =
    props.mapManager.linearTrackManager.subscribeRenderState(
      "horizontal",
      (state) => {
        if (statusOverlay.value) {
          statusOverlay.value.textContent = state.statusMessage ?? "";
          statusOverlay.value.style.display = state.statusMessage ? "block" : "none";
        }
      }
    );
};

onMounted(() => {
  bindCanvas();
  bindSubscriptions();
});

watch(
  () => props.mapManager,
  () => {
    bindCanvas();
    bindSubscriptions();
  }
);

onBeforeUnmount(() => {
  props.mapManager?.linearTrackManager.registerCanvas("horizontal", null);
  unsubscribeRenderState?.();
});
</script>

<style scoped>
#horizontal-igv-track-div {
  position: relative;
  width: 100%;
  height: 100%;
  border: 1px solid black;
  overflow: hidden;
}

#horizontal-igv-track-div canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.track-chip-list {
  display: none;
}

.track-status-overlay {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: none;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.86);
  color: rgba(55, 65, 81, 0.92);
  font-size: 11px;
  line-height: 1.2;
  pointer-events: none;
}
</style>
