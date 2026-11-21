<template>
  <Teleport to="body">
    <div class="region-selection-backdrop" @click.self="dismiss">
      <section
        ref="dialog"
        class="region-selection-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="region-selection-title"
        tabindex="-1"
      >
        <form @submit.prevent="apply" @input="copyStatus = ''">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 id="region-selection-title" class="m-0">
              Select region by coordinates
            </h5>
            <button
              type="button"
              class="btn-close"
              aria-label="Close"
              :disabled="cutPending"
              @click="dismiss"
            ></button>
          </div>
          <p class="small">
            Select independent row and column intervals for dot plots, sequence
            tools and exports. This does not select entities for editing.
          </p>
          <div class="region-coordinate-row">
            <div>
              <label for="region-frame" class="form-label"
                >Coordinate frame</label
              >
              <select
                id="region-frame"
                :value="frame"
                class="form-select form-select-sm mb-2"
                @change="changeFrame"
              >
                <option value="assembly">Assembly (global)</option>
                <option value="scaffold">Scaffold (in-scf)</option>
                <option value="contig">Contig (in-ctg)</option>
              </select>
            </div>
            <div>
              <label for="region-convention" class="form-label"
                >Coordinate convention</label
              >
              <select
                id="region-convention"
                :value="convention"
                class="form-select form-select-sm mb-2"
                @change="changeConvention"
              >
                <option value="one-based">1-based, inclusive</option>
                <option value="zero-based">0-based, end excluded</option>
              </select>
            </div>
          </div>
          <p class="small text-muted">
            Use assembly positions, <code>scf:name:position</code> or
            <code>ctg:name:position</code>. Positions follow the current
            assembly orientation. Scaffold coordinates exclude AGP padding.
            <template v-if="frame !== 'assembly'">
              Endpoints without a unique name use
              <code>assembly:position</code>.
            </template>
          </p>
          <fieldset v-for="axis in axes" :key="axis.key" class="mb-3">
            <legend class="fs-6 mb-1">{{ axis.label }}</legend>
            <div class="region-coordinate-row">
              <div>
                <label
                  :for="`region-${axis.key}-start`"
                  class="form-label small"
                  >Start</label
                >
                <input
                  :id="`region-${axis.key}-start`"
                  v-model="fields[axis.start]"
                  class="form-control"
                  autocomplete="off"
                  required
                />
              </div>
              <div>
                <label :for="`region-${axis.key}-end`" class="form-label small"
                  >End</label
                >
                <input
                  :id="`region-${axis.key}-end`"
                  v-model="fields[axis.end]"
                  class="form-control"
                  autocomplete="off"
                  required
                />
              </div>
            </div>
          </fieldset>
          <p class="small text-muted">{{ domainLabel }}</p>
          <p v-if="error" role="alert" class="text-danger small">{{ error }}</p>
          <p v-if="copyStatus" role="status" class="small text-success">
            {{ copyStatus }}
          </p>
          <details class="mb-3">
            <summary>Paste region</summary>
            <label for="paste-region" class="form-label"
              >Copied HiCT coordinates</label
            >
            <textarea
              id="paste-region"
              v-model="pasteText"
              class="form-control"
              rows="3"
              @input="previewPaste"
            />
          </details>
          <div class="d-flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary"
              @click="useViewport"
            >
              Use current view
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary"
              @click="fill(layers.getRegionDomain())"
            >
              Use full scope
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary"
              :disabled="cutPending"
              @click="copyCoordinates"
            >
              Copy coordinates
            </button>
          </div>
          <div class="d-flex justify-content-end gap-2">
            <button
              type="button"
              class="btn btn-outline-secondary"
              :disabled="cutPending"
              @click="dismiss"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="btn btn-primary"
              :disabled="cutPending || invalidPaste"
            >
              Select region
            </button>
          </div>
        </form>
        <details v-if="canCut" class="mt-3 pt-2 border-top">
          <summary>Cut at a coordinate</summary>
          <form class="mt-2" @submit.prevent="cutAtCoordinate">
            <label for="exact-cut-position" class="form-label">
              Cut after position
            </label>
            <input
              id="exact-cut-position"
              v-model="cutPosition"
              class="form-control"
              aria-describedby="exact-cut-help"
              autocomplete="off"
              :disabled="cutPending"
              @input="cutError = ''"
              required
            />
            <p id="exact-cut-help" class="form-text">
              Use a 1-based assembly, scaffold or contig position. The cut keeps
              all bases and can be undone.
            </p>
            <p v-if="cutError" role="alert" class="text-danger small">
              {{ cutError }}
            </p>
            <button
              type="submit"
              class="btn btn-outline-primary"
              :disabled="cutPending"
            >
              {{ cutPending ? "Cutting…" : "Cut contig" }}
            </button>
          </form>
        </details>
      </section>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { copyRegionCoordinates } from "@/app/core/mapmanagers/contextMenuActions";
import {
  formatBoundary,
  getCoordinateReferences,
  parseBoundary,
  parseCopiedRegion,
  parseRegion,
  type RegionBounds,
  type CoordinateFrame,
  type CoordinateConvention,
} from "@/app/core/mapmanagers/regionSelection";
import { useModalFocus } from "@/app/ui/modalFocus";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
const props = defineProps<{ mapManager: ContactMapManager }>();
const emit = defineEmits<{ (e: "dismissed"): void }>();
const dialog = ref<HTMLElement | null>(null);
const cutPosition = ref("");
const cutPending = ref(false);
const cutError = ref("");
useModalFocus(dialog);
useEscDismissableDialog({
  priority: 1050,
  isOpen: () => true,
  requestClose: dismiss,
});
function dismiss() {
  if (!cutPending.value) emit("dismissed");
}
const layers = computed(() => props.mapManager.viewAndLayersManager);
const canCut = computed(() => {
  const api = props.mapManager.networkManager.requestManager;
  return (
    api.sourceCapabilities.PRIMARY?.sequenceScaleTiles === true &&
    !api.sequenceViewReadOnly
  );
});
const convention = ref<CoordinateConvention>("one-based");
const frame = ref<CoordinateFrame>("assembly");
const error = ref("");
const copyStatus = ref("");
const fields = ref<Record<keyof RegionBounds, string>>({
  rowStart: "",
  rowEnd: "",
  columnStart: "",
  columnEnd: "",
});
const axes = [
  { key: "row", label: "Rows (vertical)", start: "rowStart", end: "rowEnd" },
  {
    key: "column",
    label: "Columns (horizontal)",
    start: "columnStart",
    end: "columnEnd",
  },
] as const;
function contextKey() {
  const h = props.mapManager.networkManager.requestManager.history.applied;
  return `${h?.session}:${h?.revision}:${layers.value.axisScopeRevision}`;
}
const openedContext = contextKey();
const openedLayers = layers.value;
const references = getCoordinateReferences(props.mapManager);
function fill(bounds: RegionBounds) {
  const boundary = (bp: number, end: boolean) =>
    formatBoundary(bp, end, convention.value, references, frame.value);
  fields.value = {
    rowStart: boundary(bounds.rowStart, false),
    rowEnd: boundary(bounds.rowEnd, true),
    columnStart: boundary(bounds.columnStart, false),
    columnEnd: boundary(bounds.columnEnd, true),
  };
  error.value = "";
  copyStatus.value = "";
}
const pasteText = ref("");
const invalidPaste = ref(false);
function previewPaste(event: Event) {
  const text = (event.target as HTMLTextAreaElement).value;
  invalidPaste.value = false;
  error.value = "";
  if (!text.trim()) return;
  try {
    const preview = parseCopiedRegion(
      text,
      references,
      layers.value.getRegionDomain()
    );
    convention.value = preview.convention;
    frame.value = preview.frame;
    fill(preview.bounds);
  } catch (failure) {
    invalidPaste.value = true;
    error.value = (failure as Error).message;
  }
}
function useViewport() {
  fill(
    layers.value.regionFromExtent(
      props.mapManager
        .getView()
        .calculateExtent(props.mapManager.getMap().getSize())
    ) ?? layers.value.getRegionDomain()
  );
}
fill(
  layers.value.getRegionBounds() ??
    layers.value.regionFromExtent(
      props.mapManager
        .getView()
        .calculateExtent(props.mapManager.getMap().getSize())
    ) ??
    layers.value.getRegionDomain()
);
const domainLabel = computed(() => {
  const d = layers.value.getRegionDomain(),
    shift = convention.value === "one-based" ? 1 : 0;
  return `Current scope (assembly): rows ${d.rowStart + shift}–${
    d.rowEnd
  }, columns ${d.columnStart + shift}–${d.columnEnd}.`;
});
function parseFields(): RegionBounds {
  if (layers.value !== openedLayers || contextKey() !== openedContext)
    throw Error(
      "The assembly or scopes changed. Reopen this dialog to use the current coordinates."
    );
  return parseRegion(
    fields.value,
    convention.value,
    references,
    layers.value.getRegionDomain(),
    frame.value
  );
}
function changeFormat(
  frameValue: CoordinateFrame,
  conventionValue: CoordinateConvention
) {
  try {
    const parsed = parseFields();
    convention.value = conventionValue;
    frame.value = frameValue;
    fill(parsed);
  } catch (failure) {
    error.value = String((failure as Error).message);
  }
}
function changeConvention(event: Event) {
  const select = event.target as HTMLSelectElement;
  changeFormat(frame.value, select.value as CoordinateConvention);
  select.value = convention.value;
}
function changeFrame(event: Event) {
  const select = event.target as HTMLSelectElement;
  changeFormat(select.value as CoordinateFrame, convention.value);
  select.value = frame.value;
}
async function copyCoordinates() {
  copyStatus.value = "";
  try {
    const region = parseFields();
    error.value = "";
    const copied = await copyRegionCoordinates(
      props.mapManager,
      region,
      frame.value,
      convention.value
    );
    if (copied) copyStatus.value = "Coordinates copied.";
    else
      error.value =
        "Clipboard unavailable. Copy the coordinate fields manually.";
  } catch (failure) {
    error.value = (failure as Error).message;
  }
}
function apply() {
  if (cutPending.value || invalidPaste.value) return;
  try {
    layers.value.setRegionBounds(parseFields());
    emit("dismissed");
  } catch (failure) {
    error.value = (failure as Error).message;
  }
}

async function cutAtCoordinate() {
  if (cutPending.value) return;
  cutError.value = "";
  try {
    if (layers.value !== openedLayers || contextKey() !== openedContext)
      throw Error(
        "The assembly or scopes changed. Reopen this dialog before cutting."
      );
    const bp = parseBoundary(
      cutPosition.value,
      true,
      "one-based",
      references,
      frame.value
    );
    const eventManager = props.mapManager.eventManager;
    const target = eventManager.getExactCutTarget(bp);
    if (!target)
      throw Error("Choose a base boundary inside an editable contig.");
    cutPending.value = true;
    if (await eventManager.cutAtExactTarget(target)) emit("dismissed");
  } catch (failure) {
    cutError.value = (failure as Error).message;
  } finally {
    cutPending.value = false;
  }
}
</script>
<style scoped>
.region-selection-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1060;
  background: rgba(15, 23, 42, 0.38);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.region-selection-dialog {
  background: white;
  color: #0f172a;
  border-radius: 0.6rem;
  padding: 1.25rem;
  width: min(100%, 42rem);
  max-height: calc(100vh - 2rem);
  overflow: auto;
  box-shadow: 0 1rem 3rem #0003;
}
.region-coordinate-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
@media (max-width: 480px) {
  .region-coordinate-row {
    grid-template-columns: 1fr;
  }
}
</style>
