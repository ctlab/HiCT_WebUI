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
        <div class="entity-title">
          {{ item.kind === "scaffold" ? "Scaffold" : "Contig" }}:
          {{ item.name }}
        </div>
        <button role="menuitem" @click="beginRename(item)">Rename…</button>
        <template v-if="item.kind === 'scaffold' || !hasScaffold">
          <button role="menuitem" @click="execute(item, 'reverse')">
            Reverse {{ item.kind }}
          </button>
          <button role="menuitem" @click="move(item)">
            Move {{ item.kind }}…
          </button>
          <button
            v-if="item.kind === 'scaffold'"
            role="menuitem"
            @click="execute(item, 'ungroup')"
          >
            Ungroup into singletons
          </button>
          <button role="menuitem" @click="execute(item, 'debris')">
            Move to debris and hide
          </button>
        </template>
      </section>
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
import type { ScaffoldDescriptor } from "@/app/core/domain/ScaffoldDescriptor";
import {
  ReverseSelectionRangeRequest,
  UngroupContigsFromScaffoldRequest,
  MoveSelectionToDebrisRequest,
} from "@/app/core/net/api/request";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
type Item = {
  kind: "contig" | "scaffold";
  id: number;
  name: string;
  startBP: number;
  endBP: number;
};
const props = defineProps<{ mapManager: ContactMapManager }>();
const items = ref<Item[]>([]),
  renaming = ref<Item | null>(null),
  newName = ref("");
const invalidName = computed(() => /[\s\p{Cc}]/u.test(newName.value.trim()));
const menu = ref<HTMLElement>(),
  nameInput = ref<HTMLInputElement>();
const position = ref({ x: 0, y: 0 });
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
async function open(event: MouseEvent) {
  if (busy.value) return;
  const manager = props.mapManager;
  const found: Item[] = [];
  for (const feature of manager.map.getFeaturesAtPixel(
    manager.map.getEventPixel(event),
    { hitTolerance: 5 }
  )) {
    const contig = feature.get("contigDescriptor") as
      | ContigDescriptor
      | undefined;
    const scaffold = feature.get("scaffolDescriptor") as
      | ScaffoldDescriptor
      | undefined;
    if (contig) {
      const order =
        manager.contigDimensionHolder.contigIdToOrd[contig.contigId];
      const prefix = manager.contigDimensionHolder.prefix_sum_bp;
      found.push({
        kind: "contig",
        id: contig.contigId,
        name: contig.contigName,
        startBP: prefix[order],
        endBP: prefix[order + 1],
      });
    }
    if (scaffold?.scaffoldBordersBP)
      found.push({
        kind: "scaffold",
        id: scaffold.scaffoldId,
        name: scaffold.scaffoldName,
        ...scaffold.scaffoldBordersBP,
      });
  }
  // A contig label need not overlap its scaffold's drawn outline.
  const contig = found.find((item) => item.kind === "contig");
  if (contig && !found.some((item) => item.kind === "scaffold")) {
    const scaffold = manager.scaffoldHolder.getScaffoldLocusByBp(
      contig.startBP
    );
    if (scaffold)
      found.push({
        kind: "scaffold",
        id: scaffold.scaffoldId,
        name: scaffold.scaffoldName,
        startBP: scaffold.startBp,
        endBP: scaffold.endBp,
      });
  }
  if (!found.length) {
    items.value = [];
    return;
  }
  event.preventDefault();
  items.value = found.filter(
    (item, index) =>
      found.findIndex(
        (other) => other.kind === item.kind && other.id === item.id
      ) === index
  );
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
watch(
  () => props.mapManager.networkManager.requestManager.history.applied,
  () => {
    items.value = [];
    renaming.value = null;
  }
);
let target: HTMLElement | undefined;
onMounted(() => {
  target = props.mapManager.map.getViewport();
  target.addEventListener("contextmenu", open);
  document.addEventListener("pointerdown", close);
  window.addEventListener("resize", close);
});
onBeforeUnmount(() => {
  target?.removeEventListener("contextmenu", open);
  document.removeEventListener("pointerdown", close);
  window.removeEventListener("resize", close);
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
