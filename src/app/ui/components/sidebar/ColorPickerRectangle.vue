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
  <div class="color-picker-rectangle-root">
    <div
      :style="colorSelectorStyleObject"
      ref="vPicker"
      role="button"
      tabindex="0"
      aria-label="Choose color"
      @click.stop="togglePicker"
      @keydown.enter.prevent.stop="togglePicker"
      @keydown.space.prevent.stop="togglePicker"
    ></div>
  </div>
</template>
<script setup lang="ts">
import { Ref, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import "toolcool-color-picker";
import Picker from "vanilla-picker";
import "vanilla-picker/dist/vanilla-picker.csp.css";
import { ColorTranslator } from "colortranslator";

type PickerPosition = false | "top" | "bottom" | "left" | "right";

const props = defineProps<{
  position?: PickerPosition | PickerPosition[];
  getDefaultColor: () => ColorTranslator | undefined;
}>();

const picker: Ref<Picker | null> = ref(null);

const emit = defineEmits<{
  (e: "onColorChanged", newColor: ColorTranslator): void;
}>();

const currentColor = ref(props.getDefaultColor());

const vPicker: Ref<HTMLElement | null> = ref(null);
const overlayRoot: Ref<HTMLDivElement | null> = ref(null);
const pickerOpen = ref(false);
let suppressPickerEvents = false;

watch(
  () => props.getDefaultColor(),
  () => {
    const nc = props.getDefaultColor();
    if (nc) {
      // console.log("Picker rectangle: new color", nc);
      // nc = "rgba(255,0,0,1.000000)";
      // const re =
      //   /\s*rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*((\d+)([,.](\d+))?)\s*\)\s*/;
      // const alpha = nc.replace(re, "$4").replace(/,/, ".");
      // currentColor.value = nc.replace(re, `rgba($1,$2,$3,${alpha})`);
      currentColor.value = nc;
      colorSelectorStyleObject.value["background"] = currentColor.value.RGBA;
      if (picker.value) {
        suppressPickerEvents = true;
        try {
          picker.value.setColor(currentColor.value.RGBA, false);
        } finally {
          suppressPickerEvents = false;
        }
      }
      // console.log("Picker rectangle: new color", currentColor.value);
    }
  }
);

onMounted(() => {
  if (!currentColor.value) {
    currentColor.value = new ColorTranslator("#00000000", { legacyCSS: true });
  }
  if (vPicker.value) {
    overlayRoot.value = document.createElement("div");
    overlayRoot.value.className = "hict-color-picker-overlay";
    overlayRoot.value.style.display = "none";
    document.body.appendChild(overlayRoot.value);
    picker.value = new Picker({
      parent: overlayRoot.value,
      color: currentColor.value.RGBA,
      onChange: function (color) {
        currentColor.value = new ColorTranslator(color.rgbaString as string, {
          legacyCSS: true,
        });
        colorSelectorStyleObject.value["background"] = currentColor.value.RGBA;
        if (pickerOpen.value && !suppressPickerEvents) {
          emit("onColorChanged", currentColor.value as ColorTranslator);
        }
      },
      onDone: function (color) {
        currentColor.value = new ColorTranslator(color.rgbaString as string, {
          legacyCSS: true,
        });
        colorSelectorStyleObject.value["background"] = currentColor.value.RGBA;
        if (pickerOpen.value && !suppressPickerEvents) {
          emit("onColorChanged", currentColor.value as ColorTranslator);
        }
        closePicker();
      },
      popup: false,
    });
    document.addEventListener("mousedown", onDocumentMouseDown, true);
    window.addEventListener("resize", positionOverlay);
    window.addEventListener("scroll", positionOverlay, true);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDocumentMouseDown, true);
  window.removeEventListener("resize", positionOverlay);
  window.removeEventListener("scroll", positionOverlay, true);
  picker.value?.destroy();
  overlayRoot.value?.remove();
});

function togglePicker() {
  if (pickerOpen.value) {
    closePicker();
  } else {
    openPicker();
  }
}

function openPicker() {
  if (!overlayRoot.value) {
    return;
  }
  pickerOpen.value = true;
  overlayRoot.value.style.display = "block";
  overlayRoot.value.style.visibility = "hidden";
  nextTick(() => {
    positionOverlay();
    if (overlayRoot.value) {
      overlayRoot.value.style.visibility = "visible";
    }
  });
}

function closePicker() {
  pickerOpen.value = false;
  if (overlayRoot.value) {
    overlayRoot.value.style.display = "none";
  }
}

function onDocumentMouseDown(event: MouseEvent) {
  if (!pickerOpen.value) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }
  if (vPicker.value?.contains(target) || overlayRoot.value?.contains(target)) {
    return;
  }
  closePicker();
}

function positionOverlay() {
  if (!pickerOpen.value || !vPicker.value || !overlayRoot.value) {
    return;
  }
  const trigger = vPicker.value.getBoundingClientRect();
  const overlay = overlayRoot.value.getBoundingClientRect();
  const margin = 8;
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const preferredPositions = (Array.isArray(props.position)
    ? props.position
    : [props.position ?? "top"]
  ).filter((candidate): candidate is Exclude<PickerPosition, false> => Boolean(candidate));
  const candidates: Exclude<PickerPosition, false>[] = preferredPositions.length > 0 ? preferredPositions : ["top"];

  const rawPlacement = (candidate: Exclude<PickerPosition, false>) => {
    switch (candidate) {
      case "top":
        return { left: trigger.left, top: trigger.top - overlay.height - margin };
      case "bottom":
        return { left: trigger.left, top: trigger.bottom + margin };
      case "left":
        return { left: trigger.left - overlay.width - margin, top: trigger.top };
      case "right":
        return { left: trigger.right + margin, top: trigger.top };
    }
  };

  let placement = rawPlacement(candidates[0]);
  for (const candidate of candidates) {
    const candidatePlacement = rawPlacement(candidate);
    if (
      candidatePlacement.left >= margin &&
      candidatePlacement.top >= margin &&
      candidatePlacement.left + overlay.width <= viewportWidth - margin &&
      candidatePlacement.top + overlay.height <= viewportHeight - margin
    ) {
      placement = candidatePlacement;
      break;
    }
  }

  overlayRoot.value.style.left = `${clamp(
    placement.left,
    margin,
    Math.max(margin, viewportWidth - overlay.width - margin)
  )}px`;
  overlayRoot.value.style.top = `${clamp(
    placement.top,
    margin,
    Math.max(margin, viewportHeight - overlay.height - margin)
  )}px`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const colorSelectorStyleObject: Ref<Record<string, string>> = ref({
  width: "16px",
  height: "16px",

  /* Global/05. Warning */
  background: currentColor.value?.HEXA ?? "#FFC107",

  /* Inside auto layout */
  flex: "none",
  order: "1",
  "flex-grow": "0",

  display: "flex",
  "justify-content": "center",
  "align-items": "center",

  border: "1px black solid",
  "border-radius": "2px",
});
</script>
<style scoped>
.color-picker-rectangle-root {
  position: relative;
  overflow: visible;
  z-index: 1;
}

:global(.hict-color-picker-overlay) {
  position: fixed;
  z-index: 2147483000 !important;
  max-width: min(18rem, calc(100vw - 1.5rem));
  max-height: min(24rem, calc(100vh - 1.5rem));
  overflow: auto;
  isolation: isolate;
  pointer-events: auto;
}

:global(.hict-color-picker-overlay .picker_wrapper),
:global(.picker_wrapper.popup) {
  background: #ffffff !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  max-width: min(18rem, calc(100vw - 1.5rem));
  max-height: min(24rem, calc(100vh - 1.5rem));
  overflow: auto;
}

:global(.hict-color-picker-overlay .picker_wrapper) {
  position: static !important;
}

:global(.picker_wrapper.popup .picker_arrow::before),
:global(.picker_wrapper.popup .picker_arrow::after) {
  background: #ffffff !important;
}

:global(.hict-color-picker-overlay .picker_wrapper button),
:global(.hict-color-picker-overlay .picker_wrapper input),
:global(.picker_wrapper.popup button),
:global(.picker_wrapper.popup input) {
  pointer-events: auto !important;
}
</style>
