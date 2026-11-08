<template>
  <Teleport to="body">
    <div
      v-if="items.length"
      ref="menu"
      class="assembly-context-menu"
      role="menu"
      aria-label="Assembly actions"
      :style="{ left: `${position.x}px`, top: `${position.y}px` }"
      @contextmenu.prevent
      @keydown="navigate"
    >
      <section v-for="item in items" :key="`${item.kind}-${item.id}`">
        <div class="entity-title">{{ item.title }}</div>
        <template v-if="item.kind !== 'selection'">
          <button role="menuitem" @click="zoomTo(item)">Zoom to {{ item.kind }}</button>
          <button role="menuitem" @click="copyName(item)">Copy name</button>
          <button v-if="item.kind === 'contig'" role="menuitem" @click="copyPosition(item)">Copy position</button>
        </template>
        <button v-if="item.kind !== 'selection'" role="menuitem" @click="beginRename(item)">Rename…</button>
        <template v-if="item.kind === 'selection'">
          <button role="menuitem" @click="items = []; histogramOpen = true">Signal histogram...</button>
          <button role="menuitem" @click="openAnalysis('dotplot')">Generate dotplot for selection…</button>
          <button role="menuitem" @click="openAnalysis('moddotplot')">Generate ModDotPlot for selection…</button>
          <button role="menuitem" @click="openAnalysis('search')">Find sequences in selection…</button>
          <button role="menuitem" @click="exportFasta">Export FASTA for selection</button>
          <button v-for="format in ['PNG', 'SVG', 'PDF'] as const" :key="format" role="menuitem" @click="exportSelection(format)">Export selection as {{ format }}</button>
        </template>
        <template v-if="item.kind === 'scaffold' || !hasScaffold">
          <button role="menuitem" :disabled="item.structural === false" @click="execute(item, 'reverse')">
            Reverse {{ item.kind }}
          </button>
          <button role="menuitem" :disabled="item.structural === false" @click="move(item)">
            Move {{ item.kind }}…
          </button>
          <button
            v-if="item.kind === 'scaffold'"
            role="menuitem"
            @click="execute(item, 'ungroup')"
          >
            Ungroup into singletons
          </button>
          <button role="menuitem" :disabled="item.structural === false" @click="execute(item, 'debris')">
            Move to debris and hide
          </button>
        </template>
      </section>
      <p v-if="items.some(item => item.kind === 'selection')" class="scope-note">Structural edits use the interval where the rectangle crosses the diagonal and expand to whole scaffolds.</p>
      <p v-if="hasScaffold" class="scope-note">
        Structural edits act on the whole scaffold.
      </p>
    </div>
    <div v-if="renaming" class="rename-backdrop" @click.self="renaming = null">
      <form
        class="rename-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-entity-title"
        @submit.prevent="saveName"
      >
        <h5 id="rename-entity-title">Rename {{ renaming.kind }}</h5>
        <label for="entity-name">Name</label>
        <input
          id="entity-name"
          ref="nameInput"
          v-model="newName"
          class="form-control"
          required
          maxlength="4096"
        />
        <p class="small mt-2">
          Names are used in AGP and FASTA exports. Use underscores between
          words. Source sequence identifiers stay unchanged.
        </p>
        <p v-if="invalidName" class="text-danger small" role="status">
          Names cannot contain whitespace or control characters.
        </p>
        <div class="d-flex justify-content-end gap-2">
          <button
            type="button"
            class="btn btn-outline-secondary"
            @click="renaming = null"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="busy || !newName.trim() || invalidName"
          >
            Rename
          </button>
        </div>
      </form>
    </div>
  </Teleport>
  <AxisContextMenu
    v-if="busyMenu"
    :items="busyMenuItems"
    :x="busyMenu.x"
    :y="busyMenu.y"
    @close="busyMenu = null"
  />
  <ModDotPlotModal v-if="analysis === 'moddotplot' || analysis === 'dotplot'" :kind="analysis" :map-manager="props.mapManager" :initial-selection="true" @dismissed="analysis = null" />
  <SequenceSearchModal v-if="analysis === 'search'" :map-manager="props.mapManager" :initial-selection="true" @dismissed="analysis = null" />
  <SignalHistogramModal v-if="histogramOpen" :map-manager="props.mapManager" selection @dismissed="histogramOpen = false" />
</template>
<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  ref,
  watch,
} from "vue";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import type { ContigDescriptor } from "@/app/core/domain/ContigDescriptor";
import {
  ReverseSelectionRangeRequest,
  UngroupContigsFromScaffoldRequest,
  MoveSelectionToDebrisRequest,
} from "@/app/core/net/api/request";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
import { containsCoordinate } from "ol/extent";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import AxisContextMenu from "@/app/ui/components/common/AxisContextMenu.vue";
import {
  copyText,
  formatLocus,
  type ContextMenuItem,
} from "@/app/core/mapmanagers/contextMenuActions";
import ModDotPlotModal from "@/app/ui/components/upper_ribbon/ModDotPlotModal.vue";
import SequenceSearchModal from "@/app/ui/components/upper_ribbon/SequenceSearchModal.vue";
import SignalHistogramModal from "@/app/ui/components/upper_ribbon/SignalHistogramModal.vue";
import { useNotificationCenterStore } from "@/app/stores/notificationCenterStore";
const histogramOpen = ref(false);
const analysis = ref<"search" | "moddotplot" | "dotplot" | null>(null);
type Item = {
  kind: "contig" | "scaffold" | "selection";
  id: number;
  name: string;
  startBP: number;
  endBP: number;
  structural?: boolean;
  title: string;
  inContigBp?: number;
};
type AxisHit = Omit<Item, "title">;
const props = defineProps<{ mapManager: ContactMapManager }>();
const items = ref<Item[]>([]),
  renaming = ref<Item | null>(null),
  newName = ref("");
const invalidName = computed(() => /[\s\p{Cc}]/u.test(newName.value.trim()));
const menu = ref<HTMLElement>(),
  nameInput = ref<HTMLInputElement>();
const position = ref({ x: 0, y: 0 });
const busyMenu = ref<{ x: number; y: number } | null>(null);
const busyMenuItems: ContextMenuItem[] = [
  {
    label: "Please wait for the current edit to finish",
    disabled: true,
    run: () => undefined,
  },
];
const busy = computed(
  () => props.mapManager.networkManager.requestManager.history.busy > 0
);
const hasScaffold = computed(() =>
  items.value.some((item) => item.kind === "scaffold")
);
useEscDismissableDialog({
  priority: 1060,
  isOpen: () => !!renaming.value || !!items.value.length,
  requestClose: () => {
    renaming.value = null;
    items.value = [];
  },
});
function close(event: Event) {
  if (!menu.value?.contains(event.target as Node)) items.value = [];
}
function axisHits(bp: number): AxisHit[] {
  const manager = props.mapManager;
  const holder = manager.contigDimensionHolder;
  const hits: AxisHit[] = [];
  const locus = holder.getContigLocusByBp(bp);
  const order = holder.contigIdToOrd[locus.contigId];
  if (order !== undefined && !Number.isNaN(order)) {
    hits.push({
      kind: "contig",
      id: locus.contigId,
      name: locus.contigName,
      startBP: holder.prefix_sum_bp[order],
      endBP: holder.prefix_sum_bp[order + 1],
      inContigBp: locus.inContigBp,
    });
  }
  const scaffold = manager.scaffoldHolder.getScaffoldLocusByBp(bp);
  if (scaffold) {
    hits.push({
      kind: "scaffold",
      id: scaffold.scaffoldId,
      name: scaffold.scaffoldName,
      startBP: scaffold.startBp,
      endBP: scaffold.endBp,
    });
  }
  return hits;
}
/** Contig and scaffold under the pointer on each axis, found by coordinates so any point inside a contig works. */
function itemsAtEvent(event: MouseEvent): Item[] {
  const manager = props.mapManager;
  const holder = manager.contigDimensionHolder;
  const finest = manager.linearTrackManager.getFinestBpResolution();
  const totalPx = holder.prefix_sum_px.get(finest)?.[holder.contig_count] ?? 0;
  const [x, y] = manager.map.getEventCoordinate(event);
  const columnPx = Math.floor(x);
  const rowPx = Math.floor(-y);
  const inside = (px: number) => Number.isFinite(px) && px >= 0 && px < totalPx;
  // The matrix is square: a point beyond either axis is outside the map, so there is nothing to act on.
  if (!inside(columnPx) || !inside(rowPx)) return [];
  const column = axisHits(holder.getStartBpOfPx(columnPx, finest));
  const row = axisHits(holder.getStartBpOfPx(rowPx, finest));
  const result: Item[] = [];
  for (const kind of ["contig", "scaffold"] as const) {
    const label = kind === "contig" ? "Contig" : "Scaffold";
    const byColumn = column.find((hit) => hit.kind === kind);
    const byRow = row.find((hit) => hit.kind === kind);
    if (byColumn && byRow && byColumn.id !== byRow.id) {
      result.push(
        { ...byColumn, title: `${label} (column): ${byColumn.name}` },
        { ...byRow, title: `${label} (row): ${byRow.name}` }
      );
    } else {
      const only = byColumn ?? byRow;
      if (only) result.push({ ...only, title: `${label}: ${only.name}` });
    }
  }
  return result;
}
async function open(event: MouseEvent) {
  // The browser's own menu must never replace ours, wherever the pointer is.
  event.preventDefault();
  items.value = [];
  busyMenu.value = null;
  if (busy.value) {
    busyMenu.value = { x: event.clientX, y: event.clientY };
    return;
  }
  const manager = props.mapManager;
  let found: Item[] = [];
  const extent = manager.viewAndLayersManager.selectionInteractions.contigSelectExtent.getExtent();
  const bounds = manager.viewAndLayersManager.currentViewState.selectionBorders;
  if (extent && bounds.leftBP && bounds.rightBP && containsCoordinate(extent, manager.map.getEventCoordinate(event))) {
    const startBP = Math.max(...bounds.leftBP), endBP = Math.min(...bounds.rightBP);
    found.push({ kind: "selection", id: -1, name: "active rectangle", title: "Selection: active rectangle", startBP, endBP, structural: endBP > startBP });
  }
  if (!found.length) found = itemsAtEvent(event);
  if (!found.length) return;
  items.value = found;
  position.value = { x: event.clientX, y: event.clientY };
  await nextTick();
  const rect = menu.value?.getBoundingClientRect();
  if (rect)
    position.value = {
      x: Math.max(8, Math.min(event.clientX, innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(event.clientY, innerHeight - rect.height - 8)),
    };
  menu.value?.querySelector("button")?.focus();
}
function zoomTo(item: Item) {
  items.value = [];
  props.mapManager.linearTrackManager.centerOnBpRange(item.startBP, item.endBP);
}
function copyName(item: Item) {
  items.value = [];
  void copyText(item.name, `${item.kind === "scaffold" ? "Scaffold" : "Contig"} name`);
}
function copyPosition(item: Item) {
  items.value = [];
  void copyText(formatLocus(item.name, (item.inContigBp ?? 0) + 1), "Position");
}
function navigate(event: KeyboardEvent) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const buttons = Array.from(menu.value?.querySelectorAll("button") ?? []);
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
      ? buttons.length - 1
      : (index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) %
        buttons.length;
  buttons[next]?.focus();
}
async function beginRename(item: Item) {
  items.value = [];
  renaming.value = item;
  newName.value = item.name;
  await nextTick();
  nameInput.value?.select();
}
async function saveName() {
  const item = renaming.value;
  if (!item || busy.value || invalidName.value) return;
  try {
    const api = props.mapManager.networkManager.requestManager;
    const assembly = await (item.kind === "contig"
      ? api.renameContig(item.id, newName.value.trim())
      : api.renameScaffold(item.id, newName.value.trim()));
    props.mapManager.eventManager.applyAssemblyInfo(assembly);
    renaming.value = null;
    await props.mapManager.reloadVisuals();
  } catch {
    /* API failure is retained in the notification center. */
  }
}
async function execute(item: Item, action: "reverse" | "ungroup" | "debris") {
  items.value = [];
  if (busy.value) return;
  try {
    const manager = props.mapManager,
      api = manager.networkManager.requestManager;
    const assembly = await (action === "reverse"
      ? api.reverseSelectionRange(new ReverseSelectionRangeRequest(item))
      : action === "ungroup"
      ? api.ungroupContigsFromScaffold(
          new UngroupContigsFromScaffoldRequest(item)
        )
      : api.moveSelectionToDebris(new MoveSelectionToDebrisRequest(item)));
    manager.eventManager.applyAssemblyInfo(assembly);
    manager.eventManager.resetSelection();
    await manager.reloadVisuals();
  } catch {
    /* API failure is retained in the notification center. */
  }
}
function move(item: Item) {
  items.value = [];
  const manager = props.mapManager;
  if (item.kind === "selection") { manager.eventManager.onMoveSelectionClicked(); return; }
  manager.eventManager.resetSelection();
  const resolution =
    manager.viewAndLayersManager.currentViewState.resolutionDesciptor
      .bpResolution;
  const features =
    manager.viewAndLayersManager.track2DHolder.contigBordersTrack.features.get(
      resolution
    ) ?? [];
  for (const feature of features) {
    const descriptor = feature.get("contigDescriptor") as
      | ContigDescriptor
      | undefined;
    if (!descriptor || feature.get("trackType") !== "contigBorders") continue;
    const order =
      manager.contigDimensionHolder.contigIdToOrd[descriptor.contigId];
    const prefix = manager.contigDimensionHolder.prefix_sum_bp;
    if (prefix[order] < item.endBP && prefix[order + 1] > item.startBP)
      manager.viewAndLayersManager.selectionCollections.selectedContigFeatures.push(
        feature
      );
  }
  manager.eventManager.onMoveSelectionClicked();
}
function openAnalysis(kind: "moddotplot" | "dotplot" | "search") { items.value = []; analysis.value = kind; }
function exportFasta() { items.value = []; props.mapManager.eventManager.onExportFASTAForSelectionClicked(); }
async function exportSelection(format: "PNG" | "SVG" | "PDF") {
  items.value = [];
  const notifications = useNotificationCenterStore();
  try {
    const manager = props.mapManager;
    const method = format === "PNG" ? manager.exportCurrentMapPng : format === "SVG" ? manager.exportCurrentMapSvg : manager.exportCurrentMapPdf;
    await method.call(manager, undefined, { scope: "selection" });
    notifications.add("success", `Selection exported as ${format}.`);
  } catch (failure) { notifications.add("error", `Selection export failed: ${String(failure)}`); }
}
watch(
  () => props.mapManager.networkManager.requestManager.history.applied,
  () => {
    items.value = [];
    renaming.value = null;
  }
);
let target: HTMLElement | undefined;
let viewKeys: EventsKey[] = [];
function closeMenu() {
  items.value = [];
}
function closeOnWheel(event: Event) {
  if (!menu.value?.contains(event.target as Node)) items.value = [];
}
onMounted(() => {
  target = props.mapManager.map.getViewport();
  target.addEventListener("contextmenu", open);
  document.addEventListener("pointerdown", close);
  window.addEventListener("resize", close);
  window.addEventListener("wheel", closeOnWheel, { capture: true, passive: true });
  const view = props.mapManager.getView();
  viewKeys = [view.on("change:center", closeMenu), view.on("change:resolution", closeMenu)];
});
onBeforeUnmount(() => {
  target?.removeEventListener("contextmenu", open);
  document.removeEventListener("pointerdown", close);
  window.removeEventListener("resize", close);
  window.removeEventListener("wheel", closeOnWheel, { capture: true });
  viewKeys.forEach((key) => unByKey(key));
  viewKeys = [];
});
</script>
<style scoped>
.assembly-context-menu {
  position: fixed;
  z-index: 1050;
  width: 280px;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 16px);
  overflow: auto;
  padding: 0.4rem;
  border: 1px solid var(--hict-ui-border, #cbd5e1);
  background: var(--hict-surface-bg, #fff);
  color: var(--hict-surface-fg, #172033);
  border-radius: 0.4rem;
  box-shadow: 0 4px 24px #0003;
}
.entity-title {
  font-weight: 600;
  overflow-wrap: anywhere;
  padding: 0.4rem;
}
.assembly-context-menu button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.4rem 0.6rem;
  border: 0;
  color: inherit;
  background: transparent;
  border-radius: 0.25rem;
}
.assembly-context-menu button:hover,
.assembly-context-menu button:focus-visible {
  background: #dbeafe;
  color: #172033;
}
.scope-note {
  font-size: 0.8rem;
  margin: 0.5rem;
}
.rename-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1060;
  display: grid;
  place-items: center;
  background: #0005;
}
.rename-dialog {
  padding: 1.25rem;
  width: min(30rem, 92vw);
  background: var(--hict-surface-bg, #fff);
  color: var(--hict-surface-fg, #172033);
  border-radius: 0.5rem;
}
</style>
