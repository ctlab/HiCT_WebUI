<!--
 Copyright (c) 2021-2024 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis, Zakhar Lobanov, Nikita Zheleznov and Computer Technologies Laboratory ITMO University team.

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
  <div class="layer-record">
    <span class="layer-name">{{ layerName }}</span>
    <div class="button-block">
      <i
        v-if="visible"
        class="bi bi-eye-fill visibility-btn"
        @click="updateVisibility"
      ></i>
      <i
        v-if="!visible"
        class="bi bi-eye-slash visibility-btn"
        @click="updateVisibility"
      ></i>
      <ColorPickerRectangle
        :position="['top', 'left']"
        :getDefaultColor="getBaseColor"
        @onColorChanged="updateBackgroundColor"
      ></ColorPickerRectangle>
      <div class="tri-square border-style-btn" @click="updateBorderStyle">
        <i v-if="bordersStyle === 0" class="bi bi-square"></i>
        <i v-if="bordersStyle === 1" class="bi bi-arrow-down-left"></i>
        <i v-if="bordersStyle === 2" class="bi bi-arrow-up-right"></i>
      </div>
      <div
        v-if="enableStyleEditor"
        class="dropdown dropdown-sm"
        data-bs-auto-close="false"
      >
        <i
          class="bi bi-pencil edit-btn dropdown-toggle"
          data-bs-toggle="dropdown"
          aria-expanded="false"
          @click="openStyleEditor"
        ></i>
        <div class="dropdown-menu p-3 track-style-menu">
          <div class="mb-2">
            <label class="form-label" for="track-border-width"
              >Border width</label
            >
            <input
              id="track-border-width"
              class="form-control form-control-sm"
              type="number"
              min="1"
              step="1"
              v-model.number="borderWidth"
            />
          </div>
          <div class="mb-2">
            <label class="form-label">Fill color</label>
            <ColorPickerRectangle
              :position="['top', 'left']"
              :getDefaultColor="getDefaultFillColor"
              @onColorChanged="(c: ColorTranslator) => (fillColor = c)"
            ></ColorPickerRectangle>
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-success" @click="applyStyle">
              Apply
            </button>
            <button class="btn btn-sm btn-outline-secondary" @click="resetStyle">
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type Ref, ref } from "vue";
import { BorderStyle } from "@/app/core/tracks/Track2DSymmetric";
import ColorPickerRectangle from "./ColorPickerRectangle.vue";
import Style from "ol/style/Style";
import { ColorTranslator } from "colortranslator";
import type { ColorLike } from "ol/colorlike";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const props = defineProps<{
  layerName: string;
  getDefaultColor?: () => Style | undefined;
  enableStyleEditor?: boolean;
}>();

function getBaseColor(): ColorTranslator {
  if (props.getDefaultColor) {
    const olColorString = props
      .getDefaultColor()
      ?.getStroke()
      ?.getColor() as ColorLike as string;

    const color = new ColorTranslator(olColorString, { legacyCSS: true });
    if (color) {
      return color;
    }
  }
  return new ColorTranslator("rgb(127, 192, 224)", { legacyCSS: true });
}

const emit = defineEmits<{
  (e: "onColorChanged", layerName: string, newColor: ColorTranslator): void;
  (
    e: "onBorderStyleChanged",
    layerName: string,
    borderStyle: BorderStyle
  ): void;
  (
    e: "onStyleChanged",
    layerName: string,
    borderWidth: number,
    fillColor: ColorTranslator
  ): void;
}>();

const currentColor = ref(new ColorTranslator("#ffaaff", { legacyCSS: true }));
const borderWidth: Ref<number> = ref(2);
const fillColor: Ref<ColorTranslator> = ref(
  new ColorTranslator("rgba(0,0,0,0.0)", { legacyCSS: true })
) as Ref<ColorTranslator>;

const bordersStyle: Ref<number> = ref(0);
const visible: Ref<boolean> = ref(true);

function updateVisibility() {
  visible.value = !visible.value;
  emit(
    "onBorderStyleChanged",
    props.layerName as string,
    visible.value ? bordersStyle.value : BorderStyle.NONE
  );
}
function updateBackgroundColor(newColor: ColorTranslator) {
  currentColor.value = newColor;
  emit("onColorChanged", props.layerName as string, newColor);
}
function updateBorderStyle() {
  bordersStyle.value += 1;
  bordersStyle.value %= 3;

  emit("onBorderStyleChanged", props.layerName as string, bordersStyle.value);
  // (Object.values(BorderStyle) as Array<BorderStyle>)[bordersStyle.value]
}

function getDefaultFillColor(): ColorTranslator {
  if (props.getDefaultColor) {
    const olColorString = props
      .getDefaultColor()
      ?.getFill()
      ?.getColor() as ColorLike as string;
    if (olColorString) {
      return new ColorTranslator(olColorString, { legacyCSS: true });
    }
  }
  return new ColorTranslator("rgba(0,0,0,0.0)", { legacyCSS: true });
}

function openStyleEditor() {
  if (!props.getDefaultColor) return;
  const style = props.getDefaultColor();
  const strokeWidth = style?.getStroke()?.getWidth();
  if (strokeWidth) {
    borderWidth.value = strokeWidth;
  }
  fillColor.value = getDefaultFillColor();
}

function applyStyle() {
  emit(
    "onStyleChanged",
    props.layerName as string,
    borderWidth.value,
    fillColor.value
  );
}

function resetStyle() {
  openStyleEditor();
  applyStyle();
}
</script>

<style scoped>
.layer-record {
  /* layer */

  /* Auto layout */
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
  padding: 0px;
  gap: 20px;

  width: 200px;
  height: 20px;

  /* Inside auto layout */
  flex: none;
  order: 0;
  flex-grow: 0;
}

.layer-name {
  /* layer name */

  width: 21px;
  height: 20px;

  /* Body/Small */
  font-family: "Roboto", ui-sans-serif;
  font-style: normal;
  font-weight: 400;
  font-size: 13px;
  line-height: 19px;

  /* identical to box height, or 150% */
  display: flex;
  align-items: center;
  text-align: center;

  /* Global/08. Dark */
  color: #343a40;

  /* Inside auto layout */
  flex: none;
  order: 0;
  flex-grow: 0;
}

.button-block {
  /* btn block */

  /* Auto layout */
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  padding: 0px;
  gap: 12px;

  width: 116px;
  height: 20px;

  /* Inside auto layout */
  flex: none;
  order: 1;
  flex-grow: 0;
}

.visibility-btn {
  /* Eye fill */

  width: 20px;
  height: 20px;

  /* Inside auto layout */
  flex: none;
  order: 0;
  flex-grow: 0;

  display: flex;
  justify-content: center;
  align-items: center;
}

.border-style-btn {
  /* Square */

  width: 20px;
  height: 20px;

  /* Inside auto layout */
  flex: none;
  order: 2;
  flex-grow: 0;

  display: flex;
  justify-content: center;
  align-items: center;
}

.edit-btn {
  /* Pencil */

  width: 20px;
  height: 20px;

  /* Inside auto layout */
  flex: none;
  order: 3;
  flex-grow: 0;

  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
