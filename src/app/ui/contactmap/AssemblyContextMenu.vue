<template>
  <Teleport to="body">
    <div
      v-if="items.length"
      ref="menu"
      class="assembly-context-menu"
      role="menu"
      aria-label="Assembly actions"
      :style="{ left: `${position.x}px`, top: `${position.y}px` }"
      @scroll.self="activeSubmenu = null"
      @pointerover="dismissSibling"
      @contextmenu.prevent
      @keydown="navigate"
    >
      <section
        v-if="
          props.mapManager.viewAndLayersManager.currentViewState
            .selectedContigIds.length
        "
      >
        <button role="menuitem" @click="isolate">Isolate view to region</button>
      </section>
      <section v-for="item in items" :key="`${item.kind}-${item.id}`">
        <div class="entity-title">{{ item.title }}</div>
        <template v-if="item.kind !== 'selection'">
          <button role="menuitem" @click="zoomTo(item)">
            Zoom to {{ item.kind }}
          </button>
          <button v-if="!hasRegion" role="menuitem" @click="copyName(item)">
            Copy name
          </button>
          <button
            v-if="!hasRegion && item.kind === 'contig'"
            role="menuitem"
            @click="copyPosition(item)"
          >
            Copy position
          </button>
        </template>
        <button
          v-if="item.kind !== 'selection'"
          role="menuitem"
          @click="beginRename(item)"
        >
          Rename…
        </button>
        <template v-if="item.kind === 'selection'">
          <button role="menuitem" @click="zoomSelection">
            <i class="bi bi-fullscreen" aria-hidden="true"></i> Zoom to region
          </button>
          <button v-if="!regionIsolated" role="menuitem" @click="isolateRegion">
            <i class="bi bi-bounding-box" aria-hidden="true"></i> Isolate view
            to region
          </button>
          <button
            v-for="submenu in submenus"
            :key="submenu.id"
            role="menuitem"
            :data-submenu="submenu.id"
            aria-haspopup="menu"
            :aria-expanded="activeSubmenu === submenu.id"
            @pointerenter="openSubmenu(submenu.id, false)"
            @click="openSubmenu(submenu.id, true)"
            @keydown.right.prevent="openSubmenu(submenu.id, true)"
          >
            <i class="bi" :class="submenu.icon" aria-hidden="true"></i>
            {{ submenu.label }}
            <span class="submenu-arrow" aria-hidden="true">›</span>
          </button>
        </template>
        <template v-if="offersStructuralEdits(item)">
          <button
            role="menuitem"
            :disabled="item.structural === false"
            @click="execute(item, 'reverse')"
          >
            Reverse
          </button>
          <button
            role="menuitem"
            :disabled="item.structural === false"
            @click="move(item)"
          >
            Move…
          </button>
          <button
            v-if="item.kind === 'scaffold'"
            role="menuitem"
            @click="execute(item, 'ungroup')"
          >
            Ungroup into singletons
          </button>
        </template>
      </section>
      <p v-if="hasScaffold" class="scope-note">
        Structural edits act on the whole scaffold.
      </p>
      <section v-if="debrisTargets.length">
        <button
          v-for="item in debrisTargets"
          :key="`${item.kind}-${item.id}`"
          role="menuitem"
          class="debris-action"
          @click="execute(item, 'debris')"
        >
          {{ debrisTargets.length === 1
            ? "Move to unplaced (debris)…"
            : `Move ${item.name} to unplaced (debris)…` }}
        </button>
      </section>
      <section
        v-if="activeSubmenu"
        ref="submenuMenu"
        role="menu"
        :aria-label="submenus.find(({ id }) => id === activeSubmenu)?.label"
        class="child-menu assembly-context-menu"
        :style="submenuPosition"
        @keydown.left.stop.prevent="closeSubmenu"
      >
        <template v-if="activeSubmenu === 'edit'">
          <button role="menuitem" @click="openRegionCoordinates">
            Edit region coordinates…
          </button>
          <button role="menuitem" @click="clearRegion">Clear selection</button>
        </template>
        <template v-else-if="activeSubmenu === 'copy'">
          <button
            role="menuitem"
            @click="copyCoordinates(currentCoordinateFrame)"
          >
            Coordinates
          </button>
          <button role="menuitem" @click="copyCoordinates('scaffold')">
            Coordinates in scaffold
          </button>
          <button role="menuitem" @click="copyCoordinates('contig')">
            Coordinates in contig
          </button>
          <button
            v-if="contextContig"
            role="menuitem"
            @click="copyName(contextContig)"
          >
            Contig name
          </button>
          <button role="menuitem" @click="requestExport('clipboard')">
            Region as image
          </button>
        </template>
        <template v-else-if="activeSubmenu === 'export'">
          <button
            v-for="format in formats"
            :key="format"
            role="menuitem"
            @click="requestExport(format)"
          >
            <i
              class="bi"
              :class="`bi-filetype-${format.toLowerCase()}`"
              aria-hidden="true"
            ></i>
            Image as {{ format }}…
          </button>
          <hr class="dropdown-divider" />
          <button role="menuitem" @click="exportFasta">FASTA of region…</button>
        </template>
        <template v-else>
          <button role="menuitem" @click="openHistogram">
            Signal histogram…
          </button>
          <button role="menuitem" @click="openAnalysis('search')">
            Find sequences in region…
          </button>
          <button role="menuitem" @click="openAnalysis('dotplot')">
            Dotplot of region…
          </button>
          <button role="menuitem" @click="openAnalysis('moddotplot')">
            ModDotPlot of region…
          </button>
        </template>
      </section>
    </div>
    <RegionSelectionDialog
      v-if="regionCoordinatesOpen"
      :map-manager="props.mapManager"
      @dismissed="regionCoordinatesOpen = false"
    />
    <div v-if="renaming" class="rename-backdrop" @click.self="renaming = null">
      <form
        class="rename-dialog"
        ref="modalFocusElement"
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
  <ModDotPlotModal
    v-if="analysis === 'moddotplot' || analysis === 'dotplot'"
    :kind="analysis"
    :map-manager="props.mapManager"
    @dismissed="analysis = null"
  />
  <SequenceSearchModal
    v-if="analysis === 'search'"
    :map-manager="props.mapManager"
    :initial-selection="true"
    @dismissed="analysis = null"
  />
  <SignalHistogramModal
    v-if="histogramOpen"
    :map-manager="props.mapManager"
    selection
    @dismissed="histogramOpen = false"
  />
</template>
<script setup lang="ts">
import { reportFailure } from "@/app/ui/reportFailure";
import { askForConfirmation } from "@/app/ui/confirmAction";
import RegionSelectionDialog from "@/app/ui/components/common/RegionSelectionDialog.vue";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import { useModalFocus } from "@/app/ui/modalFocus";
import {
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  ref,
  watch,
} from "vue";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import type { CoordinateFrame } from "@/app/core/mapmanagers/regionSelection";
import { formatLength } from "@/app/core/format/formatSignal";
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
  copySelectionCoordinates,
  copySelectionPng,
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
const hasRegion = computed(() =>
  items.value.some((item) => item.kind === "selection")
);
function offersStructuralEdits(item: Item): boolean {
  return (
    item.kind !== "selection" &&
    (item.kind === "scaffold" || !hasScaffold.value)
  );
}
const debrisTargets = computed(() =>
  items.value.filter(
    (item) => offersStructuralEdits(item) && item.structural !== false
  )
);
const formats = ["PNG", "SVG", "PDF"] as const;
type ExportAction = typeof formats[number] | "clipboard";
const submenus = [
  { id: "edit", label: "Edit", icon: "bi-pencil-square" },
  { id: "copy", label: "Copy", icon: "bi-clipboard" },
  { id: "export", label: "Export", icon: "bi-download" },
  { id: "analyse", label: "Analyse", icon: "bi-graph-up" },
] as const;
type Submenu = typeof submenus[number]["id"];
const activeSubmenu = ref<Submenu | null>(null);
const submenuMenu = ref<HTMLElement>();
const submenuPosition = ref({ left: "0px", top: "0px" });
const regionCoordinatesOpen = ref(false);
const contextContig = computed(() =>
  items.value.find((item) => item.kind === "contig")
);
const regionIsolated = computed(() =>
  props.mapManager.viewAndLayersManager.isRegionIsolated()
);
const uiSettings = useUiSettingsStore();
const currentCoordinateFrame = computed<CoordinateFrame>(() =>
  uiSettings.rulerCoordinateMode === "global"
    ? "assembly"
    : uiSettings.rulerCoordinateMode
);

async function openSubmenu(id: Submenu, focus: boolean) {
  activeSubmenu.value = id;
  await nextTick();
  if (activeSubmenu.value !== id) return;
  const anchor = menu.value
    ?.querySelector(`[data-submenu="${id}"]`)
    ?.getBoundingClientRect();
  const child = submenuMenu.value?.getBoundingClientRect();
  const parent = menu.value?.getBoundingClientRect();
  if (!anchor || !child || !parent) return;
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight;
  const x =
    parent.right + child.width <= width - 8
      ? parent.right - 1
      : Math.max(8, parent.left - child.width + 1);
  submenuPosition.value = {
    left: x + "px",
    top: Math.max(8, Math.min(anchor.top, height - child.height - 8)) + "px",
  };
  if (focus) submenuMenu.value?.querySelector("button")?.focus();
}

function dismissSibling(event: PointerEvent) {
  const target = event.target as Element;
  if (
    target.closest("button") &&
    !target.closest("[data-submenu], .child-menu")
  )
    activeSubmenu.value = null;
}

function openRegionCoordinates() {
  items.value = [];
  regionCoordinatesOpen.value = true;
}

function openHistogram() {
  items.value = [];
  histogramOpen.value = true;
}

function clearRegion() {
  items.value = [];
  props.mapManager.viewAndLayersManager.clearRegionSelection();
}

function isolateRegion() {
  items.value = [];
  props.mapManager.viewAndLayersManager.isolateRegion();
}
function zoomSelection() {
  items.value = [];
  props.mapManager.viewAndLayersManager.zoomToRegion();
}
function isolate() {
  items.value = [];
  props.mapManager.viewAndLayersManager.isolateSelectedEntities();
}
async function closeSubmenu() {
  const previous = activeSubmenu.value;
  activeSubmenu.value = null;
  await nextTick();
  if (previous)
    menu.value
      ?.querySelector<HTMLButtonElement>(`[data-submenu="${previous}"]`)
      ?.focus();
}
useEscDismissableDialog({
  priority: 1060,
  isOpen: () => !!renaming.value || !!items.value.length,
  requestClose: () => {
    activeSubmenu.value = null;
    renaming.value = null;
    items.value = [];
  },
});
function close(event: Event) {
  if (!menu.value?.contains(event.target as Node)) items.value = [];
}
function axisHits(bp: number, hideSingletonScaffold: boolean): AxisHit[] {
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
  const contig = hits[0];
  if (
    scaffold &&
    (!hideSingletonScaffold ||
      !contig ||
      scaffold.startBp < contig.startBP ||
      scaffold.endBp > contig.endBP)
  ) {
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
function itemsAtEvent(event: MouseEvent, hasActiveRegion: boolean): Item[] {
  const manager = props.mapManager;
  const holder = manager.contigDimensionHolder;
  const d = manager.viewAndLayersManager.currentViewState.resolutionDesciptor;
  const [x, y] = manager.map.getEventCoordinate(event);
  const bounds = manager.viewAndLayersManager.getActiveMapPixelBounds(
    d.bpResolution
  );
  const col = x / d.pixelResolution,
    line = -y / d.pixelResolution;
  if (
    col < bounds.colStartPx ||
    col >= bounds.colEndPx ||
    line < bounds.rowStartPx ||
    line >= bounds.rowEndPx
  )
    return [];
  const column = axisHits(
    Math.floor(holder.getFractionalBpOfPx(col, d.bpResolution)),
    hasActiveRegion
  );
  const row = axisHits(
    Math.floor(holder.getFractionalBpOfPx(line, d.bpResolution)),
    hasActiveRegion
  );
  const result: Item[] = [];
  for (const kind of ["contig", "scaffold"] as const) {
    const label = kind === "contig" ? "Contig" : "Scaffold";
    const byColumn = column.find((hit) => hit.kind === kind);
    const byRow = row.find((hit) => hit.kind === kind);
    const title = (hit: AxisHit, axis = "") =>
      `${label}${axis}: ${hit.name} · ${formatLength(hit.endBP - hit.startBP)}`;
    if (byColumn && byRow && byColumn.id !== byRow.id) {
      result.push(
        { ...byColumn, title: title(byColumn, " (column)") },
        { ...byRow, title: title(byRow, " (row)") }
      );
    } else {
      const only = byColumn ?? byRow;
      if (only) result.push({ ...only, title: title(only) });
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
  const extent =
    manager.viewAndLayersManager.selectionInteractions.contigSelectExtent.getExtent();
  const bounds = manager.viewAndLayersManager.getRegionBounds();
  if (
    extent &&
    bounds &&
    containsCoordinate(extent, manager.map.getEventCoordinate(event))
  ) {
    const startBP = Math.max(bounds.columnStart, bounds.rowStart),
      endBP = Math.min(bounds.columnEnd, bounds.rowEnd);
    const rows = formatLength(bounds.rowEnd - bounds.rowStart);
    const columns = formatLength(bounds.columnEnd - bounds.columnStart);
    found.push({
      kind: "selection",
      id: -1,
      name: "active rectangle",
      title: `Region · ${rows} × ${columns}`,
      startBP,
      endBP,
      structural: false,
    });
  }
  found = [...itemsAtEvent(event, found.length > 0), ...found];
  if (!found.length) return;
  activeSubmenu.value = null;
  items.value = found;
  position.value = { x: event.clientX, y: event.clientY };
  await nextTick();
  const rect = menu.value?.getBoundingClientRect();
  if (rect)
    position.value = {
      x: Math.max(
        8,
        Math.min(
          event.clientX,
          document.documentElement.clientWidth - rect.width - 8
        )
      ),
      y: Math.max(
        8,
        Math.min(
          event.clientY,
          document.documentElement.clientHeight - rect.height - 8
        )
      ),
    };
  menu.value?.querySelector("button")?.focus({ preventScroll: true });
}
function zoomTo(item: Item) {
  items.value = [];
  props.mapManager.linearTrackManager.centerOnBpRange(item.startBP, item.endBP);
}
function copyName(item: Item) {
  items.value = [];
  void copyText(
    item.name,
    `${item.kind === "scaffold" ? "Scaffold" : "Contig"} name`
  );
}
function copyPosition(item: Item) {
  items.value = [];
  void copyText(formatLocus(item.name, (item.inContigBp ?? 0) + 1), "Position");
}
function navigate(event: KeyboardEvent) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const activeMenu = (event.target as Element).closest('[role="menu"]');
  const buttons = Array.from(
    activeMenu?.querySelectorAll("button:not(:disabled)") ?? []
  ).filter(
    (b) => b.closest('[role="menu"]') === activeMenu
  ) as HTMLButtonElement[];
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
  } catch (error) {
    reportFailure("Edit assembly", error);
  }
}
async function execute(item: Item, action: "reverse" | "ungroup" | "debris") {
  items.value = [];
  if (busy.value) return;
  const manager = props.mapManager;
  if (action === "debris" && !(await manager.eventManager.confirmDebris(item)))
    return;
  try {
    const api = manager.networkManager.requestManager;
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
  } catch (error) {
    reportFailure("Edit assembly", error);
  }
}
function move(item: Item) {
  items.value = [];
  const manager = props.mapManager;
  if (item.kind === "selection") {
    manager.eventManager.onMoveSelectionClicked();
    return;
  }
  manager.viewAndLayersManager.selectEntityRangeByBp(
    item.startBP,
    item.endBP,
    item.kind === "scaffold" ? "scaffold" : "contig"
  );
  manager.eventManager.onMoveSelectionClicked();
}
function openAnalysis(kind: "moddotplot" | "dotplot" | "search") {
  items.value = [];
  analysis.value = kind;
}
function exportFasta() {
  items.value = [];
  props.mapManager.eventManager.onExportFASTAForSelectionClicked();
}
function copyCoordinates(frame: CoordinateFrame) {
  items.value = [];
  copySelectionCoordinates(props.mapManager, frame);
}
async function requestExport(format: ExportAction) {
  items.value = [];
  const manager = props.mapManager;
  const size = (columns: number, rows: number) =>
    `${columns.toLocaleString()} × ${rows.toLocaleString()}`;
  try {
    const estimate = manager.selectionExportEstimate();
    if (estimate.large) {
      const region = manager.viewAndLayersManager.getRegionBounds();
      const decision = await askForConfirmation({
        title: "Large selection export",
        body: "Rendering this region may take a long time. Cancel to select a smaller region.",
        details: [
          `Region: ${size(estimate.columns, estimate.rows)} bp`,
          `At ${estimate.bin.toLocaleString()} bp/bin: about ${size(
            estimate.nx,
            estimate.ny
          )} bins`,
          `Figure with rulers and tracks: about ${size(
            estimate.width,
            estimate.height
          )} px`,
        ],
        tone: "warn",
        icon: "bi-exclamation-triangle",
        confirmLabel:
          format === "clipboard" ? "Copy as PNG" : `Export ${format}`,
      });
      if (decision !== "confirm") return;
      if (
        JSON.stringify(region) !==
        JSON.stringify(manager.viewAndLayersManager.getRegionBounds())
      ) {
        throw new Error(
          "The region changed. Open the export menu to review the new size."
        );
      }
    }
    await performExport(format);
  } catch (failure) {
    reportFailure("Export selection", failure);
  }
}
async function performExport(format: ExportAction) {
  const notifications = useNotificationCenterStore();
  try {
    const manager = props.mapManager;
    if (format === "clipboard") return await copySelectionPng(manager);
    const method =
      format === "PNG"
        ? manager.exportCurrentMapPng
        : format === "SVG"
        ? manager.exportCurrentMapSvg
        : manager.exportCurrentMapPdf;
    const result = await method.call(manager, undefined, {
      scope: "selection",
    });
    if (result.status === "saved")
      notifications.add("success", `Saved ${result.path ?? result.filename}`);
    if (result.status === "download-started")
      notifications.add("success", `Download started for ${result.filename}`);
  } catch (failure) {
    reportFailure("Export selection", failure);
  }
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
  window.addEventListener("wheel", closeOnWheel, {
    capture: true,
    passive: true,
  });
  const view = props.mapManager.getView();
  viewKeys = [
    view.on("change:center", closeMenu),
    view.on("change:resolution", closeMenu),
  ];
});
onBeforeUnmount(() => {
  target?.removeEventListener("contextmenu", open);
  document.removeEventListener("pointerdown", close);
  window.removeEventListener("resize", close);
  window.removeEventListener("wheel", closeOnWheel, { capture: true });
  viewKeys.forEach((key) => unByKey(key));
  viewKeys = [];
});

const modalFocusElement = ref<HTMLElement | null>(null);
useModalFocus(modalFocusElement, () => !!renaming.value);
</script>
<style scoped>
.assembly-context-menu {
  position: fixed;
  z-index: 1050;
  width: 280px;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 16px);
  overflow: auto;
  overscroll-behavior: contain;
  padding: 0.4rem;
  border: 1px solid var(--hict-ui-border, #cbd5e1);
  background: var(--hict-surface-bg, #fff);
  color: var(--hict-surface-fg, #172033);
  border-radius: 0.4rem;
  box-shadow: 0 4px 24px #0003;
}
.child-menu {
  width: 15rem;
  z-index: 1051;
}
.submenu-arrow {
  float: right;
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
.assembly-context-menu button.debris-action {
  color: var(--bs-danger-text-emphasis, #9e1b26);
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
