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
  <div :class="iwsClass" :style="iwcStyle">
    <div class="interactive-workspace_tracknames">
      <TrackNames></TrackNames>
    </div>
    <div class="interactive-workspace_horizontal">
      <HorizontalIGVTrack></HorizontalIGVTrack>
    </div>
    <div class="interactive-workspace_vertical">
      <VerticalIGVTrack></VerticalIGVTrack>
    </div>
    <div class="interactive-workspace_content">
      <ContactMap :map-manager="props.mapManager"></ContactMap>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ContactMapManager,
  // type ContactMapManagerOptions,
} from "@/app/core/mapmanagers/ContactMapManager";
import TrackNames from "./TrackNames.vue";
import HorizontalIGVTrack from "../tracks/HorizontalIGVTrack.vue";
import ContactMap from "../../contactmap/ContactMap.vue";
import VerticalIGVTrack from "../tracks/VerticalIGVTrack.vue";

import { useStyleStore } from "@/app/stores/styleStore";
import { ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { ColorTranslator } from "colortranslator";

const stylesStore = useStyleStore();

const { mapBackgroundColor } = storeToRefs(stylesStore);

const iwsClass = ref("interactive-workspace");
const iwcStyle = ref({
  "background-color": mapBackgroundColor.value.RGB,
});

watch(
  () => mapBackgroundColor.value.RGB,
  () => {
    iwcStyle.value["background-color"] = mapBackgroundColor.value.RGB;
  }
);

const props = defineProps<{
  mapManager: ContactMapManager | undefined;
  filename?: string;
}>();
</script>

<style scoped>
.interactive-workspace {
  width: 100%;
  display: grid;
  grid-template-rows: 100px 1fr;
  grid-template-columns: 100px 1fr;
  grid-template-areas:
    "tracknames horizontal"
    "vertical content";
}

/*
.interactive-workspace_tracknames {
  grid-area: tracknames;
  background-color: red;
}
.interactive-workspace_horizontal {
  grid-area: horizontal;
  background-color: green;
}
.interactive-workspace_vertical {
  grid-area: vertical;
  background-color: yellow;
}
.interactive-workspace_content {
  grid-area: content;
  background-color: magenta;
}
*/

.test {
  width: 100%;
  height: 100%;

  background-color: black;
}
</style>
