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
    ref="trackHost"
    class="horizontal-track-canvas-host"
    :style="trackHostStyle"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="stopPointerDrag"
    @pointercancel="stopPointerDrag"
    @wheel.prevent="onWheelForward"
    @dblclick.prevent="onDoubleClickForward"
    @mousemove="onMouseMoveFeature"
    @mouseleave="onMouseLeaveFeature"
  >
    <canvas ref="trackCanvas"></canvas>
    <div ref="statusOverlay" class="track-status-overlay"></div>
    <div
      v-if="featureTooltipVisible"
      class="track-feature-tooltip"
      :style="featureTooltipStyle"
    >
      <div class="feature-title">
        {{ featureTooltipTitle }}
      </div>
      <div class="feature-meta">
        {{ featureTooltipRange }}
      </div>
      <div v-if="featureTooltipSecondary" class="feature-meta">
        {{ featureTooltipSecondary }}
      </div>
    </div>
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
const trackHost = ref<HTMLDivElement | null>(null);
let unsubscribeRenderState: (() => void) | undefined;
let draggingPointerId: number | null = null;
let dragStartClientX = 0;
let dragCenterX = 0;
let pointerMoved = false;

const featureTooltipVisible = ref(false);
const featureTooltipTitle = ref("");
const featureTooltipRange = ref("");
const featureTooltipSecondary = ref("");
const featureTooltipStyle = ref<Record<string, string>>({
  left: "0px",
  top: "0px",
});

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

const hideFeatureTooltip = (): void => {
  featureTooltipVisible.value = false;
};

const onMouseMoveFeature = (event: MouseEvent): void => {
  if (!props.mapManager || draggingPointerId !== null) {
    hideFeatureTooltip();
    return;
  }
  const host = trackHost.value;
  if (!host) {
    hideFeatureTooltip();
    return;
  }
  const hit = props.mapManager.linearTrackManager.getFeatureHoverAt(
    "horizontal",
    event.offsetX,
    event.offsetY
  );
  if (!hit) {
    hideFeatureTooltip();
    return;
  }
  const hostRect = host.getBoundingClientRect();
  const desiredLeft = Math.min(
    hostRect.width - 250,
    Math.max(6, event.offsetX + 10)
  );
  const desiredTop = Math.min(
    hostRect.height - 70,
    Math.max(6, event.offsetY + 10)
  );
  featureTooltipStyle.value = {
    left: `${Math.round(desiredLeft)}px`,
    top: `${Math.round(desiredTop)}px`,
  };
  featureTooltipTitle.value =
    hit.label ?? hit.featureType ?? hit.trackName;
  featureTooltipRange.value = `${hit.startBp.toLocaleString()}-${hit.endBp.toLocaleString()} bp`;
  const secondaryParts: string[] = [];
  if (hit.featureType) {
    secondaryParts.push(hit.featureType);
  }
  if (hit.strand) {
    secondaryParts.push(`strand ${hit.strand}`);
  }
  secondaryParts.push(hit.trackName);
  featureTooltipSecondary.value = secondaryParts.join(" | ");
  featureTooltipVisible.value = true;
};

const onMouseLeaveFeature = (): void => {
  hideFeatureTooltip();
};

const onPointerDown = (event: PointerEvent): void => {
  if (!props.mapManager || event.button !== 0) {
    return;
  }
  const view = props.mapManager.getView();
  const center = view.getCenter();
  if (!center) {
    return;
  }
  draggingPointerId = event.pointerId;
  dragStartClientX = event.clientX;
  dragCenterX = center[0];
  pointerMoved = false;
  hideFeatureTooltip();
  trackHost.value?.setPointerCapture(event.pointerId);
  event.preventDefault();
};

const onPointerMove = (event: PointerEvent): void => {
  if (!props.mapManager || draggingPointerId !== event.pointerId) {
    return;
  }
  const view = props.mapManager.getView();
  const resolution = view.getResolution() ?? 1;
  const center = view.getCenter();
  if (!center) {
    return;
  }
  const dx = event.clientX - dragStartClientX;
  if (Math.abs(dx) > 2) {
    pointerMoved = true;
  }
  if (!pointerMoved) {
    return;
  }
  view.setCenter([dragCenterX - dx * resolution, center[1]]);
  event.preventDefault();
};

const stopPointerDrag = (event: PointerEvent): void => {
  if (draggingPointerId !== event.pointerId) {
    return;
  }
  if (!pointerMoved && props.mapManager && trackHost.value) {
    const rect = trackHost.value.getBoundingClientRect();
    const axisOffsetPx = event.clientX - rect.left;
    const crossOffsetPx = event.clientY - rect.top;
    props.mapManager.linearTrackManager.toggleFeatureSelectionAt(
      "horizontal",
      axisOffsetPx,
      crossOffsetPx
    );
  }
  draggingPointerId = null;
  pointerMoved = false;
  trackHost.value?.releasePointerCapture(event.pointerId);
};

const onWheelForward = (event: WheelEvent): void => {
  if (!props.mapManager || !trackHost.value) {
    return;
  }
  const viewport = props.mapManager.getMap().getViewport();
  const viewportRect = viewport.getBoundingClientRect();
  const hostRect = trackHost.value.getBoundingClientRect();
  const ratioX = hostRect.width > 0 ? event.offsetX / hostRect.width : 0.5;
  const clientX = viewportRect.left + viewportRect.width * ratioX;
  const clientY = viewportRect.top + viewportRect.height * 0.5;
  const forwarded = new WheelEvent("wheel", {
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaZ: event.deltaZ,
    deltaMode: event.deltaMode,
    clientX,
    clientY,
    bubbles: true,
    cancelable: true,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
  });
  viewport.dispatchEvent(forwarded);
};

const onDoubleClickForward = (event: MouseEvent): void => {
  if (!props.mapManager || !trackHost.value) {
    return;
  }
  const viewport = props.mapManager.getMap().getViewport();
  const viewportRect = viewport.getBoundingClientRect();
  const hostRect = trackHost.value.getBoundingClientRect();
  const ratioX = hostRect.width > 0 ? event.offsetX / hostRect.width : 0.5;
  const clientX = viewportRect.left + viewportRect.width * ratioX;
  const clientY = viewportRect.top + viewportRect.height * 0.5;
  const forwarded = new MouseEvent("dblclick", {
    clientX,
    clientY,
    button: 0,
    bubbles: true,
    cancelable: true,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
  });
  viewport.dispatchEvent(forwarded);
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
  hideFeatureTooltip();
});
</script>

<style scoped>
#horizontal-igv-track-div {
  position: relative;
  width: 100%;
  height: 100%;
  border: 1px solid black;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
}

#horizontal-igv-track-div:active {
  cursor: grabbing;
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

.track-feature-tooltip {
  position: absolute;
  z-index: 14;
  max-width: 240px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid rgba(17, 24, 39, 0.35);
  background: rgba(17, 24, 39, 0.9);
  color: rgba(244, 247, 252, 0.98);
  font-size: 11px;
  line-height: 1.25;
  pointer-events: none;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
}

.feature-title {
  font-weight: 700;
  margin-bottom: 2px;
}

.feature-meta {
  opacity: 0.95;
}
</style>
