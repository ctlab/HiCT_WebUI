<template>
  <Teleport to="body">
    <div class="region-selection-backdrop" @click.self="$emit('dismissed')">
      <section
        ref="dialog"
        class="region-selection-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="region-selection-title"
        tabindex="-1"
      >
        <form @submit.prevent="apply">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 id="region-selection-title" class="m-0">
              Select region by coordinates
            </h5>
            <button
              type="button"
              class="btn-close"
              aria-label="Close"
              @click="$emit('dismissed')"
            ></button>
          </div>
          <p class="small">
            Select independent row and column intervals for dot plots, sequence
            tools and exports. This does not select entities for editing.
          </p>
          <label for="region-convention" class="form-label"
            >Coordinate convention</label
          >
          <select
            id="region-convention"
            :value="convention"
            class="form-select form-select-sm mb-2"
            @change="changeConvention"
          >
            <option value="one-based">
              1-based, inclusive (genome-browser coordinates)
            </option>
            <option value="zero-based">
              0-based, end excluded (BED coordinates)
            </option>
          </select>
          <p class="small text-muted">
            Use assembly positions or current-contig:position. Contig positions
            follow its current orientation. Thousands separators are accepted.
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
          </div>
          <div class="d-flex justify-content-end gap-2">
            <button
              type="button"
              class="btn btn-outline-secondary"
              @click="$emit('dismissed')"
            >
              Cancel
            </button>
            <button type="submit" class="btn btn-primary">Select region</button>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import {
  parseRegion,
  type RegionBounds,
  type CoordinateConvention,
} from "@/app/core/mapmanagers/regionSelection";
import { useModalFocus } from "@/app/ui/modalFocus";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
const props = defineProps<{ mapManager: ContactMapManager }>();
const emit = defineEmits<{ (e: "dismissed"): void }>();
const dialog = ref<HTMLElement | null>(null);
useModalFocus(dialog);
useEscDismissableDialog({
  priority: 1050,
  isOpen: () => true,
  requestClose: () => emit("dismissed"),
});
const layers = computed(() => props.mapManager.viewAndLayersManager);
const convention = ref<CoordinateConvention>("one-based");
const error = ref("");
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
function contigs() {
  const h = props.mapManager.contigDimensionHolder;
  return h.contigDescriptors.map((d, i) => ({
    name: d.contigName,
    start: h.prefix_sum_bp[i],
    length: d.contigLengthBp,
  }));
}
function fill(bounds: RegionBounds) {
  fields.value = {
    rowStart: String(
      bounds.rowStart + (convention.value === "one-based" ? 1 : 0)
    ),
    rowEnd: String(bounds.rowEnd),
    columnStart: String(
      bounds.columnStart + (convention.value === "one-based" ? 1 : 0)
    ),
    columnEnd: String(bounds.columnEnd),
  };
  error.value = "";
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
  return `Current scope: rows ${d.rowStart + shift}–${d.rowEnd}, columns ${
    d.columnStart + shift
  }–${d.columnEnd}.`;
});
function changeConvention(event: Event) {
  const select = event.target as HTMLSelectElement;
  try {
    const parsed = parseRegion(
      fields.value,
      convention.value,
      contigs(),
      layers.value.getRegionDomain()
    );
    convention.value = select.value as CoordinateConvention;
    fill(parsed);
  } catch (failure) {
    error.value = String((failure as Error).message);
    select.value = convention.value;
  }
}
function apply() {
  try {
    if (layers.value !== openedLayers || contextKey() !== openedContext)
      throw Error(
        "The assembly or scopes changed. Reopen this dialog before selecting coordinates."
      );
    layers.value.setRegionBounds(
      parseRegion(
        fields.value,
        convention.value,
        contigs(),
        layers.value.getRegionDomain()
      )
    );
    emit("dismissed");
  } catch (failure) {
    error.value = (failure as Error).message;
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
