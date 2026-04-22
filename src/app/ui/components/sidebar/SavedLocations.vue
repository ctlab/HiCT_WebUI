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
  <p class="w-100 m-0 text-lg-center"><b>Locations</b></p>
  <div class="pills w-100">
    <div class="btn-group" role="group">
      <input
        id="bookmarks-btn"
        autocomplete="off"
        class="btn-check"
        name="btnradio"
        type="radio"
        :checked="activeTab === 'bookmarks'"
        @change="activeTab = 'bookmarks'"
      />
      <label class="btn btn-outline-primary" for="bookmarks-btn">
        Bookmarks
      </label>

      <input
        id="contigs-btn"
        autocomplete="off"
        class="btn-check"
        name="btnradio"
        type="radio"
        :checked="activeTab === 'contigs'"
        @change="activeTab = 'contigs'"
      />
      <label class="btn btn-outline-primary" for="contigs-btn">Contigs</label>

      <input
        id="scaffolds-btn"
        autocomplete="off"
        class="btn-check"
        name="btnradio"
        type="radio"
        :checked="activeTab === 'scaffolds'"
        @change="activeTab = 'scaffolds'"
      />
      <label class="btn btn-outline-primary" for="scaffolds-btn">
        Scaffolds
      </label>
    </div>
  </div>

  <div v-if="activeTab === 'bookmarks'">
    <div class="save-btn-div">
      <button
        id="save-button"
        class="btn btn-outline-primary"
        type="button"
        data-bs-toggle="tooltip"
        data-bs-placement="bottom"
        title="Save current viewport"
        @click="saveLocation"
      >
        <i class="bi bi-bookmark-plus"></i>
        <span id="save-btn-text">Save</span>
      </button>
      <div class="bookmark-actions">
        <button class="btn btn-outline-secondary" @click="exportBookmarks">
          Export
        </button>
        <label class="btn btn-outline-secondary">
          Import
          <input type="file" accept="application/json" @change="importBookmarks" />
        </label>
      </div>
    </div>
    <div class="saved-locations-div">
      <div v-for="[id, loc] of savedLocations" :key="id">
        <SavedLocationElement
          v-if="loc"
          :map-manager="props.mapManager"
          :location_id="loc.location_id"
          :center_point="loc.center_point"
          :resolution="loc.resolution"
          :rotation="loc.rotation"
          @goto="gotoSavedLocation"
          @remove="removeSavedLocation"
        ></SavedLocationElement>
      </div>
    </div>
  </div>

  <div v-if="activeTab === 'contigs'" class="list-panel">
    <div class="names-actions">
      <button class="btn btn-outline-secondary" @click="exportNames">
        Export names
      </button>
      <label class="btn btn-outline-secondary">
        Import names
        <input type="file" accept="application/json" @change="importNames" />
      </label>
    </div>
    <div
      v-for="contig in contigList"
      :key="contig.contigId"
      class="name-row"
    >
      <div class="input-group">
        <input
          type="text"
          class="form-control m-0"
          v-model="contigDraftNames[contig.contigId]"
          @input="markContigDirty(contig.contigId)"
          @focus="isEditingNames = true"
          @blur="isEditingNames = false"
        />
        <button
          class="btn btn-outline-success"
          type="button"
          title="Rename contig"
          v-if="contigDirty.has(contig.contigId)"
          @click="renameContig(contig.contigId)"
        >
          <i class="bi bi-check-square-fill"></i>
        </button>
        <button
          class="btn btn-outline-secondary"
          type="button"
          title="Reset contig name"
          @click="resetContigName(contig.contigId)"
        >
          <i class="bi bi-arrow-counterclockwise"></i>
        </button>
        <button
          class="btn btn-outline-primary"
          type="button"
          title="Go to contig"
          @click="goToContig(contig.contigId)"
        >
          <i class="bi bi-eye"></i>
        </button>
      </div>
      <div class="original-name">Original: {{ contig.contigOriginalName }}</div>
    </div>
  </div>

  <div v-if="activeTab === 'scaffolds'" class="list-panel">
    <div class="names-actions">
      <button class="btn btn-outline-secondary" @click="exportNames">
        Export names
      </button>
      <label class="btn btn-outline-secondary">
        Import names
        <input type="file" accept="application/json" @change="importNames" />
      </label>
    </div>
    <div
      v-for="scaffold in scaffoldList"
      :key="scaffold.scaffoldId"
      class="name-row"
    >
      <div class="input-group">
        <input
          type="text"
          class="form-control m-0"
          v-model="scaffoldDraftNames[scaffold.scaffoldId]"
          @input="markScaffoldDirty(scaffold.scaffoldId)"
          @focus="isEditingNames = true"
          @blur="isEditingNames = false"
        />
        <button
          class="btn btn-outline-success"
          type="button"
          title="Rename scaffold"
          v-if="scaffoldDirty.has(scaffold.scaffoldId)"
          @click="renameScaffold(scaffold.scaffoldId)"
        >
          <i class="bi bi-check-square-fill"></i>
        </button>
        <button
          class="btn btn-outline-secondary"
          type="button"
          title="Reset scaffold name"
          @click="resetScaffoldName(scaffold.scaffoldId)"
        >
          <i class="bi bi-arrow-counterclockwise"></i>
        </button>
        <button
          class="btn btn-outline-primary"
          type="button"
          title="Go to scaffold"
          @click="goToScaffold(scaffold.scaffoldId)"
        >
          <i class="bi bi-eye"></i>
        </button>
      </div>
      <div class="original-name">
        Original: {{ scaffold.scaffoldOriginalName }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import SavedLocationElement from "./SavedLocationElement.vue";
import { Ref, ref, watch, onMounted, onBeforeUnmount } from "vue";
import { Coordinate } from "ol/coordinate";
import { toast } from "vue-sonner";
import type { ContigDescriptor } from "@/app/core/domain/ContigDescriptor";
import type { ScaffoldDescriptor } from "@/app/core/domain/ScaffoldDescriptor";
import { useSessionStore } from "@/app/stores/sessionStore";

const props = defineProps<{
  mapManager?: ContactMapManager;
}>();

const activeTab = ref<"bookmarks" | "contigs" | "scaffolds">("bookmarks");

const savedLocations: Ref<
  Map<
    number,
    {
      location_id: number;
      center_point: Coordinate | undefined;
      resolution: number | undefined;
      rotation: number | undefined;
    }
  >
> = ref(new Map());

const locationCount = ref(0);
const sessionStore = useSessionStore();

const contigList = ref<ContigDescriptor[]>([]);
const scaffoldList = ref<ScaffoldDescriptor[]>([]);
const contigDraftNames = ref<Record<number, string>>({});
const scaffoldDraftNames = ref<Record<number, string>>({});
const contigDirty = ref<Set<number>>(new Set());
const scaffoldDirty = ref<Set<number>>(new Set());
const isEditingNames = ref(false);
let refreshTimer: number | undefined;

function refreshAssemblyLists(): void {
  const map = props.mapManager;
  if (!map) {
    return;
  }
  if (isEditingNames.value) {
    return;
  }
  contigList.value = [...map.getContigDimensionHolder().contigDescriptors];
  const nextContigDrafts: Record<number, string> = {};
  contigList.value.forEach((ctg) => {
    const isDirty = contigDirty.value.has(ctg.contigId);
    nextContigDrafts[ctg.contigId] = isDirty
      ? contigDraftNames.value[ctg.contigId] ?? ctg.contigName
      : ctg.contigName;
  });
  contigDraftNames.value = nextContigDrafts;
  contigDirty.value = new Set(
    Array.from(contigDirty.value).filter((id) =>
      contigList.value.some((ctg) => ctg.contigId === id)
    )
  );

  const scaffoldsSorted = map.scaffoldHolder.scaffoldBordersSorted.map(
    ([, scaffoldId]) => map.scaffoldHolder.getScaffoldById(scaffoldId)
  );
  scaffoldList.value = scaffoldsSorted;
  const nextScaffoldDrafts: Record<number, string> = {};
  scaffoldList.value.forEach((sc) => {
    const isDirty = scaffoldDirty.value.has(sc.scaffoldId);
    nextScaffoldDrafts[sc.scaffoldId] = isDirty
      ? scaffoldDraftNames.value[sc.scaffoldId] ?? sc.scaffoldName
      : sc.scaffoldName;
  });
  scaffoldDraftNames.value = nextScaffoldDrafts;
  scaffoldDirty.value = new Set(
    Array.from(scaffoldDirty.value).filter((id) =>
      scaffoldList.value.some((sc) => sc.scaffoldId === id)
    )
  );
}

watch(activeTab, () => {
  refreshAssemblyLists();
});

onMounted(() => {
  refreshAssemblyLists();
  syncSessionStore();
  // Poll for assembly changes triggered by backend ops (group/ungroup/move).
  // This keeps Contigs/Scaffolds tabs in sync without tab switches.
  refreshTimer = window.setInterval(() => {
    if (activeTab.value === "contigs" || activeTab.value === "scaffolds") {
      refreshAssemblyLists();
    }
  }, 1000);
});

onBeforeUnmount(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
});

function saveLocation() {
  const map = props.mapManager;
  const view = map?.getView();
  if (props.mapManager && map && view) {
    savedLocations.value.set(locationCount.value, {
      location_id: locationCount.value,
      center_point: view.getCenter(),
      resolution: view.getResolution(),
      rotation: view.getRotation(),
    });
    locationCount.value += 1;
    syncSessionStore();
  }
}

function gotoSavedLocation(location_id: number) {
  const map = props.mapManager;
  const view = map?.getView();
  const loc = savedLocations.value.get(location_id);
  if (loc && props.mapManager && map && view) {
    view.animate({
      center: loc.center_point,
      resolution: loc.resolution,
      rotation: loc.rotation,
    });
  }
}

function removeSavedLocation(location_id: number) {
  savedLocations.value.delete(location_id);
  syncSessionStore();
}

function exportBookmarks(): void {
  const entries = Array.from(savedLocations.value.values());
  const blob = new Blob([JSON.stringify(entries, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "hict_bookmarks.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importBookmarks(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  file.text().then((text) => {
    try {
      const entries = JSON.parse(text) as {
        location_id: number;
        center_point: Coordinate;
        resolution: number;
        rotation: number;
      }[];
      savedLocations.value.clear();
      entries.forEach((entry, idx) => {
        savedLocations.value.set(idx, {
          location_id: idx,
          center_point: entry.center_point,
          resolution: entry.resolution,
          rotation: entry.rotation,
        });
      });
      locationCount.value = entries.length;
      syncSessionStore();
    } catch (e) {
      toast.error("Invalid bookmarks file");
    }
  });
}

function syncSessionStore() {
  const entries = Array.from(savedLocations.value.values()).map((loc, idx) => ({
    location_id: idx,
    center_point: (loc.center_point ?? [0, 0]) as [number, number],
    resolution: loc.resolution ?? 1,
    rotation: loc.rotation ?? 0,
  }));
  sessionStore.setSavedLocations(entries);
}

function loadFromSessionStore() {
  const entries = sessionStore.savedLocations;
  savedLocations.value.clear();
  entries.forEach((entry, idx) => {
    savedLocations.value.set(idx, {
      location_id: idx,
      center_point: entry.center_point,
      resolution: entry.resolution,
      rotation: entry.rotation,
    });
  });
  locationCount.value = entries.length;
}

watch(
  () => sessionStore.savedLocations,
  () => {
    const current = Array.from(savedLocations.value.values()).map((loc) => ({
      location_id: loc.location_id,
      center_point: loc.center_point,
      resolution: loc.resolution,
      rotation: loc.rotation,
    }));
    const next = sessionStore.savedLocations;
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      loadFromSessionStore();
    }
  },
  { deep: true }
);

function markContigDirty(contigId: number): void {
  contigDirty.value.add(contigId);
}

function markScaffoldDirty(scaffoldId: number): void {
  scaffoldDirty.value.add(scaffoldId);
}

function renameContig(contigId: number): void {
  const map = props.mapManager;
  if (!map) return;
  const newName = contigDraftNames.value[contigId] ?? "";
  map.networkManager.requestManager
    .renameContig(contigId, newName)
    .then((asm) => {
      map.contigDimensionHolder.updateContigData(asm.contigDescriptors);
      map.scaffoldHolder.updateScaffoldData(asm.scaffoldDescriptors);
      contigDirty.value.delete(contigId);
      map.getLayersManager().reloadTracks();
      map.reloadTiles();
      refreshAssemblyLists();
    })
    .catch((err) => {
      toast.error(err?.message ?? "Failed to rename contig");
    });
}

function renameScaffold(scaffoldId: number): void {
  const map = props.mapManager;
  if (!map) return;
  const newName = scaffoldDraftNames.value[scaffoldId] ?? "";
  map.networkManager.requestManager
    .renameScaffold(scaffoldId, newName)
    .then((asm) => {
      map.contigDimensionHolder.updateContigData(asm.contigDescriptors);
      map.scaffoldHolder.updateScaffoldData(asm.scaffoldDescriptors);
      scaffoldDirty.value.delete(scaffoldId);
      map.getLayersManager().reloadTracks();
      map.reloadTiles();
      refreshAssemblyLists();
    })
    .catch((err) => {
      toast.error(err?.message ?? "Failed to rename scaffold");
    });
}

function resetContigName(contigId: number): void {
  const contig = contigList.value.find((c) => c.contigId === contigId);
  if (!contig) return;
  contigDraftNames.value[contigId] = contig.contigOriginalName;
  renameContig(contigId);
}

function resetScaffoldName(scaffoldId: number): void {
  const scaffold = scaffoldList.value.find((s) => s.scaffoldId === scaffoldId);
  if (!scaffold) return;
  scaffoldDraftNames.value[scaffoldId] = scaffold.scaffoldOriginalName;
  renameScaffold(scaffoldId);
}

function goToContig(contigId: number): void {
  const map = props.mapManager;
  if (!map) return;
  const contig = contigList.value.find((c) => c.contigId === contigId);
  if (!contig) return;
  const view = map.getView();
  const prefix = map.contigDimensionHolder.prefix_sum_bp;
  const ord = map.contigDimensionHolder.contigIdToOrd[contigId];
  if (ord === undefined || Number.isNaN(ord)) {
    toast.error("Contig is not available in the current assembly");
    return;
  }
  const startBp = prefix[ord];
  const endBp = startBp + contig.contigLengthBp;
  const midBp = (startBp + endBp) / 2;
  const res = view.getResolution() ?? 1;
  const midPx = midBp / res;
  view.animate({ center: [midPx, -midPx] });
}

function goToScaffold(scaffoldId: number): void {
  const map = props.mapManager;
  if (!map) return;
  const scaffold = map.scaffoldHolder.getScaffoldById(scaffoldId);
  const borders = scaffold.scaffoldBordersBP;
  if (!borders) {
    toast.error("Scaffold has no borders in the current assembly");
    return;
  }
  const view = map.getView();
  const midBp = (borders.startBP + borders.endBP) / 2;
  const res = view.getResolution() ?? 1;
  const midPx = midBp / res;
  view.animate({ center: [midPx, -midPx] });
}

function exportNames(): void {
  const map = props.mapManager;
  if (!map) return;
  map.networkManager.requestManager
    .exportNameMapping()
    .then((mapping) => {
      const blob = new Blob([JSON.stringify(mapping, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "hict_names.json";
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch((err) => {
      toast.error(err?.message ?? "Failed to export names");
    });
}

function importNames(event: Event): void {
  const map = props.mapManager;
  if (!map) return;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  file.text().then((text) => {
    try {
      const payload = JSON.parse(text) as {
        contigs: { contigId: number; name: string }[];
        scaffolds: { scaffoldId: number; name: string }[];
      };
      map.networkManager.requestManager
        .importNameMapping(payload.contigs ?? [], payload.scaffolds ?? [])
        .then((asm) => {
          map.contigDimensionHolder.updateContigData(asm.contigDescriptors);
          map.scaffoldHolder.updateScaffoldData(asm.scaffoldDescriptors);
          map.reloadTiles();
          refreshAssemblyLists();
        })
        .catch((err) => {
          toast.error(err?.message ?? "Failed to import names");
        });
    } catch (e) {
      toast.error("Invalid names file");
    }
  });
}
</script>

<style scoped>
.pills {
  display: flex;
  flex-direction: column;
  padding: 0px 16px;
  gap: 10px;
  height: 40px;
}

.save-btn-div {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 8px 16px 0px;
  width: 232px;
  height: auto;
  gap: 8px;
}

#save-button {
  width: 232px;
}

#save-btn-text {
  margin-left: 10px;
}

.saved-locations-div {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  height: 50%;
  max-height: 250px;
  overflow-y: scroll;
  overflow-x: hidden;
  width: 100%;
  padding-top: 15px;
  padding-right: 20px;
}

.bookmark-actions {
  display: flex;
  gap: 8px;
}

.bookmark-actions input[type="file"] {
  display: none;
}

.names-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.names-actions input[type="file"] {
  display: none;
}

.list-panel {
  padding: 8px 16px;
  max-height: 320px;
  overflow: auto;
}

.name-row {
  margin-bottom: 10px;
}

.original-name {
  font-size: 12px;
  color: #6b7280;
  margin-left: 6px;
}
</style>
