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
      data-bs-toggle="tooltip"
      data-bs-placement="right"
      title="Reverse selection"
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
      data-bs-toggle="tooltip"
      data-bs-placement="right"
      title="Enter translocation mode"
      ref="translocationButton"
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
import { ref } from "vue";

const props = defineProps<{
  readonly mapManager?: ContactMapManager | undefined;
}>();

const translocationMode = ref(false);

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
