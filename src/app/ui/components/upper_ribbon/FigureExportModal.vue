<template>
  <Teleport to="body">
    <div class="figure-export-backdrop"></div>
    <section
      ref="dialog"
      class="figure-export-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="figure-export-title"
    >
      <header>
        <h5 id="figure-export-title">Export figure</h5>
        <button
          class="btn-close"
          type="button"
          aria-label="Close"
          @click="emit('dismissed')"
        ></button>
      </header>
      <div class="figure-export-body">
        <div class="figure-export-options">
          <label v-if="!sequenceOnly"
            >Area
            <select
              v-model="scope"
              class="form-select form-select-sm"
              aria-label="Export area"
              :disabled="capturing"
            >
              <option value="viewport">Viewport</option>
              <option value="whole-map">Whole map</option>
              <option value="selection">Selected rectangle</option>
            </select>
          </label>
          <label v-if="!sequenceOnly" class="form-check-label"
            ><input
              v-model="crop"
              type="checkbox"
              aria-label="Crop export to map"
              :disabled="capturing"
            />
            Crop to map</label
          >
          <label v-if="!sequenceOnly" class="form-check-label"
            ><input
              v-model="rulers"
              type="checkbox"
              aria-label="Include rulers and FASTA"
              :disabled="capturing"
            />
            Rulers and FASTA</label
          >
          <label v-if="!sequenceOnly" class="form-check-label"
            ><input
              v-model="tracks"
              type="checkbox"
              aria-label="Include 1D tracks"
              :disabled="capturing"
            />
            1D tracks</label
          >
          <button
            class="btn btn-outline-primary btn-sm"
            type="button"
            :disabled="capturing || !!saving"
            @click="capture"
          >
            {{
              capturing
                ? "Capturing…"
                : figure
                ? "Refresh capture"
                : "Capture preview"
            }}
          </button>
        </div>
        <p class="small text-muted">
          {{
            sequenceOnly
              ? "Captures the displayed sequence windows."
              : "Captures the current map layers. To include ModDotPlot, attach its result and choose the overlay or split display before capturing."
          }}
        </p>
        <p v-if="capturing" role="status">
          Capturing figure · {{ Math.round(progress * 100) }}%
        </p>
        <p v-if="error" class="text-danger" role="alert">{{ error }}</p>
        <p v-if="outdated" class="alert alert-info" role="status">
          Options changed. Refresh the capture to apply them. The current
          preview remains unchanged.
        </p>
        <div
          class="figure-export-preview"
          tabindex="0"
          aria-label="Captured figure preview"
        >
          <img v-if="previewUrl" :src="previewUrl" alt="Captured figure" />
          <p v-else>
            Capture a preview to inspect the figure before saving it.
          </p>
        </div>
        <p v-if="figure" class="small mt-2 mb-0">
          {{ figure.width.toLocaleString() }} ×
          {{ figure.height.toLocaleString() }} pixels · captured
          {{ new Date(figure.capturedAt).toLocaleString() }}. All formats use
          this same capture.
        </p>
      </div>
      <footer>
        <span class="small text-muted"
          >Choose a format and save destination.</span
        >
        <div class="figure-export-actions">
          <button
            v-for="format in formats"
            :id="`export-${format}-button`"
            :key="format"
            class="btn btn-outline-primary"
            type="button"
            :disabled="!figure || capturing || !!saving || outdated"
            @click="save(format)"
          >
            {{ saving === format ? "Saving…" : format.toUpperCase() }}
          </button>
          <button
            class="btn btn-secondary"
            type="button"
            @click="emit('dismissed')"
          >
            Close
          </button>
        </div>
      </footer>
    </section>
  </Teleport>
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
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import type { FrozenFigure } from "@/app/core/export/FrozenFigure";
import { useModalFocus } from "@/app/ui/modalFocus";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";
import { notifyFileSave } from "@/app/ui/fileSaveNotice";
import { useStyleStore } from "@/app/stores/styleStore";

const props = defineProps<{
  mapManager: ContactMapManager;
  metadata?: Record<string, unknown>;
}>();
const emit = defineEmits<{ (event: "dismissed"): void }>();
const formats = ["svg", "png", "pdf"] as const;
const dialog = ref<HTMLElement | null>(null);
const scope = ref<"viewport" | "whole-map" | "selection">("viewport");
const crop = ref(true),
  rulers = ref(true),
  tracks = ref(true);
const sequenceOnly = computed(
  () => props.mapManager.networkManager.requestManager.sequenceViewReadOnly
);
const figure = shallowRef<FrozenFigure | null>(null);
const previewUrl = ref("");
const capturing = ref(false),
  progress = ref(0),
  error = ref("");
const saving = ref<"svg" | "png" | "pdf" | null>(null);
const outdated = ref(false);
let disposed = false,
  generation = 0;
let controller: AbortController | undefined;
function releasePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = "";
}
watch([scope, crop, rulers, tracks], () => {
  if (figure.value) outdated.value = true;
});
watch(
  () => props.mapManager,
  () => {
    controller?.abort();
    generation++;
    releasePreview();
    figure.value = null;
    capturing.value = false;
    outdated.value = false;
  }
);
async function capture() {
  if (capturing.value || saving.value) return;
  const current = ++generation,
    manager = props.mapManager;
  controller = new AbortController();
  const signal = controller.signal;
  capturing.value = true;
  progress.value = 0;
  error.value = "";
  try {
    const result = await manager.captureCurrentFigure(
      {
        scope: scope.value,
        cropToMap: crop.value,
        includeRulers: rulers.value,
        includeTracks: tracks.value,
        metadata: props.metadata,
        backgroundColor: useStyleStore().mapBackgroundColor.RGBA,
        signal,
      },
      (value) => {
        if (!disposed && current === generation) progress.value = value;
      }
    );
    if (disposed || current !== generation || signal.aborted) return;
    releasePreview();
    figure.value = result;
    previewUrl.value = URL.createObjectURL(result.png);
    outdated.value = false;
  } catch (failure) {
    if (!disposed && current === generation && !signal.aborted)
      error.value = extractErrorMessage(failure);
  } finally {
    if (!disposed && current === generation) capturing.value = false;
  }
}
async function save(format: "svg" | "png" | "pdf") {
  const captured = figure.value;
  if (!captured || capturing.value || saving.value || outdated.value) return;
  saving.value = format;
  error.value = "";
  try {
    const result = await props.mapManager.saveCapturedFigure(
      captured,
      format,
      undefined,
      (value) => {
        progress.value = value;
      }
    );
    notifyFileSave(result, `${format.toUpperCase()} export`);
  } catch (failure) {
    if (!disposed) error.value = extractErrorMessage(failure);
  } finally {
    if (!disposed) saving.value = null;
  }
}
useModalFocus(dialog);
useEscDismissableDialog({
  priority: 1075,
  isOpen: () => true,
  requestClose: () => emit("dismissed"),
});
onMounted(() => {
  void capture();
});
onBeforeUnmount(() => {
  disposed = true;
  generation++;
  controller?.abort();
  releasePreview();
});
</script>

<style scoped>
.figure-export-backdrop {
  position: fixed;
  inset: 0;
  background: #0007;
  z-index: 1070;
}
.figure-export-dialog {
  position: fixed;
  inset: 4vh 4vw;
  z-index: 1075;
  display: flex;
  flex-direction: column;
  background: #fff;
  color: #172033;
  border: 1px solid #cbd5e1;
  border-radius: 0.6rem;
  box-shadow: 0 12px 40px #0003;
  overflow: hidden;
  font-family: system-ui, sans-serif;
}
header,
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  flex-shrink: 0;
}
header {
  border-bottom: 1px solid #cbd5e1;
}
header h5 {
  margin: 0;
}
footer {
  border-top: 1px solid #cbd5e1;
  flex-wrap: wrap;
}
.figure-export-body {
  padding: 1rem;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}
.figure-export-options,
.figure-export-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.figure-export-options {
  margin-bottom: 0.75rem;
}
.figure-export-preview {
  flex: 1;
  min-height: 160px;
  overflow: auto;
  padding: 1rem;
  background: #e8ecf0;
}
.figure-export-preview img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  margin: auto;
  object-fit: contain;
}
</style>
