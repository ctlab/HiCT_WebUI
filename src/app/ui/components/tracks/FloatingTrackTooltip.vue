<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="panel"
      role="tooltip"
      class="track-feature-tooltip"
      :style="position"
      @mouseenter="$emit('enter')"
      @mouseleave="$emit('leave')"
      @pointerdown.stop
      @wheel.stop
    >
      <slot />
    </div>
  </Teleport>
</template>
<script setup lang="ts">
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  onUpdated,
} from "vue";
import { placeFloatingPanel } from "@/app/core/visualization/floatingPanel";
const props = defineProps<{ open: boolean; x: number; y: number }>();
const emit = defineEmits<{ (event: "enter" | "leave" | "dismiss"): void }>();
const panel = ref<HTMLElement>();
const position = ref({ left: "12px", top: "12px" });
function place() {
  const rect = panel.value?.getBoundingClientRect();
  if (!props.open || !rect) return;
  const p = placeFloatingPanel(
    props.x,
    props.y,
    rect.width,
    rect.height,
    window.innerWidth,
    window.innerHeight
  );
  const next = { left: `${p.left}px`, top: `${p.top}px` };
  if (next.left !== position.value.left || next.top !== position.value.top)
    position.value = next;
}
watch(
  () => [props.open, props.x, props.y],
  async () => {
    await nextTick();
    place();
  }
);
// Metadata can change at a stationary pointer when a new feature is rendered.
onUpdated(place);
const dismiss = () => emit("dismiss");
const escape = (e: KeyboardEvent) => {
  if (e.key === "Escape") dismiss();
};
onMounted(() => {
  window.addEventListener("resize", dismiss);
  window.addEventListener("keydown", escape);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", dismiss);
  window.removeEventListener("keydown", escape);
});
</script>
<style scoped>
.track-feature-tooltip {
  position: fixed;
  z-index: 1065;
  width: max-content;
  max-width: min(360px, calc(100vw - 24px));
  max-height: calc(100dvh - 24px);
  overflow: auto;
  overflow-wrap: anywhere;
  overscroll-behavior: contain;
  padding: 12px 14px;
  border: 1px solid #475569;
  border-radius: 10px;
  background: #1e293b;
  color: #f8fafc;
  font-size: 12px;
  line-height: 1.5;
  box-shadow: 0 8px 28px #0f172a40;
  pointer-events: auto;
}
</style>
