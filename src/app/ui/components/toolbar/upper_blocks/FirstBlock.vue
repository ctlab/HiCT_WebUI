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
  <div class="block-of-buttons">
    <button
      class="btn btn-outline-primary"
      type="button"
      data-bs-toggle="tooltip"
      data-bs-placement="right"
      title="Zoom out to the next coarser resolution"
      aria-label="Zoom out"
      @click="zoomOut"
    >
      <i class="bi bi-zoom-out"></i>
    </button>
    <button
      class="btn btn-outline-primary"
      type="button"
      data-bs-toggle="tooltip"
      data-bs-placement="right"
      title="Zoom in to the next finer resolution"
      aria-label="Zoom in"
      @click="zoomIn"
    >
      <i class="bi bi-zoom-in"></i>
    </button>
    <button
      class="btn btn-outline-primary"
      type="button"
      data-bs-toggle="tooltip"
      data-bs-placement="right"
      title="Slide to the main diagonal vertically"
      aria-label="Slide to the main diagonal vertically"
      @click="slideVertically"
    >
      <i class="bi bi-arrow-down-up"></i>
    </button>
    <button
      class="btn btn-outline-primary"
      type="button"
      data-bs-toggle="tooltip"
      data-bs-placement="right"
      title="Slide to the main diagonal horizontally"
      aria-label="Slide to the main diagonal horizontally"
      @click="slideHorizontally"
    >
      <i class="bi bi-arrow-left-right"></i>
    </button>
    <button
      class="btn btn-outline-primary"
      type="button"
      data-bs-toggle="tooltip"
      data-bs-placement="right"
      title="Slide to the main diagonal over counter-diagonal"
      aria-label="Slide to the main diagonal over counter-diagonal"
      @click="slideByCounterDiagonal"
    >
      <i class="bi bi-arrows-angle-contract"></i>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import { toast } from "vue-sonner";
import { onMounted, ref, watch } from "vue";

const props = defineProps<{
  readonly mapManager?: ContactMapManager | undefined;
}>();

watch(
  () => props.mapManager,
  (newManager) => {
    if (newManager) {
      const mapMinSize = newManager
        ?.getMap()
        ?.getSize()
        ?.reduce((a, b) => Math.min(a, b));
      PRECISION_THRESHOLD_PX.value = Math.min(100, (mapMinSize ?? 1000) / 10);
      toast.message(
        "Sensitivity threshold for slide to diagonal is set to " +
          PRECISION_THRESHOLD_PX.value
      );
    }
  }
);

const PRECISION_THRESHOLD_PX = ref(150);

const lastVerticalSlideCenterPosition = ref({
  x_bp: 0,
  y_bp: 0,
  zoom: 0,
  bpResolution: 1000,
});
const lastHorizontalSlideCenterPosition = ref({
  x_bp: 0,
  y_bp: 0,
  zoom: 0,
  bpResolution: 1000,
});
const lastCounterDiagonalSlideCenterPosition = ref({
  x_bp: 0,
  y_bp: 0,
  zoom: 0,
  bpResolution: 1000,
});

/**
 * One bounded zoom step about the view center, the same size as a wheel notch. The view's own limits
 * clamp it, so the result is always a valid resolution and the center stays where it was.
 */
function stepZoom(direction: 1 | -1): void {
  const view = props.mapManager?.map?.getView();
  const current = view?.getZoom();
  if (!view || current === undefined) return;
  // The view's own constraint, not the nominal zoom range: the finest usable level is lower.
  const target = view.getConstrainedZoom(current + direction);
  if (target === undefined || Math.abs(target - current) < 1e-9) {
    toast.message(
      direction > 0
        ? "Already at the finest zoom"
        : "The whole map is already in view"
    );
    return;
  }
  view.animate({ zoom: target, duration: 250 });
}

function zoomIn(): void {
  stepZoom(1);
}

function zoomOut(): void {
  stepZoom(-1);
}

function slideVertically() {
  if (props.mapManager) {
    const map = props.mapManager?.map;
    const view = map?.getView();
    const center = view?.getCenter();
    if (map && view && center) {
      const currentResolutionDescriptor =
        props.mapManager?.viewAndLayersManager.currentViewState
          .resolutionDesciptor;
      const [x_px, y_px] = [center[0], -center[1]].map((p) =>
        Math.floor(p / currentResolutionDescriptor.pixelResolution)
      );
      const [x_bp, y_bp] = [x_px, y_px].map((px) =>
        props.mapManager
          ?.getContigDimensionHolder()
          .getStartBpOfPx(px, currentResolutionDescriptor.bpResolution)
      );
      const [last_x_px, last_y_px] = [
        lastVerticalSlideCenterPosition.value.x_bp,
        lastVerticalSlideCenterPosition.value.y_bp,
      ].map((bp) =>
        props.mapManager
          ?.getContigDimensionHolder()
          .getPxContainingBp(bp, currentResolutionDescriptor.bpResolution)
      );

      if (
        x_bp &&
        y_bp &&
        Math.abs(x_px - y_px) < PRECISION_THRESHOLD_PX.value
      ) {
        // Are now close to the main diagonal
        if (
          (lastVerticalSlideCenterPosition.value.x_bp === 0 &&
            lastVerticalSlideCenterPosition.value.y_bp === 0) ||
          !(last_x_px && last_y_px) ||
          Math.abs(last_x_px - last_y_px) < PRECISION_THRESHOLD_PX.value
        ) {
          // Old position is not set or close to the main diagonal at current resolution
          toast.success("Already close to the main diagonal");
        } else {
          toast.message("Returning to the previous position vertically");
          view.animate({
            center: [
              last_x_px * currentResolutionDescriptor.pixelResolution,
              -last_y_px * currentResolutionDescriptor.pixelResolution,
            ],
            zoom: view.getZoom(),
          });
        }
      } else {
        // Was far away from the main diagonal
        lastVerticalSlideCenterPosition.value = {
          x_bp: x_bp ?? 0,
          y_bp: y_bp ?? 0,
          zoom: view.getZoom() ?? 0,
          bpResolution: currentResolutionDescriptor.bpResolution,
        };
        toast.message("Sliding vertically to the main diagonal");
        view.animate({
          center: [center[0], -center[0]],
          zoom: view.getZoom(),
        });
      }
    }
  }
}

function slideHorizontally() {
  if (props.mapManager) {
    const map = props.mapManager?.map;
    const view = map?.getView();
    const center = view?.getCenter();
    if (map && view && center) {
      const currentResolutionDescriptor =
        props.mapManager?.viewAndLayersManager.currentViewState
          .resolutionDesciptor;
      const [x_px, y_px] = [center[0], -center[1]].map((p) =>
        Math.floor(p / currentResolutionDescriptor.pixelResolution)
      );
      const [x_bp, y_bp] = [x_px, y_px].map((px) =>
        props.mapManager
          ?.getContigDimensionHolder()
          .getStartBpOfPx(px, currentResolutionDescriptor.bpResolution)
      );
      const [last_x_px, last_y_px] = [
        lastHorizontalSlideCenterPosition.value.x_bp,
        lastHorizontalSlideCenterPosition.value.y_bp,
      ].map((bp) =>
        props.mapManager
          ?.getContigDimensionHolder()
          .getPxContainingBp(bp, currentResolutionDescriptor.bpResolution)
      );

      if (
        x_bp &&
        y_bp &&
        Math.abs(x_px - y_px) < PRECISION_THRESHOLD_PX.value
      ) {
        // Are now close to the main diagonal
        if (
          (lastHorizontalSlideCenterPosition.value.x_bp === 0 &&
            lastHorizontalSlideCenterPosition.value.y_bp === 0) ||
          !(last_x_px && last_y_px) ||
          Math.abs(last_x_px - last_y_px) < PRECISION_THRESHOLD_PX.value
        ) {
          // Old position is not set or close to the main diagonal at current resolution
          toast.success("Already close to the main diagonal");
        } else {
          toast.message("Returning to the previous position horizontally");
          view.animate({
            center: [
              last_x_px * currentResolutionDescriptor.pixelResolution,
              -last_y_px * currentResolutionDescriptor.pixelResolution,
            ],
            zoom: view.getZoom(),
          });
        }
      } else {
        // Was far away from the main diagonal
        lastHorizontalSlideCenterPosition.value = {
          x_bp: x_bp ?? 0,
          y_bp: y_bp ?? 0,
          zoom: view.getZoom() ?? 0,
          bpResolution: currentResolutionDescriptor.bpResolution,
        };
        toast.message("Sliding horizontally to the main diagonal");
        view.animate({
          center: [-center[1], center[1]],
          zoom: view.getZoom(),
        });
      }
    }
  }
}

function slideByCounterDiagonal() {
  if (props.mapManager) {
    const map = props.mapManager?.map;
    const view = map?.getView();
    const center = view?.getCenter();
    if (map && view && center) {
      const currentResolutionDescriptor =
        props.mapManager?.viewAndLayersManager.currentViewState
          .resolutionDesciptor;
      const [x_px, y_px] = [center[0], -center[1]].map((p) =>
        Math.floor(p / currentResolutionDescriptor.pixelResolution)
      );
      const [x_bp, y_bp] = [x_px, y_px].map((px) =>
        props.mapManager
          ?.getContigDimensionHolder()
          .getStartBpOfPx(px, currentResolutionDescriptor.bpResolution)
      );
      const [last_x_px, last_y_px] = [
        lastCounterDiagonalSlideCenterPosition.value.x_bp,
        lastCounterDiagonalSlideCenterPosition.value.y_bp,
      ].map((bp) =>
        props.mapManager
          ?.getContigDimensionHolder()
          .getPxContainingBp(bp, currentResolutionDescriptor.bpResolution)
      );

      if (
        x_bp &&
        y_bp &&
        Math.abs(x_px - y_px) < PRECISION_THRESHOLD_PX.value
      ) {
        // Are now close to the main diagonal
        if (
          (lastCounterDiagonalSlideCenterPosition.value.x_bp === 0 &&
            lastCounterDiagonalSlideCenterPosition.value.y_bp === 0) ||
          !(last_x_px && last_y_px) ||
          Math.abs(last_x_px - last_y_px) < PRECISION_THRESHOLD_PX.value
        ) {
          // Old position is not set or close to the main diagonal at current resolution
          toast.success("Already close to the main diagonal");
        } else {
          toast.message(
            "Returning to the previous position along counter-diagonal"
          );
          view.animate({
            center: [
              last_x_px * currentResolutionDescriptor.pixelResolution,
              -last_y_px * currentResolutionDescriptor.pixelResolution,
            ],
            zoom: view.getZoom(),
          });
        }
      } else {
        // Was far away from the main diagonal
        lastCounterDiagonalSlideCenterPosition.value = {
          x_bp: x_bp ?? 0,
          y_bp: y_bp ?? 0,
          zoom: view.getZoom() ?? 0,
          bpResolution: currentResolutionDescriptor.bpResolution,
        };
        toast.message("Sliding to the main diagonal");
        view.animate({
          center: [(center[0] - center[1]) / 2, -(center[0] - center[1]) / 2],
          zoom: view.getZoom(),
        });
      }
    }
  }
}
</script>

<style scoped>
.block-of-buttons {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
</style>
