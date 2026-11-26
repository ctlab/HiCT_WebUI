<template>
  <div
    class="track-lane-divider"
    :class="orientation"
    role="separator"
    tabindex="0"
    :aria-orientation="orientation"
    :aria-label="label"
    :aria-valuemin="minimum"
    :aria-valuemax="100 - minimum"
    :aria-valuenow="Math.round(share * 100)"
    :title="label"
    @pointerdown.stop.prevent="start"
    @pointermove.stop="move"
    @pointerup.stop="stop"
    @pointercancel.stop="stop"
    @lostpointercapture="stop"
    @dblclick.stop
    @keydown="adjustWithKey"
  ></div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Orientation } from "@/app/core/mapmanagers/LinearTrackManager";

const props = defineProps<{
  orientation: Orientation;
  label: string;
  share: number;
  pairSize: number;
}>();
const emit = defineEmits<{ (event: "resize", share: number): void }>();
const minimum = computed(() =>
  Math.min(50, Math.floor((32 / Math.max(props.pairSize, 1)) * 100))
);

let drag: { pointerId: number; coordinate: number; share: number; size: number } | null = null;
const position = (event: PointerEvent) =>
  props.orientation === "horizontal" ? event.clientY : event.clientX;

function update(share: number) {
  const min = minimum.value / 100;
  emit("resize", Math.max(min, Math.min(1 - min, share)));
}

function start(event: PointerEvent) {
  if (event.button !== 0 || props.pairSize <= 0) return;
  const divider = event.currentTarget as HTMLElement;
  divider.focus({ preventScroll: true });
  divider.setPointerCapture(event.pointerId);
  drag = {
    pointerId: event.pointerId,
    coordinate: position(event),
    share: props.share,
    size: props.pairSize,
  };
}

function move(event: PointerEvent) {
  if (!drag || drag.pointerId !== event.pointerId) return;
  update(drag.share + (position(event) - drag.coordinate) / drag.size);
}

function stop(event: PointerEvent) {
  if (drag?.pointerId === event.pointerId) drag = null;
}

function adjustWithKey(event: KeyboardEvent) {
  const horizontal = props.orientation === "horizontal";
  const backward = horizontal ? "ArrowUp" : "ArrowLeft";
  const forward = horizontal ? "ArrowDown" : "ArrowRight";
  if (event.key !== backward && event.key !== forward) return;
  event.preventDefault();
  if (props.pairSize > 0) {
    update(props.share + (event.key === forward ? 8 : -8) / props.pairSize);
  }
}
</script>

<style scoped>
.track-lane-divider {
  position: absolute;
  z-index: 13;
  display: grid;
  place-items: center;
  touch-action: none;
}
.track-lane-divider::before {
  content: "";
  background: #a7b0bb;
}
.track-lane-divider:hover::before,
.track-lane-divider:focus-visible::before {
  background: #2563eb;
}
.track-lane-divider.horizontal {
  inset-inline: 0 5px;
  height: 8px;
  transform: translateY(-50%);
  cursor: row-resize;
}
.track-lane-divider.horizontal::before {
  width: 100%;
  height: 1px;
}
.track-lane-divider.vertical {
  inset-block: 0 5px;
  width: 8px;
  transform: translateX(-50%);
  cursor: col-resize;
}
.track-lane-divider.vertical::before {
  width: 1px;
  height: 100%;
}
</style>
