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
  <div class="upper-frame">
    <NavigationBar
      :networkManager="props.networkManager"
      :mapManager="props.mapManager"
      @selected="onFileSelected"
      @closed="onClosed"
      @attached="onAttached"
      @saveSession="onSaveSession"
      @openSession="onOpenSession"
      @agpLoaded="onAgpLoaded"
      @fastaLinked="onFastaLinked"
      @wizardRequested="onWizardRequested"
    ></NavigationBar>
    <HeaderRibbon :mapManager="props.mapManager"></HeaderRibbon>
  </div>
</template>

<script setup lang="ts">
import NavigationBar from "@/app/ui/components/upper_ribbon/NavigationBar.vue";
import HeaderRibbon from "@/app/ui/components/upper_ribbon/HeaderRibbon.vue";
import type { NetworkManager } from "@/app/core/net/NetworkManager.js";
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
const emit = defineEmits<{
  (e: "selected", filename: string): void;
  (e: "closed"): void;
  (e: "attached"): void;
  (e: "saveSession"): void;
  (e: "openSession", file: File): void;
  (e: "agpLoaded", filename: string): void;
  (e: "fastaLinked", filename: string): void;
  (e: "wizardRequested"): void;
}>();

const props = defineProps<{
  networkManager: NetworkManager;
  mapManager?: ContactMapManager;
}>();

function onFileSelected(filename: string): void {
  emit("selected", filename);
}

function onClosed(): void {
  emit("closed");
}

function onAttached(): void {
  emit("attached");
}

function onSaveSession(): void {
  emit("saveSession");
}

function onOpenSession(file: File): void {
  emit("openSession", file);
}

function onAgpLoaded(filename: string): void {
  emit("agpLoaded", filename);
}

function onFastaLinked(filename: string): void {
  emit("fastaLinked", filename);
}

function onWizardRequested(): void {
  emit("wizardRequested");
}
</script>

<style scoped>
.upper-frame {
  /* navbar&header */

  /* Auto layout */
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 0px;

  /* position: absolute; */
  /* width: 1840px; */
  width: 100%;
  /* TODO: Константа глобальная */
  height: 109px;
  left: 0px;
  top: 0px;
}
</style>
