<template>
  <Teleport to="body">
    <div
      ref="menu"
      class="axis-context-menu"
      role="menu"
      :aria-label="title || 'Actions'"
      :style="{ left: `${position.x}px`, top: `${position.y}px` }"
      @contextmenu.prevent
      @keydown="onKeydown"
    >
      <div v-if="title" class="axis-context-title">{{ title }}</div>
      <button
        v-for="(item, index) in items"
        :key="`${index}-${item.label}`"
        type="button"
        role="menuitem"
        :disabled="item.disabled"
        @click="activate(item)"
      >
        {{ item.label }}
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { toast } from "vue-sonner";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
import type { ContextMenuItem } from "@/app/core/mapmanagers/contextMenuActions";

const props = defineProps<{
  items: ContextMenuItem[];
  title?: string;
  x: number;
  y: number;
}>();
const emit = defineEmits<{ (e: "close"): void }>();

const menu = ref<HTMLElement>();
const position = ref({ x: props.x, y: props.y });

useEscDismissableDialog({
  priority: 1060,
  isOpen: () => true,
  requestClose: () => emit("close"),
});

function enabledButtons(): HTMLButtonElement[] {
  return Array.from(
    menu.value?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ??
      []
  );
}

function activate(item: ContextMenuItem): void {
  emit("close");
  try {
    item.run();
  } catch (failure) {
    toast.error(`${item.label} failed: ${String(failure)}`);
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Tab") {
    emit("close");
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const buttons = enabledButtons();
  if (buttons.length === 0) return;
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
      ? buttons.length - 1
      : (index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) %
        buttons.length;
  buttons[next]?.focus();
}

function onOutsidePointerDown(event: Event): void {
  if (!menu.value?.contains(event.target as Node)) emit("close");
}

function onWheel(event: Event): void {
  if (!menu.value?.contains(event.target as Node)) emit("close");
}

function onResize(): void {
  emit("close");
}

onMounted(async () => {
  document.addEventListener("pointerdown", onOutsidePointerDown, true);
  window.addEventListener("wheel", onWheel, { capture: true, passive: true });
  window.addEventListener("resize", onResize);
  await nextTick();
  const rect = menu.value?.getBoundingClientRect();
  if (rect) {
    position.value = {
      x: Math.max(8, Math.min(props.x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(props.y, window.innerHeight - rect.height - 8)),
    };
  }
  enabledButtons()[0]?.focus();
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onOutsidePointerDown, true);
  window.removeEventListener("wheel", onWheel, { capture: true });
  window.removeEventListener("resize", onResize);
});
</script>

<style scoped>
.axis-context-menu {
  position: fixed;
  z-index: 2300;
  min-width: 14rem;
  max-width: min(22rem, calc(100vw - 16px));
  max-height: calc(100vh - 16px);
  overflow: auto;
  padding: 0.4rem;
  border: 1px solid var(--hict-ui-border, #cbd5e1);
  background: var(--hict-surface-bg, #fff);
  color: var(--hict-surface-fg, #172033);
  border-radius: 0.4rem;
  box-shadow: 0 4px 24px #0003;
}
.axis-context-title {
  font-weight: 600;
  overflow-wrap: anywhere;
  padding: 0.4rem;
}
.axis-context-menu button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.4rem 0.6rem;
  border: 0;
  color: inherit;
  background: transparent;
  border-radius: 0.25rem;
}
.axis-context-menu button:hover:not(:disabled),
.axis-context-menu button:focus-visible {
  background: #dbeafe;
  color: #172033;
}
.axis-context-menu button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
