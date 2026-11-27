<template>
  <svg v-if="outlined.length" class="dotplot-region-outlines" aria-hidden="true">
    <g v-for="item in outlined" :key="item.index" :data-region="item.index">
      <rect :x="item.x" :y="item.y" :width="item.width" :height="item.height" />
      <text :x="item.labelX" :y="item.labelY">{{ item.label }}</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { shallowRef, watch } from "vue";
import { unByKey } from "ol/Observable";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import type { DotplotRegion } from "@/app/core/net/api/RequestManager";
import { useSessionStore } from "@/app/stores/sessionStore";
import { useDotplotResultsStore } from "@/app/stores/dotplotResultsStore";
import { formatDotplotSizes } from "@/app/core/sequence/dotplotResults";
import { formatLength } from "@/app/core/format/formatSignal";

const props = defineProps<{ mapManager: ContactMapManager }>();
const session = useSessionStore();
const preference = useDotplotResultsStore();
const regions = shallowRef<DotplotRegion[]>([]);
type Outline = { index: number; x: number; y: number; width: number; height: number; labelX: number; labelY: number; label: string };
const outlined = shallowRef<Outline[]>([]);
const api = props.mapManager.networkManager.requestManager;

watch(() => [session.secondaryMapFilename, api.history.applied?.session, api.history.applied?.revision,
  preference.showOutlines, preference.dialogOpen] as const, async ([secondary, , , enabled, dialog], _, cleanup) => {
  let current = true;
  cleanup(() => { current = false; });
  if (!secondary || !enabled) {
    regions.value = [];
    return;
  }
  if (dialog) return;
  try {
    const sets = await api.listDotplotResults();
    if (current) regions.value = sets.find((entry) => entry.shown)?.regions ?? [];
  } catch {
    if (current) regions.value = [];
  }
}, { immediate: true });

watch(regions, (values, _, cleanup) => {
  if (!values.length) {
    outlined.value = [];
    return;
  }
  const manager = props.mapManager;
  const map = manager.getMap();
  const layers = manager.viewAndLayersManager;
  function project(): void {
    const size = map.getSize();
    if (!size) return;
    const display = layers.currentViewState.resolutionDesciptor;
    const secondary = layers.getVisibleSourceResolutionDescriptors().secondary;
    if (!secondary) {
      outlined.value = [];
      return;
    }
    const coordinate = (bp: number) => manager.contigDimensionHolder.getFractionalPxOfBp(bp, display.bpResolution) * display.pixelResolution;
    outlined.value = values.flatMap((region) => {
      const start = map.getPixelFromCoordinate([coordinate(region.columns.start), -coordinate(region.rows.start)]);
      const end = map.getPixelFromCoordinate([coordinate(region.columns.end), -coordinate(region.rows.end)]);
      if (!start || !end || end[0] <= start[0] || end[1] <= start[1]
          || end[0] <= 0 || end[1] <= 0 || start[0] >= size[0] || start[1] >= size[1]) return [];
      const note = secondary.bpResolution < region.finest ? " · zoom out to see it" : "";
      return [{ index: region.index, x: start[0], y: start[1], width: end[0] - start[0], height: end[1] - start[1],
        labelX: end[0] + 5, labelY: end[1] + 12,
        label: `Region ${region.index} · ${formatDotplotSizes(region.levels, formatLength)}${note}` }];
    });
  }
  const listener = map.on("postrender", project);
  project();
  cleanup(() => unByKey(listener));
}, { immediate: true });
</script>

<style scoped>
.dotplot-region-outlines { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 4; overflow: hidden; pointer-events: none; }
rect { fill: none; stroke: #4338ca; stroke-width: 1.5; stroke-dasharray: 5 3; }
text { font-family: system-ui, sans-serif; font-size: 11px; fill: #3730a3; stroke: white; stroke-width: 2.5; paint-order: stroke; }
</style>
