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
    ref="workspaceRoot"
    :class="iwsClass"
    :style="iwcStyle"
  >
    <div class="interactive-workspace_corner_track">
      <div
        v-if="visibleTrackCount > 0"
        ref="cornerMiniMapTarget"
        class="interactive-workspace_corner_minimap"
      ></div>
    </div>
    <div class="interactive-workspace_corner_tracks_ruler"></div>
    <div class="interactive-workspace_horizontal_tracks">
      <HorizontalIGVTrack :map-manager="props.mapManager"></HorizontalIGVTrack>
    </div>
    <div class="interactive-workspace_corner_ruler_tracks"></div>
    <div class="interactive-workspace_corner_ruler">
      <div
        v-if="visibleTrackCount <= 0"
        ref="cornerMiniMapFallbackTarget"
        class="interactive-workspace_corner_minimap interactive-workspace_corner_minimap--compact"
      ></div>
    </div>
    <div class="interactive-workspace_horizontal_ruler" id="horizontal-ruler-div"></div>
    <div class="interactive-workspace_vertical_tracks">
      <VerticalIGVTrack :map-manager="props.mapManager"></VerticalIGVTrack>
    </div>
    <div class="interactive-workspace_vertical_ruler" id="vertical-ruler-div"></div>
    <div class="interactive-workspace_content">
      <ContactMap :map-manager="props.mapManager"></ContactMap>
    </div>
    <div
      v-if="visibleTrackCount > 0"
      class="interactive-workspace_resize_handle interactive-workspace_resize_handle_horizontal"
      @mousedown.prevent="startTrackPanelResize('horizontal', $event)"
      title="Drag to resize horizontal tracks panel"
    ></div>
    <div
      v-if="visibleTrackCount > 0"
      class="interactive-workspace_resize_handle interactive-workspace_resize_handle_vertical"
      @mousedown.prevent="startTrackPanelResize('vertical', $event)"
      title="Drag to resize vertical tracks panel"
    ></div>
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
const workspaceRoot = ref<HTMLElement | null>(null);
const cornerMiniMapTarget = ref<HTMLElement | null>(null);
const cornerMiniMapFallbackTarget = ref<HTMLElement | null>(null);

const visibleTrackCount = ref(0);
let unsubscribeTrackList: (() => void) | undefined;
const horizontalTrackPanelSizePx = ref(140);
const verticalTrackPanelSizePx = ref(140);
let trackPanelResizeState:
  | {
      orientation: "horizontal" | "vertical";
      startPointer: number;
      startSize: number;
    }
  | null = null;

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

const bindCornerMinimap = () => {
  const target =
    visibleTrackCount.value > 0
      ? cornerMiniMapTarget.value
      : cornerMiniMapFallbackTarget.value;
  if (!props.mapManager || !target) {
    props.mapManager?.clearOverviewMapTarget();
    return;
  }
  props.mapManager.addOverviewMapTarget(target);
};

const refreshWorkspaceAfterLayout = async () => {
  await nextTick();
  bindCornerMinimap();
  props.mapManager?.scheduleWorkspaceLayoutRefresh();
};

onMounted(() => {
  bindTrackVisibility();
  void refreshWorkspaceAfterLayout();
});

watch(
  () => props.mapManager,
  () => {
    bindTrackVisibility();
    void refreshWorkspaceAfterLayout();
  }
);

watch(visibleTrackCount, async () => {
  if (visibleTrackCount.value <= 0) {
    trackPanelResizeState = null;
  } else {
    if (horizontalTrackPanelSizePx.value < 60) {
      horizontalTrackPanelSizePx.value = 140;
    }
    if (verticalTrackPanelSizePx.value < 60) {
      verticalTrackPanelSizePx.value = 140;
    }
  }
  // The visible track count changes the workspace grid dimensions. OpenLayers,
  // rulers and 1D canvases all cache viewport state, so refresh them after Vue
  // has committed the new grid.
  await refreshWorkspaceAfterLayout();
});

onBeforeUnmount(() => {
  document.body.style.removeProperty("cursor");
  window.removeEventListener("mousemove", onTrackPanelResizeMove);
  window.removeEventListener("mouseup", stopTrackPanelResize);
  unsubscribeTrackList?.();
  props.mapManager?.clearOverviewMapTarget();
});

const clampTrackPanelSize = (value: number): number => {
  const root = workspaceRoot.value;
  if (!root) {
    return Math.max(60, Math.min(380, Math.round(value)));
  }
  const maxHorizontal = Math.max(60, Math.floor(root.clientHeight * 0.45));
  const maxVertical = Math.max(60, Math.floor(root.clientWidth * 0.45));
  const hardMax = Math.max(60, Math.min(maxHorizontal, maxVertical, 420));
  return Math.max(60, Math.min(hardMax, Math.round(value)));
};

const onTrackPanelResizeMove = (event: MouseEvent): void => {
  if (!trackPanelResizeState) {
    return;
  }
  if (trackPanelResizeState.orientation === "horizontal") {
    const delta = event.clientY - trackPanelResizeState.startPointer;
    horizontalTrackPanelSizePx.value = clampTrackPanelSize(
      trackPanelResizeState.startSize + delta
    );
    document.body.style.cursor = "row-resize";
  } else {
    const delta = event.clientX - trackPanelResizeState.startPointer;
    verticalTrackPanelSizePx.value = clampTrackPanelSize(
      trackPanelResizeState.startSize + delta
    );
    document.body.style.cursor = "col-resize";
  }
};

const stopTrackPanelResize = (): void => {
  if (!trackPanelResizeState) {
    return;
  }
  trackPanelResizeState = null;
  document.body.style.removeProperty("cursor");
  window.removeEventListener("mousemove", onTrackPanelResizeMove);
  window.removeEventListener("mouseup", stopTrackPanelResize);
};

const startTrackPanelResize = (
  orientation: "horizontal" | "vertical",
  event: MouseEvent
): void => {
  if (visibleTrackCount.value <= 0) {
    return;
  }
  trackPanelResizeState = {
    orientation,
    startPointer:
      orientation === "horizontal" ? event.clientY : event.clientX,
    startSize:
      orientation === "horizontal"
        ? horizontalTrackPanelSizePx.value
        : verticalTrackPanelSizePx.value,
  };
  document.body.style.cursor =
    orientation === "horizontal" ? "row-resize" : "col-resize";
  window.addEventListener("mousemove", onTrackPanelResizeMove);
  window.addEventListener("mouseup", stopTrackPanelResize);
};

const horizontalTrackPanelCssSize = computed(() =>
  visibleTrackCount.value > 0 ? `${horizontalTrackPanelSizePx.value}px` : "0px"
);
const verticalTrackPanelCssSize = computed(() =>
  visibleTrackCount.value > 0 ? `${verticalTrackPanelSizePx.value}px` : "0px"
);
const rulerPanelCssSize = "44px";
</script>

<style scoped>
.interactive-workspace {
  width: 100%;
  height: 100%;
  position: relative;
  display: grid;
  grid-template-rows: v-bind(horizontalTrackPanelCssSize) v-bind(rulerPanelCssSize) 1fr;
  grid-template-columns: v-bind(verticalTrackPanelCssSize) v-bind(rulerPanelCssSize) 1fr;
  grid-template-areas:
    "corner-track corner-tracks-ruler horizontal-tracks"
    "corner-ruler-tracks corner-ruler horizontal-ruler"
    "vertical-tracks vertical-ruler content";
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
  position: relative;
  background: inherit;
  border-right: 1px solid black;
  border-bottom: 1px solid black;
  overflow: hidden;
}

.interactive-workspace_corner_minimap {
  width: 100%;
  height: 100%;
  padding: 2px;
  box-sizing: border-box;
  border: 1px solid rgba(31, 41, 55, 0.55);
  background: inherit;
  cursor: grab;
  touch-action: none;
}

.interactive-workspace_corner_minimap :deep(.ol-viewport) {
  width: 100%;
  height: 100%;
  background: transparent;
}

.interactive-workspace_corner_minimap :deep(canvas) {
  image-rendering: auto;
}

.interactive-workspace_corner_tracks_ruler {
  grid-area: corner-tracks-ruler;
  background: inherit;
  border-right: 1px solid black;
  border-bottom: 1px solid black;
}

.interactive-workspace_corner_ruler_tracks {
  grid-area: corner-ruler-tracks;
  background: inherit;
  border-right: 1px solid black;
  border-bottom: 1px solid black;
}

.interactive-workspace_corner_ruler {
  grid-area: corner-ruler;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  background: inherit;
  border-right: 1px solid black;
  border-bottom: 1px solid black;
}

.interactive-workspace_corner_minimap--compact {
  padding: 1px;
}

.interactive-workspace_horizontal_tracks {
  grid-area: horizontal-tracks;
}

.interactive-workspace_horizontal_ruler {
  grid-area: horizontal-ruler;
  overflow: hidden;
  border-right: 1px solid black;
  border-bottom: 1px solid black;
  background: inherit;
}

.interactive-workspace_vertical_tracks {
  grid-area: vertical-tracks;
}

.interactive-workspace_vertical_ruler {
  grid-area: vertical-ruler;
  overflow: hidden;
  border-right: 1px solid black;
  border-bottom: 1px solid black;
  background: inherit;
}

.interactive-workspace_content {
  grid-area: content;
}

.interactive-workspace_resize_handle {
  position: absolute;
  z-index: 26;
  background: transparent;
}

.interactive-workspace_resize_handle_horizontal {
  left: 0;
  right: 0;
  top: v-bind(horizontalTrackPanelCssSize);
  height: 8px;
  transform: translateY(-4px);
  cursor: row-resize;
}

.interactive-workspace_resize_handle_vertical {
  top: 0;
  bottom: 0;
  left: v-bind(verticalTrackPanelCssSize);
  width: 8px;
  transform: translateX(-4px);
  cursor: col-resize;
}
</style>
