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
  <div id="vertical-igv-track-div" class="vertical-track-canvas-host">
    <canvas ref="trackCanvas"></canvas>
    <div ref="chipList" class="track-chip-list"></div>
    <div ref="statusOverlay" class="track-status-overlay"></div>
  </div>
</template>

<script setup lang="ts">
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  mapManager?: ContactMapManager;
}>();

const trackCanvas = ref<HTMLCanvasElement | null>(null);
const chipList = ref<HTMLDivElement | null>(null);
const statusOverlay = ref<HTMLDivElement | null>(null);
let unsubscribeRenderState: (() => void) | undefined;
let unsubscribeTrackList: (() => void) | undefined;

const bindCanvas = () => {
  props.mapManager?.linearTrackManager.registerCanvas(
    "vertical",
    trackCanvas.value
  );
};

const bindSubscriptions = () => {
  unsubscribeRenderState?.();
  unsubscribeTrackList?.();
  if (statusOverlay.value) {
    statusOverlay.value.textContent = props.mapManager ? "No tracks loaded" : "";
  }
  if (chipList.value) {
    chipList.value.replaceChildren();
  }
  if (!props.mapManager) {
    return;
  }
  unsubscribeRenderState =
    props.mapManager.linearTrackManager.subscribeRenderState(
      "vertical",
      (state) => {
        if (statusOverlay.value) {
          statusOverlay.value.textContent = state.statusMessage ?? "";
          statusOverlay.value.style.display = state.statusMessage ? "block" : "none";
        }
      }
    );
  unsubscribeTrackList = props.mapManager.linearTrackManager.subscribeTrackList(
    (tracks) => {
      if (!chipList.value) {
        return;
      }
      const visibleTrackNames = tracks
        .filter((track) => track.visible)
        .map((track) => track.name);
      const chips = visibleTrackNames.map((trackName) => {
        const chip = document.createElement("span");
        chip.className = "track-chip";
        chip.textContent = trackName;
        return chip;
      });
      chipList.value.replaceChildren(...chips);
      chipList.value.style.display = chips.length > 0 ? "flex" : "none";
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
  props.mapManager?.linearTrackManager.registerCanvas("vertical", null);
  unsubscribeRenderState?.();
  unsubscribeTrackList?.();
});
</script>

<style scoped>
#vertical-igv-track-div {
  position: relative;
  width: 100%;
  height: 100%;
  border: 1px solid black;
  overflow: hidden;
  background: rgba(244, 247, 251, 0.98);
}

#vertical-igv-track-div canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.track-chip-list {
  position: absolute;
  left: 6px;
  top: 6px;
  display: none;
  flex-direction: column;
  gap: 4px;
  max-height: calc(100% - 12px);
  pointer-events: none;
}

.track-chip {
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(40, 48, 66, 0.78);
  color: white;
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
  writing-mode: vertical-rl;
  text-orientation: mixed;
}

.track-status-overlay {
  position: absolute;
  right: 8px;
  bottom: 8px;
  max-height: calc(100% - 16px);
  display: none;
  padding: 4px 6px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.86);
  color: rgba(55, 65, 81, 0.92);
  font-size: 11px;
  line-height: 1.2;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  pointer-events: none;
}
</style>
