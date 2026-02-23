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
  <div class="toolbar-outer">
    <div class="toolbar-upper">
      <FirstBlock :map-manager="props.mapManager"></FirstBlock>
      <RearrangementButtons
        :map-manager="props.mapManager"
      ></RearrangementButtons>
      <ScaffoldingButtons :map-manager="props.mapManager"></ScaffoldingButtons>
      <ThirdBlock :map-manager="props.mapManager"></ThirdBlock>
    </div>
    <div class="toolbar-bottom">
      <BottomButtons></BottomButtons>
    </div>
  </div>
</template>

<script setup lang="ts">
import FirstBlock from "@/app/ui/components/toolbar/upper_blocks/FirstBlock.vue";
import ThirdBlock from "@/app/ui/components/toolbar/upper_blocks/ThirdBlock.vue";
import BottomButtons from "@/app/ui/components/toolbar/bottom_blocks/BottomButtons.vue";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import RearrangementButtons from "./upper_blocks/RearrangementButtons.vue";
import ScaffoldingButtons from "./upper_blocks/ScaffoldingButtons.vue";

const props = defineProps<{
  readonly mapManager?: ContactMapManager | undefined;
}>();
</script>

<style scoped>
.toolbar-outer {
  /* Auto layout */
  display: flex;
  flex-direction: column;
  align-items: center;
  /* justify-content: space-between;  c  */
  padding: 16px 4px;
  gap: 6px;

  width: 60px;
  /* height: 100%; TODO: сделать иначе  */

  /* Global/07. Light */
  background: #f8f9fa;

  /* Shadows/02. Regular */
  box-shadow: 0px 8px 16px rgba(0, 0, 0, 0.15);
}

.toolbar-upper {
  /* upper block */

  /* Auto layout */
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 0px;
  gap: 24px;

  width: 44px;
}

/* .toolbar-bottom {
  background-color: green;
} */
</style>
