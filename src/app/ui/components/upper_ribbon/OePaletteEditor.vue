<template>
  <section
    class="oe-palette-editor"
    aria-label="Primary O/E colormap"
    :aria-busy="busy || loading"
  >
    <h6>Primary O/E colormap</h6>
    <p class="small text-muted">
      The viewport supplies contact ratios. This colormap sends them to the
      primary map with neutral white at 1.
    </p>
    <label class="preset-label"
      >O/E palette
      <select
        class="form-select form-select-sm"
        :value="preset"
        :disabled="loading"
        @change="choosePreset(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="p in OE_PALETTE_PRESETS" :key="p.id" :value="p.id">
          {{ p.label }}
        </option>
        <option value="custom" disabled>Custom colors</option>
      </select>
    </label>
    <div class="oe-palette-fields">
      <label
        >Lower ratio (depleted)
        <div class="color-row">
          <input
            v-model.number="lower"
            class="form-control form-control-sm"
            type="number"
            step="any"
            aria-label="O/E lower ratio"
            :disabled="loading"
          />
          <ColorPickerRectangle
            v-if="!loading"
            :get-default-color="fromColorFn"
            position="bottom"
            @on-color-changed="fromColor = $event"
          />
        </div>
      </label>
      <label
        >Upper ratio (enriched)
        <div class="color-row">
          <input
            v-model.number="upper"
            class="form-control form-control-sm"
            type="number"
            step="any"
            aria-label="O/E upper ratio"
            :disabled="loading"
          />
          <ColorPickerRectangle
            v-if="!loading"
            :get-default-color="toColorFn"
            position="bottom"
            @on-color-changed="toColor = $event"
          />
        </div>
      </label>
    </div>
    <SignalRangeControl
      v-if="!loading"
      :min="sliderMin"
      :max="sliderMax"
      :lower="lower"
      :upper="upper"
      :lower-text="String(lower)"
      :upper-text="String(upper)"
      :lower-color="fromColor.RGBA"
      :upper-color="toColor.RGBA"
      :neutral="1"
      @adjustment-start="keepLimits"
      @lower="
        lower = Math.max(Number.EPSILON, Math.min($event, 1 - Number.EPSILON))
      "
      @upper="upper = Math.max($event, 1 + Number.EPSILON)"
    />
    <p class="small text-muted">
      Changes preview automatically. Limits must satisfy 0 &lt; lower &lt; 1
      &lt; upper. The Observed graph stays unchanged.
    </p>
    <p v-if="error" class="text-danger small" role="alert">{{ error }}</p>
    <p v-else class="small text-muted" role="status">
      {{
        loading
          ? "Loading palette…"
          : busy
          ? "Updating O/E palette…"
          : "Palette ready"
      }}
    </p>
    <button
      class="btn btn-sm btn-outline-secondary"
      :disabled="busy || loading"
      @click="reload"
    >
      Reload palette
    </button>
    <input
      ref="importInput"
      class="d-none"
      type="file"
      accept=".json,application/json"
      @change="readImport"
    />
  </section>
</template>
<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import { ColorTranslator } from "colortranslator";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { GetVisualizationOptionsRequest } from "@/app/core/net/api/request";
import SimpleLinearGradient from "@/app/core/visualization/colormap/SimpleLinearGradient";
import {
  OE_PALETTE_PRESETS,
  oePalettePresetId,
  parseOePalette,
} from "@/app/core/visualization/oePalette";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";
import { saveFileWithNotice } from "@/app/ui/fileSaveNotice";
import ColorPickerRectangle from "../sidebar/ColorPickerRectangle.vue";
import SignalRangeControl from "../sidebar/SignalRangeControl.vue";
const props = defineProps<{ mapManager: ContactMapManager }>();
const emit = defineEmits<{ (event: "busy", value: boolean): void }>();
const lower = ref(0.5),
  upper = ref(2),
  fromColor = shallowRef(new ColorTranslator("#2166acff", { legacyCSS: true })),
  toColor = shallowRef(new ColorTranslator("#b2182bff", { legacyCSS: true }));
const fromColorFn = () => fromColor.value,
  toColorFn = () => toColor.value;
const preset = computed(() =>
  oePalettePresetId(fromColor.value.HEXA, toColor.value.HEXA)
);
const domainLower = ref(0),
  domainUpper = ref(4);
const sliderMin = computed(() =>
  Math.min(domainLower.value, Number.isFinite(lower.value) ? lower.value : 0)
);
const sliderMax = computed(() =>
  Math.max(domainUpper.value, Number.isFinite(upper.value) ? upper.value : 4)
);
function keepLimits() {
  domainLower.value = sliderMin.value;
  domainUpper.value = sliderMax.value;
}
const loading = ref(true),
  busy = ref(false),
  ready = ref(false),
  error = ref(""),
  importInput = ref<HTMLInputElement>();
watch(
  () => loading.value || busy.value,
  (value) => emit("busy", value),
  { immediate: true }
);
let timer: number | undefined,
  disposed = false,
  hydrating = false,
  generation = 0;
let committed = "",
  pendingKey = "",
  publication = Promise.resolve();
const draft = () =>
  parseOePalette({
    min: lower.value,
    max: upper.value,
    startColor: fromColor.value.HEXA,
    endColor: toColor.value.HEXA,
  });
const key = () => JSON.stringify(draft());
function assign(p: ReturnType<typeof parseOePalette>) {
  lower.value = p.min;
  upper.value = p.max;
  fromColor.value = new ColorTranslator(p.startColor, { legacyCSS: true });
  toColor.value = new ColorTranslator(p.endColor, { legacyCSS: true });
}
function choosePreset(id: string) {
  const p = OE_PALETTE_PRESETS.find((p) => p.id === id);
  if (p) {
    fromColor.value = new ColorTranslator(p.startColor, { legacyCSS: true });
    toColor.value = new ColorTranslator(p.endColor, { legacyCSS: true });
  }
}
async function apply(): Promise<void> {
  window.clearTimeout(timer);
  if (!ready.value)
    throw new Error("Reload the O/E palette before applying changes.");
  let palette: ReturnType<typeof parseOePalette>;
  try {
    palette = draft();
  } catch (e) {
    error.value = extractErrorMessage(e);
    throw e;
  }
  const snapshot = JSON.stringify(palette);
  if ((snapshot === committed && !pendingKey) || snapshot === pendingKey) {
    await publication;
    return;
  }
  pendingKey = snapshot;
  busy.value = true;
  const requestGeneration = generation;
  const manager = props.mapManager;
  const next = publication
    .catch(() => undefined)
    .then(async () => {
      // An older queued draft must not add a network round trip before the latest one.
      if (
        disposed ||
        requestGeneration !== generation ||
        props.mapManager !== manager ||
        pendingKey !== snapshot ||
        committed === snapshot
      )
        return;
      await manager.visualizationManager.applyObservedExpectedPalette(palette);
      if (
        disposed ||
        requestGeneration !== generation ||
        props.mapManager !== manager
      )
        return;
      committed = snapshot;
      error.value = "";
    });
  publication = next;
  try {
    await next;
  } catch (e) {
    if (!disposed) error.value = extractErrorMessage(e);
    throw e;
  } finally {
    if (pendingKey === snapshot) {
      pendingKey = "";
      busy.value = false;
    }
  }
}
async function flushValid(): Promise<void> {
  window.clearTimeout(timer);
  if (!ready.value || loading.value) {
    await publication.catch(() => undefined);
    return;
  }
  try {
    draft();
  } catch {
    return;
  }
  await apply();
}
async function reload(): Promise<void> {
  window.clearTimeout(timer);
  ++generation;
  const current = generation;
  const manager = props.mapManager;
  loading.value = true;
  ready.value = false;
  hydrating = true;
  try {
    await publication.catch(() => undefined);
    await manager.visualizationManager.waitForPendingOptionRequests();
    if (disposed || current !== generation || props.mapManager !== manager)
      return;
    const options =
      await manager.networkManager.requestManager.getVisualizationOptions(
        new GetVisualizationOptionsRequest({})
      );
    if (disposed || current !== generation || props.mapManager !== manager)
      return;
    if (options.signalDisplayMode !== "OBSERVED_OVER_EXPECTED")
      throw new Error("Select Observed/Expected before editing its palette.");
    if (!(options.colormap instanceof SimpleLinearGradient))
      throw new Error("This O/E colormap cannot be edited here.");
    const p = {
      min: options.colormap.minSignal,
      max: options.colormap.maxSignal,
      startColor: options.colormap.startColorRGBA.HEXA,
      endColor: options.colormap.endColorRGBA.HEXA,
    };
    assign(p);
    ready.value = true;
    committed = JSON.stringify(p);
    domainLower.value = 0;
    domainUpper.value = Math.max(4, p.max);
    parseOePalette(p);
    error.value = "";
  } catch (e) {
    if (!disposed) error.value = extractErrorMessage(e);
  } finally {
    if (!disposed && current === generation) {
      loading.value = false;
      queueMicrotask(() => {
        hydrating = false;
      });
    }
  }
}
async function reset(): Promise<void> {
  ready.value = true;
  domainLower.value = 0;
  domainUpper.value = 4;
  assign({ min: 0.5, max: 2, ...OE_PALETTE_PRESETS[0] });
  await apply();
}
async function exportPalette(): Promise<void> {
  const palette = draft();
  await saveFileWithNotice(
    new Blob(
      [
        JSON.stringify(
          { schemaVersion: 1, target: "PRIMARY_OE", palette },
          null,
          2
        ),
      ],
      { type: "application/json" }
    ),
    "hict_oe_palette.json",
    "pipeline",
    "O/E palette"
  );
}
function importPalette() {
  importInput.value?.click();
}
async function readImport(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  if (!file) return;
  window.clearTimeout(timer);
  await publication.catch(() => undefined);
  try {
    if (file.size > 2_000_000)
      throw new Error("Palette files must be smaller than 2 MB.");
    const document = JSON.parse(await file.text());
    if (document.schemaVersion !== 1 || document.target !== "PRIMARY_OE")
      throw new Error(
        "Choose a Primary O/E palette file. Import Observed graphs in the Observed graph tab."
      );
    assign(parseOePalette(document.palette));
    ready.value = true;
    await apply();
  } catch (e) {
    error.value = extractErrorMessage(e);
  } finally {
    input.value = "";
  }
}
watch(
  [lower, upper, () => fromColor.value.HEXA, () => toColor.value.HEXA],
  () => {
    if (loading.value || hydrating || disposed) return;
    window.clearTimeout(timer);
    try {
      key();
      error.value = "";
    } catch (e) {
      error.value = extractErrorMessage(e);
      return;
    }
    timer = window.setTimeout(() => {
      void apply().catch(() => undefined);
    }, 350);
  }
);
watch(
  () => props.mapManager,
  () => void reload()
);
onMounted(() => void reload());
onBeforeUnmount(() => {
  disposed = true;
  ++generation;
  window.clearTimeout(timer);
});
defineExpose({
  apply,
  flushValid,
  reload,
  reset,
  exportPalette,
  importPalette,
});
</script>
<style scoped>
.oe-palette-editor {
  max-width: 720px;
  margin: 0 auto;
  padding: 12px;
  min-width: 0;
}
.preset-label {
  display: grid;
  gap: 6px;
  font-size: 0.875rem;
}
.oe-palette-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 18px 0 8px;
}
.oe-palette-fields label {
  min-width: 0;
  font-size: 0.875rem;
}
.color-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}
.color-row input {
  min-width: 0;
}
@media (max-width: 600px) {
  .oe-palette-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
