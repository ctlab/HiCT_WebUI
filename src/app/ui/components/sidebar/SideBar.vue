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
  <aside class="sidebar" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <button
      type="button"
      class="sidebar-collapse-toggle"
      :title="sidebarCollapsed ? 'Show side panel' : 'Hide side panel (more room for the map)'"
      :aria-label="sidebarCollapsed ? 'Show side panel' : 'Hide side panel'"
      :aria-expanded="!sidebarCollapsed"
      @click="toggleSidebarCollapsed"
    >
      <i :class="sidebarCollapsed ? 'bi bi-chevron-double-left' : 'bi bi-chevron-double-right'"></i>
    </button>
    <div v-if="!props.mapManager && !sidebarCollapsed" class="sidebar-empty-hint">
      Settings for borders, colors, presets, contigs and the edit journal appear here once a map is open.
    </div>
    <div id="upper-block" v-show="!sidebarCollapsed">
      <!-- <div id="minimap">
        <MiniMap
          :map-manager="props.mapManager"
          v-if="props.mapManager"
        ></MiniMap>
      </div> -->

      <button
        v-if="props.mapManager"
        type="button"
        class="layers-block-toggle"
        :aria-expanded="layersBlockExpanded"
        aria-controls="layers-block"
        @click="toggleLayersBlock"
      >
        <i :class="layersBlockExpanded ? 'bi bi-chevron-down' : 'bi bi-chevron-right'"></i>
        Borders &amp; labels
      </button>
      <div id="layers-block" v-if="props.mapManager" v-show="layersBlockExpanded">
        <!-- Instantiate layer components here using v-for -->
        <LayerComponent
          v-for="layer in layers"
          v-bind:key="layer.name"
          v-bind:layer-name="layer.name"
          :getDefaultColor="layer.getStyle"
          :getLabelSize="layer.getLabelSize"
          :getLabelOffsetMultiplier="layer.getLabelOffsetMultiplier"
          :getLabelBold="layer.getLabelBold"
          :getLabelOutline="layer.getLabelOutline"
          :getLabelOutlineWidth="layer.getLabelOutlineWidth"
          :getIncludeInSvg="layer.getIncludeInSvg"
          :getBorderOutline="() => getBorderOutline(layer.name)"
          :enableStyleEditor="layer.enableStyleEditor"
          :current-border-style="currentBorderStyle(layer.name)"
          @onColorChanged="onColorChanged"
          @onBorderStyleChanged="onBorderStyleChanged"
          @onStyleChanged="onStyleChanged"
        >
        </LayerComponent>
      </div>

      <div v-if="props.mapManager" class="sidebar-panel-selector px-2 py-2">
        <div class="btn-group w-100" role="group" aria-label="Sidebar content">
          <button
            type="button"
            class="btn btn-sm"
            :class="activeSidebarPanel === 'visualization' ? 'btn-primary' : 'btn-outline-primary'"
            @click="activeSidebarPanel = 'visualization'"
          >
            Visualization
          </button>
          <button
            type="button"
            class="btn btn-sm"
            :class="activeSidebarPanel === 'entities' ? 'btn-primary' : 'btn-outline-primary'"
            @click="activeSidebarPanel = 'entities'"
          >
            Entities
          </button>
          <button type="button" class="btn btn-sm"
            :class="activeSidebarPanel === 'history' ? 'btn-primary' : 'btn-outline-primary'"
            :aria-pressed="activeSidebarPanel === 'history'" @click="activeSidebarPanel = 'history'">Journal</button>
        </div>
      </div>

      <AssemblyHistory v-if="props.mapManager"
        :network-manager="props.mapManager.networkManager" :expanded="activeSidebarPanel === 'history'" />
      <div v-if="props.mapManager" class="sidebar-panel-content">
        <template v-if="activeSidebarPanel === 'visualization'">
          <div v-if="showLayerSelector" class="visualization-source-selector px-2 pt-2">
            <div class="source-selection-label">Layer</div>
            <div v-if="hasTwoSources" class="visualization-source-row">
              <div
                class="btn-group flex-grow-1"
                role="group"
                aria-label="Visualization source"
              >
                <button
                  type="button"
                  class="btn btn-sm"
                  :class="activeVisualizationSource === 'PRIMARY' ? 'btn-primary' : 'btn-outline-primary'"
                  :aria-pressed="activeVisualizationSource === 'PRIMARY'"
                  :title="primaryMapFilename ? `Primary: ${primaryMapFilename}` : 'Primary source'"
                  @click="selectVisualizationSource('PRIMARY')"
                >
                  Primary
                </button>
                <button
                  type="button"
                  class="btn btn-sm"
                  :class="activeVisualizationSource === 'SECONDARY' ? 'btn-primary' : 'btn-outline-primary'"
                  :aria-pressed="activeVisualizationSource === 'SECONDARY'"
                  :title="secondaryMapFilename ? `Secondary: ${secondaryMapFilename}` : 'Secondary source'"
                  @click="selectVisualizationSource('SECONDARY')"
                >
                  Secondary
                </button>
              </div>
              <button
                type="button"
                class="btn btn-sm layer-swap-button"
                :class="layersSwapped ? 'btn-secondary active' : 'btn-outline-secondary'"
                title="Swap sources (which map is drawn on top)"
                aria-label="Swap sources"
                @click="swapSources"
              >
                <i class="bi bi-shuffle"></i>
              </button>
            </div>
            <div class="visualization-half-row" :class="{ 'mt-2': hasTwoSources }">
              <div class="half-stack" role="group" aria-label="Triangle to edit">
                <button
                  v-for="half in (['upper', 'lower'] as const)"
                  :key="half"
                  type="button"
                  class="btn btn-sm half-button"
                  :class="isHalfActive(half) ? 'btn-primary' : 'btn-outline-primary'"
                  :aria-pressed="isHalfActive(half)"
                  :disabled="!halfAvailable(half)"
                  :title="!halfAvailable(half)
                    ? `${sourceLabel} is not drawn in the ${half} triangle`
                    : halvesLinked && sourceSpansBothHalves
                    ? `Edit only the ${half} triangle (unlinks the triangles)`
                    : `Edit the ${half} triangle`"
                  @click="selectHalf(half)"
                >
                  <svg class="half-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" />
                    <path :d="half === 'upper' ? 'M2 2H14V14Z' : 'M2 2V14H14Z'" fill="currentColor" />
                  </svg>
                  {{ half === "upper" ? "Upper" : "Lower" }} triangle
                  <span v-if="halfLabelSuffix(half)" class="half-mode">{{ halfLabelSuffix(half) }}</span>
                </button>
              </div>
              <button
                type="button"
                class="btn btn-sm tall-icon-button"
                :class="halvesLinked ? 'btn-primary' : 'btn-outline-secondary'"
                :aria-pressed="halvesLinked"
                :disabled="!sourceSpansBothHalves"
                :title="!sourceSpansBothHalves
                  ? `${sourceLabel} is drawn in one triangle only`
                  : halvesLinked
                  ? 'Linked: changes apply to both triangles. Click to edit one triangle.'
                  : 'Unlinked: changes apply to the selected triangle only. Click to link.'"
                aria-label="Link upper and lower triangles"
                @click="toggleHalvesLinked"
              >
                <i class="bi" :class="halvesLinked ? 'bi-lock-fill' : 'bi-unlock'"></i>
              </button>
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary tall-icon-button"
                title="Swap upper and lower triangles"
                aria-label="Swap upper and lower triangles"
                @click="swapHalves"
              >
                <i class="bi bi-arrow-down-up"></i>
              </button>
            </div>
            <div v-if="activeSourceTargets.length === 0" class="half-hint">
              {{ sourceLabel }} is not part of the current rendering pipeline.
            </div>
            <select
              v-if="!halvesLinked && activeHalfTargets.length > 1"
              v-model="activeVisualizationTargetId"
              class="form-select form-select-sm mt-2"
              aria-label="Rendering pipeline colormap target"
            >
              <option v-for="target in activeHalfTargets" :key="target.id" :value="target.id">{{ target.label }}</option>
            </select>
          </div>
          <VisualziationSettingsEditor :map-manager="props.mapManager" />

          <!-- <div id="color-range" v-if="props.mapManager">
            <ContrastSelector :map-manager="props.mapManager" />
          </div> -->

          <div id="saved-visual-settings">
            <SavedVisualOptions :map-manager="props.mapManager"></SavedVisualOptions>
          </div>
        </template>

        <template v-else-if="activeSidebarPanel === 'entities'">
          <div id="saved-locations">
            <SavedLocations :map-manager="props.mapManager"></SavedLocations>
          </div>
        </template>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import AssemblyHistory from "../AssemblyHistory.vue";
import LayerComponent from "@/app/ui/components/sidebar/LayerComponent.vue";
import SavedLocations from "@/app/ui/components/sidebar/SavedLocations.vue";
import { computed, onMounted, onUnmounted, ref, watch, type Ref } from "vue";
import { CommonEventManager } from "@/app/core/mapmanagers/CommonEventManager";
import { BorderStyle, NamePlacement } from "@/app/core/tracks/Track2DSymmetric";
import Style from "ol/style/Style";
import { toast } from "vue-sonner";
import Stroke from "ol/style/Stroke";
import { useStyleStore } from "@/app/stores/styleStore";
import { useSessionStore } from "@/app/stores/sessionStore";
// import GradientEditor from "@/app/ui/components/sidebar/GradientEditor.vue";
import VisualziationSettingsEditor from "./VisualziationSettingsEditor.vue";
import SavedVisualOptions from "./SavedVisualOptions.vue";
import { storeToRefs } from "pinia";
import { ColorTranslator } from "colortranslator";
import { useMatrixViewStore } from "@/app/stores/matrixViewStore";

const stylesStore = useStyleStore();
const matrixViewStore = useMatrixViewStore();
const activeSidebarPanel = ref<"visualization" | "entities" | "history">("visualization");

// Per-viewer layout conveniences; storage can be unavailable (private mode).
function readLayoutFlag(key: string, fallback: boolean): boolean {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}
function writeLayoutFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* Layout still works without persistence. */
  }
}
const sidebarCollapsed = ref(readLayoutFlag("hict.sidebar.collapsed", false));
const layersBlockExpanded = ref(readLayoutFlag("hict.sidebar.layersExpanded", true));
function toggleSidebarCollapsed(): void {
  sidebarCollapsed.value = !sidebarCollapsed.value;
  writeLayoutFlag("hict.sidebar.collapsed", sidebarCollapsed.value);
}
function toggleLayersBlock(): void {
  layersBlockExpanded.value = !layersBlockExpanded.value;
  writeLayoutFlag("hict.sidebar.layersExpanded", layersBlockExpanded.value);
}

const { mapBackgroundColor } = storeToRefs(stylesStore);
const { openMapFilename: primaryMapFilename, secondaryMapFilename } = storeToRefs(
  useSessionStore()
);
const {
  presentationMode,
  activeVisualizationSource,
  activeVisualizationTargetId,
  layersSwapped,
  halvesLinked,
  activeVisualizationHalf,
} = storeToRefs(matrixViewStore);
const secondaryAttached = ref(false);
const pipelineTargets = ref<import("@/app/core/mapmanagers/VisualizationManager").VisualizationPipelineTarget[]>([]);
const hasTwoSources = computed(() => presentationMode.value !== "single" || secondaryAttached.value);
const activeSourceTargets = computed(() => pipelineTargets.value.filter(target => target.source === activeVisualizationSource.value));
const sourceSpansBothHalves = computed(() =>
  activeSourceTargets.value.some(target => target.half === "upper") &&
  activeSourceTargets.value.some(target => target.half === "lower"));
const showLayerSelector = computed(() => hasTwoSources.value || sourceSpansBothHalves.value);
const sourceLabel = computed(() => activeVisualizationSource.value === "SECONDARY" ? "Secondary" : "Primary");

function halfAvailable(half: "upper" | "lower"): boolean {
  return activeSourceTargets.value.some(target => target.half === half);
}
const activeHalfTargets = computed(() =>
  activeSourceTargets.value.filter(target => target.half === activeVisualizationHalf.value));

/// @ts-expect-error "Style objects are not cloneable"
const backgroundColorStyle: Ref<Style> = ref(
  new Style({
    stroke: new Stroke({
      color: "rgba(255,255,255,255)",
    }),
  })
);

watch(
  () => mapBackgroundColor.value,
  () => {
    backgroundColorStyle.value = new Style({
      stroke: new Stroke({
        color: mapBackgroundColor.value.RGBA,
      }),
    });
  }
);

const props = defineProps<{
  mapManager?: ContactMapManager;
}>();

function isHalfActive(half: "upper" | "lower"): boolean {
  if (!halfAvailable(half)) return false;
  return halvesLinked.value || !sourceSpansBothHalves.value || activeVisualizationHalf.value === half;
}

function halfLabelSuffix(half: "upper" | "lower"): string {
  const target = activeSourceTargets.value.find(candidate => candidate.half === half);
  return target?.mode === "MODDOTPLOT_IDENTITY" ? "identity" : "";
}

/**
 * Linked triangles edit every colormap of the active source (target id null);
 * otherwise the editor targets the active source's colormap in one triangle.
 */
function syncActiveTarget(): void {
  const targets = activeSourceTargets.value;
  if (halvesLinked.value || !sourceSpansBothHalves.value) {
    if (activeVisualizationTargetId.value !== null) activeVisualizationTargetId.value = null;
    return;
  }
  const inHalf = targets.filter(target => target.half === activeVisualizationHalf.value);
  if (inHalf.some(target => target.id === activeVisualizationTargetId.value)) return;
  activeVisualizationTargetId.value = inHalf[0]?.id ?? targets[0]?.id ?? null;
}

async function refreshVisualizationSources(): Promise<void> {
  if (!props.mapManager || props.mapManager.isDisposed) return;
  const [status, targets] = await Promise.all([
    props.mapManager.networkManager.requestManager.getSecondarySourceStatus().catch(() => null),
    props.mapManager.visualizationManager.getVisualizationPipelineTargets().catch(() => []),
  ]);
  secondaryAttached.value = Boolean(status?.attached);
  pipelineTargets.value = targets;
  syncActiveTarget();
}

watch(() => [props.mapManager, presentationMode.value, activeVisualizationSource.value] as const,
  () => { void refreshVisualizationSources(); }, { immediate: true });
watch(() => [halvesLinked.value, activeVisualizationHalf.value] as const, syncActiveTarget);

function selectHalf(half: "upper" | "lower"): void {
  matrixViewStore.setActiveVisualizationHalf(half);
  matrixViewStore.setHalvesLinked(false);
}

function toggleHalvesLinked(): void {
  matrixViewStore.setHalvesLinked(!halvesLinked.value);
}

const onRenderPipelineChanged = () => { void refreshVisualizationSources(); };
onMounted(() => window.addEventListener("hict:render-pipeline-changed", onRenderPipelineChanged));
onUnmounted(() => window.removeEventListener("hict:render-pipeline-changed", onRenderPipelineChanged));

class LayerDescriptor {
  constructor(
    public name: string,
    public getStyle?: () => Style | undefined,
    public layer_manager?: unknown,
    public enableStyleEditor: boolean = false,
    public getLabelSize?: () => number,
    public getLabelOffsetMultiplier?: () => number,
    public getLabelBold?: () => boolean,
    public getLabelOutline?: () => boolean,
    public getLabelOutlineWidth?: () => number,
    public getIncludeInSvg?: () => boolean
  ) {}
}

const layers: Ref<LayerDescriptor[]> = ref([
  new LayerDescriptor(
    "Contigs",
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getStyle(),
    undefined,
    true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getLabelSize() ?? 12,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getLabelOffsetMultiplier() ?? 1.25
    ,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getLabelBold() ?? true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getLabelOutline() ?? true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getLabelOutlineWidth() ?? 2,
    () => props.mapManager?.getLayersManager().getExportTrackFlags().contigBorders ?? true
  ),
  new LayerDescriptor(
    "Scaffolds",
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getStyle(),
    undefined,
    true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getLabelSize() ?? 12,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getLabelOffsetMultiplier() ?? 1.25
    ,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getLabelBold() ?? true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getLabelOutline() ?? true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getLabelOutlineWidth() ?? 2,
    () => props.mapManager?.getLayersManager().getExportTrackFlags().scaffoldBorders ?? true
  ),
  new LayerDescriptor(
    "Cnames",
    () => {
      const color =
        props.mapManager?.getLayersManager().track2DHolder.contigBordersTrack.getLabelColor() ??
        props.mapManager?.getLayersManager().track2DHolder.contigBordersTrack.options.borderColor;
      return new Style({
        stroke: new Stroke({
          color: color as string,
        }),
      });
    },
    undefined,
    true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getLabelSize() ?? 12,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getLabelOffsetMultiplier() ?? 1.25
    ,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getLabelBold() ?? true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getLabelOutline() ?? true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.getLabelOutlineWidth() ?? 2,
    () => props.mapManager?.getLayersManager().getExportTrackFlags().contigNames ?? true
  ),
  new LayerDescriptor(
    "Snames",
    () => {
      const color =
        props.mapManager?.getLayersManager().track2DHolder.scaffoldBordersTrack.getLabelColor() ??
        props.mapManager?.getLayersManager().track2DHolder.scaffoldBordersTrack.options.borderColor;
      return new Style({
        stroke: new Stroke({
          color: color as string,
        }),
      });
    },
    undefined,
    true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getLabelSize() ?? 12,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getLabelOffsetMultiplier() ?? 1.25
    ,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getLabelBold() ?? true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getLabelOutline() ?? true,
    () =>
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.getLabelOutlineWidth() ?? 2,
    () => props.mapManager?.getLayersManager().getExportTrackFlags().scaffoldNames ?? true
  ),
  new LayerDescriptor("Background", () => backgroundColorStyle.value),
]);

function onColorChanged(layerName: string, newColor: ColorTranslator) {
  switch (layerName) {
    case "Contigs":
      getEventManager()?.onContigBorderColorChanged(newColor.RGBA);
      break;
    case "Scaffolds":
      getEventManager()?.onScanffoldBorderColorChanged(newColor.RGBA);
      break;
    case "Cnames":
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.contigBordersTrack.setLabelColor(newColor.RGBA);
      getEventManager()?.reloadTracks();
      break;
    case "Snames":
      props.mapManager
        ?.getLayersManager()
        .track2DHolder.scaffoldBordersTrack.setLabelColor(newColor.RGBA);
      getEventManager()?.reloadTracks();
      break;
    case "Background":
      stylesStore.setMapBackground(newColor);
      break;
    default:
      toast.error(`Method for ${layerName} is undefined`);
      // console.log(`Method for ${layerName} is undefined`);
      console.error(`Method for ${layerName} is undefined`);
  }

  // getEventManager()?.onContigBorderColorChanged(layerName, newColor);
  // getEventManager()[invoke](layerName, newColor);
}

function currentBorderStyle(name: string): BorderStyle | undefined {
  const manager = props.mapManager?.getLayersManager();
  if (!manager || name === "Background") return undefined;
  // Explicit style revisions keep the controls synchronized with loaded presets.
  void manager.trackStyleState.revision.value;
  const track = name === "Contigs" || name === "Cnames"
    ? manager.track2DHolder.contigBordersTrack : manager.track2DHolder.scaffoldBordersTrack;
  if (!name.endsWith("names")) return track.getStyleType();
  switch (track.getNamePlacement()) {
    case NamePlacement.TOP: return BorderStyle.TOP;
    case NamePlacement.BOTTOM: return BorderStyle.BOTTOM;
    case NamePlacement.CENTER: return BorderStyle.FULL;
    case NamePlacement.LEFT: return BorderStyle.LEFT;
    case NamePlacement.RIGHT: return BorderStyle.RIGHT;
    default: return BorderStyle.NONE;
  }
}

function onBorderStyleChanged(layerName: string, style: BorderStyle) {
  switch (layerName) {
    case "Contigs":
      getEventManager()?.onContigBorderStyleChanged(style);
      break;
    case "Scaffolds":
      getEventManager()?.onScanffoldBorderStyleChanged(style);
      break;
    case "Cnames":
      getEventManager()?.onContigNamePlacementChanged(style);
      break;
    case "Snames":
      getEventManager()?.onScaffoldNamePlacementChanged(style);
      break;
    default:
      // alert(`Method for ${layerName} is undefined`);
      toast.error(`Method for ${layerName} is undefined`);
      console.error(`Method for ${layerName} is undefined`);
  }
}

function onStyleChanged(
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
) {
  const holder = props.mapManager?.getLayersManager().track2DHolder;
  if (holder && (layerName === 'Contigs' || layerName === 'Scaffolds')) {
    const track = layerName === 'Contigs' ? holder.contigBordersTrack : holder.scaffoldBordersTrack;
    track.options.borderOutline = borderOutline;
  }
  switch (layerName) {
    case "Contigs":
      getEventManager()?.onContigBorderWidthChanged(borderWidth);
      getEventManager()?.onContigFillColorChanged(fillColor.RGBA);
      getEventManager()?.onContigLabelSizeChanged(labelSize);
      getEventManager()?.onContigLabelOffsetMultiplierChanged(
        labelOffsetMultiplier
      );
      getEventManager()?.onContigLabelBoldChanged(labelBold);
      getEventManager()?.onContigLabelOutlineChanged(labelOutline);
      getEventManager()?.onContigLabelOutlineWidthChanged(labelOutlineWidth);
      getEventManager()?.onContigExportEnabledChanged(includeInSvg);
      break;
    case "Scaffolds":
      getEventManager()?.onScaffoldBorderWidthChanged(borderWidth);
      getEventManager()?.onScaffoldFillColorChanged(fillColor.RGBA);
      getEventManager()?.onScaffoldLabelSizeChanged(labelSize);
      getEventManager()?.onScaffoldLabelOffsetMultiplierChanged(
        labelOffsetMultiplier
      );
      getEventManager()?.onScaffoldLabelBoldChanged(labelBold);
      getEventManager()?.onScaffoldLabelOutlineChanged(labelOutline);
      getEventManager()?.onScaffoldLabelOutlineWidthChanged(labelOutlineWidth);
      getEventManager()?.onScaffoldExportEnabledChanged(includeInSvg);
      break;
    case "Cnames":
      getEventManager()?.onContigLabelSizeChanged(labelSize);
      getEventManager()?.onContigLabelOffsetMultiplierChanged(
        labelOffsetMultiplier
      );
      getEventManager()?.onContigLabelBoldChanged(labelBold);
      getEventManager()?.onContigLabelOutlineChanged(labelOutline);
      getEventManager()?.onContigLabelOutlineWidthChanged(labelOutlineWidth);
      getEventManager()?.onContigNamesExportEnabledChanged(includeInSvg);
      break;
    case "Snames":
      getEventManager()?.onScaffoldLabelSizeChanged(labelSize);
      getEventManager()?.onScaffoldLabelOffsetMultiplierChanged(
        labelOffsetMultiplier
      );
      getEventManager()?.onScaffoldLabelBoldChanged(labelBold);
      getEventManager()?.onScaffoldLabelOutlineChanged(labelOutline);
      getEventManager()?.onScaffoldLabelOutlineWidthChanged(labelOutlineWidth);
      getEventManager()?.onScaffoldNamesExportEnabledChanged(includeInSvg);
      break;
    default:
      toast.error(`Method for ${layerName} is undefined`);
      console.error(`Method for ${layerName} is undefined`);
  }
}

function getBorderOutline(name: string): boolean {
  const holder = props.mapManager?.getLayersManager().track2DHolder;
  return (name === 'Contigs' ? holder?.contigBordersTrack : holder?.scaffoldBordersTrack)?.options.borderOutline ?? false;
}

function getEventManager(): CommonEventManager | undefined {
  return props.mapManager != undefined
    ? new CommonEventManager(props.mapManager)
    : undefined;
}

function swapSources(): void {
  props.mapManager?.visualizationManager
    .swapRenderPipelineSourcesAndReload()
    .then((swapped) => {
      if (!swapped) {
        toast.message("Both sources are not blended in the same triangle; nothing to swap");
        return;
      }
      matrixViewStore.toggleLayersSwapped();
    })
    .catch((error) => {
      toast.error(String(error ?? "Failed to swap sources"));
    });
}

function swapHalves(): void {
  props.mapManager?.visualizationManager
    .swapRenderPipelineHalvesAndReload()
    .then((swapped) => {
      // The selection stays on the same on-screen triangle; the editor
      // rehydrates from the pipeline-changed event.
      if (!swapped) toast.message("No active rendering pipeline to swap");
    })
    .catch((error) => {
      toast.error(String(error ?? "Failed to swap triangles"));
    });
}

function selectVisualizationSource(source: "PRIMARY" | "SECONDARY"): void {
  matrixViewStore.setActiveVisualizationSource(source);
}
</script>

<style scoped>
.sidebar {
  /* sidebar */

  /* Auto layout */
  display: flex;
  flex-direction: column;
  gap: 1px;

  position: relative;
  width: clamp(290px, 24vw, 350px);
  min-width: 290px;
  max-width: 350px;
  flex: 0 0 auto;
  max-height: 100%;
  min-height: 0;

  right: 0px;
  top: 0px;

  background: var(--hict-surface-bg-muted, #f8f9fa);
  color: var(--hict-surface-fg, #1f2937);
  border-left: 1px solid #000000;
  /* background-color: green; */

  /* Shadows/02. Regular */
  box-shadow: 0px 8px 16px rgba(0, 0, 0, 0.15);
}

.sidebar.sidebar-collapsed {
  width: 28px;
  min-width: 28px;
  max-width: 28px;
}

.sidebar-collapse-toggle {
  position: absolute;
  top: 6px;
  left: -1px;
  z-index: 5;
  width: 22px;
  height: 40px;
  padding: 0;
  border: 1px solid #94a3b8;
  border-left: none;
  border-radius: 0 6px 6px 0;
  background: var(--hict-surface-bg, #ffffff);
  color: #334155;
  font-size: 0.8rem;
  line-height: 1;
}

.sidebar-collapse-toggle:hover,
.sidebar-collapse-toggle:focus-visible {
  background: #e2e8f0;
}

.sidebar-collapsed .sidebar-collapse-toggle {
  left: 3px;
  border-left: 1px solid #94a3b8;
  border-radius: 6px;
}

.sidebar-empty-hint {
  margin: 56px 20px 0 32px;
  color: #64748b;
  font-size: 0.85rem;
}

.layers-block-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 12px 6px 28px;
  border: none;
  background: var(--hict-surface-bg, #ffffff);
  color: #334155;
  font-size: 0.8rem;
  font-weight: 600;
  text-align: left;
}

.layers-block-toggle:hover,
.layers-block-toggle:focus-visible {
  background: #f1f5f9;
}

.sidebar :deep(*) {
  text-shadow: 0 0 1px var(--hict-ui-outline, rgba(255, 255, 255, 0.9));
}

#upper-block {
  /* upper block */

  /* Auto layout */
  display: flex;
  flex-direction: column;
  gap: 4px;

  /* Inside auto layout */
  flex: 1 1 auto;
  order: 0;
  flex-grow: 1;
  width: 100%;
  min-height: 0;
  overflow: hidden;
}

#layers-block {
  /* layers */

  /* Auto layout */
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 12px 16px;
  gap: 8px;

  height: fit-content;

  background: var(--hict-surface-bg, #ffffff);

  /* Shadows/01. Small */
  box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.075);

  /* Inside auto layout */
  flex: none;
  order: 0;
  flex-grow: 0;
  width: 100%;
}

.sidebar-panel-selector {
  background: var(--hict-surface-bg, #ffffff);
  box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.075);
}

.sidebar-panel-selector .btn:first-child {
  border-top-left-radius: 0.6rem;
  border-bottom-left-radius: 0.6rem;
}

.sidebar-panel-selector .btn:last-child {
  border-top-right-radius: 0.6rem;
  border-bottom-right-radius: 0.6rem;
}

.sidebar-panel-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
}

.visualization-source-selector {
  background: var(--hict-surface-bg, #ffffff);
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 12px;
}

.visualization-source-row .btn { font-size: .8rem; min-height: 32px; font-weight: 500; }
.visualization-source-selector select { font-size: .8rem; border-radius: 7px; }
.visualization-source-row {
  display: flex;
  align-items: stretch;
  gap: 0.45rem;
}

.source-selection-label {
  color: #5c6773;
  font-size: 0.72rem;
  font-weight: 600;
  margin-bottom: 0.2rem;
}

.visualization-source-row .btn-group .btn:first-child {
  border-top-left-radius: 0.55rem;
  border-bottom-left-radius: 0.55rem;
}

.visualization-source-row .btn-group .btn:last-child {
  border-top-right-radius: 0.55rem;
  border-bottom-right-radius: 0.55rem;
}

.layer-swap-button {
  width: 2.35rem;
  min-width: 2.35rem;
  border-radius: 0.55rem;
}

.layer-swap-button.active {
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
}

.visualization-half-row {
  display: flex;
  align-items: stretch;
  gap: 0.45rem;
}

.half-stack {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
}

.half-button {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 30px;
  font-size: 0.8rem;
  font-weight: 500;
  text-align: left;
}

.half-stack .half-button:first-child {
  border-radius: 0.55rem 0.55rem 0 0;
}

.half-stack .half-button:last-child {
  border-radius: 0 0 0.55rem 0.55rem;
  margin-top: -1px;
}

.half-stack .half-button + .half-button.btn-primary {
  border-top-color: rgba(255, 255, 255, 0.55);
}

.half-button:disabled {
  opacity: 0.45;
}

.half-hint {
  margin-top: 0.35rem;
  color: #5c6773;
  font-size: 0.72rem;
}

.half-icon {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
}

.half-mode {
  margin-left: auto;
  font-size: 0.7rem;
  opacity: 0.75;
}

/* Same height as the two stacked triangle buttons. */
.tall-icon-button {
  width: 2.35rem;
  min-width: 2.35rem;
  padding: 0;
  border-radius: 0.55rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

#minimap {
  height: 200px;
  background-color: grey;
}

#color-range {
  /* color range */

  /* Auto layout */
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 12px;

  height: fit-content;

  /* Global/09. White */
  background: #ffffff;

  /* Shadows/01. Small */
  box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.075);

  /* Inside auto layout */
  flex: none;
  order: 1;
  flex-grow: 0;
}

#saved-visual-settings {
  display: flex;
  flex-direction: column;
  padding: 8px 0px;
  gap: 4px;

  background: var(--hict-surface-bg, #ffffff);

  box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.075);

  /* One scroll area for the whole panel: no nested scroll box for presets. */
  flex: 0 0 auto;
  width: 100%;
  padding-top: 8px;
  padding-right: 10px;
}

#saved-locations {
  /* saved locations */

  /* Auto layout */
  display: flex;
  flex-direction: column;
  padding: 16px 0px;
  gap: 8px;

  min-height: 0;
  flex: 1 1 auto;

  background: var(--hict-surface-bg, #ffffff);

  /* Shadows/01. Small */
  box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.075);
}
</style>
