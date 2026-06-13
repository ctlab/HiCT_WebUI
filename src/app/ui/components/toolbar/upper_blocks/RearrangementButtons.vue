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
  <div class="block-of-buttons">
    <button
      class="btn btn-outline-primary"
      type="button"
      ref="reverseSelectionButton"
      data-bs-toggle="popover"
      data-bs-placement="right"
      data-bs-html="true"
      data-bs-title="Reverse Selection"
      data-bs-content="First select a range of contigs on the map using Shift + hold left mouse key. Then press this button to reverse a range covered by the selection"
      @click="props.mapManager?.eventManager.onReverseSelectionClicked"
    >
      <i class="bi bi-arrow-repeat"></i>
    </button>
    <button
      class="btn"
      :class="{
        'btn-primary': translocationMode,
        'btn-outline-primary': !translocationMode,
      }"
      type="button"
      ref="translocationButton"
      data-bs-toggle="popover"
      data-bs-placement="right"
      data-bs-html="true"
      data-bs-title="Enter translocation mode"
      data-bs-content="First select a range of contigs on the map using Shift + left mouse key. Then press this button and use your mouse cursor to insert it between neighbouring contigs. Press on the highlighted triangle inside the contig border to insert the range there."
      @click="translocationClick"
    >
      <i class="bi bi-arrows-move"></i>
    </button>
    <button
      class="btn btn-outline-primary"
      type="button"
      data-bs-toggle="tooltip"
      data-bs-placement="right"
      data-bs-html="true"
      title="Split contig at bin"
      @click="props.mapManager?.eventManager.onSplitContigClicked"
    >
      <i class="bi bi-scissors"></i>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { Popover } from "bootstrap";

const props = defineProps<{
  readonly mapManager?: ContactMapManager | undefined;
}>();

const translocationMode = ref(false);
const reverseSelectionButton = ref<HTMLElement | null>(null);
const translocationButton = ref<HTMLElement | null>(null);
const popovers = ref<Popover[]>([]);

onMounted(() => {
  const sharedOptions = {
    trigger: "hover focus" as const,
    delay: { show: 1000, hide: 150 },
    container: "body",
    fallbackPlacements: ["right", "left", "top", "bottom"],
  };
  popovers.value = [reverseSelectionButton, translocationButton]
    .map((buttonRef) =>
      buttonRef.value
        ? new Popover(buttonRef.value, {
            ...sharedOptions,
            customClass: "hict-toolbar-help-popover",
          })
        : null
    )
    .filter((popover): popover is Popover => popover !== null);
});

onBeforeUnmount(() => {
  popovers.value.forEach((popover) => popover.dispose());
  popovers.value = [];
});

function translocationClick() {
  props.mapManager?.eventManager.onMoveSelectionClicked();
}
</script>

<style scoped>
.block-of-buttons {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
