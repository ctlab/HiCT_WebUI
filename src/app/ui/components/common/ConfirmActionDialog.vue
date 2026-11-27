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
  <div class="confirm-action">
    <div class="modal-backdrop fade show"></div>
    <div
      ref="dialog"
      class="modal fade show"
      style="display: block"
      tabindex="-1"
      role="alertdialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      :aria-describedby="bodyId"
      @keydown="trapTab"
      @click.self="emit('cancel')"
    >
      <div class="modal-dialog modal-dialog-centered" :style="{ maxWidth: wide ? '540px' : '440px' }">
        <div class="modal-content hict-modal">
          <div class="hict-modal-head">
            <div class="hict-modal-icon" :class="tone" aria-hidden="true">
              <i class="bi" :class="icon"></i>
            </div>
            <h5 :id="titleId" class="hict-modal-title">{{ title }}</h5>
          </div>
          <div :id="bodyId" class="hict-modal-text"><slot /></div>
          <div class="hict-modal-foot">
            <label v-if="dontAskAgain !== undefined" class="left hict-check">
              <input
                type="checkbox"
                :checked="dontAskAgain"
                @change="emit('update:dontAskAgain', ($event.target as HTMLInputElement).checked)"
              />
              Don’t ask again
            </label>
            <button v-if="secondaryLabel" type="button" class="hict-btn link left" @click="emit('secondary')">
              {{ secondaryLabel }}
            </button>
            <button ref="cancelButton" type="button" class="hict-btn" @click="emit('cancel')">
              {{ cancelLabel ?? "Cancel" }}
            </button>
            <button
              type="button"
              class="hict-btn"
              :class="tone === 'danger' ? 'danger' : 'primary'"
              :disabled="busy"
              @click="emit('confirm')"
            >
              <span v-if="busy" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
              <i v-else-if="confirmIcon" class="bi" :class="confirmIcon" aria-hidden="true"></i>
              {{ confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";

const props = defineProps<{
  title: string;
  confirmLabel: string;
  tone: "danger" | "info" | "warn";
  icon: string; // bootstrap-icons class, e.g. "bi-ui-checks-grid"
  confirmIcon?: string;
  cancelLabel?: string;
  secondaryLabel?: string;
  dontAskAgain?: boolean;
  busy?: boolean;
  wide?: boolean;
}>();

const emit = defineEmits<{
  (e: "confirm"): void;
  (e: "cancel"): void;
  (e: "secondary"): void;
  (e: "update:dontAskAgain", value: boolean): void;
}>();

const uid = Math.random().toString(36).slice(2, 8);
const titleId = `confirm-title-${uid}`;
const bodyId = `confirm-body-${uid}`;
const dialog = ref<HTMLElement | null>(null);
const cancelButton = ref<HTMLButtonElement | null>(null);

useEscDismissableDialog({
  priority: 2300,
  isOpen: () => true,
  requestClose: () => emit("cancel"),
  canClose: () => !props.busy,
});

function trapTab(event: KeyboardEvent): void {
  if (event.key !== "Tab") return;
  const items = Array.from(
    dialog.value?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])") ?? []
  );
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

let returnFocus: HTMLElement | undefined;
onMounted(async () => {
  if (document.activeElement instanceof HTMLElement) returnFocus = document.activeElement;
  await nextTick();
  cancelButton.value?.focus(); // focus starts on Cancel
});

onBeforeUnmount(() => {
  const previous = returnFocus;
  void nextTick(() => {
    if (previous?.isConnected && document.activeElement === document.body) previous.focus();
  });
});
</script>

<style scoped>
.hict-modal { width: 440px; background: #fff; border-radius: 12px; box-shadow: var(--hict-surface-shadow); overflow: hidden; }
.hict-modal-head { display: flex; align-items: flex-start; gap: 12px; padding: 20px 20px 4px; }
.hict-modal-icon { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex: none; font-size: 19px; }
.hict-modal-icon.danger { background: var(--hict-danger-soft); color: var(--hict-danger); }
.hict-modal-icon.info { background: var(--hict-primary-soft); color: var(--hict-primary); }
.hict-modal-icon.warn { background: var(--hict-warning-soft); color: var(--hict-warning); }
.hict-modal-title { font-size: var(--hict-text-lg); font-weight: 650; margin: 8px 0 0; }
.hict-modal-text { padding: 4px 20px 0 72px; font-size: var(--hict-text-md); color: #475467; line-height: 1.5; }
.hict-modal-text ul { padding-left: 18px; margin: 8px 0 0; }
.hict-modal-foot { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; padding: 20px; }
.hict-modal-foot .left { margin-right: auto; }
.hict-btn { height: 36px; padding: 0 14px; border-radius: 8px; font-size: var(--hict-text-md); font-weight: 600; border: 1px solid #d0d5dd; background: #fff; color: #344054; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.hict-btn.primary { background: var(--hict-primary); border-color: var(--hict-primary); color: #fff; }
.hict-btn.danger { background: var(--hict-danger); border-color: var(--hict-danger); color: #fff; }
.hict-btn.link { border: 0; background: none; color: var(--hict-primary); padding: 0 4px; }
.hict-btn:focus-visible { outline: none; box-shadow: var(--hict-focus-ring); }
.hict-btn[disabled] { opacity: .45; }


.hict-modal { width: 100%; border: 0; max-height: min(90vh, 720px); }
.hict-modal-text { overflow-y: auto; }
.modal-backdrop { background: rgb(15 23 38); opacity: 0.42; }
</style>
