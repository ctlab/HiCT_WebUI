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
  <div class="saved-locations">
    <div class="input-group">
      <input
        type="text"
        class="form-control m-0"
        placeholder="Location name"
        aria-label="Name of the saved location"
        v-model="name"
      />
      <button
        class="btn btn-outline-primary"
        type="button"
        title="Go to saved location"
        data-bs-toggle="tooltip"
        data-bs-placement="bottom"
        @click="$emit('goto', props.location_id)"
      >
        <i class="bi bi-box-arrow-in-right"></i>
      </button>
      <button
        class="btn btn-outline-danger"
        type="button"
        title="Remove saved location"
        data-bs-toggle="tooltip"
        data-bs-placement="bottom"
        @click="$emit('remove', props.location_id)"
      >
        <i class="bi bi-x-square-fill"></i>
      </button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { Coordinate } from "ol/coordinate";
import { ref } from "vue";

const props = defineProps<{
  mapManager?: ContactMapManager;
  location_id: number;
  center_point: Coordinate | undefined;
  resolution: number | undefined;
  rotation: number | undefined;
}>();

const emits = defineEmits<{
  (e: "goto", location_id: number): void;
  (e: "remove", location_id: number): void;
}>();

const name = ref(props.location_id + " unnamed location");
</script>
<style scoped>
.saved-locations {
  /* layer */

  /* Auto layout */
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-start;
  padding: 0px;
  /* gap: 20px; */

  width: 100%;
  height: 40px;
  margin-left: 10px;
  margin-right: 10px;

  /* Inside auto layout */
  flex: none;
  order: 0;
  flex-grow: 0;
}
</style>
