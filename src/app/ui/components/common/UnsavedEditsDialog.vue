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
  <div class="unsaved-edits">
    <div class="modal-backdrop fade show unsaved-edits-backdrop"></div>
    <div
      ref="dialog"
      class="modal fade show unsaved-edits-modal"
      style="display: block"
      tabindex="-1"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="unsaved-edits-title"
      aria-describedby="unsaved-edits-body"
      @keydown="trapTab"
    >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 id="unsaved-edits-title" class="modal-title">
              Unsaved assembly edits
            </h5>
          </div>
          <div id="unsaved-edits-body" class="modal-body">
            <p class="mb-2">
              You changed the assembly since it was opened or last saved. If you
              {{ action }}, those edits are lost.
            </p>
            <p class="small text-muted mb-0">
              Saving a session keeps the edited assembly, tracks, scopes and
              processing graph. Undo history is not saved.
            </p>
            <p v-if="error" class="text-danger small mt-2 mb-0" role="alert">
              {{ error }}
            </p>
          </div>
          <div class="modal-footer">
            <button
              ref="saveButton"
              type="button"
              class="btn btn-primary"
              :disabled="busy"
              @click="emit('save')"
            >
              <span
                v-if="busy"
                class="spinner-border spinner-border-sm me-1"
                aria-hidden="true"
              ></span>
              {{ busy ? "Saving…" : "Save session" }}
            </button>
            <button
              type="button"
              class="btn btn-outline-danger"
              :disabled="busy"
              @click="emit('discard')"
            >
              Discard edits
            </button>
            <button
              type="button"
              class="btn btn-secondary"
              :disabled="busy"
              @click="emit('cancel')"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from "vue";

defineProps<{
  /** Completes the sentence "If you …", for example "close this map". */
  action: string;
  busy: boolean;
  error: string;
}>();

const emit = defineEmits<{
  (e: "save"): void;
  (e: "discard"): void;
  (e: "cancel"): void;
}>();

const dialog = ref<HTMLElement | null>(null);
const saveButton = ref<HTMLButtonElement | null>(null);
let opener: HTMLElement | null = null;

function focusable(): HTMLElement[] {
  return Array.from(
    dialog.value?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []
  );
}

/** Keeps Tab inside the dialog, as the page behind it is not usable until it is answered. */
function trapTab(event: KeyboardEvent): void {
  if (event.key !== "Tab") return;
  const items = focusable();
  if (items.length === 0) {
    event.preventDefault();
    dialog.value?.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !dialog.value?.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (
    !event.shiftKey &&
    (active === last || !dialog.value?.contains(active))
  ) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => {
  opener = document.activeElement as HTMLElement | null;
  void nextTick(() => saveButton.value?.focus());
});

onUnmounted(() => {
  // Return focus to whatever opened the dialog, if it is still on the page.
  if (opener && document.contains(opener)) opener.focus();
});
</script>

<style scoped>
.unsaved-edits-backdrop {
  z-index: 2090;
}
.unsaved-edits-modal {
  z-index: 2100;
}
</style>
