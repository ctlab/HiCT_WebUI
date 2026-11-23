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
  <details
    class="hict-advanced"
    :open="open"
    :data-advanced-id="dialogId"
    @toggle="onToggle"
    @invalid.capture="onInvalid"
  >
    <summary>
      Advanced<span v-if="hint" class="hict-advanced-hint">{{ hint }}</span>
    </summary>
    <div class="hict-advanced-body">
      <slot />
    </div>
  </details>
</template>

<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{
  /** Stable id of the dialog or panel, e.g. "matrix-export", "sidebar-visualization". */
  dialogId: string;
  /** Short, lower-case list of what is inside, e.g. "threads, compression". */
  hint?: string;
}>();

const storageKey = `hict.ui.advanced.${props.dialogId}`;
const emit = defineEmits<{ (event: "open-change", open: boolean): void }>();

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

const open = ref(readOpen());

function onToggle(event: Event): void {
  const next = (event.target as HTMLDetailsElement).open;
  open.value = next;
  emit("open-change", next);
  try {
    window.localStorage.setItem(storageKey, next ? "1" : "0");
  } catch {
    /* Private window or blocked storage: the section still works, it just is not remembered. */
  }
}

function onInvalid(event: Event): void {
  const details = event.currentTarget as HTMLDetailsElement;
  details.open = true;
}
</script>

<style scoped>
.hict-advanced {
  border-top: 1px solid #eaecf0;
  padding-top: 8px;
}
.hict-advanced > summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
  font-weight: 650;
  color: #344054;
  padding: 4px 0;
  user-select: none;
}
.hict-advanced > summary::-webkit-details-marker {
  display: none;
}
.hict-advanced > summary::before {
  content: "\F285"; /* bootstrap-icons chevron-right */
  font-family: "bootstrap-icons";
  font-size: 11px;
  color: #667085;
  transition: transform 0.15s ease;
}
.hict-advanced[open] > summary::before {
  transform: rotate(90deg);
}
.hict-advanced > summary:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(13, 110, 253, 0.28);
  border-radius: 4px;
}
.hict-advanced-hint {
  margin-left: auto;
  font-weight: 400;
  font-size: 0.75rem;
  color: #667085;
}
.hict-advanced-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 0 4px 18px;
}
</style>
