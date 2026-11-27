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
      title="Bookmark current location (listed under Entities → Bookmarks)"
      aria-label="Bookmark current location"
      :disabled="!props.mapManager"
      @click="saveCurrentLocation"
    >
      <i class="bi bi-bookmark-plus"></i>
    </button>
    <button
      class="btn btn-outline-primary"
      type="button"
      data-bs-toggle="tooltip"
      data-bs-placement="right"
      title="Removed from the assembly and from AGP and FASTA exports. Undo restores it."
      aria-label="Move to unplaced (debris)…"
      :disabled="!props.mapManager || props.mapManager.networkManager.requestManager.history.busy > 0"
      @click="moveToDebrisClicked"
    >
      <i class="bi bi-box-arrow-down"></i>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { useSessionStore } from "@/app/stores/sessionStore";
import { toast } from "vue-sonner";

const props = defineProps<{
  mapManager?: ContactMapManager | undefined;
}>();

const sessionStore = useSessionStore();

function saveCurrentLocation() {
  const view = props.mapManager?.getMap().getView();
  const center = view?.getCenter();
  const resolution = view?.getResolution();
  if (!view || !center || resolution === undefined) return;
  const existing = sessionStore.savedLocations;
  const locationId = existing.length;
  sessionStore.setSavedLocations([
    ...existing,
    {
      location_id: locationId,
      name: `Location ${locationId + 1}`,
      center_point: [center[0], center[1]],
      resolution,
      rotation: view.getRotation(),
    },
  ]);
  window.dispatchEvent(new CustomEvent("hict:show-bookmark", { detail: locationId }));
  toast.success(
    `Location ${existing.length + 1} bookmarked (Entities → Bookmarks)`
  );
}

function moveToDebrisClicked() {
  props.mapManager?.eventManager.onMoveToDebrisClicked();
}
</script>

<style scoped>
.block-of-buttons {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
