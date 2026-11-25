<template>
  <div
    ref="rail"
    class="signal-range"
    :class="{
      'handles-close': close,
      'has-midpoint': midpoint !== undefined,
    }"
    :style="colors"
    role="group"
    aria-label="Signal thresholds"
    @pointerdown="start($event)"
    @pointermove="move"
    @pointerup="stop"
    @pointercancel="stop"
  >
    <div class="range-rail"></div>
    <div
      class="range-fill"
      :style="{
        left: `${fraction(lower) * 100}%`,
        right: `${100 - fraction(upper) * 100}%`,
      }"
    ></div>
    <button
      v-for="side in sides"
      :key="side"
      type="button"
      class="range-handle"
      :class="side"
      role="slider"
      :aria-label="
        side === 'midpoint'
          ? 'Color midpoint'
          : `${side === 'lower' ? 'Lower' : 'Upper'} threshold`
      "
      :aria-valuemin="side === 'midpoint' ? lower : min"
      :aria-valuemax="side === 'midpoint' ? upper : max"
      :aria-valuenow="valueFor(side)"
      :aria-valuetext="textFor(side)"
      :title="
        side === 'midpoint'
          ? `Color midpoint: ${midpointText}. Drag to adjust colors without transforming signal.`
          : `${side}: ${textFor(side)}`
      "
      :style="{ left: `${fraction(valueFor(side)) * 100}%` }"
      @pointerdown.stop="start($event, side)"
      @contextmenu="side === 'midpoint' && removeMidpoint($event)"
      @keydown="key($event, side)"
    ></button>
    <button
      v-for="(point, index) in points"
      :key="index"
      type="button"
      class="range-handle midpoint"
      role="slider"
      :aria-label="'Curve point ' + (index + 1)"
      :aria-valuemin="lower"
      :aria-valuemax="upper"
      :aria-valuenow="point"
      :style="{ left: fraction(point) * 100 + '%' }"
      @contextmenu.stop.prevent="emit('remove', index)"
      @keydown.delete.prevent="emit('remove', index)"
      @keydown.left.prevent="emit('point', index, point - (max - min) / 100)"
      @keydown.right.prevent="emit('point', index, point + (max - min) / 100)"
      @pointerdown.stop="startPoint($event, index)"
    ></button>
  </div>
  <div v-if="$slots.histogram" class="range-histogram">
    <slot name="histogram" />
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
type Side = "lower" | "upper" | "midpoint";
const sides = computed<Side[]>(() =>
  props.midpoint === undefined
    ? ["lower", "upper"]
    : ["lower", "upper", "midpoint"]
);
const props = defineProps<{
  min: number;
  max: number;
  lower: number;
  upper: number;
  lowerText: string;
  upperText: string;
  lowerColor: string;
  upperColor: string;
  neutral?: number;
  points?: number[];
  midpoint?: number;
  midpointText?: string;
  gradient?: string;
}>();
const emit = defineEmits<{
  (event: "lower" | "upper" | "midpoint", value: number): void;
  (event: "remove", index: number): void;
  (event: "point", index: number, value: number): void;
  (event: "adjustment-start"): void;
}>();
const rail = ref<HTMLElement>();
const width = ref(300);
let observer: ResizeObserver | undefined;
let drag: { pointer: number; side: Side } | undefined;
const fraction = (value: number) =>
  props.max > props.min
    ? Math.max(0, Math.min(1, (value - props.min) / (props.max - props.min)))
    : 0;
const close = computed(
  () => (fraction(props.upper) - fraction(props.lower)) * width.value < 26
);
const colors = computed(() => ({
  "--lower-color": props.lowerColor,
  "--upper-color": props.upperColor,
  "--range-gradient":
    props.gradient ??
    (props.neutral != null && props.upper > props.lower
      ? `linear-gradient(90deg, ${props.lowerColor}, white ${Math.max(
          0,
          Math.min(
            100,
            (100 * (props.neutral - props.lower)) / (props.upper - props.lower)
          )
        )}%, ${props.upperColor})`
      : `linear-gradient(90deg, ${props.lowerColor}, ${props.upperColor})`),
}));
const valueFor = (side: Side) =>
  side === "midpoint"
    ? props.midpoint!
    : side === "lower"
    ? props.lower
    : props.upper;
const textFor = (side: Side) =>
  side === "midpoint"
    ? props.midpointText
    : side === "lower"
    ? props.lowerText
    : props.upperText;
function change(side: Side, value: number) {
  if (Number.isFinite(value))
    emit(side, Math.max(props.min, Math.min(props.max, value)));
}
function at(event: PointerEvent) {
  const box = rail.value!.getBoundingClientRect();
  return (
    props.min +
    Math.max(
      0,
      Math.min(1, (event.clientX - box.left) / Math.max(1, box.width))
    ) *
      (props.max - props.min)
  );
}
let pointDrag: { id: number; index: number } | undefined;
function removeMidpoint(event: MouseEvent) {
  event.preventDefault();
  emit("remove", 0);
}
function startPoint(event: PointerEvent, index: number) {
  if (event.button !== 0 || !rail.value) return;
  emit("adjustment-start");
  pointDrag = { id: event.pointerId, index };
  rail.value.setPointerCapture(event.pointerId);
  event.preventDefault();
}
function start(event: PointerEvent, side?: Side) {
  if (event.button !== 0 || !rail.value || !(props.max > props.min)) return;
  emit("adjustment-start");
  const value = at(event);
  side ??=
    Math.abs(value - props.lower) < Math.abs(value - props.upper)
      ? "lower"
      : "upper";
  drag = { pointer: event.pointerId, side };
  rail.value.setPointerCapture(event.pointerId);
  rail.value
    .querySelector<HTMLButtonElement>(`.range-handle.${side}`)
    ?.focus({ preventScroll: true });
  // Grabbing a handle must not jump its value before the pointer moves.
  if (!(event.target as HTMLElement).classList.contains("range-handle"))
    change(side, value);
  event.preventDefault();
}
function move(event: PointerEvent) {
  if (pointDrag?.id === event.pointerId)
    emit("point", pointDrag.index, at(event));
  if (drag?.pointer === event.pointerId) {
    change(drag.side, at(event));
    event.preventDefault();
  }
}
function stop(event: PointerEvent) {
  if (drag?.pointer !== event.pointerId && pointDrag?.id !== event.pointerId)
    return;
  pointDrag = undefined;
  if (rail.value?.hasPointerCapture(event.pointerId))
    rail.value.releasePointerCapture(event.pointerId);
  drag = undefined;
}
function key(event: KeyboardEvent, side: Side) {
  const current = valueFor(side);
  const lower = side === "midpoint" ? props.lower : props.min;
  const upper = side === "midpoint" ? props.upper : props.max;
  const step = (upper - lower) / (event.shiftKey ? 1000 : 100);
  const values: Record<string, number> = {
    ArrowLeft: current - step,
    ArrowDown: current - step,
    ArrowRight: current + step,
    ArrowUp: current + step,
    PageDown: current - step * 10,
    PageUp: current + step * 10,
    Home: lower,
    End: upper,
  };
  if (event.key in values) {
    emit("adjustment-start");
    change(side, values[event.key]);
    event.preventDefault();
    event.stopPropagation();
  }
}
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    width.value = entries[0].contentRect.width;
  });
  if (rail.value) observer.observe(rail.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>
<style scoped>
.signal-range {
  height: 42px;
  position: relative;
  margin: 0 10px;
  touch-action: none;
  cursor: pointer;
}
.range-rail,
.range-fill {
  position: absolute;
  top: 18px;
  height: 6px;
  border-radius: 4px;
  pointer-events: none;
}
.range-histogram {
  margin: -10px 10px 0;
}
.range-rail {
  left: 0;
  right: 0;
  background: #e2e8f0;
  border: 1px solid #cbd5e1;
}
.range-fill {
  background: var(--range-gradient);
  border: 1px solid #94a3b8;
}
.range-handle {
  position: absolute;
  top: 21px;
  width: 18px;
  height: 18px;
  transform: translate(-50%, -50%);
  padding: 0;
  border-radius: 50%;
  border: 2px solid white;
  box-shadow: 0 0 0 1px #64748b, 0 2px 4px #0f172a30;
  cursor: grab;
}
.lower {
  background: var(--lower-color);
}
.upper {
  background: var(--upper-color);
}
.midpoint {
  top: 7px;
  width: 10px;
  height: 10px;
  border-radius: 1px;
  background: #64748b;
  transform: translate(-50%, -50%) rotate(45deg);
}
.midpoint::after {
  content: "";
  position: absolute;
  inset: -7px;
}
.midpoint:focus-visible {
  outline: 2px solid #0d6efd;
  outline-offset: 4px;
}
.handles-close .lower {
  top: 30px;
}
.handles-close .upper {
  top: 12px;
}
.has-midpoint.handles-close {
  margin-top: 16px;
}
.has-midpoint.handles-close .midpoint {
  top: -8px;
}
.range-handle:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 3px;
  z-index: 2;
}
.range-handle:active {
  cursor: grabbing;
}
</style>
