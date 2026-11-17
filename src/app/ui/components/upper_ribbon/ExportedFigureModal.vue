<template>
  <Teleport to="body">
    <div class="figure-backdrop"></div>
    <section
      ref="dialog"
      class="figure-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="figure-viewer-title"
    >
      <header>
        <h5 id="figure-viewer-title">Exported figure</h5>
        <button
          class="btn-close"
          type="button"
          aria-label="Close"
          @click="emit('dismissed')"
        ></button>
      </header>
      <div class="figure-tools">
        <button
          class="btn btn-outline-primary btn-sm"
          type="button"
          @click="choose"
        >
          Open PNG or SVG…
        </button>
        <input
          ref="fileInput"
          type="file"
          accept=".png,.svg,image/png,image/svg+xml"
          hidden
          @change="selected"
        />
        <template v-if="image">
          <button
            class="btn btn-outline-secondary btn-sm"
            type="button"
            :aria-pressed="zoom === null"
            @click="zoom = null"
          >
            Fit
          </button>
          <button
            class="btn btn-outline-secondary btn-sm"
            type="button"
            :aria-pressed="zoom === 1"
            @click="zoom = 1"
          >
            Actual size
          </button>
          <button
            class="btn btn-outline-secondary btn-sm"
            type="button"
            aria-label="Zoom out figure"
            :disabled="(zoom ?? fitScale) <= 0.0625"
            @click="changeZoom(-1)"
          >
            −
          </button>
          <button
            class="btn btn-outline-secondary btn-sm"
            type="button"
            aria-label="Zoom in figure"
            :disabled="(zoom ?? fitScale) >= 8"
            @click="changeZoom(1)"
          >
            +
          </button>
          <span>{{ Math.round((zoom ?? fitScale) * 100) }}%</span>
        </template>
      </div>
      <p v-if="loading" class="figure-message" role="status">Opening figure…</p>
      <p v-if="error" class="figure-message text-danger" role="alert">
        {{ error }}
      </p>
      <div
        ref="viewport"
        class="figure-viewport"
        tabindex="0"
        aria-label="Figure preview"
      >
        <img
          v-if="image"
          :src="image.url"
          :alt="filename"
          :style="imageStyle"
        />
        <p v-else-if="!loading" class="figure-empty">
          Choose an exported PNG or SVG to inspect it here. The open assembly
          stays available after closing this viewer.
        </p>
      </div>
      <footer>
        <span class="figure-caption">{{
          image
            ? `${filename} · ${image.width.toLocaleString()} × ${image.height.toLocaleString()} pixels`
            : "Read-only image viewer"
        }}</span>
        <button
          class="btn btn-secondary"
          type="button"
          @click="emit('dismissed')"
        >
          Close
        </button>
      </footer>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { canPickLocalFile, pickFigureFile } from "@/app/core/export/FileSave";
import { useModalFocus } from "@/app/ui/modalFocus";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";

const emit = defineEmits<{ (event: "dismissed"): void }>();
const dialog = ref<HTMLElement | null>(null);
const viewport = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const image = ref<{ url: string; width: number; height: number } | null>(null);
const filename = ref("");
const loading = ref(false),
  error = ref("");
const zoom = ref<number | null>(null);
const viewportSize = ref([1, 1]);
let generation = 0,
  disposed = false;
let observer: ResizeObserver | undefined;
const fitScale = computed(() =>
  image.value
    ? Math.min(
        1,
        Math.max(1, viewportSize.value[0] - 32) / image.value.width,
        Math.max(1, viewportSize.value[1] - 32) / image.value.height
      )
    : 1
);
const imageStyle = computed(() =>
  image.value
    ? {
        width: `${image.value.width * (zoom.value ?? fitScale.value)}px`,
        height: `${image.value.height * (zoom.value ?? fitScale.value)}px`,
      }
    : {}
);
function changeZoom(direction: number) {
  zoom.value = Math.max(
    0.0625,
    Math.min(
      8,
      (zoom.value ?? fitScale.value) * (direction > 0 ? 1.5 : 1 / 1.5)
    )
  );
}
function releaseImage() {
  if (image.value) URL.revokeObjectURL(image.value.url);
  image.value = null;
}
async function open(file: File) {
  const current = ++generation;
  loading.value = true;
  error.value = "";
  let url: string | undefined;
  try {
    const extension = file.name.split(".").at(-1)?.toLowerCase();
    if (!["png", "svg"].includes(extension ?? ""))
      throw Error("Choose a PNG or SVG figure.");
    if (file.size === 0 || file.size > 64 * 1024 * 1024)
      throw Error("Choose a non-empty figure no larger than 64 MiB.");
    const bytes = new Uint8Array(await file.slice(0, 24).arrayBuffer());
    if (extension === "png") {
      if (
        bytes.length < 24 ||
        ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
      )
        throw Error("This file is not a valid PNG image.");
      const view = new DataView(bytes.buffer);
      const width = view.getUint32(16),
        height = view.getUint32(20);
      if (!width || !height || width * height > 128 * 1024 * 1024)
        throw Error("The figure exceeds the 128-megapixel preview limit.");
    }
    // Keep SVG in image context. Never insert file markup into the application DOM.
    url = URL.createObjectURL(
      new Blob([file], {
        type: extension === "png" ? "image/png" : "image/svg+xml",
      })
    );
    const decoded = new Image();
    decoded.src = url;
    await decoded.decode();
    if (disposed || current !== generation) return;
    if (
      !decoded.naturalWidth ||
      !decoded.naturalHeight ||
      decoded.naturalWidth * decoded.naturalHeight > 128 * 1024 * 1024
    )
      throw Error("The figure exceeds the 128-megapixel preview limit.");
    releaseImage();
    image.value = {
      url,
      width: decoded.naturalWidth,
      height: decoded.naturalHeight,
    };
    url = undefined;
    filename.value = file.name;
    zoom.value = null;
    if (viewport.value) {
      viewport.value.scrollTop = 0;
      viewport.value.scrollLeft = 0;
    }
  } catch (failure) {
    if (!disposed && current === generation)
      error.value = extractErrorMessage(failure);
  } finally {
    if (url) URL.revokeObjectURL(url);
    if (!disposed && current === generation) loading.value = false;
  }
}
async function choose() {
  if (!canPickLocalFile()) {
    fileInput.value?.click();
    return;
  }
  try {
    const file = await pickFigureFile();
    if (file && !disposed) await open(file);
  } catch (failure) {
    if (!disposed) error.value = extractErrorMessage(failure);
  }
}
function selected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) void open(file);
}
useModalFocus(dialog);
useEscDismissableDialog({
  priority: 1075,
  isOpen: () => true,
  requestClose: () => emit("dismissed"),
});
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    viewportSize.value = [
      entries[0].contentRect.width,
      entries[0].contentRect.height,
    ];
  });
  if (viewport.value) observer.observe(viewport.value);
});
onBeforeUnmount(() => {
  disposed = true;
  generation++;
  observer?.disconnect();
  releaseImage();
});
</script>

<style scoped>
.figure-backdrop {
  position: fixed;
  inset: 0;
  background: #0007;
  z-index: 1070;
}
.figure-dialog {
  position: fixed;
  inset: 3vh 3vw;
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
}
.figure-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
}
.figure-viewport {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: #e8ecf0;
  padding: 1rem;
}
.figure-viewport img {
  display: block;
  max-width: none;
  max-height: none;
  margin: auto;
  background: #fff;
}
.figure-message {
  padding: 0 1rem;
}
.figure-empty {
  max-width: 36rem;
  margin: 3rem auto;
}
.figure-caption {
  overflow-wrap: anywhere;
  min-width: 0;
}
</style>
