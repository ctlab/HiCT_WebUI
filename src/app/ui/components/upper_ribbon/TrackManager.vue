<!--
 Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis and Computer Technologies Laboratory ITMO University team.

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
  <div class="track-manager-root">
    <div class="modal-backdrop fade show"></div>
    <div
      class="modal fade show"
      style="display: block"
      tabindex="-1"
      role="dialog"
    >
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Tracks and layers</h5>
            <button class="btn-close" @click="$emit('dismissed')"></button>
          </div>
          <div class="modal-body">
            <div v-if="!props.mapManager" class="alert alert-warning">
              Open a HiCT file first.
            </div>
            <template v-else>
              <div class="row g-2 align-items-end mb-3">
                <div class="col-7">
                  <label class="form-label">Track file</label>
                  <div class="input-group">
                    <input
                      type="text"
                      class="form-control"
                      :value="selectedFile || 'Select BED/VCF/GFF/GTF/BigWig/BAM file'"
                      readonly
                    />
                    <button class="btn btn-outline-secondary" @click="trackFileSelectorOpen = true">
                      Browse…
                    </button>
                  </div>
                </div>
                <div class="col-3">
                  <label class="form-label">Display name</label>
                  <input
                    v-model="trackDisplayName"
                    type="text"
                    class="form-control"
                    placeholder="Optional"
                  />
                </div>
                <div class="col-2 d-grid gap-2">
                  <button class="btn btn-primary" @click="onAddTrack" :disabled="!selectedFile">
                    Add file
                  </button>
                  <button class="btn btn-outline-primary btn-sm" @click="onAddCoolerWeights">
                    Add weights
                  </button>
                </div>
              </div>

              <div class="alert alert-light border py-2 mb-3">
                <div class="row g-2 align-items-end">
                  <div class="col-7">
                    <label class="form-label mb-1">Secondary data source</label>
                    <div class="input-group">
                      <input
                        type="text"
                        class="form-control"
                        :value="
                          selectedSecondaryFile ||
                          secondaryStatus.filename ||
                          'Select secondary .hict.hdf5 source'
                        "
                        readonly
                      />
                      <button
                        class="btn btn-outline-secondary"
                        @click="secondaryFileSelectorOpen = true"
                      >
                        Browse…
                      </button>
                    </div>
                  </div>
                  <div class="col-2 d-grid gap-2">
                    <button
                      class="btn btn-outline-primary"
                      :disabled="!selectedSecondaryFile"
                      @click="onAttachSecondarySource"
                    >
                      Attach
                    </button>
                    <button
                      class="btn btn-outline-danger btn-sm"
                      :disabled="!secondaryStatus.attached"
                      @click="onDetachSecondarySource"
                    >
                      Detach
                    </button>
                  </div>
                  <div class="col-3">
                    <label class="form-label mb-1">Assembly source</label>
                    <select
                      class="form-select"
                      :value="secondaryStatus.assemblySource"
                      @change="
                        onAssemblySourceChanged(
                          ($event.target as HTMLSelectElement).value as
                            | 'PRIMARY'
                            | 'SECONDARY'
                        )
                      "
                    >
                      <option value="PRIMARY">Primary</option>
                      <option value="SECONDARY" :disabled="!secondaryStatus.attached">
                        Secondary
                      </option>
                    </select>
                  </div>
                </div>
                <small class="text-muted d-block mt-1">
                  {{
                    secondaryStatus.attached
                      ? `Attached: ${secondaryStatus.filename}`
                      : "No secondary source attached"
                  }}
                </small>
              </div>

              <div class="alert alert-secondary py-2">
                <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
                  <strong>1D track precompute</strong>
                  <button class="btn btn-sm btn-outline-primary" @click="onStartPrecomputeAll">
                    Precompute all
                  </button>
                </div>
                <div v-if="precomputeStatus && precomputeStatus.tracks.length > 0" class="precompute-list">
                  <div v-for="item in precomputeStatus.tracks" :key="item.trackId" class="precompute-item">
                    <div class="d-flex justify-content-between align-items-center">
                      <small>{{ item.trackName }}</small>
                      <small class="text-muted">
                        {{ item.status }} {{ Math.round(item.progress * 100) }}%
                      </small>
                    </div>
                    <div class="progress" style="height: 6px">
                      <div
                        class="progress-bar"
                        role="progressbar"
                        :style="{ width: `${Math.max(0, Math.min(100, Math.round(item.progress * 100)))}%` }"
                      ></div>
                    </div>
                    <small v-if="item.currentTask" class="text-muted">{{ item.currentTask }}</small>
                    <small v-if="item.error" class="text-danger">{{ item.error }}</small>
                  </div>
                </div>
                <small v-else class="text-muted">No background jobs yet.</small>
              </div>

              <div class="alert alert-light border py-2">
                <div class="d-flex align-items-center justify-content-between gap-2">
                  <strong class="small">Track panel background</strong>
                  <div class="d-flex align-items-center gap-2">
                    <div class="form-check form-switch m-0">
                      <input
                        id="track-bg-inherit"
                        v-model="inheritTrackBackgroundFromMap"
                        class="form-check-input"
                        type="checkbox"
                      />
                      <label class="form-check-label small" for="track-bg-inherit">
                        Inherit from Hi-C map
                      </label>
                    </div>
                    <input
                      type="color"
                      class="form-control form-control-color"
                      :value="trackBackgroundHex"
                      :disabled="inheritTrackBackgroundFromMap"
                      @change="onTrackBackgroundColorChanged(($event.target as HTMLInputElement).value)"
                    />
                  </div>
                </div>
              </div>

              <div class="tracks-list">
                <div
                  class="track-row d-flex align-items-center gap-2"
                  v-for="track in tracks"
                  :key="track.trackId"
                >
                  <input
                    class="form-check-input"
                    type="checkbox"
                    :checked="track.visible"
                    @change="onToggleVisible(track.trackId, ($event.target as HTMLInputElement).checked)"
                  />
                  <input
                    type="color"
                    class="form-control form-control-color"
                    :value="normalizeColor(track.color)"
                    @change="onChangeColor(track.trackId, ($event.target as HTMLInputElement).value)"
                  />
                  <input
                    type="text"
                    class="form-control"
                    :value="track.name"
                    @change="onRename(track.trackId, ($event.target as HTMLInputElement).value)"
                  />
                  <span class="badge text-bg-secondary">{{ track.type }}</span>
                  <select
                    v-if="track.type === 'BIGWIG'"
                    class="form-select form-select-sm track-mode-select"
                    :value="normalizeBigWigAggregation(track.aggregationMode)"
                    @change="onChangeBigWigAggregation(track.trackId, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="MAX">max</option>
                    <option value="MEAN">mean</option>
                    <option value="SUM">sum</option>
                  </select>
                  <div
                    v-if="(track.renderStyle ?? 'SIGNAL').toUpperCase() !== 'FEATURE'"
                    class="d-flex align-items-center gap-1 ms-1"
                  >
                    <div class="form-check form-switch m-0">
                      <input
                        :id="`track-log-scale-${track.trackId}`"
                        class="form-check-input"
                        type="checkbox"
                        :checked="track.logScale"
                        @change="onChangeLogScale(track.trackId, ($event.target as HTMLInputElement).checked)"
                      />
                      <label
                        class="form-check-label small"
                        :for="`track-log-scale-${track.trackId}`"
                      >
                        log
                      </label>
                    </div>
                    <input
                      v-if="track.logScale"
                      type="number"
                      class="form-control form-control-sm track-log-base-input"
                      :value="getTrackLogBase(track.trackId)"
                      min="1.000001"
                      step="0.1"
                      @change="onChangeLogBase(track.trackId, Number(($event.target as HTMLInputElement).value))"
                      title="Log base for log(1+x)"
                    />
                  </div>
                  <select
                    v-if="track.type === 'BAM'"
                    class="form-select form-select-sm track-mode-select"
                    :value="normalizeBamMode(track.renderMode)"
                    @change="onChangeBamMode(track.trackId, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="COVERAGE">coverage</option>
                    <option value="READ_DENSITY">density</option>
                  </select>
                  <small class="text-muted">{{ formatFeatureCount(track.featureCount) }}</small>
                  <button class="btn btn-sm btn-outline-danger ms-auto" @click="onRemove(track.trackId)">
                    Remove
                  </button>
                </div>
                <div v-if="tracks.length === 0" class="text-muted">No tracks loaded</div>
              </div>

              <hr />
              <div class="d-flex align-items-center gap-2">
                <button class="btn btn-outline-primary" @click="addMarkerAtCenter">
                  Add marker at center
                </button>
                <button
                  class="btn btn-outline-primary"
                  @click="addRectangleFromSelection"
                >
                  Add rectangle from selection
                </button>
                <button class="btn btn-outline-danger" @click="clearAnnotations">
                  Clear annotations
                </button>
              </div>
              <small class="text-muted">
                Rectangles use current selection. Markers and rectangles stay aligned after scaffolding operations.
              </small>
            </template>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="$emit('dismissed')">Close</button>
          </div>
        </div>
      </div>
    </div>
    <UniversalFileSelector
      v-if="trackFileSelectorOpen && props.mapManager"
      :network-manager="props.mapManager.networkManager"
      :title="'Select 1D track file'"
      :file-name-predicate="isSupportedTrackFilename"
      @selected="onTrackFileSelected"
      @dismissed="trackFileSelectorOpen = false"
    />
    <UniversalFileSelector
      v-if="secondaryFileSelectorOpen && props.mapManager"
      :network-manager="props.mapManager.networkManager"
      :title="'Select secondary .hict.hdf5 source'"
      :file-name-predicate="isSupportedSecondaryFilename"
      @selected="onSecondaryFileSelected"
      @dismissed="secondaryFileSelectorOpen = false"
    />
    <template v-if="pendingTrackProbe">
      <div class="modal-backdrop fade show track-compat-backdrop"></div>
      <div class="modal fade show track-compat-modal" style="display: block" tabindex="-1" role="dialog">
        <div class="modal-dialog modal-lg modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Track Compatibility Warning</h5>
              <button class="btn-close" @click="pendingTrackProbe = null"></button>
            </div>
            <div class="modal-body">
              <p class="mb-2">{{ pendingTrackProbe.message }}</p>
              <ul class="small mb-2">
                <li>Track names: {{ pendingTrackProbe.totalNames }}</li>
                <li>Matched source names: {{ pendingTrackProbe.matchedSourceNames }}</li>
                <li>Matched assembly names: {{ pendingTrackProbe.matchedAssemblyNames }}</li>
                <li>Matched total: {{ pendingTrackProbe.matchedAnyNames }}</li>
              </ul>
              <div
                v-if="pendingTrackProbe.unknownNames.length > 0"
                class="alert alert-warning py-2 mb-0"
              >
                Unknown names:
                <code>{{ pendingTrackProbe.unknownNames.slice(0, 12).join(", ") }}</code>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" @click="pendingTrackProbe = null">Cancel</button>
              <button class="btn btn-primary" @click="onProceedTrackWithMismatch">
                Ignore and Load
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import type { AssemblyInfo } from "@/app/core/domain/AssemblyInfo";
import type {
  TrackCompatibilityReportResponse,
  TrackSummaryResponse,
  TracksPrecomputeStatusResponse,
} from "@/app/core/net/api/response";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import UniversalFileSelector from "@/app/ui/components/upper_ribbon/UniversalFileSelector.vue";
import { storeToRefs } from "pinia";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { toast } from "vue-sonner";

const props = defineProps<{
  mapManager?: ContactMapManager;
}>();

defineEmits<{
  (e: "dismissed"): void;
}>();

const selectedFile = ref("");
const trackDisplayName = ref("");
const trackFileSelectorOpen = ref(false);
const secondaryFileSelectorOpen = ref(false);
const selectedSecondaryFile = ref("");
const pendingTrackProbe = ref<TrackCompatibilityReportResponse | null>(null);
const tracks = ref<TrackSummaryResponse[]>([]);
const precomputeStatus = ref<TracksPrecomputeStatusResponse | null>(null);
const secondaryStatus = ref<{
  attached: boolean;
  filename: string;
  assemblySource: "PRIMARY" | "SECONDARY";
}>({
  attached: false,
  filename: "",
  assemblySource: "PRIMARY",
});
let precomputePollHandle: number | null = null;
const uiSettingsStore = useUiSettingsStore();
const { inheritTrackBackgroundFromMap, trackBackgroundColor } =
  storeToRefs(uiSettingsStore);

const normalizeColor = (value: string): string => {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return value;
  }
  return "#4e79a7";
};

const formatFeatureCount = (featureCount: number): string => {
  if (!Number.isFinite(featureCount) || featureCount < 0) {
    return "streaming";
  }
  return `${featureCount} features`;
};

const normalizeBamMode = (value: string): "COVERAGE" | "READ_DENSITY" => {
  return value === "READ_DENSITY" ? "READ_DENSITY" : "COVERAGE";
};

const normalizeBigWigAggregation = (value: string): "MAX" | "MEAN" | "SUM" => {
  if (value === "MEAN") {
    return "MEAN";
  }
  if (value === "SUM") {
    return "SUM";
  }
  return "MAX";
};

const rgbaLikeToHex = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) {
    return normalized;
  }
  const rgbMatch = normalized.match(
    /rgba?\s*\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/
  );
  if (!rgbMatch) {
    return "#f4f7fb";
  }
  const channel = (idx: number): string =>
    Math.max(0, Math.min(255, Number(rgbMatch[idx])))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(1)}${channel(2)}${channel(3)}`;
};

const onTrackBackgroundColorChanged = (value: string): void => {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
    return;
  }
  trackBackgroundColor.value = value;
};

const trackBackgroundHex = computed(() => rgbaLikeToHex(trackBackgroundColor.value));

const TRACK_SUFFIXES = [
  ".bed",
  ".bed.gz",
  ".vcf",
  ".vcf.gz",
  ".gff",
  ".gff.gz",
  ".gff3",
  ".gff3.gz",
  ".gtf",
  ".gtf.gz",
  ".bw",
  ".bigwig",
  ".bam",
];

const isSupportedTrackFilename = (name: string): boolean => {
  const lowered = name.toLowerCase();
  return TRACK_SUFFIXES.some((suffix) => lowered.endsWith(suffix));
};

const isSupportedSecondaryFilename = (name: string): boolean => {
  const lowered = name.toLowerCase();
  return lowered.endsWith(".hict.hdf5");
};

const refreshTracks = async () => {
  if (!props.mapManager) {
    tracks.value = [];
    return;
  }
  try {
    tracks.value = await props.mapManager.linearTrackManager.refreshTrackList();
  } catch (err) {
    toast.error(String(err));
  }
};

const refreshPrecomputeStatus = async () => {
  if (!props.mapManager) {
    precomputeStatus.value = null;
    return;
  }
  try {
    precomputeStatus.value =
      await props.mapManager.linearTrackManager.getPrecomputeStatus();
  } catch (err) {
    console.debug("Failed to fetch precompute status", err);
  }
};

const refreshSecondaryStatus = async () => {
  if (!props.mapManager) {
    secondaryStatus.value = {
      attached: false,
      filename: "",
      assemblySource: "PRIMARY",
    };
    return;
  }
  try {
    secondaryStatus.value =
      await props.mapManager.networkManager.requestManager.getSecondarySourceStatus();
    if (!secondaryStatus.value.attached) {
      selectedSecondaryFile.value = "";
    }
  } catch (err) {
    console.debug("Failed to fetch secondary source status", err);
  }
};

const openTrackInternal = async () => {
  if (!props.mapManager || !selectedFile.value) {
    return;
  }
  try {
    await props.mapManager.linearTrackManager.openTrack(
      selectedFile.value,
      trackDisplayName.value.trim() || undefined
    );
    trackDisplayName.value = "";
    await refreshTracks();
    await refreshPrecomputeStatus();
  } catch (err) {
    toast.error(String(err));
  }
};

const onAddTrack = async () => {
  if (!props.mapManager || !selectedFile.value) {
    return;
  }
  try {
    const probe = await props.mapManager.linearTrackManager.probeTrackCompatibility(
      selectedFile.value
    );
    if (probe.status !== "ok") {
      pendingTrackProbe.value = probe;
      return;
    }
    await openTrackInternal();
  } catch (err) {
    toast.error(String(err));
  }
};

const onAddCoolerWeights = async () => {
  if (!props.mapManager) {
    return;
  }
  try {
    await props.mapManager.linearTrackManager.openCoolerWeightsTrack(
      trackDisplayName.value.trim() || undefined
    );
    trackDisplayName.value = "";
    await refreshTracks();
    await refreshPrecomputeStatus();
  } catch (err) {
    toast.error(String(err));
  }
};

const onProceedTrackWithMismatch = async () => {
  pendingTrackProbe.value = null;
  await openTrackInternal();
};

const onTrackFileSelected = (filename: string) => {
  selectedFile.value = filename;
  trackFileSelectorOpen.value = false;
  if (!trackDisplayName.value.trim()) {
    const parts = filename.split("/");
    trackDisplayName.value = parts[parts.length - 1] ?? "";
  }
};

const onSecondaryFileSelected = (filename: string) => {
  selectedSecondaryFile.value = filename;
  secondaryFileSelectorOpen.value = false;
};

const applyAssemblyInfo = (assemblyInfo: AssemblyInfo): void => {
  if (!props.mapManager) {
    return;
  }
  props.mapManager.contigDimensionHolder.updateContigData(assemblyInfo.contigDescriptors);
  props.mapManager.scaffoldHolder.updateScaffoldData(assemblyInfo.scaffoldDescriptors);
  props.mapManager.reloadVisuals();
  props.mapManager.refreshOverviewMinimap();
  void props.mapManager.linearTrackManager.clearCachesAndRender();
};

const onAttachSecondarySource = async () => {
  if (!props.mapManager || !selectedSecondaryFile.value) {
    return;
  }
  try {
    secondaryStatus.value =
      await props.mapManager.networkManager.requestManager.openSecondarySource(
        selectedSecondaryFile.value
      );
    await props.mapManager.reloadTilesFromBackend();
    await refreshSecondaryStatus();
    toast.success("Secondary source attached");
  } catch (err) {
    toast.error(String(err));
  }
};

const onDetachSecondarySource = async () => {
  if (!props.mapManager) {
    return;
  }
  try {
    secondaryStatus.value =
      await props.mapManager.networkManager.requestManager.closeSecondarySource();
    await props.mapManager.reloadTilesFromBackend();
    if (secondaryStatus.value.assemblySource === "PRIMARY") {
      const result =
        await props.mapManager.networkManager.requestManager.setAssemblyInfoSource(
          "PRIMARY"
        );
      applyAssemblyInfo(result.assemblyInfo);
    }
    await refreshSecondaryStatus();
    toast.success("Secondary source detached");
  } catch (err) {
    toast.error(String(err));
  }
};

const onAssemblySourceChanged = async (
  assemblySource: "PRIMARY" | "SECONDARY"
) => {
  if (!props.mapManager) {
    return;
  }
  try {
    const result =
      await props.mapManager.networkManager.requestManager.setAssemblyInfoSource(
        assemblySource
      );
    secondaryStatus.value.assemblySource = result.assemblySource;
    applyAssemblyInfo(result.assemblyInfo);
  } catch (err) {
    toast.error(String(err));
    await refreshSecondaryStatus();
  }
};

const onToggleVisible = async (trackId: string, visible: boolean) => {
  if (!props.mapManager) {
    return;
  }
  try {
    await props.mapManager.linearTrackManager.updateTrack(trackId, { visible });
    await refreshTracks();
  } catch (err) {
    toast.error(String(err));
  }
};

const onChangeColor = async (trackId: string, color: string) => {
  if (!props.mapManager) {
    return;
  }
  try {
    await props.mapManager.linearTrackManager.updateTrack(trackId, { color });
    await refreshTracks();
  } catch (err) {
    toast.error(String(err));
  }
};

const onRename = async (trackId: string, name: string) => {
  if (!props.mapManager) {
    return;
  }
  try {
    await props.mapManager.linearTrackManager.updateTrack(trackId, { name });
    await refreshTracks();
  } catch (err) {
    toast.error(String(err));
  }
};

const onRemove = async (trackId: string) => {
  if (!props.mapManager) {
    return;
  }
  try {
    await props.mapManager.linearTrackManager.removeTrack(trackId);
    await refreshTracks();
  } catch (err) {
    toast.error(String(err));
  }
};

const onChangeBamMode = async (trackId: string, renderMode: string) => {
  if (!props.mapManager) {
    return;
  }
  try {
    await props.mapManager.linearTrackManager.updateTrack(trackId, {
      renderMode: normalizeBamMode(renderMode),
    });
    await refreshTracks();
  } catch (err) {
    toast.error(String(err));
  }
};

const onChangeBigWigAggregation = async (
  trackId: string,
  aggregationMode: string
) => {
  if (!props.mapManager) {
    return;
  }
  try {
    await props.mapManager.linearTrackManager.updateTrack(trackId, {
      aggregationMode: normalizeBigWigAggregation(aggregationMode),
    });
    await refreshTracks();
  } catch (err) {
    toast.error(String(err));
  }
};

const onChangeLogScale = async (trackId: string, logScale: boolean) => {
  if (!props.mapManager) {
    return;
  }
  try {
    await props.mapManager.linearTrackManager.updateTrack(trackId, {
      logScale,
    });
    await refreshTracks();
  } catch (err) {
    toast.error(String(err));
  }
};

const getTrackLogBase = (trackId: string): number => {
  return props.mapManager?.linearTrackManager.getTrackLogBase(trackId) ?? 10;
};

const onChangeLogBase = (trackId: string, value: number): void => {
  if (!props.mapManager) {
    return;
  }
  props.mapManager.linearTrackManager.setTrackLogBase(trackId, value);
};

const addMarkerAtCenter = () => {
  props.mapManager?.getLayersManager().addAnnotationMarkerAtCenter();
};

const addRectangleFromSelection = () => {
  props.mapManager?.getLayersManager().addAnnotationRectangleFromSelection();
};

const clearAnnotations = () => {
  props.mapManager?.getLayersManager().clearAnnotations();
};

const onStartPrecomputeAll = async () => {
  if (!props.mapManager) {
    return;
  }
  try {
    precomputeStatus.value = await props.mapManager.linearTrackManager.startPrecompute(
      undefined,
      true
    );
  } catch (err) {
    toast.error(String(err));
  }
};

const startPrecomputePolling = () => {
  if (precomputePollHandle !== null) {
    window.clearInterval(precomputePollHandle);
  }
  precomputePollHandle = window.setInterval(() => {
    void refreshPrecomputeStatus();
  }, 1200);
};

onMounted(async () => {
  await Promise.all([
    refreshTracks(),
    refreshPrecomputeStatus(),
    refreshSecondaryStatus(),
  ]);
  startPrecomputePolling();
});

onBeforeUnmount(() => {
  if (precomputePollHandle !== null) {
    window.clearInterval(precomputePollHandle);
    precomputePollHandle = null;
  }
});
</script>

<style scoped>
.tracks-list {
  max-height: 45vh;
  overflow: auto;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 0.5rem;
}

.track-row {
  padding: 0.25rem 0;
  border-bottom: 1px solid #eee;
}

.track-row:last-child {
  border-bottom: none;
}

.track-mode-select {
  max-width: 7rem;
}

.track-log-base-input {
  max-width: 5.4rem;
}

.precompute-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.precompute-item {
  border: 1px solid #e6e6e6;
  border-radius: 4px;
  padding: 0.35rem 0.5rem;
}

.track-compat-backdrop {
  z-index: 1060;
}

.track-compat-modal {
  z-index: 1065;
}
</style>
