<template>
  <div
    ref="rail"
    class="signal-range"
    :class="{ 'handles-close': close }"
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
      :aria-label="`${side === 'lower' ? 'Lower' : 'Upper'} threshold`"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-valuenow="side === 'lower' ? lower : upper"
      :aria-valuetext="side === 'lower' ? lowerText : upperText"
      :title="`${side === 'lower' ? 'Lower' : 'Upper'}: ${
        side === 'lower' ? lowerText : upperText
      }`"
      :style="{ left: `${fraction(side === 'lower' ? lower : upper) * 100}%` }"
      @pointerdown.stop="start($event, side)"
      @keydown="key($event, side)"
    ></button>
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
type Side = "lower" | "upper";
const sides: Side[] = ["lower", "upper"];
const props = defineProps<{
  min: number;
  max: number;
  lower: number;
  upper: number;
  lowerText: string;
  upperText: string;
  lowerColor: string;
  upperColor: string;
}>();
const emit = defineEmits<{ (event: "lower" | "upper", value: number): void }>();
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
}));
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
function start(event: PointerEvent, side?: Side) {
  if (event.button !== 0 || !rail.value || !(props.max > props.min)) return;
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
  if (drag?.pointer === event.pointerId) {
    change(drag.side, at(event));
    event.preventDefault();
  }
}
function stop(event: PointerEvent) {
  if (drag?.pointer !== event.pointerId) return;
  if (rail.value?.hasPointerCapture(event.pointerId))
    rail.value.releasePointerCapture(event.pointerId);
  drag = undefined;
}
function key(event: KeyboardEvent, side: Side) {
  const current = side === "lower" ? props.lower : props.upper;
  const step = (props.max - props.min) / (event.shiftKey ? 1000 : 100);
  const values: Record<string, number> = {
    ArrowLeft: current - step,
    ArrowDown: current - step,
    ArrowRight: current + step,
    ArrowUp: current + step,
    PageDown: current - step * 10,
    PageUp: current + step * 10,
    Home: props.min,
    End: props.max,
  };
  if (event.key in values) {
    change(side, values[event.key]);
    event.preventDefault();
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
.range-rail {
  left: 0;
  right: 0;
  background: #e2e8f0;
  border: 1px solid #cbd5e1;
}
.range-fill {
  background: linear-gradient(90deg, var(--lower-color), var(--upper-color));
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
.handles-close .lower {
  top: 30px;
}
.handles-close .upper {
  top: 12px;
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
