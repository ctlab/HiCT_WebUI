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
    <div :style="colorSelectorStyleObject" ref="vPicker"></div>
  </div>
</template>
<script setup lang="ts">
import { Ref, onMounted, ref, watch } from "vue";
import "toolcool-color-picker";
import Picker from "vanilla-picker";
import "vanilla-picker/dist/vanilla-picker.csp.css";
import { ColorTranslator } from "colortranslator";

type position = false | "top" | "bottom" | "left" | "right";

const props = defineProps<{
  position?: position | position[];
  getDefaultColor: () => ColorTranslator | undefined;
}>();

const picker: Ref<Picker | null> = ref(null);

const emit = defineEmits<{
  (e: "onColorChanged", newColor: ColorTranslator): void;
}>();

const currentColor = ref(props.getDefaultColor());

const vPicker: Ref<HTMLElement | null> = ref(null);

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
      picker.value?.setColor(currentColor.value.RGBA, false);
      // console.log("Picker rectangle: new color", currentColor.value);
    }
  }
);

onMounted(() => {
  if (!currentColor.value) {
    currentColor.value = new ColorTranslator("#00000000", { legacyCSS: true });
  }
  if (vPicker.value) {
    picker.value = new Picker({
      parent: vPicker.value,
      color: currentColor.value.RGBA,
      onChange: function (color) {
        currentColor.value = new ColorTranslator(color.rgbaString as string, {
          legacyCSS: true,
        });
        colorSelectorStyleObject.value["background"] = currentColor.value.RGBA;
      },
      onDone: function (color) {
        currentColor.value = new ColorTranslator(color.rgbaString as string, {
          legacyCSS: true,
        });
        colorSelectorStyleObject.value["background"] = currentColor.value.RGBA;
        emit("onColorChanged", currentColor.value as ColorTranslator);
      },
      // @ts-expect-error Library actiually supports multiple terms in positioning
      popup: props.position ?? ["top", "left"],
    });
  }
});

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

:global(.picker_wrapper.popup) {
  z-index: 2147483000 !important;
  position: absolute !important;
  background: #ffffff !important;
  opacity: 1 !important;
  isolation: isolate;
  pointer-events: auto !important;
  max-width: min(18rem, calc(100vw - 1.5rem));
  max-height: min(24rem, calc(100vh - 1.5rem));
  overflow: auto;
}

:global(.picker_wrapper.popup .picker_arrow::before),
:global(.picker_wrapper.popup .picker_arrow::after) {
  background: #ffffff !important;
}

:global(.picker_wrapper.popup button),
:global(.picker_wrapper.popup input) {
  pointer-events: auto !important;
}
</style>
