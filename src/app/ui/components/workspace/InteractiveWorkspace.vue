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
  <div :class="iwsClass" :style="iwcStyle">
    <div class="interactive-workspace_corner_track"></div>
    <div class="interactive-workspace_corner_ruler"></div>
    <div class="interactive-workspace_horizontal_tracks">
      <HorizontalIGVTrack :map-manager="props.mapManager"></HorizontalIGVTrack>
    </div>
    <div class="interactive-workspace_horizontal_ruler" id="horizontal-ruler-div"></div>
    <div class="interactive-workspace_vertical_tracks">
      <VerticalIGVTrack :map-manager="props.mapManager"></VerticalIGVTrack>
    </div>
    <div class="interactive-workspace_vertical_ruler" id="vertical-ruler-div"></div>
    <div class="interactive-workspace_content">
      <ContactMap :map-manager="props.mapManager"></ContactMap>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ContactMapManager,
  // type ContactMapManagerOptions,
} from "@/app/core/mapmanagers/ContactMapManager";
import HorizontalIGVTrack from "../tracks/HorizontalIGVTrack.vue";
import ContactMap from "../../contactmap/ContactMap.vue";
import VerticalIGVTrack from "../tracks/VerticalIGVTrack.vue";

import { useStyleStore } from "@/app/stores/styleStore";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";

const stylesStore = useStyleStore();

const { mapBackgroundColor } = storeToRefs(stylesStore);

const iwsClass = ref("interactive-workspace");
const iwcStyle = ref({
  "background-color": mapBackgroundColor.value.RGB,
});

watch(
  () => mapBackgroundColor.value.RGB,
  () => {
    iwcStyle.value["background-color"] = mapBackgroundColor.value.RGB;
  }
);

const props = defineProps<{
  mapManager: ContactMapManager | undefined;
  filename?: string;
}>();

const visibleTrackCount = ref(0);
let unsubscribeTrackList: (() => void) | undefined;

const bindTrackVisibility = () => {
  unsubscribeTrackList?.();
  visibleTrackCount.value = 0;
  if (!props.mapManager) {
    return;
  }
  const syncVisibleCount = () => {
    visibleTrackCount.value = props.mapManager
      ?.linearTrackManager.getTracksSnapshot()
      .filter((track) => track.visible).length ?? 0;
  };
  syncVisibleCount();
  unsubscribeTrackList = props.mapManager.linearTrackManager.subscribeTrackList(
    () => {
      syncVisibleCount();
    }
  );
};

onMounted(() => {
  bindTrackVisibility();
});

watch(
  () => props.mapManager,
  () => {
    bindTrackVisibility();
  }
);

watch(visibleTrackCount, async () => {
  await nextTick();
  window.requestAnimationFrame(() => {
    void props.mapManager?.linearTrackManager.render();
  });
});

onBeforeUnmount(() => {
  unsubscribeTrackList?.();
});

const trackPanelCssSize = computed(() =>
  visibleTrackCount.value > 0 ? "140px" : "0px"
);
const rulerPanelCssSize = "44px";
</script>

<style scoped>
.interactive-workspace {
  width: 100%;
  display: grid;
  grid-template-rows: v-bind(rulerPanelCssSize) v-bind(trackPanelCssSize) 1fr;
  grid-template-columns: v-bind(rulerPanelCssSize) v-bind(trackPanelCssSize) 1fr;
  grid-template-areas:
    "corner-ruler corner-track horizontal-ruler"
    "corner-ruler corner-track horizontal-tracks"
    "vertical-ruler vertical-tracks content";
}

.interactive-workspace_horizontal_tracks,
.interactive-workspace_vertical_tracks,
.interactive-workspace_content,
.interactive-workspace_horizontal_ruler,
.interactive-workspace_vertical_ruler {
  min-width: 0;
  min-height: 0;
}

.interactive-workspace_corner_track {
  grid-area: corner-track;
  background: rgba(244, 247, 251, 0.98);
  border-right: 1px solid black;
  border-bottom: 1px solid black;
}

.interactive-workspace_corner_ruler {
  grid-area: corner-ruler;
  background: rgba(255, 255, 255, 0.95);
  border-right: 1px solid black;
  border-bottom: 1px solid black;
}

.interactive-workspace_horizontal_tracks {
  grid-area: horizontal-tracks;
}

.interactive-workspace_horizontal_ruler {
  grid-area: horizontal-ruler;
  overflow: hidden;
  border-right: 1px solid black;
  border-bottom: 1px solid black;
  background: rgba(255, 255, 255, 0.95);
}

.interactive-workspace_vertical_tracks {
  grid-area: vertical-tracks;
}

.interactive-workspace_vertical_ruler {
  grid-area: vertical-ruler;
  overflow: hidden;
  border-right: 1px solid black;
  border-bottom: 1px solid black;
  background: rgba(255, 255, 255, 0.95);
}

.interactive-workspace_content {
  grid-area: content;
}
</style>
