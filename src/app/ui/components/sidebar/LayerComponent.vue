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
  <div class="layer-record">
    <span class="layer-name" :title="displayName">{{ displayName }}</span>
    <div class="button-block">
      <i
        v-if="layerName !== 'Background' && visible"
        class="bi bi-eye-fill visibility-btn"
        @click="updateVisibility"
      ></i>
      <i
        v-if="layerName !== 'Background' && !visible"
        class="bi bi-eye-slash visibility-btn"
        @click="updateVisibility"
      ></i>
      <ColorPickerRectangle
        :position="['top', 'left']"
        :getDefaultColor="getBaseColor"
        @onColorChanged="updateBackgroundColor"
      ></ColorPickerRectangle>
      <div
        v-if="layerName !== 'Background' && !layerName.endsWith('names')"
        class="tri-square border-style-btn"
        @click="updateBorderStyle"
      >
        <i v-if="bordersStyle === 0" class="bi bi-square"></i>
        <i v-if="bordersStyle === 1" class="bi bi-arrow-down-left"></i>
        <i v-if="bordersStyle === 2" class="bi bi-arrow-up-right"></i>
      </div>
      <select
        v-if="layerName.endsWith('names')"
        class="form-select form-select-sm caption-placement"
        :aria-label="`${displayName} caption side`"
        title="Caption position"
        v-model.number="bordersStyle"
        @change="
          visible = true;
          emit('onBorderStyleChanged', layerName, bordersStyle);
        "
      >
        <option :value="BorderStyle.TOP">Above</option>
        <option :value="BorderStyle.BOTTOM">Below</option>
        <option :value="BorderStyle.LEFT">Left</option>
        <option :value="BorderStyle.RIGHT">Right</option>
        <option :value="BorderStyle.FULL">Inside</option>
      </select>
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
          <label
            v-if="layerName === 'Contigs' || layerName === 'Scaffolds'"
            class="form-check mb-2"
          >
            <input
              type="checkbox"
              class="form-check-input"
              v-model="borderOutline"
            />
            Black border outline
          </label>
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
            <label class="form-label" for="track-label-size">Label size</label>
            <input
              id="track-label-size"
              class="form-control form-control-sm"
              type="number"
              min="6"
              step="1"
              v-model.number="labelSize"
            />
          </div>
          <div class="mb-2">
            <label class="form-label" for="track-label-offset"
              >Label offset</label
            >
            <input
              id="track-label-offset"
              class="form-control form-control-sm"
              type="number"
              min="0"
              step="0.1"
              v-model.number="labelOffsetMultiplier"
            />
          </div>
          <div class="mb-2" v-if="props.layerName.includes('names')">
            <div class="form-check">
              <input
                id="track-label-bold"
                class="form-check-input"
                type="checkbox"
                v-model="labelBold"
              />
              <label class="form-check-label" for="track-label-bold"
                >Bold</label
              >
            </div>
            <div class="form-check mt-1">
              <input
                id="track-label-outline"
                class="form-check-input"
                type="checkbox"
                v-model="labelOutline"
              />
              <label class="form-check-label" for="track-label-outline"
                >Outline</label
              >
            </div>
            <div class="mt-2">
              <label class="form-label" for="track-label-outline-width"
                >Outline width</label
              >
              <input
                id="track-label-outline-width"
                class="form-control form-control-sm"
                type="number"
                min="0"
                step="0.5"
                v-model.number="labelOutlineWidth"
                :disabled="!labelOutline"
              />
            </div>
          </div>
          <div class="mb-2">
            <div class="form-check">
              <input
                id="track-export-svg"
                class="form-check-input"
                type="checkbox"
                v-model="includeInSvg"
              />
              <label class="form-check-label" for="track-export-svg">
                Include in SVG export
              </label>
            </div>
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-success" @click="applyStyle">
              Apply
            </button>
            <button
              class="btn btn-sm btn-outline-secondary"
              @click="resetStyle"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
      <div v-else-if="layerName !== 'Background'" class="edit-spacer"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type Ref, ref, watch } from "vue";
import { BorderStyle } from "@/app/core/tracks/Track2DSymmetric";
import ColorPickerRectangle from "./ColorPickerRectangle.vue";
import Style from "ol/style/Style";
import { ColorTranslator } from "colortranslator";
import type { ColorLike } from "ol/colorlike";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const props = defineProps<{
  layerName: string;
  currentBorderStyle?: BorderStyle;
  getDefaultColor?: () => Style | undefined;
  enableStyleEditor?: boolean;
  getLabelSize?: () => number;
  getLabelOffsetMultiplier?: () => number;
  getLabelBold?: () => boolean;
  getLabelOutline?: () => boolean;
  getLabelOutlineWidth?: () => number;
  getIncludeInSvg?: () => boolean;
  getBorderOutline?: () => boolean;
}>();

function getBaseColor(): ColorTranslator {
  try {
    if (props.getDefaultColor) {
      const style = props.getDefaultColor();
      const olColorString = style?.getStroke()?.getColor() as ColorLike as
        | string
        | undefined;
      if (olColorString) {
        return new ColorTranslator(olColorString, { legacyCSS: true });
      }
    }
  } catch (e) {
    // fall through to default
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
    fillColor: ColorTranslator,
    labelSize: number,
    labelOffsetMultiplier: number,
    labelBold: boolean,
    labelOutline: boolean,
    labelOutlineWidth: number,
    includeInSvg: boolean,
    borderOutline: boolean
  ): void;
}>();

const currentColor = ref(new ColorTranslator("#ffaaff", { legacyCSS: true }));
const borderWidth: Ref<number> = ref(2);
const fillColor: Ref<ColorTranslator> = ref(
  new ColorTranslator("rgba(0,0,0,0.0)", { legacyCSS: true })
) as Ref<ColorTranslator>;
const labelSize: Ref<number> = ref(12);
const labelOffsetMultiplier: Ref<number> = ref(1.25);
const labelBold: Ref<boolean> = ref(true);
const labelOutline: Ref<boolean> = ref(true);
const labelOutlineWidth: Ref<number> = ref(2);
const includeInSvg: Ref<boolean> = ref(true);
const borderOutline = ref(false);

// Internal names drive behavior elsewhere (borders vs names, track lookup); only the text shown differs.
const DISPLAY_NAMES: Record<string, string> = {
  Contigs: "Contig borders",
  Scaffolds: "Scaffold borders",
  Cnames: "Contig names",
  Snames: "Scaffold names",
};
const displayName = computed(
  () => DISPLAY_NAMES[props.layerName] ?? props.layerName
);

// Contig names default below and scaffold names above, so they do not share a line.
const bordersStyle: Ref<number> = ref(
  props.layerName === "Cnames"
    ? BorderStyle.BOTTOM
    : props.layerName.includes("names")
    ? BorderStyle.TOP
    : 0
);
const visible: Ref<boolean> = ref(true);

watch(
  () => props.currentBorderStyle,
  (style) => {
    if (style === undefined) return;
    visible.value = style !== BorderStyle.NONE;
    if (visible.value) bordersStyle.value = style;
  },
  { immediate: true }
);

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
  borderOutline.value = props.getBorderOutline?.() ?? false;
  if (!props.getDefaultColor) return;
  const style = props.getDefaultColor();
  const strokeWidth = style?.getStroke()?.getWidth();
  if (strokeWidth) {
    borderWidth.value = strokeWidth;
  }
  fillColor.value = getDefaultFillColor();
  if (props.getLabelSize) {
    labelSize.value = props.getLabelSize();
  }
  if (props.getLabelOffsetMultiplier) {
    labelOffsetMultiplier.value = props.getLabelOffsetMultiplier();
  }
  if (props.getLabelBold) {
    labelBold.value = props.getLabelBold();
  }
  if (props.getLabelOutline) {
    labelOutline.value = props.getLabelOutline();
  }
  if (props.getLabelOutlineWidth) {
    labelOutlineWidth.value = props.getLabelOutlineWidth();
  }
  if (props.getIncludeInSvg) {
    includeInSvg.value = props.getIncludeInSvg();
  }
}

function applyStyle() {
  emit(
    "onStyleChanged",
    props.layerName as string,
    borderWidth.value,
    fillColor.value,
    labelSize.value,
    labelOffsetMultiplier.value,
    labelBold.value,
    labelOutline.value,
    labelOutlineWidth.value,
    includeInSvg.value,
    borderOutline.value
  );
}

function resetStyle() {
  openStyleEditor();
  applyStyle();
}
</script>

<style scoped>
.caption-placement {
  width: 4.9rem;
  font-size: 0.8rem;
  padding-left: 0.4rem;
  padding-right: 1.4rem;
}
.layer-record {
  /* layer */

  /* Auto layout */
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
  padding: 0px;
  gap: 8px;

  width: 100%;
  min-height: 20px;
  height: auto;
  overflow: visible;

  /* Inside auto layout */
  flex: none;
  order: 0;
  flex-grow: 0;
}

.layer-name {
  /* layer name: takes the free space; the button column stays right-aligned */

  flex: 1 1 6.5rem;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  height: 20px;

  /* Body/Small */
  font-family: var(--hict-font-sans);
  font-style: normal;
  font-weight: 400;
  font-size: 13px;
  line-height: 19px;

  /* identical to box height, or 150% */
  display: block;
  text-align: left;

  /* Global/08. Dark */
  color: #343a40;

  order: 0;
}

.button-block {
  /* btn block */

  /* Auto layout */
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  padding: 0px;
  gap: 8px;

  width: auto;
  min-height: 20px;
  height: auto;
  overflow: visible;

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

.edit-spacer {
  width: 20px;
  height: 20px;
  flex: none;
  order: 3;
  flex-grow: 0;
}
</style>
