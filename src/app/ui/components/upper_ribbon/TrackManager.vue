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
  <div ref="rootElement" class="track-manager-root">
    <div class="modal-backdrop fade show"></div>
    <div
      class="modal fade show"
      style="display: block"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="track-manager-title"
    >
      <div
        class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable"
      >
        <div class="modal-content">
          <div class="modal-header">
            <h5 id="track-manager-title" class="modal-title">
              {{
                props.section === "tracks" ? "1D tracks" : "Sources and layers"
              }}
            </h5>
            <button
              class="btn-close"
              aria-label="Close manager"
              @click="$emit('dismissed')"
            ></button>
          </div>
          <div class="modal-body">
            <div v-if="!props.mapManager" class="alert alert-warning">
              Open a HiCT file first.
            </div>
            <template v-else>
              <section
                id="track-panel-tracks"
                v-if="props.section === 'tracks'"
              >
                <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
                  <label for="track-add-kind" class="form-label mb-0"
                    >Add track</label
                  >
                  <select
                    id="track-add-kind"
                    v-model="addKind"
                    class="form-select track-add-kind"
                    :disabled="isAddingTrack || sourceChanging"
                  >
                    <option value="file">File</option>
                    <option value="weights">Map weights</option>
                  </select>
                  <span
                    v-if="isAddingTrack"
                    class="small text-muted"
                    role="status"
                    >Adding track…</span
                  >
                </div>
                <div
                  v-if="addKind === 'file'"
                  class="row g-2 align-items-end mb-3"
                >
                  <div class="col-12 col-sm-7">
                    <label for="track-file" class="form-label"
                      >Track file</label
                    >
                    <div class="input-group">
                      <input
                        id="track-file"
                        type="text"
                        class="form-control"
                        :value="
                          selectedFile ||
                          'Select BED/VCF/GFF/GTF/BigWig/BAM file'
                        "
                        readonly
                      />
                      <button
                        class="btn btn-outline-secondary"
                        :disabled="isAddingTrack || sourceChanging"
                        @click="trackFileSelectorOpen = true"
                      >
                        Browse…
                      </button>
                    </div>
                  </div>
                  <div class="col-8 col-sm-3">
                    <label for="track-display-name" class="form-label"
                      >Display name</label
                    >
                    <input
                      id="track-display-name"
                      v-model="trackDisplayName"
                      :disabled="isAddingTrack || sourceChanging"
                      type="text"
                      class="form-control"
                      placeholder="Optional"
                    />
                  </div>
                  <div class="col-4 col-sm-2 d-grid gap-2">
                    <button
                      class="btn btn-primary"
                      @click="onAddTrack"
                      :disabled="
                        !selectedFile || isAddingTrack || sourceChanging
                      "
                    >
                      Add file
                    </button>
                  </div>
                </div>

                <div v-if="addKind === 'weights'" class="mb-3">
                  <div class="d-flex flex-wrap align-items-end gap-2">
                    <div class="flex-grow-1">
                      <label for="track-weight-source" class="form-label"
                        >Weights from</label
                      >
                      <select
                        id="track-weight-source"
                        v-model="weightSource"
                        class="form-select"
                        :disabled="isAddingTrack || sourceChanging"
                      >
                        <option value="PRIMARY">Primary map</option>
                        <option
                          value="SECONDARY"
                          :disabled="!secondaryStatus.attached"
                        >
                          Secondary map
                        </option>
                      </select>
                    </div>
                    <button
                      class="btn btn-primary"
                      :disabled="
                        isAddingTrack ||
                        sourceChanging ||
                        weightsAlreadyAdded ||
                        weightsUnavailable
                      "
                      @click="onAddWeights"
                    >
                      Add weights
                    </button>
                  </div>
                  <p class="small text-muted mt-2 mb-0" role="status">
                    {{ weightsAddHint }}
                  </p>
                </div>
                <div class="tracks-list">
                  <div
                    class="track-row d-flex flex-wrap align-items-center gap-2"
                    v-for="(track, trackIndex) in tracks"
                    :key="track.trackId"
                    :data-track-id="track.trackId"
                    role="group"
                    :aria-label="`Track ${track.name}`"
                  >
                    <input
                      class="form-check-input"
                      type="checkbox"
                      :aria-label="`Show ${track.name}`"
                      :checked="track.visible"
                      @change="
                        onToggleVisible(
                          track.trackId,
                          ($event.target as HTMLInputElement).checked
                        )
                      "
                    />
                    <div
                      class="btn-group"
                      role="group"
                      aria-label="Track axis visibility"
                    >
                      <button
                        type="button"
                        class="btn btn-sm track-axis-button"
                        :class="
                          axisVisible(track.trackId, 'horizontal')
                            ? 'btn-outline-primary'
                            : 'btn-outline-secondary'
                        "
                        :title="`${
                          axisVisible(track.trackId, 'horizontal')
                            ? 'Hide'
                            : 'Show'
                        } ${track.name} horizontally`"
                        :aria-label="`${
                          axisVisible(track.trackId, 'horizontal')
                            ? 'Hide'
                            : 'Show'
                        } ${track.name} horizontally`"
                        @click="toggleAxis(track.trackId, 'horizontal')"
                      >
                        <span aria-hidden="true">↔</span>
                      </button>
                      <button
                        type="button"
                        class="btn btn-sm track-axis-button"
                        :class="
                          axisVisible(track.trackId, 'vertical')
                            ? 'btn-outline-primary'
                            : 'btn-outline-secondary'
                        "
                        :title="`${
                          axisVisible(track.trackId, 'vertical')
                            ? 'Hide'
                            : 'Show'
                        } ${track.name} vertically`"
                        :aria-label="`${
                          axisVisible(track.trackId, 'vertical')
                            ? 'Hide'
                            : 'Show'
                        } ${track.name} vertically`"
                        @click="toggleAxis(track.trackId, 'vertical')"
                      >
                        <span aria-hidden="true">↕</span>
                      </button>
                    </div>
                    <input
                      type="color"
                      class="form-control form-control-color"
                      :aria-label="`Color for ${track.name}`"
                      :value="normalizeColor(track.color)"
                      @change="
                        onChangeColor(
                          track.trackId,
                          ($event.target as HTMLInputElement).value
                        )
                      "
                    />
                    <div class="track-name-group">
                      <CommittedTrackInput
                        type="text"
                        class="form-control"
                        :aria-label="`Track name for ${track.name}`"
                        :model-value="track.name"
                        :commit="(value) => onRename(track.trackId, value)"
                      />
                      <small
                        class="text-muted track-source"
                        :title="trackSourceLabel(track)"
                        >{{ trackSourceLabel(track) }}</small
                      >
                    </div>
                    <button
                      v-if="
                        props.mapManager?.linearTrackManager.getAnalysisWarning(
                          track.trackId
                        )
                      "
                      type="button"
                      class="btn btn-sm btn-outline-warning"
                      :title="
                        props.mapManager?.linearTrackManager.getAnalysisWarning(
                          track.trackId
                        )
                      "
                      aria-label="New matches might have formed"
                      @click="
                        toast.message(
                          props.mapManager?.linearTrackManager.getAnalysisWarning(
                            track.trackId
                          ) ?? '',
                          { duration: 15000 }
                        )
                      "
                    >
                      ⚠
                    </button>
                    <span class="badge text-bg-secondary">{{
                      track.type === "COOLER_WEIGHTS" ? "Weights" : track.type
                    }}</span>
                    <small class="text-muted">{{
                      formatFeatureCount(track.featureCount)
                    }}</small>
                    <button
                      class="btn btn-sm btn-outline-secondary"
                      :disabled="trackIndex === 0"
                      :aria-label="`Move ${track.name} up`"
                      title="Move up"
                      @click="onMoveTrack(track.trackId, trackIndex - 1)"
                    >
                      ↑
                    </button>
                    <button
                      class="btn btn-sm btn-outline-secondary"
                      :disabled="trackIndex >= tracks.length - 1"
                      :aria-label="`Move ${track.name} down`"
                      title="Move down"
                      @click="onMoveTrack(track.trackId, trackIndex + 1)"
                    >
                      ↓
                    </button>
                    <button
                      class="btn btn-sm btn-outline-danger ms-auto"
                      @click="onRemove(track.trackId)"
                    >
                      Remove
                    </button>
                    <details
                      v-if="
                        (track.renderStyle ?? 'SIGNAL').toUpperCase() !==
                        'FEATURE'
                      "
                      class="track-signal-settings"
                    >
                      <summary>Signal settings</summary>
                      <div
                        class="d-flex flex-wrap align-items-center gap-2 pt-2"
                      >
                        <select
                          v-if="track.type === 'BIGWIG'"
                          :aria-label="`Aggregation for ${track.name}`"
                          title="Maximum, mean over covered positions, or mean with gaps treated as zero."
                          class="form-select form-select-sm track-mode-select"
                          :value="
                            normalizeBigWigAggregation(track.aggregationMode)
                          "
                          @change="
                            onChangeBigWigAggregation(
                              track.trackId,
                              ($event.target as HTMLSelectElement).value
                            )
                          "
                        >
                          <option value="MAX">Maximum</option>
                          <option value="MEAN">Mean (covered span)</option>
                          <option value="MEAN_WITH_ZERO_GAPS">
                            Mean (gaps as zero)
                          </option>
                        </select>
                        <div
                          v-if="
                            (track.renderStyle ?? 'SIGNAL').toUpperCase() !==
                            'FEATURE'
                          "
                          class="d-flex flex-wrap align-items-center gap-2"
                        >
                          <div class="form-check form-switch m-0">
                            <input
                              :id="`track-log-scale-${track.trackId}`"
                              class="form-check-input"
                              type="checkbox"
                              title="Logarithmic scale; signed signals use symmetric log1p around zero."
                              :checked="track.logScale"
                              @change="
                                onChangeLogScale(
                                  track.trackId,
                                  ($event.target as HTMLInputElement).checked
                                )
                              "
                            />
                            <label
                              class="form-check-label small"
                              :for="`track-log-scale-${track.trackId}`"
                            >
                              log
                            </label>
                          </div>
                          <CommittedTrackInput
                            v-if="track.logScale"
                            type="number"
                            class="form-control form-control-sm track-log-base-input"
                            :model-value="getTrackLogBase(track.trackId)"
                            step="any"
                            :commit="
                              (value) => onChangeLogBase(track.trackId, value)
                            "
                            title="Log base for log(1+x)"
                          />
                          <div class="form-check form-switch m-0 ms-2">
                            <input
                              :id="`track-range-auto-${track.trackId}`"
                              class="form-check-input"
                              type="checkbox"
                              :checked="track.rangeAuto"
                              @change="
                                onChangeRangeAuto(
                                  track.trackId,
                                  ($event.target as HTMLInputElement).checked
                                )
                              "
                            />
                            <label
                              class="form-check-label small"
                              :for="`track-range-auto-${track.trackId}`"
                            >
                              auto range
                            </label>
                          </div>
                          <CommittedTrackInput
                            type="number"
                            class="form-control form-control-sm track-range-input"
                            :model-value="track.rangeMin"
                            :disabled="track.rangeAuto"
                            step="any"
                            title="Signal range minimum"
                            :commit="
                              (value) =>
                                onChangeRangeBound(
                                  track.trackId,
                                  'rangeMin',
                                  Number(value)
                                )
                            "
                          />
                          <CommittedTrackInput
                            type="number"
                            class="form-control form-control-sm track-range-input"
                            :model-value="track.rangeMax"
                            :disabled="track.rangeAuto"
                            step="any"
                            title="Signal range maximum"
                            :commit="
                              (value) =>
                                onChangeRangeBound(
                                  track.trackId,
                                  'rangeMax',
                                  Number(value)
                                )
                            "
                          />
                        </div>
                        <select
                          v-if="track.type === 'BAM'"
                          :aria-label="`Rendering for ${track.name}`"
                          title="Aligned-base depth excludes skipped and deleted bases. Read centers count one source midpoint per mapped alignment."
                          class="form-select form-select-sm track-mode-select"
                          :value="normalizeBamMode(track.renderMode)"
                          @change="
                            onChangeBamMode(
                              track.trackId,
                              ($event.target as HTMLSelectElement).value
                            )
                          "
                        >
                          <option value="COVERAGE">Aligned-base depth</option>
                          <option value="READ_DENSITY">Read centers</option>
                        </select>
                      </div>
                    </details>
                  </div>
                  <div v-if="tracks.length === 0" class="text-muted">
                    No tracks loaded
                  </div>
                </div>

                <AdvancedSection
                  dialog-id="tracks"
                  @open-change="onPreparationToggle"
                >
                  <h6 class="mb-0">Track appearance</h6>
                  <div class="alert alert-light border py-2">
                    <div
                      class="d-flex align-items-center justify-content-between gap-2"
                    >
                      <strong class="small">Track panel background</strong>
                      <div class="d-flex align-items-center gap-2">
                        <div class="form-check form-switch m-0">
                          <input
                            id="track-bg-inherit"
                            v-model="inheritTrackBackgroundFromMap"
                            class="form-check-input"
                            type="checkbox"
                          />
                          <label
                            class="form-check-label small"
                            for="track-bg-inherit"
                          >
                            Inherit from Hi-C map
                          </label>
                        </div>
                        <input
                          aria-label="Track panel background color"
                          type="color"
                          class="form-control form-control-color"
                          :value="trackBackgroundHex"
                          :disabled="inheritTrackBackgroundFromMap"
                          @change="
                            onTrackBackgroundColorChanged(
                              ($event.target as HTMLInputElement).value
                            )
                          "
                        />
                      </div>
                    </div>
                  </div>
                  <h6 class="mb-0">Preparation</h6>
                  <p
                    v-if="
                      tracks.some((track) => track.type === 'COOLER_WEIGHTS')
                    "
                    class="small text-muted mt-2"
                  >
                    Map weights are read directly and need no preparation.
                  </p>
                  <p class="small text-muted mt-2">
                    Prepare tracks in advance for browsing. Progress is also
                    available in Jobs.
                  </p>
                  <div class="alert alert-secondary py-2">
                    <div
                      class="d-flex align-items-center justify-content-between gap-2 mb-2"
                    >
                      <strong>Prepare tracks for browsing</strong>
                      <button
                        class="btn btn-sm btn-outline-primary"
                        :disabled="
                          !tracks.some(
                            (track) => track.type !== 'COOLER_WEIGHTS'
                          )
                        "
                        @click="onStartPrecomputeAll"
                      >
                        Precompute all
                      </button>
                    </div>
                    <div
                      v-if="
                        precomputeStatus && precomputeStatus.tracks.length > 0
                      "
                      class="precompute-list"
                    >
                      <div
                        v-for="item in precomputeStatus.tracks"
                        :key="item.trackId"
                        class="precompute-item"
                      >
                        <div
                          class="d-flex justify-content-between align-items-center"
                        >
                          <small>{{ item.trackName }}</small>
                          <small class="text-muted">
                            {{ item.status }}
                            {{ Math.round(item.progress * 100) }}%
                          </small>
                        </div>
                        <div class="progress" style="height: 6px">
                          <div
                            class="progress-bar"
                            role="progressbar"
                            :style="{
                              width: `${Math.max(
                                0,
                                Math.min(100, Math.round(item.progress * 100))
                              )}%`,
                            }"
                          ></div>
                        </div>
                        <small v-if="item.currentTask" class="text-muted">{{
                          item.currentTask
                        }}</small>
                        <small v-if="item.error" class="text-danger">{{
                          item.error
                        }}</small>
                      </div>
                    </div>
                    <small v-else class="text-muted"
                      >No background jobs yet.</small
                    >
                  </div>
                </AdvancedSection>
              </section>
              <section
                id="track-panel-sources"
                v-if="props.section === 'sources'"
              >
                <p class="small mb-3">
                  Primary map:
                  <strong class="source-filename">{{
                    props.mapManager.getOptions().filename
                  }}</strong>
                </p>
                <div class="alert alert-light border py-2 mb-3">
                  <div class="row g-2 align-items-end">
                    <div class="col-12 col-sm-7">
                      <label for="secondary-source-file" class="form-label mb-1"
                        >Secondary data source</label
                      >
                      <div class="input-group">
                        <input
                          id="secondary-source-file"
                          type="text"
                          class="form-control"
                          :value="
                            selectedSecondaryFile ||
                            secondaryStatus.filename ||
                            'Select secondary data source (.hict.hdf5, .cool, .mcool)'
                          "
                          readonly
                        />
                        <button
                          class="btn btn-outline-secondary"
                          :disabled="sourceChanging || isAddingTrack"
                          @click="secondaryFileSelectorOpen = true"
                        >
                          Browse…
                        </button>
                      </div>
                    </div>
                    <div class="col-4 col-sm-2 d-grid gap-2">
                      <button
                        class="btn btn-outline-primary"
                        :disabled="
                          !selectedSecondaryFile ||
                          sourceChanging ||
                          isAddingTrack
                        "
                        @click="onAttachSecondarySource"
                      >
                        Attach
                      </button>
                      <button
                        class="btn btn-outline-danger btn-sm"
                        :disabled="
                          !secondaryStatus.attached ||
                          sourceChanging ||
                          isAddingTrack
                        "
                        @click="onDetachSecondarySource"
                      >
                        Detach
                      </button>
                    </div>
                    <div class="col-8 col-sm-3">
                      <label for="assembly-source" class="form-label mb-1"
                        >Assembly source</label
                      >
                      <select
                        id="assembly-source"
                        :disabled="sourceChanging || isAddingTrack"
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
                        <option
                          value="SECONDARY"
                          :disabled="
                            !secondaryStatus.attached ||
                            sourceChanging ||
                            isAddingTrack
                          "
                        >
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

                <div class="border rounded p-3 mb-3">
                  <h6>Map layers</h6>
                  <p class="small text-muted">
                    Adjust contig and scaffold borders, labels and their
                    appearance in the side panel.
                  </p>
                  <button
                    type="button"
                    class="btn btn-outline-secondary"
                    @click="showMapLayers"
                  >
                    Borders and labels…
                  </button>
                </div>
                <AdvancedSection dialog-id="sources">
                  <h6 class="mb-0">Compatibility</h6>
                  <p class="small mb-0">
                    HiCT keeps a separate edit history for each assembly.
                    Choose the secondary map as the assembly source to display
                    its layout.
                  </p>
                  <p class="small mb-0">
                    Generated dotplot scores move with their original sequence
                    bins. Recompute after changing joins to refresh scores that
                    depend on the surrounding sequence.
                  </p>
                </AdvancedSection>
              </section>
            </template>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="$emit('dismissed')">
              Close
            </button>
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
      :title="'Select secondary data source'"
      :file-type="'.hict.hdf5, .cool, .mcool'"
      :note="'Cooler files have to be converted into HiCT internal format before opening.'"
      :file-name-predicate="isSupportedSecondaryFilename"
      @selected="onSecondaryFileSelected"
      @dismissed="secondaryFileSelectorOpen = false"
    />
    <CoolerConverter
      v-if="convertingSecondaryCooler && props.mapManager"
      :network-manager="props.mapManager.networkManager"
      :initial-cooler-filename="secondaryCoolerToConvert"
      @dismissed="onSecondaryConverterDismissed"
    />
    <template v-if="pendingTrackProbe">
      <div class="modal-backdrop fade show track-compat-backdrop"></div>
      <div
        class="modal fade show track-compat-modal"
        style="display: block"
        tabindex="-1"
        role="dialog"
      >
        <div class="modal-dialog modal-lg modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Track Compatibility Warning</h5>
              <button
                type="button"
                class="btn-close"
                aria-label="Close dialog"
                @click="pendingTrackProbe = null"
              ></button>
            </div>
            <div class="modal-body">
              <p class="mb-2">{{ pendingTrackProbe.message }}</p>
              <ul class="small mb-2">
                <li>Track names: {{ pendingTrackProbe.totalNames }}</li>
                <li>
                  Matched source names:
                  {{ pendingTrackProbe.matchedSourceNames }}
                </li>
                <li>
                  Matched assembly names:
                  {{ pendingTrackProbe.matchedAssemblyNames }}
                </li>
                <li>Matched total: {{ pendingTrackProbe.matchedAnyNames }}</li>
              </ul>
              <div
                v-if="pendingTrackProbe.unknownNames.length > 0"
                class="alert alert-warning py-2 mb-0"
              >
                Unknown names:
                <code>{{
                  pendingTrackProbe.unknownNames.slice(0, 12).join(", ")
                }}</code>
              </div>
            </div>
            <div class="modal-footer">
              <button
                class="btn btn-secondary"
                @click="pendingTrackProbe = null"
              >
                Cancel
              </button>
              <button
                class="btn btn-primary"
                @click="onProceedTrackWithMismatch"
              >
                Ignore and Load
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
    <template v-if="pendingSecondaryProbe">
      <div class="modal-backdrop fade show track-compat-backdrop"></div>
      <div
        class="modal fade show track-compat-modal"
        style="display: block"
        tabindex="-1"
        role="dialog"
      >
        <div class="modal-dialog modal-lg modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">
                Secondary Source Compatibility Warning
              </h5>
              <button
                type="button"
                class="btn-close"
                aria-label="Close dialog"
                @click="pendingSecondaryProbe = null"
              ></button>
            </div>
            <div class="modal-body">
              <p class="mb-2">
                Secondary source differs from the primary source matrix sizes.
                Smaller matrix regions will be padded with background color.
              </p>
              <ul class="small mb-2">
                <li>
                  Requested file:
                  {{
                    pendingSecondaryProbe.requestedFilename ||
                    selectedSecondaryFile
                  }}
                </li>
                <li>
                  Primary max bins:
                  {{ pendingSecondaryProbe.compatibility?.primaryMaxBins ?? 0 }}
                </li>
                <li>
                  Secondary max bins:
                  {{
                    pendingSecondaryProbe.compatibility?.secondaryMaxBins ?? 0
                  }}
                </li>
                <li>
                  Mismatched resolutions:
                  {{
                    (
                      pendingSecondaryProbe.compatibility
                        ?.mismatchedResolutionOrders ?? []
                    ).length
                  }}
                </li>
              </ul>
              <div
                v-if="pendingSecondaryProbe.warnings.length > 0"
                class="alert alert-warning py-2 mb-0"
              >
                <div
                  v-for="warning in pendingSecondaryProbe.warnings"
                  :key="warning"
                >
                  {{ warning }}
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button
                class="btn btn-secondary"
                @click="pendingSecondaryProbe = null"
              >
                Cancel
              </button>
              <button
                class="btn btn-primary"
                @click="onProceedSecondaryWithMismatch"
              >
                Continue and Attach
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import AdvancedSection from "@/app/ui/components/common/AdvancedSection.vue";
import CommittedTrackInput from "@/app/ui/components/tracks/CommittedTrackInput.vue";
import { reportFailure } from "@/app/ui/reportFailure";
import { useModalFocus } from "@/app/ui/modalFocus";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import type { AssemblyInfo } from "@/app/core/domain/AssemblyInfo";
import type { SecondarySourceStatusResponse } from "@/app/core/net/api/RequestManager";
import type {
  TrackCompatibilityReportResponse,
  TrackSummaryResponse,
  TracksPrecomputeStatusResponse,
} from "@/app/core/net/api/response";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import CoolerConverter from "@/app/ui/components/upper_ribbon/CoolerConverter.vue";
import UniversalFileSelector from "@/app/ui/components/upper_ribbon/UniversalFileSelector.vue";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
import { storeToRefs } from "pinia";
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { toast } from "vue-sonner";

const rootElement = ref<HTMLElement | null>(null);
useModalFocus(rootElement);

const props = defineProps<{
  mapManager?: ContactMapManager;
  section: "tracks" | "sources";
}>();

const emit = defineEmits<{
  (e: "dismissed"): void;
}>();

const addKind = ref<"file" | "weights">("file");
const weightSource = ref<"PRIMARY" | "SECONDARY">("PRIMARY");
const isAddingTrack = ref(false);
const sourceChanging = ref(false);
function showMapLayers(): void {
  emit("dismissed");
  void nextTick(() => window.dispatchEvent(new Event("hict:show-map-layers")));
}
const trackSourceLabel = (track: TrackSummaryResponse): string =>
  track.sourceFile.startsWith("__internal__/cooler_weights")
    ? `${computedWeights.value ? "Coverage weights" : "File weights"} · ${
        track.sourceFile.endsWith("/SECONDARY") ? "Secondary" : "Primary"
      }`
    : track.sourceFile;
const selectedFile = ref("");
const trackDisplayName = ref("");
const trackFileSelectorOpen = ref(false);
const secondaryFileSelectorOpen = ref(false);
const convertingSecondaryCooler = ref(false);
const secondaryCoolerToConvert = ref<string | undefined>(undefined);
const selectedSecondaryFile = ref("");
const pendingTrackProbe = ref<TrackCompatibilityReportResponse | null>(null);
const pendingSecondaryProbe = ref<SecondarySourceStatusResponse | null>(null);
const tracks = ref<TrackSummaryResponse[]>([]);
const precomputeStatus = ref<TracksPrecomputeStatusResponse | null>(null);
const secondaryStatus = ref<SecondarySourceStatusResponse>({
  attached: false,
  filename: "",
  assemblySource: "PRIMARY",
  requiresConfirmation: false,
  warnings: [],
});
let precomputePollHandle: number | null = null;
let disposed = false;
let unsubscribeTracks: (() => void) | undefined;
const uiSettingsStore = useUiSettingsStore();
const { inheritTrackBackgroundFromMap, trackBackgroundColor } =
  storeToRefs(uiSettingsStore);

useEscDismissableDialog({
  priority: 1060,
  isOpen: () => true,
  requestClose: () => {
    emit("dismissed");
  },
});

useEscDismissableDialog({
  priority: 1075,
  isOpen: () => pendingTrackProbe.value !== null,
  requestClose: () => {
    pendingTrackProbe.value = null;
  },
});

useEscDismissableDialog({
  priority: 1075,
  isOpen: () => pendingSecondaryProbe.value !== null,
  requestClose: () => {
    pendingSecondaryProbe.value = null;
  },
});

const normalizeColor = (value: string): string => {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return value;
  }
  return "#4e79a7";
};

const formatFeatureCount = (featureCount: number): string => {
  if (!Number.isFinite(featureCount) || featureCount < 0) {
    return "On demand";
  }
  return `${featureCount} features`;
};

const normalizeBamMode = (value: string): "COVERAGE" | "READ_DENSITY" => {
  return value === "READ_DENSITY" ? "READ_DENSITY" : "COVERAGE";
};

const normalizeBigWigAggregation = (
  value: string
): "MAX" | "MEAN" | "MEAN_WITH_ZERO_GAPS" => {
  if (value === "MEAN") {
    return "MEAN";
  }
  if (value === "SUM" || value === "MEAN_WITH_ZERO_GAPS") {
    return "MEAN_WITH_ZERO_GAPS";
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

const trackBackgroundHex = computed(() =>
  rgbaLikeToHex(trackBackgroundColor.value)
);
const COOLER_WEIGHTS_PRIMARY_SOURCE_FILE =
  "__internal__/cooler_weights/PRIMARY";
const COOLER_WEIGHTS_SECONDARY_SOURCE_FILE =
  "__internal__/cooler_weights/SECONDARY";
const primaryCoolerWeightsTrackIds = computed(() =>
  tracks.value
    .filter(
      (track) =>
        track.sourceFile === COOLER_WEIGHTS_PRIMARY_SOURCE_FILE ||
        track.sourceFile === "__internal__/cooler_weights"
    )
    .map((track) => track.trackId)
);
const primaryCoolerWeightsVisible = computed(
  () => primaryCoolerWeightsTrackIds.value.length > 0
);
const secondaryCoolerWeightsTrackIds = computed(() =>
  tracks.value
    .filter(
      (track) => track.sourceFile === COOLER_WEIGHTS_SECONDARY_SOURCE_FILE
    )
    .map((track) => track.trackId)
);
const secondaryCoolerWeightsVisible = computed(
  () => secondaryCoolerWeightsTrackIds.value.length > 0
);

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
  return (
    lowered.endsWith(".hict.hdf5") ||
    lowered.endsWith(".cool") ||
    lowered.endsWith(".mcool")
  );
};

const refreshTracks = async () => {
  if (!props.mapManager) {
    tracks.value = [];
    return;
  }
  try {
    tracks.value = await props.mapManager.linearTrackManager.refreshTrackList();
  } catch (err) {
    reportFailure("List tracks", err);
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
      requiresConfirmation: false,
      warnings: [],
    };
    return;
  }
  try {
    secondaryStatus.value =
      await props.mapManager.networkManager.requestManager.getSecondarySourceStatus();
    props.mapManager.viewAndLayersManager.setSecondaryResolutionModel(
      secondaryStatus.value.attached
        ? secondaryStatus.value.compatibility
        : undefined
    );
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
    const warnings = await props.mapManager.linearTrackManager.openTrack(
      selectedFile.value,
      trackDisplayName.value.trim() || undefined
    );
    if (warnings.length > 0)
      toast.message(warnings[0], {
        description: warnings.slice(1).join("\n"),
        duration: 20000,
      });
    trackDisplayName.value = "";
    await refreshTracks();
    await refreshPrecomputeStatus();
  } catch (err) {
    reportFailure("Add track", err);
  }
};

const onAddTrack = async () => {
  if (
    !props.mapManager ||
    !selectedFile.value ||
    isAddingTrack.value ||
    sourceChanging.value
  ) {
    return;
  }
  isAddingTrack.value = true;
  try {
    const probe =
      await props.mapManager.linearTrackManager.probeTrackCompatibility(
        selectedFile.value
      );
    if (probe.status !== "ok") {
      pendingTrackProbe.value = probe;
      return;
    }
    await openTrackInternal();
  } catch (err) {
    reportFailure("Add track", err);
  } finally {
    isAddingTrack.value = false;
  }
};

const weightsAlreadyAdded = computed(() =>
  weightSource.value === "PRIMARY"
    ? primaryCoolerWeightsVisible.value
    : secondaryCoolerWeightsVisible.value
);
const computedWeights = computed(
  () =>
    props.mapManager?.networkManager.requestManager.getNormalizationWeightsMode(
      weightSource.value
    ) === "SQRT_COVERAGE"
);
const weightsCapability = computed(() => {
  const capabilities =
    props.mapManager?.networkManager.requestManager.sourceCapabilities[
      weightSource.value
    ];
  return computedWeights.value
    ? capabilities?.contactNormalization
    : capabilities?.importedWeights;
});
const weightsUnavailable = computed(
  () =>
    (weightSource.value === "SECONDARY" && !secondaryStatus.value.attached) ||
    weightsCapability.value?.state === "UNAVAILABLE"
);
const weightsDescription = computed(() =>
  computedWeights.value
    ? "Square-root coverage weights from the selected map."
    : weightsCapability.value?.state === "AVAILABLE"
    ? "Stored Cooler weights from the selected map."
    : "Weight provenance is unknown for this file. The track uses its source-bin weights."
);
const weightsAddHint = computed(() =>
  weightSource.value === "SECONDARY" && !secondaryStatus.value.attached
    ? "Attach a secondary map in Sources and layers first."
    : weightsUnavailable.value
    ? weightsCapability.value?.reason
    : weightsDescription.value +
      (weightsAlreadyAdded.value
        ? " Already added. Manage it in the track list."
        : " Values follow the original source bins.")
);
const onAddWeights = async () => {
  if (
    !props.mapManager ||
    isAddingTrack.value ||
    sourceChanging.value ||
    weightsAlreadyAdded.value ||
    weightsUnavailable.value
  )
    return;
  isAddingTrack.value = true;
  const source = weightSource.value;
  try {
    await props.mapManager.linearTrackManager.openCoolerWeightsTrack(
      `Map weights - ${source === "PRIMARY" ? "Primary" : "Secondary"}`,
      source
    );
    await refreshTracks();
    await refreshPrecomputeStatus();
  } catch (err) {
    reportFailure("Add map weights", err);
  } finally {
    isAddingTrack.value = false;
  }
};

const onProceedTrackWithMismatch = async () => {
  if (isAddingTrack.value || sourceChanging.value) return;
  pendingTrackProbe.value = null;
  isAddingTrack.value = true;
  try {
    await openTrackInternal();
  } finally {
    isAddingTrack.value = false;
  }
};

const onTrackFileSelected = (filename: string) => {
  selectedFile.value = filename;
  trackFileSelectorOpen.value = false;
  if (!trackDisplayName.value.trim()) {
    const parts = filename.split("/");
    trackDisplayName.value = parts[parts.length - 1] ?? "";
  }
};

const onSecondaryFileSelected = async (filename: string) => {
  const lowered = filename.toLowerCase();
  if (lowered.endsWith(".cool") || lowered.endsWith(".mcool")) {
    try {
      const resolution =
        await props.mapManager?.networkManager.requestManager.resolveMatrixSource(
          filename
        );
      if (resolution?.action === "REUSE_CONVERTED") {
        selectedSecondaryFile.value = resolution.resolvedFilename;
        secondaryFileSelectorOpen.value = false;
        resolution.warnings.forEach((warning) => toast.message(warning));
        return;
      }
      secondaryFileSelectorOpen.value = false;
      secondaryCoolerToConvert.value = filename;
      convertingSecondaryCooler.value = true;
      resolution?.warnings.forEach((warning) =>
        toast.message(warning, {
          style: {
            "background-color": "lightyellow",
            color: "black",
          },
        })
      );
    } catch (error) {
      reportFailure("Choose secondary map", error);
      secondaryFileSelectorOpen.value = false;
    }
    return;
  }
  selectedSecondaryFile.value = filename;
  secondaryFileSelectorOpen.value = false;
};

const onSecondaryConverterDismissed = () => {
  convertingSecondaryCooler.value = false;
  secondaryCoolerToConvert.value = undefined;
};

const applyAssemblyInfo = (assemblyInfo: AssemblyInfo): void => {
  if (!props.mapManager) {
    return;
  }
  props.mapManager.contigDimensionHolder.updateContigData(
    assemblyInfo.contigDescriptors
  );
  props.mapManager.scaffoldHolder.updateScaffoldData(
    assemblyInfo.scaffoldDescriptors
  );
  props.mapManager.getLayersManager().reapplyAxisScopes();
  props.mapManager.reloadVisuals();
  props.mapManager.refreshOverviewMinimap();
  void props.mapManager.linearTrackManager.clearCachesAndRender();
};

const onAttachSecondarySource = async () => {
  if (
    sourceChanging.value ||
    isAddingTrack.value ||
    !props.mapManager ||
    !selectedSecondaryFile.value
  ) {
    return;
  }
  sourceChanging.value = true;
  try {
    const response =
      await props.mapManager.networkManager.requestManager.openSecondarySource(
        selectedSecondaryFile.value,
        false
      );
    if (response.requiresConfirmation) {
      pendingSecondaryProbe.value = response;
      return;
    }
    pendingSecondaryProbe.value = null;
    secondaryStatus.value = response;
    props.mapManager.viewAndLayersManager.setSecondaryResolutionModel(
      response.compatibility
    );
    if (response.assemblyInfo) applyAssemblyInfo(response.assemblyInfo);
    await props.mapManager.reloadTilesFromBackend();
    await refreshSecondaryStatus();
    toast.success("Secondary source attached");
  } catch (err) {
    reportFailure("Attach secondary map", err);
  } finally {
    sourceChanging.value = false;
  }
};

const onProceedSecondaryWithMismatch = async () => {
  if (sourceChanging.value || isAddingTrack.value || !props.mapManager) {
    return;
  }
  const filenameToOpen =
    pendingSecondaryProbe.value?.requestedFilename ??
    selectedSecondaryFile.value;
  if (!filenameToOpen) {
    pendingSecondaryProbe.value = null;
    return;
  }
  sourceChanging.value = true;
  try {
    pendingSecondaryProbe.value = null;
    secondaryStatus.value =
      await props.mapManager.networkManager.requestManager.openSecondarySource(
        filenameToOpen,
        true
      );
    props.mapManager.viewAndLayersManager.setSecondaryResolutionModel(
      secondaryStatus.value.compatibility
    );
    if (secondaryStatus.value.assemblyInfo) {
      applyAssemblyInfo(secondaryStatus.value.assemblyInfo);
    }
    selectedSecondaryFile.value = filenameToOpen;
    await props.mapManager.reloadTilesFromBackend();
    await refreshSecondaryStatus();
    toast.success("Secondary source attached with compatibility warning");
  } catch (err) {
    reportFailure("Attach secondary map", err);
  } finally {
    sourceChanging.value = false;
  }
};

const onDetachSecondarySource = async () => {
  if (sourceChanging.value || isAddingTrack.value || !props.mapManager) {
    return;
  }
  sourceChanging.value = true;
  try {
    secondaryStatus.value =
      await props.mapManager.networkManager.requestManager.closeSecondarySource();
    props.mapManager.viewAndLayersManager.setSecondaryResolutionModel(
      undefined
    );
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
    reportFailure("Detach secondary map", err);
  } finally {
    sourceChanging.value = false;
  }
};

const onAssemblySourceChanged = async (
  assemblySource: "PRIMARY" | "SECONDARY"
) => {
  if (sourceChanging.value || isAddingTrack.value || !props.mapManager) {
    return;
  }
  sourceChanging.value = true;
  try {
    const result =
      await props.mapManager.networkManager.requestManager.setAssemblyInfoSource(
        assemblySource
      );
    secondaryStatus.value.assemblySource = result.assemblySource;
    applyAssemblyInfo(result.assemblyInfo);
  } catch (err) {
    reportFailure("Change assembly source", err);
    await refreshSecondaryStatus();
  } finally {
    sourceChanging.value = false;
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
    reportFailure("Change track visibility", err);
  }
};

const axisVisible = (trackId: string, orientation: "horizontal" | "vertical") =>
  props.mapManager?.linearTrackManager.isTrackVisibleOnAxis(
    trackId,
    orientation
  ) ?? true;

const toggleAxis = (
  trackId: string,
  orientation: "horizontal" | "vertical"
) => {
  if (!props.mapManager) return;
  props.mapManager.linearTrackManager.setTrackVisibleOnAxis(
    trackId,
    orientation,
    !props.mapManager.linearTrackManager.isTrackVisibleOnAxis(
      trackId,
      orientation
    )
  );
};

const onChangeColor = async (trackId: string, color: string) => {
  if (!props.mapManager) {
    return;
  }
  try {
    await props.mapManager.linearTrackManager.updateTrack(trackId, { color });
    await refreshTracks();
  } catch (err) {
    reportFailure("Change track color", err);
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
    reportFailure("Rename track", err);
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
    reportFailure("Remove track", err);
  }
};

const onMoveTrack = async (trackId: string, targetIndex: number) => {
  if (!props.mapManager) {
    return;
  }
  try {
    await props.mapManager.linearTrackManager.reorderTrack(
      trackId,
      targetIndex
    );
    await refreshTracks();
  } catch (err) {
    reportFailure("Move track", err);
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
    reportFailure("Change track rendering", err);
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
    const mode = normalizeBigWigAggregation(aggregationMode);
    await props.mapManager.linearTrackManager.updateTrack(trackId, {
      // The existing API and saved tracks use SUM for this zero-filled mean.
      aggregationMode: mode === "MEAN_WITH_ZERO_GAPS" ? "SUM" : mode,
    });
    await refreshTracks();
  } catch (err) {
    reportFailure("Change track aggregation", err);
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
    reportFailure("Change track scale", err);
  }
};

const onChangeRangeAuto = async (trackId: string, rangeAuto: boolean) => {
  if (!props.mapManager) {
    return;
  }
  try {
    await props.mapManager.linearTrackManager.updateTrack(trackId, {
      rangeAuto,
    });
    await refreshTracks();
  } catch (err) {
    reportFailure("Set track range", err);
  }
};

const onChangeRangeBound = async (
  trackId: string,
  field: "rangeMin" | "rangeMax",
  value: number
) => {
  if (!props.mapManager || !Number.isFinite(value)) {
    return;
  }
  const current = tracks.value.find((t) => t.trackId === trackId);
  if (
    current &&
    (field === "rangeMin"
      ? value >= current.rangeMax
      : value <= current.rangeMin)
  ) {
    toast.message(
      field === "rangeMin"
        ? `The minimum must be below the maximum (${current.rangeMax}). Raise the maximum first.`
        : `The maximum must be above the minimum (${current.rangeMin}). Lower the minimum first.`
    );
    // Show the range that is still in use rather than the rejected number.
    tracks.value = tracks.value.slice();
    await refreshTracks();
    return;
  }
  try {
    const options =
      field === "rangeMin"
        ? { rangeAuto: false, rangeMin: value }
        : { rangeAuto: false, rangeMax: value };
    await props.mapManager.linearTrackManager.updateTrack(trackId, options);
    await refreshTracks();
  } catch (err) {
    reportFailure("Set track range", err);
    // Restore the displayed range after a failed update.
    console.debug("Track range was not changed", err);
    await refreshTracks();
  }
};

const getTrackLogBase = (trackId: string): number => {
  return props.mapManager?.linearTrackManager.getTrackLogBase(trackId) ?? 10;
};

const onChangeLogBase = async (
  trackId: string,
  value: string
): Promise<void> => {
  const manager = props.mapManager?.linearTrackManager;
  if (!manager) return;
  const result = manager.setTrackLogBase(trackId, Number(value));
  if (!result.ok) toast.message(result.message);
};

const onStartPrecomputeAll = async () => {
  if (!props.mapManager) {
    return;
  }
  try {
    precomputeStatus.value =
      await props.mapManager.linearTrackManager.startPrecompute(
        undefined,
        true
      );
  } catch (err) {
    reportFailure("Precompute tracks", err);
  }
};

const stopPrecomputePolling = (): void => {
  if (precomputePollHandle !== null) window.clearInterval(precomputePollHandle);
  precomputePollHandle = null;
};
const onPreparationToggle = (open: boolean): void => {
  stopPrecomputePolling();
  if (disposed || !open) return;
  void refreshPrecomputeStatus();
  precomputePollHandle = window.setInterval(() => {
    void refreshPrecomputeStatus();
  }, 1200);
};

onMounted(async () => {
  if (props.section === "sources") {
    await refreshSecondaryStatus();
    return;
  }
  unsubscribeTracks = props.mapManager?.linearTrackManager.subscribeTrackList(
    (snapshot) => {
      tracks.value = snapshot;
    }
  );
  await Promise.all([
    refreshTracks(),
    refreshPrecomputeStatus(),
    refreshSecondaryStatus(),
  ]);
});

onBeforeUnmount(() => {
  disposed = true;
  unsubscribeTracks?.();
  stopPrecomputePolling();
});
</script>

<style scoped>
.nav-tabs .nav-link:not(.active) {
  color: var(--hict-surface-fg, #212529);
}

.modal-dialog {
  max-width: min(900px, calc(100vw - 2rem));
  margin-left: auto;
  margin-right: auto;
}
.track-axis-button {
  min-width: 2rem;
  min-height: 2rem;
}
.track-row > .btn-group,
.track-row > input[type="color"],
.track-row > input[type="checkbox"] {
  flex-shrink: 0;
}

.tracks-list {
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 0.5rem;
}

.track-row {
  padding: 0.75rem 0;
  border-bottom: 1px solid #eee;
}

.track-row:last-child {
  border-bottom: none;
}

.track-name-group {
  flex: 1 1 12rem;
  min-width: 0;
}
.track-source {
  display: block;
  overflow-wrap: anywhere;
}
.track-signal-settings {
  flex-basis: 100%;
  padding: 0.35rem;
  background: #f8f9fa;
  border-radius: 4px;
}
.track-add-kind {
  width: auto;
  min-width: 10rem;
}
.track-extra-settings > summary {
  font-weight: 500;
  cursor: pointer;
}
.track-extra-settings[open] > summary {
  margin-bottom: 0.75rem;
}
.source-filename {
  overflow-wrap: anywhere;
}
.track-mode-select {
  width: 12.5rem;
  max-width: 100%;
}

.track-log-base-input {
  min-width: 4rem;
  max-width: 5.4rem;
}

.track-range-input {
  min-width: 5rem;
  max-width: 6.2rem;
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
