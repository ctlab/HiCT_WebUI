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
  <div class="workspace-component">
    <ToolBar :mapManager="props.mapManager"></ToolBar>
    <InteractiveWorkspace
      :map-manager="props.mapManager"
      :filename="filename"
    ></InteractiveWorkspace>
    <SideBar :mapManager="props.mapManager"></SideBar>
  </div>
</template>

<script setup lang="ts">
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import InteractiveWorkspace from "@/app/ui/components/workspace/InteractiveWorkspace.vue";
import ToolBar from "@/app/ui/components/toolbar/ToolBar.vue";
import SideBar from "@/app/ui/components/sidebar/SideBar.vue";

const props = defineProps<{
  mapManager: ContactMapManager | undefined;
  filename?: string;
}>();
</script>

<style scoped>
.workspace-component {
  display: flex;
  /* background-color: orange; */
  height: calc(100% - 109px);
}
</style>
