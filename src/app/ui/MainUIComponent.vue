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
  <Toaster position="bottom-right" />
  <!-- <button @click="() => toast('My first toast')">Render a toast</button> -->
  <div class="main-ui-component">
    <UpperFrame
      :networkManager="networkManager"
      :mapManager="mapManager"
      @selected="onFileSelected"
      @closed="onClosed"
    ></UpperFrame>
    <WorkspaceComponent
      :mapManager="mapManager"
      :filename="filename"
    ></WorkspaceComponent>
    <div
      class="toast-container position-absolute top-0 end-0 p-3"
      id="toasts-container"
    ></div>
  </div>
</template>

<script setup lang="ts">
import UpperFrame from "@/app/ui/components/upper_ribbon/UpperFrame.vue";
import {
  ContactMapManager,
  // type ContactMapManagerOptions,
} from "@/app/core/mapmanagers/ContactMapManager";
import { ref, watch, type Ref } from "vue";
import { NetworkManager } from "@/app/core/net/NetworkManager";

import WorkspaceComponent from "@/app/ui/components/workspace/WorkspaceComponent.vue";
import { Toaster, toast } from "vue-sonner";
import { storeToRefs } from "pinia";
import { usehtmlElementReferencesStore } from "../stores/htmlElementReferencesStore";

// Reactively use these refs only inside component
// Pass them to Map Manager on creation as values, not Refs as objects
// Get notifications about state change using event handlers in MainComponent
// Change values in managers using their callbacks and watches in MainComponent

const filename: Ref<string | undefined> = ref("");
const fastaFilename: Ref<string | undefined> = ref("");
const tileSize: Ref<number> = ref(256);
const contigBorderColor: Ref<string> = ref("ffccee");
const mapManager: Ref<ContactMapManager | undefined> = ref(undefined);
const networkManager: NetworkManager = new NetworkManager(
  "http://localhost:5000/",
  undefined
);

const htmlElementReferencesStore = usehtmlElementReferencesStore();
const { mapTarget, miniMapTarget } = storeToRefs(htmlElementReferencesStore);

function resetState() {
  mapManager.value?.dispose();
  filename.value = "";
  fastaFilename.value = "";
  mapManager.value = undefined;
}

function onClosed() {
  resetState();
}

function displayNewMap() {
  const fname = filename.value;
  const ffname = fastaFilename.value;
  if (!fname) {
    const message =
      "Cannot open non-specified files: filename=" +
      fname +
      " fastaFilename=" +
      ffname;
    toast.error(message);
    throw new Error(message);
  }
  networkManager.requestManager
    .openFile(fname, ffname)
    .then((openFileResponse) => {
      mapManager.value?.dispose();
      const newManager = new ContactMapManager({
        response: openFileResponse,
        filename: fname,
        fastaFilename: ffname ?? "",
        tileSize: tileSize.value,
        contigBorderColor: contigBorderColor.value,
        mapTargetSelector: "hic-contact-map",
        networkManager: networkManager,
        minimapTarget: miniMapTarget,
      });
      mapManager.value = newManager;
      networkManager.mapManager = mapManager.value;
      newManager.initializeMap();
      toast.success("Opened file " + fname);
    })
    .catch((a) => {
      console.log(a);
      toast.error(a);
    });
}

watch(
  () => tileSize.value,
  (newTileSize, oldTileSize) => {
    if (newTileSize && newTileSize !== oldTileSize) {
      mapManager.value?.getLayersManager().onTileSizeChanged(newTileSize);
    }
  }
);

watch(
  () => contigBorderColor.value,
  (newContigBorderColor, oldContigBorderColor) => {
    if (newContigBorderColor && newContigBorderColor !== oldContigBorderColor) {
      mapManager.value
        ?.getLayersManager()
        .onContigBorderColorChanged(newContigBorderColor);
    }
  }
);

function onFileSelected(newFilename: string) {
  if (newFilename !== filename.value) {
    resetState();
    filename.value = newFilename;
    if (filename.value && filename.value !== "") {
      displayNewMap();
    }
  }
}
</script>

<style scoped>
.main-ui-component {
  width: 100%;
  height: 100vh;
}
</style>
