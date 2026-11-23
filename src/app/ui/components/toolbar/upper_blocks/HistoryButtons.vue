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
  <div class="block-of-buttons tb-history" role="group" aria-label="Edit history">
    <button
      type="button"
      class="btn btn-outline-primary"
      :disabled="!canUndo"
      :title="undoTitle"
      aria-label="Undo"
      @click="restore('undo')"
    >
      <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
    </button>
    <button
      type="button"
      class="btn btn-outline-primary"
      :disabled="!canRedo"
      :title="redoTitle"
      aria-label="Redo"
      @click="restore('redo')"
    >
      <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { reportFailure } from "@/app/ui/reportFailure";
import { hasAnyOpenEscDialog } from "@/app/ui/escapeDialogRegistry";
// Use the same failure helper the other toolbar blocks use (see ScaffoldingButtons.vue: reportFailure).

const props = defineProps<{ mapManager?: ContactMapManager }>();

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl";

const requestManager = computed(
  () => props.mapManager?.networkManager.requestManager
);
const summary = computed(() => requestManager.value?.history.summary ?? null);
const busy = computed(
  () =>
    !requestManager.value ||
    requestManager.value.history.busy > 0 ||
    requestManager.value.sequenceViewReadOnly
);
const canUndo = computed(() => !busy.value && !!summary.value?.canUndo);
const canRedo = computed(() => !busy.value && !!summary.value?.canRedo);

// If the journal page with entry labels is cached on the history state, name the action,
// e.g. "Undo: Reverse Ch1 (Ctrl+Z)". Otherwise fall back to the generic text.
const undoTitle = computed(() =>
  !props.mapManager
    ? "Open a map to edit"
    : canUndo.value
    ? `Undo (${mod}+Z)`
    : "Nothing to undo"
);
const redoTitle = computed(() =>
  !props.mapManager
    ? "Open a map to edit"
    : canRedo.value
    ? `Redo (${mod}+Shift+Z)`
    : "Nothing to redo"
);

async function restore(action: "undo" | "redo"): Promise<void> {
  if (!requestManager.value) return;
  if (action === "undo" ? !canUndo.value : !canRedo.value) return;
  try {
    await requestManager.value.restoreAssemblyHistory(action);
  } catch (error) {
    reportFailure(action === "undo" ? "Undo" : "Redo", error);
  }
}

function keyboard(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.repeat || event.altKey) return;
  if (!(event.ctrlKey || event.metaKey)) return;
  const element = event.target instanceof Element ? event.target : null;
  if (
    element?.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'
    )
  )
    return;
  if (
    hasAnyOpenEscDialog() ||
    document.querySelector('.modal.show, [role="dialog"][aria-modal="true"]')
  )
    return;
  const key = event.key.toLowerCase();
  const action =
    key === "z" ? (event.shiftKey ? "redo" : "undo") : key === "y" && !event.shiftKey ? "redo" : null;
  if (!action || !summary.value) return;
  event.preventDefault();
  void restore(action);
}

onMounted(() => window.addEventListener("keydown", keyboard));
onUnmounted(() => window.removeEventListener("keydown", keyboard));
</script>

<style scoped>
.tb-history { display: flex; flex-direction: column; gap: 6px; padding-bottom: 8px; margin-bottom: 4px; border-bottom: 1px solid #e3e7ec; }
.tb-history .btn { height: 34px; }


.tb-history .btn { width: var(--hict-toolbar-btn); }
</style>
