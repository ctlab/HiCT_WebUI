<template>
  <div class="nav-item dropdown">
    <button
      type="button"
      class="btn btn-sm btn-outline-primary dropdown-toggle selection-label"
      data-bs-toggle="dropdown"
      :data-bs-popper-config="navbarPopperConfig"
      :disabled="!mapManager"
      :title="mapManager ? summary : 'Open a map to select a region'"
    >
      <span>{{ label }}</span>
    </button>
    <ul class="dropdown-menu selection-menu">
      <li class="px-3 py-2 small">
        <span role="status">{{ state?.entitySelectionStatus ?? summary }}</span>
      </li>
      <li class="px-3 pb-2 small text-muted">
        Shift-click or Shift-drag on the diagonal selects contigs. A scaffold
        that is touched is selected whole. Ctrl-drag (⌘ on macOS) selects a
        region. Esc clears.
      </li>
      <li class="px-3 pb-2 small text-muted">
        To change one contig inside a scaffold, right-click it.
      </li>
      <li><hr class="dropdown-divider" /></li>
      <li>
        <button
          class="dropdown-item"
          :disabled="!mapManager"
          @click="coordinateOpen = true"
        >
          {{
            region
              ? "Edit region coordinates…"
              : "Select region by coordinates…"
          }}
        </button>
      </li>
      <li>
        <button
          class="dropdown-item"
          :disabled="!region && !count"
          @click="copyCoordinates"
        >
          Copy coordinates
        </button>
      </li>
      <li>
        <button
          class="dropdown-item"
          :disabled="!region"
          title="Select a region with Ctrl-drag or ⌘-drag to copy its image"
          @click="copyPng"
        >
          Copy as image
        </button>
      </li>
      <li>
        <button
          class="dropdown-item"
          :disabled="!mapManager"
          @click="mapManager?.viewAndLayersManager.clearSelections()"
        >
          Clear selection
        </button>
      </li>
      <li><hr class="dropdown-divider" /></li>
      <li>
        <button
          class="dropdown-item"
          :aria-pressed="state?.hideScopedBorders ?? false"
          :disabled="!bothScoped"
          @click="
            mapManager?.viewAndLayersManager.setHideScopedBorders(
              !state?.hideScopedBorders
            )
          "
        >
          {{ state?.hideScopedBorders ? "✓ " : "" }}Hide borders in scoped view
        </button>
      </li>
      <li class="px-3 pt-1 pb-2 small text-muted">
        Available when both rows and columns are narrowed. Selected entity
        borders stay visible.
      </li>
    </ul>
    <RegionSelectionDialog
      v-if="coordinateOpen && mapManager"
      :map-manager="mapManager"
      @dismissed="coordinateOpen = false"
    />
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { formatLength } from "@/app/core/format/formatSignal";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import {
  copySelectionCoordinates,
  copySelectionPng,
} from "@/app/core/mapmanagers/contextMenuActions";
import RegionSelectionDialog from "../common/RegionSelectionDialog.vue";
const props = defineProps<{
  mapManager?: ContactMapManager;
}>();
const navbarPopperConfig = JSON.stringify({
  modifiers: [
    { name: "applyStyles", enabled: true },
    { name: "preventOverflow", options: { padding: 8, altAxis: true } },
  ],
});
const coordinateOpen = ref(false);
const state = computed(
  () => props.mapManager?.viewAndLayersManager.currentViewState
);
const region = computed(() =>
  props.mapManager?.viewAndLayersManager.getRegionBounds()
);
const count = computed(() => state.value?.selectedContigIds.length ?? 0);
const summary = computed(() => {
  const r = region.value;
  if (r)
    return `Region: rows ${(
      r.rowStart + 1
    ).toLocaleString()}–${r.rowEnd.toLocaleString()}, columns ${(
      r.columnStart + 1
    ).toLocaleString()}–${r.columnEnd.toLocaleString()} bp (1-based inclusive).`;
  const range = props.mapManager?.viewAndLayersManager.getSelectedEntityRange();
  return range
    ? `${entityLabel.value} · ${range.startBP.toLocaleString()}–${range.endBP.toLocaleString()} bp`
    : "No selection.";
});
const entityLabel = computed(() => {
  const n = count.value;
  const m = state.value?.selectedScaffoldIds.length ?? 0;
  return `${n} ${n === 1 ? "contig" : "contigs"}${m ? ` in ${m} ${m === 1 ? "scaffold" : "scaffolds"}` : ""}`;
});
const label = computed(() => {
  const r = region.value;
  if (r) {
    return `Region · ${formatSelectionLength(
      r.rowEnd - r.rowStart
    )} × ${formatSelectionLength(r.columnEnd - r.columnStart)}`;
  }
  return count.value ? `Selection · ${entityLabel.value}` : "Selection";
});
function formatSelectionLength(bp: number): string {
  return bp >= 1000 && bp < 1e6
    ? `${Math.round(bp / 1000)} kb`
    : formatLength(bp);
}
const bothScoped = computed(() => state.value?.scopedAxes ?? false);
function copyCoordinates() {
  const mode = useUiSettingsStore().rulerCoordinateMode;
  if (props.mapManager)
    copySelectionCoordinates(
      props.mapManager,
      mode === "global" ? "assembly" : mode
    );
}
function copyPng() {
  if (props.mapManager) void copySelectionPng(props.mapManager);
}
</script>
<style scoped>
:global(.hict-entity-drag) {
  border: 2px dashed #fff;
  outline: 2px solid #0f172a;
  background: rgba(255, 176, 0, 0.16);
}
.selection-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: 120px;
}
.selection-label span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.selection-label::after {
  flex: none;
  margin-left: 0;
}
@media (min-width: 1280px) {
  .selection-label:enabled {
    width: clamp(190px, calc(50vw - 450px), 260px);
  }
}
.selection-menu {
  min-width: min(25rem, 90vw);
  max-width: 90vw;
  max-height: min(25rem, calc(100dvh - 8rem));
  overflow-y: auto;
  overscroll-behavior: contain;
}
.selection-menu .dropdown-item {
  white-space: normal;
}
</style>
