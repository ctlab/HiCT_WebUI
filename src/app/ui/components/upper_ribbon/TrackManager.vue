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
                <div class="col-6">
                  <label class="form-label">Track file</label>
                  <select v-model="selectedFile" class="form-select">
                    <option value="">Select BED/VCF/BigWig/BAM file</option>
                    <option v-for="file in availableFiles" :key="file" :value="file">
                      {{ file }}
                    </option>
                  </select>
                </div>
                <div class="col-4">
                  <label class="form-label">Display name</label>
                  <input
                    v-model="trackDisplayName"
                    type="text"
                    class="form-control"
                    placeholder="Optional"
                  />
                </div>
                <div class="col-2 d-grid">
                  <button class="btn btn-primary" @click="onAddTrack" :disabled="!selectedFile">
                    Add
                  </button>
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
  </div>
</template>

<script setup lang="ts">
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import type { TrackSummaryResponse } from "@/app/core/net/api/response";
import { onMounted, ref } from "vue";
import { toast } from "vue-sonner";

const props = defineProps<{
  mapManager?: ContactMapManager;
}>();

defineEmits<{
  (e: "dismissed"): void;
}>();

const availableFiles = ref<string[]>([]);
const selectedFile = ref("");
const trackDisplayName = ref("");
const tracks = ref<TrackSummaryResponse[]>([]);

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

const refreshFiles = async () => {
  if (!props.mapManager) {
    availableFiles.value = [];
    return;
  }
  try {
    availableFiles.value = await props.mapManager.linearTrackManager.listTrackFiles();
  } catch (err) {
    toast.error(String(err));
  }
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

const onAddTrack = async () => {
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
  } catch (err) {
    toast.error(String(err));
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

const addMarkerAtCenter = () => {
  props.mapManager?.getLayersManager().addAnnotationMarkerAtCenter();
};

const addRectangleFromSelection = () => {
  props.mapManager?.getLayersManager().addAnnotationRectangleFromSelection();
};

const clearAnnotations = () => {
  props.mapManager?.getLayersManager().clearAnnotations();
};

onMounted(async () => {
  await Promise.all([refreshFiles(), refreshTracks()]);
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
</style>
