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
  <div class="wizard-root">
    <div class="modal-backdrop fade show"></div>
    <div class="modal fade show wizard-shell" style="display: block" tabindex="-1" role="dialog">
      <div class="modal-dialog modal-xl modal-dialog-centered">
        <div class="modal-content wizard-content">
          <div class="modal-header">
            <div>
              <h5 class="modal-title">Open File Wizard</h5>
              <small class="text-muted">
                Guided dataset opening, conversion reuse, layered rendering, FASTA/AGP linkage, and track precompute.
              </small>
            </div>
            <button type="button" class="btn-close" :disabled="runState.running" @click="emit('dismissed')"></button>
          </div>
          <div class="modal-body wizard-body">
            <aside class="wizard-sidebar">
              <button
                v-for="(step, index) in visibleSteps"
                :key="step.id"
                type="button"
                class="wizard-step-button"
                :class="{
                  active: currentStepIndex === index,
                  completed: isStepComplete(step.id),
                  running: runState.running && runState.currentStepId === step.id,
                }"
                :disabled="runState.running"
                @click="currentStepIndex = index"
              >
                <span class="wizard-step-index">{{ index + 1 }}</span>
                <span class="wizard-step-label">{{ step.label }}</span>
              </button>
            </aside>

            <section class="wizard-main">
              <div v-if="currentStep?.id === 'view-mode'" class="wizard-section">
                <h6>View Mode</h6>
                <div class="row g-3">
                  <div class="col-md-4" v-for="mode in viewModeCards" :key="mode.id">
                    <button
                      type="button"
                      class="wizard-choice-card"
                      :class="{ selected: viewMode === mode.id }"
                      @click="viewMode = mode.id"
                    >
                      <strong>{{ mode.label }}</strong>
                      <small>{{ mode.description }}</small>
                    </button>
                  </div>
                </div>
              </div>

              <div v-else-if="currentStep?.id === 'sources'" class="wizard-section">
                <h6>Sources Selection</h6>
                <div class="wizard-source-grid">
                  <div class="wizard-card">
                    <div class="wizard-card-header">
                      <strong>Primary source</strong>
                    </div>
                    <div class="wizard-card-body">
                      <label class="form-label">Matrix file</label>
                      <div class="input-group mb-2">
                        <input
                          class="form-control"
                          type="text"
                          readonly
                          :value="primarySource.filename || matrixSelectorPlaceholder"
                        />
                        <button class="btn btn-outline-secondary" @click="openSelector('primary-matrix')">
                          Browse…
                        </button>
                      </div>
                      <div
                        v-if="primarySource.resolving"
                        class="alert alert-light border py-2 mb-0 d-flex align-items-center gap-2"
                      >
                        <div
                          class="spinner-border spinner-border-sm text-primary flex-shrink-0"
                          role="status"
                          aria-hidden="true"
                        ></div>
                        <div class="text-truncate">
                          Checking <strong>{{ primarySource.filename }}</strong>
                        </div>
                      </div>
                      <div v-else-if="primarySource.resolution" class="alert alert-light border py-2 mb-0">
                        <small class="d-block">
                          Action: <strong>{{ humanizeMatrixAction(primarySource.resolution.action) }}</strong>
                        </small>
                        <small class="d-block">Resolved target: {{ primarySource.resolution.resolvedFilename }}</small>
                        <small
                          v-for="warning in primarySource.resolution.warnings"
                          :key="`primary-warning-${warning}`"
                          class="d-block text-warning"
                        >
                          {{ warning }}
                        </small>
                      </div>
                    </div>
                  </div>

                  <div v-if="requiresSecondarySource" class="wizard-card">
                    <div class="wizard-card-header">
                      <strong>Secondary source</strong>
                    </div>
                    <div class="wizard-card-body">
                      <label class="form-label">Matrix file</label>
                      <div class="input-group mb-2">
                        <input
                          class="form-control"
                          type="text"
                          readonly
                          :value="secondarySource.filename || matrixSelectorPlaceholder"
                        />
                        <button class="btn btn-outline-secondary" @click="openSelector('secondary-matrix')">
                          Browse…
                        </button>
                      </div>
                      <div
                        v-if="secondarySource.resolving"
                        class="alert alert-light border py-2 mb-0 d-flex align-items-center gap-2"
                      >
                        <div
                          class="spinner-border spinner-border-sm text-primary flex-shrink-0"
                          role="status"
                          aria-hidden="true"
                        ></div>
                        <div class="text-truncate">
                          Checking <strong>{{ secondarySource.filename }}</strong>
                        </div>
                      </div>
                      <div v-else-if="secondarySource.resolution" class="alert alert-light border py-2 mb-0">
                        <small class="d-block">
                          Action: <strong>{{ humanizeMatrixAction(secondarySource.resolution.action) }}</strong>
                        </small>
                        <small class="d-block">Resolved target: {{ secondarySource.resolution.resolvedFilename }}</small>
                        <small
                          v-for="warning in secondarySource.resolution.warnings"
                          :key="`secondary-warning-${warning}`"
                          class="d-block text-warning"
                        >
                          {{ warning }}
                        </small>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-if="requiresSecondarySource" class="alert alert-info mt-3 mb-0">
                  Overlay and split sessions keep one assembly source authoritative and propagate that layout to the
                  other source by matching contig names. Choose the authoritative source on the Assembly File step.
                </div>
                <div v-if="selectedHicToolchainNote" class="alert alert-info mt-3 mb-0">
                  <div class="fw-semibold mb-1">.hic processing with hictk</div>
                  <div v-for="(line, index) in selectedHicToolchainNote" :key="`hictk-source-${index}-${line}`">{{ line }}</div>
                  <div class="mt-1">
                    Project:
                    <a :href="hictkProjectUrl" target="_blank" rel="noopener noreferrer">hictk</a>
                  </div>
                  <div>Citation: {{ hictkCitationText }}</div>
                </div>
                <div v-if="hictkLoadSources.length > 0" class="alert alert-info mt-3 mb-0">
                  <div class="fw-semibold mb-1">Additional text matrix formats</div>
                  <div>
                    HiCT can load Hi-C Pro .matrix, COO TSV/CSV, BEDPE/bedGraph2, pairs, and validPairs files
                    through hictk before importing them into .hict.hdf5.
                  </div>
                </div>
              </div>

              <div v-else-if="currentStep?.id === 'visualization'" class="wizard-section">
                <h6>Visualization Options</h6>
                <div class="wizard-source-grid">
                  <div class="wizard-card">
                    <div class="wizard-card-header">
                      <strong>Primary preset</strong>
                    </div>
                    <div class="wizard-card-body">
                      <label class="form-label">Preset</label>
                      <select v-model="primarySource.presetId" class="form-select">
                        <option v-for="preset in availablePresets" :key="preset.id" :value="preset.id">
                          {{ preset.label }}
                        </option>
                      </select>
                      <div v-if="primaryPreset" class="wizard-preset-preview mt-2">
                        <small class="text-muted d-block">Background: {{ primaryPreset.preset.backgroundColor }}</small>
                        <small class="text-muted d-block">
                          Signal view: {{ primaryPreset.preset.options.signalDisplayMode }}
                        </small>
                        <small class="text-muted d-block">
                          Thresholds:
                          {{ primaryPreset.preset.signalThresholds?.lowerSignalBound ?? 0 }}
                          →
                          {{ primaryPreset.preset.signalThresholds?.upperSignalBound ?? 1 }}
                        </small>
                      </div>
                    </div>
                  </div>

                  <div v-if="requiresSecondarySource" class="wizard-card">
                    <div class="wizard-card-header">
                      <strong>Secondary preset</strong>
                    </div>
                    <div class="wizard-card-body">
                      <label class="form-label">Preset</label>
                      <select v-model="secondarySource.presetId" class="form-select">
                        <option v-for="preset in availablePresets" :key="preset.id" :value="preset.id">
                          {{ preset.label }}
                        </option>
                      </select>
                      <div v-if="secondaryPreset" class="wizard-preset-preview mt-2">
                        <small class="text-muted d-block">Background: {{ secondaryPreset.preset.backgroundColor }}</small>
                        <small class="text-muted d-block">
                          Signal view: {{ secondaryPreset.preset.options.signalDisplayMode }}
                        </small>
                        <small class="text-muted d-block">
                          Thresholds:
                          {{ secondaryPreset.preset.signalThresholds?.lowerSignalBound ?? 0 }}
                          →
                          {{ secondaryPreset.preset.signalThresholds?.upperSignalBound ?? 1 }}
                        </small>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-if="usesExpectedPreset" class="alert alert-info mt-3 mb-0">
                  Expected and O/E are computed independently inside each scaffold. If the opened assembly has no
                  scaffolds yet, each contig is treated as its own scaffold for expected-value estimation.
                </div>
                <div v-if="requiresSecondarySource" class="wizard-card mt-3">
                  <div class="wizard-card-header">
                    <strong>Blending mode</strong>
                  </div>
                  <div class="wizard-card-body">
                    <div class="row g-3">
                      <div class="col-md-6">
                        <label class="form-label">Pixel blend mode</label>
                        <select v-model="blendMode" class="form-select">
                          <option v-for="mode in BLEND_MODES" :key="mode" :value="mode">{{ mode }}</option>
                        </select>
                      </div>
                      <div class="col-md-3">
                        <label class="form-label">Top opacity (secondary)</label>
                        <input v-model.number="topOpacity" class="form-control" type="number" min="0" max="1" step="0.05" />
                      </div>
                      <div class="col-md-3">
                        <label class="form-label">Bottom opacity (primary)</label>
                        <input v-model.number="bottomOpacity" class="form-control" type="number" min="0" max="1" step="0.05" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-else-if="currentStep?.id === 'tracks'" class="wizard-section">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <h6 class="mb-0">1D tracks</h6>
                  <button class="btn btn-outline-primary btn-sm" @click="openSelector('track')">Add track…</button>
                </div>
                <div v-if="selectedTracks.length === 0" class="alert alert-light border">
                  No tracks selected. This step is optional.
                </div>
                <div v-else class="wizard-track-list">
                  <div v-for="track in selectedTracks" :key="track.filename" class="wizard-track-item">
                    <div class="d-flex justify-content-between align-items-start gap-3">
                      <div>
                        <strong>{{ track.displayName || track.filename.split('/').pop() }}</strong>
                        <code class="d-block">{{ track.filename }}</code>
                        <small v-if="track.compatibility" class="d-block text-muted">
                          {{ track.compatibility.message }}
                        </small>
                        <small v-if="track.precomputeProbe" class="d-block text-muted">
                          Precompute cache:
                          {{
                            track.precomputeProbe.cacheCurrent
                              ? "current"
                              : track.precomputeProbe.cacheAvailable
                                ? "stale"
                                : "missing"
                          }}
                        </small>
                      </div>
                      <button class="btn btn-outline-danger btn-sm" @click="removeTrack(track.filename)">
                        Remove
                      </button>
                    </div>
                    <div class="row g-2 mt-2">
                      <div class="col-md-6">
                        <label class="form-label">Display name</label>
                        <input v-model="track.displayName" class="form-control form-control-sm" type="text" placeholder="Optional" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-else-if="currentStep?.id === 'conversion'" class="wizard-section">
                <h6>Map Files Conversion</h6>
                <div class="wizard-card mb-3">
                  <div class="wizard-card-body">
                    <div class="form-check">
                      <input id="primary-force-conversion" v-model="primarySource.forceConversion" class="form-check-input" type="checkbox" />
                      <label class="form-check-label" for="primary-force-conversion">
                        Force primary conversion even when cached output is current
                      </label>
                    </div>
                    <div v-if="requiresSecondarySource" class="form-check mt-2">
                      <input id="secondary-force-conversion" v-model="secondarySource.forceConversion" class="form-check-input" type="checkbox" />
                      <label class="form-check-label" for="secondary-force-conversion">
                        Force secondary conversion even when cached output is current
                      </label>
                    </div>
                    <div class="form-check mt-2">
                      <input id="drop-caches-before-run" v-model="dropCachesBeforeRun" class="form-check-input" type="checkbox" />
                      <label class="form-check-label" for="drop-caches-before-run">
                        Drop all precomputed caches before running the wizard
                      </label>
                    </div>
                    <div v-if="hasSelectedCoolerSource" class="form-check form-switch mt-3">
                      <input id="build-resolution-pyramid" v-model="buildResolutionPyramid" class="form-check-input" type="checkbox" />
                      <label class="form-check-label" for="build-resolution-pyramid">
                        Build optimized resolution pyramid with hictk
                      </label>
                      <div class="form-text">
                        Enabled by default. HiCT will zoomify converted Cooler inputs before import so sparse or single-resolution files open with a complete set of map resolutions.
                      </div>
                    </div>
                    <div v-if="hasSelectedCoolerSource" class="form-check form-switch mt-3">
                      <input id="balance-input-coolers" v-model="balanceInputCoolers" class="form-check-input" type="checkbox" />
                      <label class="form-check-label" for="balance-input-coolers">
                        Balance input Coolers with hictk
                      </label>
                      <div class="form-text">
                        Enabled by default for .cool/.mcool inputs. HiCT will run hictk ICE balancing before importing so Cooler weights are available immediately.
                      </div>
                    </div>
                    <div v-if="toolchainStatus && !toolchainStatus.hicConversionAvailable" class="alert alert-warning mt-3 mb-0">
                      {{ toolchainStatus.summary }}
                    </div>
                    <div v-if="selectedHicToolchainNote" class="alert alert-info mt-3 mb-0">
                      <div class="fw-semibold mb-1">.hic processing with hictk</div>
                      <div v-for="(line, index) in selectedHicToolchainNote" :key="`conversion-hictk-${index}-${line}`">
                        {{ line }}
                      </div>
                      <div class="mt-1">
                        Project:
                        <a :href="hictkProjectUrl" target="_blank" rel="noopener noreferrer">hictk</a>
                      </div>
                      <div>Citation: {{ hictkCitationText }}</div>
                    </div>
                    <div v-for="source in conversionSidecarSources" :key="`sidecar-${source.role}`" class="wizard-sidecar-card mt-3">
                      <div class="fw-semibold mb-2">
                        {{ source.role === "primary" ? "Primary" : "Secondary" }} {{ source.formatLabel }} options
                      </div>
                      <div v-if="source.needsBinTable" class="mb-2">
                        <label class="form-label">BED3+ bin table</label>
                        <div class="input-group">
                          <input class="form-control" type="text" readonly :value="source.draft.binTableFilename || 'Auto-detect same-stem .bed when possible'" />
                          <button class="btn btn-outline-secondary" @click="openSelector(source.role === 'primary' ? 'primary-bin-table' : 'secondary-bin-table')">Browse…</button>
                          <button class="btn btn-outline-danger" :disabled="!source.draft.binTableFilename" @click="source.draft.binTableFilename = ''">Clear</button>
                        </div>
                        <small class="text-muted">
                          Hi-C Pro .matrix requires the matching bin BED. Generic COO can auto-generate a synthetic 1 bp bin table for plain text or .gz input.
                        </small>
                      </div>
                      <div v-if="source.needsChromSizes" class="row g-2">
                        <div class="col-md-8">
                          <label class="form-label">Chrom sizes</label>
                          <div class="input-group">
                            <input class="form-control" type="text" readonly :value="source.draft.chromSizesFilename || 'Select .chrom.sizes file'" />
                            <button class="btn btn-outline-secondary" @click="openSelector(source.role === 'primary' ? 'primary-chrom-sizes' : 'secondary-chrom-sizes')">Browse…</button>
                            <button class="btn btn-outline-danger" :disabled="!source.draft.chromSizesFilename" @click="source.draft.chromSizesFilename = ''">Clear</button>
                          </div>
                        </div>
                        <div class="col-md-4">
                          <label class="form-label">Bin size</label>
                          <input v-model.number="source.draft.binSize" class="form-control" type="number" min="1" step="1" placeholder="required" />
                        </div>
                        <small class="text-muted">
                          BEDPE/bedGraph2 and validPairs inputs need chromosome lengths plus a target bin size.
                        </small>
                      </div>
                      <div v-if="source.supportsFloatCounts" class="form-check mt-2">
                        <input :id="`${source.role}-count-as-float`" v-model="source.draft.countAsFloat" class="form-check-input" type="checkbox" />
                        <label class="form-check-label" :for="`${source.role}-count-as-float`">
                          Counts are floating-point values
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
                <ul class="list-group">
                  <li class="list-group-item">
                    Primary:
                    <strong>{{ describeConversionPlan(primarySource) }}</strong>
                  </li>
                  <li v-if="requiresSecondarySource" class="list-group-item">
                    Secondary:
                    <strong>{{ describeConversionPlan(secondarySource) }}</strong>
                  </li>
                </ul>
              </div>

              <div v-else-if="currentStep?.id === 'fasta'" class="wizard-section">
                <h6>FASTA files</h6>
                <div v-if="selectedHicSourceCount > 0" class="alert alert-warning mb-3">
                  {{ hicAssemblyAndFastaWarning }}
                </div>
                <div class="wizard-source-grid">
                  <div class="wizard-card">
                    <div class="wizard-card-header">
                      <strong>Primary FASTA</strong>
                    </div>
                    <div class="wizard-card-body">
                      <div class="input-group">
                        <input class="form-control" type="text" readonly :value="primaryFasta || 'Optional FASTA for primary source'" />
                        <button class="btn btn-outline-secondary" @click="openSelector('primary-fasta')">Browse…</button>
                      </div>
                    </div>
                  </div>
                  <div v-if="requiresSecondarySource" class="wizard-card">
                    <div class="wizard-card-header">
                      <strong>Secondary FASTA</strong>
                    </div>
                    <div class="wizard-card-body">
                      <div class="input-group">
                        <input class="form-control" type="text" readonly :value="secondaryFasta || 'Optional FASTA for secondary source'" />
                        <button class="btn btn-outline-secondary" @click="openSelector('secondary-fasta')">Browse…</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-else-if="currentStep?.id === 'agp'" class="wizard-section">
                <h6>Assembly File</h6>
                <div class="wizard-source-grid">
                  <div class="wizard-card">
                    <div class="wizard-card-header">
                      <strong>Primary assembly</strong>
                    </div>
                    <div class="wizard-card-body">
                      <div class="input-group">
                        <input class="form-control" type="text" readonly :value="primaryAgp || 'Optional .agp or Juicebox .assembly for primary source'" />
                        <button class="btn btn-outline-secondary" @click="openSelector('primary-agp')">Browse…</button>
                        <button
                          v-if="primaryAgp?.toLowerCase().endsWith('.assembly')"
                          class="btn btn-outline-primary"
                          @click="convertAssemblySelectionToAgp('primary')"
                        >
                          Convert to AGP
                        </button>
                      </div>
                      <small class="text-muted d-block mt-2">
                        .agp is loaded after opening. .assembly is passed to .hic conversion; for already converted
                        matrices it must be converted to AGP before applying layout.
                      </small>
                      <div v-if="selectedHicSourceCount > 0" class="alert alert-warning mt-3 mb-0">
                        {{ hicAssemblyAndFastaWarning }}
                      </div>
                    </div>
                  </div>
                  <div v-if="requiresSecondarySource" class="wizard-card">
                    <div class="wizard-card-header">
                      <strong>Secondary assembly</strong>
                    </div>
                    <div class="wizard-card-body">
                      <div class="input-group">
                        <input class="form-control" type="text" readonly :value="secondaryAgp || 'Optional .agp or Juicebox .assembly for secondary source'" />
                        <button class="btn btn-outline-secondary" @click="openSelector('secondary-agp')">Browse…</button>
                        <button
                          v-if="secondaryAgp?.toLowerCase().endsWith('.assembly')"
                          class="btn btn-outline-primary"
                          @click="convertAssemblySelectionToAgp('secondary')"
                        >
                          Convert to AGP
                        </button>
                      </div>
                      <div v-if="selectedHicSourceCount > 0" class="alert alert-warning mt-3 mb-0">
                        {{ hicAssemblyAndFastaWarning }}
                      </div>
                    </div>
                  </div>
                </div>
                <div v-if="requiresSecondarySource" class="wizard-card mt-3">
                  <div class="wizard-card-header">
                    <strong>Overlay assembly source</strong>
                  </div>
                  <div class="wizard-card-body">
                    <div class="row g-3">
                      <div class="col-md-6">
                        <button
                          type="button"
                          class="wizard-choice-card"
                          :class="{ selected: overlayAssemblySource === 'PRIMARY' }"
                          @click="overlayAssemblySource = 'PRIMARY'"
                        >
                          <strong>Primary controls overlay</strong>
                          <small>
                            Primary AGP/current layout is propagated to secondary; hidden contigs stay hidden in both
                            layers.
                          </small>
                        </button>
                      </div>
                      <div class="col-md-6">
                        <button
                          type="button"
                          class="wizard-choice-card"
                          :class="{ selected: overlayAssemblySource === 'SECONDARY' }"
                          @click="overlayAssemblySource = 'SECONDARY'"
                        >
                          <strong>Secondary controls overlay</strong>
                          <small>
                            Secondary AGP/current layout is propagated to primary when the dotplot or companion source
                            is already scaffolded.
                          </small>
                        </button>
                      </div>
                    </div>
                    <small class="text-muted d-block mt-2">
                      For correctly coupled overlays, apply only the AGP for the selected authoritative source. A
                      non-authoritative AGP is kept as metadata and is not loaded into the active map state.
                    </small>
                  </div>
                </div>
              </div>

              <div v-else-if="currentStep?.id === 'track-precompute'" class="wizard-section">
                <h6>Track Precomputing</h6>
                <div class="form-check">
                  <input id="enable-track-precompute" v-model="precomputeTracks" class="form-check-input" type="checkbox" />
                  <label class="form-check-label" for="enable-track-precompute">
                    Precompute selected tracks after opening
                  </label>
                </div>
                <div class="form-check mt-2" v-if="precomputeTracks">
                  <input id="force-track-precompute" v-model="forceTrackPrecompute" class="form-check-input" type="checkbox" />
                  <label class="form-check-label" for="force-track-precompute">
                    Force track precompute and overwrite existing sidecars
                  </label>
                </div>
                <div v-if="runState.trackPrecomputeStatus" class="alert alert-light border mt-3">
                  <div
                    v-for="item in runState.trackPrecomputeStatus.tracks"
                    :key="item.trackId"
                    class="wizard-precompute-row"
                  >
                    <div class="d-flex justify-content-between">
                      <small>{{ item.trackName }}</small>
                      <small>{{ item.status }} {{ Math.round(item.progress * 100) }}%</small>
                    </div>
                    <div class="progress" style="height: 6px">
                      <div
                        class="progress-bar"
                        role="progressbar"
                        :style="{ width: `${Math.round(item.progress * 100)}%` }"
                      ></div>
                    </div>
                    <small v-if="item.currentTask" class="text-muted d-block">{{ item.currentTask }}</small>
                    <small v-if="item.error" class="text-danger d-block">{{ item.error }}</small>
                  </div>
                </div>
              </div>

              <div v-else-if="currentStep?.id === 'notes'" class="wizard-section">
                <h6>Notes and Warnings</h6>
                <div class="wizard-check-list">
                  <div
                    v-for="item in wizardCheckItems"
                    :key="item.id"
                    class="alert wizard-check"
                    :class="item.kind === 'pass' ? 'alert-success' : item.kind === 'warning' ? 'alert-warning' : 'alert-danger'"
                  >
                    <div class="d-flex align-items-start gap-2">
                      <div v-if="item.kind === 'pending'" class="spinner-border spinner-border-sm mt-1" role="status"></div>
                      <div class="flex-grow-1">
                        <strong>{{ item.title }}</strong>
                        <div>{{ item.message }}</div>
                        <div v-if="item.fixable" class="btn-group btn-group-sm mt-2">
                          <button
                            type="button"
                            class="btn"
                            :class="fixableIssuePolicy[item.id] !== 'discard' ? 'btn-primary' : 'btn-outline-primary'"
                            @click="fixableIssuePolicy[item.id] = 'ignore'"
                          >
                            Ignore
                          </button>
                          <button
                            type="button"
                            class="btn"
                            :class="fixableIssuePolicy[item.id] === 'discard' ? 'btn-warning' : 'btn-outline-warning'"
                            @click="fixableIssuePolicy[item.id] = 'discard'"
                          >
                            Discard
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-else-if="currentStep?.id === 'finish'" class="wizard-section">
                <h6 class="d-flex align-items-center gap-2">
                  <div
                    v-if="runState.running"
                    class="spinner-border spinner-border-sm text-primary"
                    role="status"
                    aria-hidden="true"
                  ></div>
                  <span>Final Checks</span>
                </h6>
                <div class="alert alert-light border">
                  <div><strong>View Mode:</strong> {{ currentViewModeLabel }}</div>
                  <div><strong>Primary source:</strong> {{ primarySource.filename || "not selected" }}</div>
                  <div v-if="requiresSecondarySource"><strong>Secondary source:</strong> {{ secondarySource.filename || "not selected" }}</div>
                  <div><strong>Tracks:</strong> {{ selectedTracks.length }}</div>
                  <div><strong>Primary assembly:</strong> {{ primaryAgp || "not selected" }}</div>
                  <div v-if="requiresSecondarySource"><strong>Secondary assembly:</strong> {{ secondaryAgp || "not selected" }}</div>
                  <div v-if="requiresSecondarySource"><strong>Overlay assembly source:</strong> {{ overlayAssemblySource }}</div>
                </div>
                <div class="wizard-check-list mb-3">
                  <div
                    v-for="item in wizardCheckItems"
                    :key="`final-${item.id}`"
                    class="alert wizard-check"
                    :class="item.kind === 'pass' ? 'alert-success' : item.kind === 'warning' ? 'alert-warning' : 'alert-danger'"
                  >
                    <strong>{{ item.title }}</strong>
                    <div>{{ item.message }}</div>
                  </div>
                </div>
                <div v-if="runState.running" class="alert alert-info">
                  <div class="d-flex justify-content-between align-items-center">
                    <strong>{{ currentRunStepLabel }}</strong>
                    <span>{{ runState.currentMessage }}</span>
                  </div>
                  <div v-if="runState.currentConversion" class="mt-2">
                    <small class="d-block">
                      {{ runState.currentConversion.sourceFilename }} → {{ runState.currentConversion.outputFilename }}
                    </small>
                    <div class="progress mt-1" style="height: 8px">
                      <div
                        class="progress-bar progress-bar-striped progress-bar-animated"
                        role="progressbar"
                        :style="{ width: `${Math.round(runState.currentConversion.overallProgress * 100)}%` }"
                      ></div>
                    </div>
                  </div>
                </div>
                <div v-if="runState.error" class="alert alert-danger">{{ runState.error }}</div>
                <div v-if="runState.completed && !runState.error" class="alert alert-success">
                  Wizard completed successfully.
                </div>
              </div>
            </section>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" :disabled="runState.running" @click="emit('dismissed')">
              {{ runState.completed ? "Close" : "Cancel" }}
            </button>
            <button class="btn btn-outline-secondary" :disabled="runState.running || currentStepIndex === 0" @click="goBack">
              Back
            </button>
            <button
              v-if="currentStep?.id !== 'finish'"
              class="btn btn-primary"
              :disabled="runState.running || !canAdvanceFromCurrentStep"
              @click="goNext"
            >
              Next
            </button>
            <button
              v-else
              class="btn btn-success"
              :disabled="runState.running || !canRunWizard"
              @click="onFinishClicked"
            >
              Finish
            </button>
          </div>
        </div>
      </div>
    </div>

    <UniversalFileSelector
      v-if="selectorState.kind !== null"
      :network-manager="networkManager"
      :title="selectorState.title"
      :file-type="selectorState.fileType"
      :note="selectorState.note"
      :file-name-predicate="selectorState.predicate"
      @selected="onSelectorPicked"
      @dismissed="closeSelector"
    />
  </div>
</template>

<script setup lang="ts">
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import type { AssemblyInfo } from "@/app/core/domain/AssemblyInfo";
import type { NetworkManager } from "@/app/core/net/NetworkManager";
import {
  type ConversionJobResponse,
  type ConversionToolchainStatusResponse,
  type MatrixSourceResolutionResponse,
  type TrackCompatibilityReportResponse,
  type TrackPrecomputeCacheProbeResponse,
  type TracksPrecomputeStatusResponse,
} from "@/app/core/net/api/response";
import {
  LinkFASTARequest,
  LoadAGPRequest,
  StartConversionJobRequest,
} from "@/app/core/net/api/request";
import {
  mergeVisualizationPresets,
  type VisualizationPresetRecord,
} from "@/app/core/visualization/presetCatalog";
import {
  buildWizardRenderPipelineConfig,
  type WizardBlendMode,
  type WizardViewMode,
} from "@/app/core/visualization/renderPipelineWizard";
import { useMatrixViewStore } from "@/app/stores/matrixViewStore";
import { useSessionStore } from "@/app/stores/sessionStore";
import { useStyleStore } from "@/app/stores/styleStore";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import { ColorTranslator } from "colortranslator";
import { computed, nextTick, onMounted, reactive, ref } from "vue";
import { toast } from "vue-sonner";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
import UniversalFileSelector from "./UniversalFileSelector.vue";

type WizardStepId =
  | "view-mode"
  | "sources"
  | "visualization"
  | "tracks"
  | "fasta"
  | "agp"
  | "conversion"
  | "track-precompute"
  | "notes"
  | "finish";

type SourceRole = "primary" | "secondary";
type OverlayAssemblySource = "PRIMARY" | "SECONDARY";

type SourceDraft = {
  filename: string;
  resolution: MatrixSourceResolutionResponse | null;
  forceConversion: boolean;
  presetId: string;
  resolving: boolean;
  resolveRequestId: number;
  binTableFilename: string;
  chromSizesFilename: string;
  binSize: number | null;
  countAsFloat: boolean;
};

type SelectedTrack = {
  filename: string;
  displayName: string;
  compatibility: TrackCompatibilityReportResponse | null;
  precomputeProbe: TrackPrecomputeCacheProbeResponse | null;
};

type WizardCheckItem = {
  id: string;
  kind: "pending" | "pass" | "warning" | "error";
  title: string;
  message: string;
  fixable?: boolean;
};

type SelectorKind =
  | "primary-matrix"
  | "secondary-matrix"
  | "track"
  | "primary-fasta"
  | "secondary-fasta"
  | "primary-agp"
  | "secondary-agp"
  | "primary-bin-table"
  | "secondary-bin-table"
  | "primary-chrom-sizes"
  | "secondary-chrom-sizes";

const BLEND_MODES: WizardBlendMode[] = [
  "OVER",
  "ADD",
  "SUBTRACT",
  "MULTIPLY",
  "SCREEN",
  "DIFFERENCE",
  "LIGHTEN",
  "DARKEN",
  "XOR",
];

const emit = defineEmits<{
  (e: "dismissed"): void;
}>();

const props = defineProps<{
  networkManager: NetworkManager;
  mapManager?: ContactMapManager;
  openPrimaryDataset: (
    filename: string,
    fastaFilename?: string,
    options?: { applyDefaultPreset?: boolean }
  ) => Promise<void>;
}>();

useEscDismissableDialog({
  priority: 1070,
  isOpen: () => true,
  canClose: () => !runState.running,
  requestClose: () => {
    emit("dismissed");
  },
});

const sessionStore = useSessionStore();
const visualizationOptionsStore = useVisualizationOptionsStore();
const styleStore = useStyleStore();
const matrixViewStore = useMatrixViewStore();

const steps: Array<{ id: WizardStepId; label: string }> = [
  { id: "view-mode", label: "View mode" },
  { id: "sources", label: "Sources selection" },
  { id: "conversion", label: "Map files conversion" },
  { id: "agp", label: "Assembly file" },
  { id: "fasta", label: "FASTA file" },
  { id: "tracks", label: "1D tracks" },
  { id: "visualization", label: "Visualization" },
  { id: "notes", label: "Notes and warnings" },
  { id: "track-precompute", label: "Track precomputing" },
  { id: "finish", label: "Final checks" },
];

const viewModeCards: Array<{
  id: WizardViewMode;
  label: string;
  description: string;
}> = [
  {
    id: "single",
    label: "Single map",
    description: "Open one matrix source and use one full-map preset.",
  },
  {
    id: "overlay",
    label: "Two maps overlaid",
    description: "Open primary and secondary sources and blend full-map colors per pixel.",
  },
  {
    id: "split",
    label: "Upper/lower triangular",
    description: "Open two sources and render primary on the upper triangle and secondary on the lower triangle.",
  },
];

const viewMode = ref<WizardViewMode>("single");
const currentStepIndex = ref(0);
const primarySource = reactive<SourceDraft>({
  filename: "",
  resolution: null,
  forceConversion: false,
  presetId: "",
  resolving: false,
  resolveRequestId: 0,
  binTableFilename: "",
  chromSizesFilename: "",
  binSize: null,
  countAsFloat: false,
});
const secondarySource = reactive<SourceDraft>({
  filename: "",
  resolution: null,
  forceConversion: false,
  presetId: "",
  resolving: false,
  resolveRequestId: 0,
  binTableFilename: "",
  chromSizesFilename: "",
  binSize: null,
  countAsFloat: false,
});
const primaryFasta = ref("");
const secondaryFasta = ref("");
const primaryAgp = ref("");
const secondaryAgp = ref("");
const overlayAssemblySource = ref<OverlayAssemblySource>("PRIMARY");
const selectedTracks = ref<SelectedTrack[]>([]);
const fixableIssuePolicy = reactive<Record<string, "ignore" | "discard">>({});
const precomputeTracks = ref(true);
const forceTrackPrecompute = ref(false);
const dropCachesBeforeRun = ref(false);
const buildResolutionPyramid = ref(true);
const balanceInputCoolers = ref(true);
const blendMode = ref<WizardBlendMode>("OVER");
const topOpacity = ref(0.5);
const bottomOpacity = ref(1.0);
const toolchainStatus = ref<ConversionToolchainStatusResponse | null>(null);

const selectorState = reactive<{
  kind: SelectorKind | null;
  title: string;
  fileType: string;
  note: string;
  predicate: ((name: string) => boolean) | undefined;
}>({
  kind: null,
  title: "",
  fileType: "",
  note: "",
  predicate: undefined,
});

const runState = reactive<{
  running: boolean;
  completed: boolean;
  error: string;
  currentStepId: WizardStepId;
  currentMessage: string;
  currentConversion: ConversionJobResponse | null;
  trackPrecomputeStatus: TracksPrecomputeStatusResponse | null;
}>({
  running: false,
  completed: false,
  error: "",
  currentStepId: "finish",
  currentMessage: "",
  currentConversion: null,
  trackPrecomputeStatus: null,
});

const visibleSteps = computed(() => steps);

const currentStep = computed(() => visibleSteps.value[currentStepIndex.value]);
const requiresSecondarySource = computed(() => viewMode.value !== "single");

const availablePresets = computed(() =>
  mergeVisualizationPresets(sessionStore.savedVisualizationPresets).map((preset) => ({
    id: `${preset.origin}:${preset.option_id}`,
    label:
      preset.origin === "session" ? `${preset.name} (session)` : preset.name,
    preset,
  }))
);

const presetById = (id: string): VisualizationPresetRecord | null => {
  const hit = availablePresets.value.find((preset) => preset.id === id);
  return hit?.preset ?? null;
};

const primaryPreset = computed(() => {
  const preset = presetById(primarySource.presetId);
  return preset ? { id: primarySource.presetId, preset } : null;
});

const secondaryPreset = computed(() => {
  const preset = presetById(secondarySource.presetId);
  return preset ? { id: secondarySource.presetId, preset } : null;
});

const currentViewModeLabel = computed(
  () => viewModeCards.find((mode) => mode.id === viewMode.value)?.label ?? viewMode.value
);

const currentRunStepLabel = computed(
  () =>
    steps.find((step) => step.id === runState.currentStepId)?.label ??
    (runState.currentStepId === "conversion" ? "Map Files Conversion" : "Running")
);

const findPresetIdByName = (name: string): string =>
  availablePresets.value.find((preset) => preset.preset.name === name)?.id ??
  availablePresets.value[0]?.id ??
  "";

const usesExpectedPreset = computed(
  () =>
    primaryPreset.value?.preset.options.signalDisplayMode !== "OBSERVED" ||
    (requiresSecondarySource.value &&
      secondaryPreset.value?.preset.options.signalDisplayMode !== "OBSERVED")
);

const selectedHicSourceCount = computed(() =>
  [primarySource, secondarySource]
    .filter((source, index) => index === 0 || requiresSecondarySource.value)
    .filter((source) => source.filename.toLowerCase().endsWith(".hic")).length
);

const matrixSelectorFileTypes =
  ".hict.hdf5, .hic, .cool, .mcool, .matrix, .coo, .tsv, .csv, .bg2, .bedgraph2, .bedpe, .pairs, .validPairs";
const matrixSelectorPlaceholder = `Select ${matrixSelectorFileTypes}`;

const hictkLoadSources = computed(() =>
  [primarySource, secondarySource]
    .filter((source, index) => index === 0 || requiresSecondarySource.value)
    .filter((source) => isHictkLoadFilename(source.filename))
);

const hictkConversionSourceCount = computed(() =>
  [primarySource, secondarySource]
    .filter((source, index) => index === 0 || requiresSecondarySource.value)
    .filter((source) => {
      const lowered = source.filename.toLowerCase();
      return (lowered.endsWith(".hic") || isHictkLoadFilename(lowered)) && !isResolvedDirectly(source);
    }).length
);

const conversionSidecarSources = computed(() =>
  [
    { role: "primary" as const, draft: primarySource },
    { role: "secondary" as const, draft: secondarySource },
  ]
    .filter((entry, index) => index === 0 || requiresSecondarySource.value)
    .map((entry) => ({
      ...entry,
      formatLabel: hictkLoadFormatLabel(entry.draft.filename),
      needsBinTable: isHicProMatrixFilename(entry.draft.filename) || isCooFilename(entry.draft.filename),
      needsChromSizes: isBg2Filename(entry.draft.filename) || isValidPairsFilename(entry.draft.filename),
      supportsFloatCounts: isCooFilename(entry.draft.filename) || isHicProMatrixFilename(entry.draft.filename) || isBg2Filename(entry.draft.filename),
    }))
    .filter((entry) => entry.needsBinTable || entry.needsChromSizes || entry.supportsFloatCounts)
);

const hictkProjectUrl = "https://github.com/paulsengroup/hictk";
const hictkCitationText =
  "Rossini R, Paulsen J. Bioinformatics 2024;40(7):btae408.";

const selectedHicToolchainVariant = computed(() => {
  const command = toolchainStatus.value?.hictkCommand ?? "";
  const lowered = command.toLowerCase();
  if (lowered.includes("avx512")) {
    return "AVX-512";
  }
  if (lowered.includes("avx2")) {
    return "AVX2";
  }
  if (lowered.includes("generic")) {
    return "generic";
  }
  return "default";
});

const selectedHicToolchainAvailabilityText = computed(() => {
  const status = toolchainStatus.value;
  if (!status) {
    return "hictk status is still loading";
  }
  if (status.hictkAvailable) {
    return status.source.toLowerCase().includes("bundled")
      ? `hictk is available in this build via bundled variant: ${selectedHicToolchainVariant.value}`
      : `hictk is available in this build via external executable`;
  }
  return "hictk is not currently available in this build";
});

const selectedHicToolchainCommandText = computed(() => {
  const status = toolchainStatus.value;
  if (!status) {
    return "";
  }
  return status.hictkCommand ? `Selected executable: ${status.hictkCommand}` : "Selected executable: unavailable";
});

const selectedHicToolchainNote = computed(() => {
  if (selectedHicSourceCount.value === 0) {
    return null;
  }
  const lines = [
    "HiCT processes .hic files with hictk.",
  ];
  lines.push(selectedHicToolchainAvailabilityText.value);
  if (selectedHicToolchainCommandText.value) {
    lines.push(selectedHicToolchainCommandText.value);
  }
  return lines;
});

const hicAssemblyAndFastaWarning = computed(
  () =>
    "For the best .hic conversion quality, provide the matching .assembly and FASTA files. If a .hic source is paired with .assembly but no FASTA, contig-border placement will be less precise and borders may look shifted at intermediate zoom levels."
);

const canRunWizard = computed(() => wizardBlockingIssues.value.length === 0);
const wizardBlockingIssues = computed(() => {
  const issues: string[] = [];
  if (!primarySource.filename) {
    issues.push("Select the primary matrix source.");
  }
  if (!primaryPreset.value) {
    issues.push("Select a visualization preset for the primary source.");
  }
  if (requiresSecondarySource.value && !secondarySource.filename) {
    issues.push("Select the secondary matrix source.");
  }
  if (requiresSecondarySource.value && !secondaryPreset.value) {
    issues.push("Select a visualization preset for the secondary source.");
  }
  const sourcesNeedingToolchain = [primarySource, secondarySource]
    .filter((source, index) => index === 0 || requiresSecondarySource.value)
    .filter((source) => {
      const lowered = source.filename.toLowerCase();
      return (lowered.endsWith(".hic") || isHictkLoadFilename(lowered)) && !isResolvedDirectly(source);
    });
  if (
    sourcesNeedingToolchain.length > 0 &&
    toolchainStatus.value &&
    !toolchainStatus.value.hicConversionAvailable
  ) {
    issues.push(
      "Bundled/external hictk toolchain is required for this conversion but is currently unavailable."
    );
  }
  conversionSidecarSources.value.forEach((source) => {
    if (source.needsChromSizes && (!source.draft.chromSizesFilename || !source.draft.binSize || source.draft.binSize <= 0)) {
      issues.push(`${source.role === "primary" ? "Primary" : "Secondary"} ${source.formatLabel} conversion requires chrom sizes and a positive bin size.`);
    }
  });
  if (viewMode.value !== "single" && usesExpectedPreset.value) {
    issues.push(
      "Expected and O/E presets are currently supported only in single-map mode. Use Observed presets for overlay and upper/lower rendering."
    );
  }
  return issues;
});

const wizardNotes = computed(() => {
  const notes = [...wizardBlockingIssues.value];
  for (const source of [primarySource, secondarySource]) {
    if (!source.filename) {
      continue;
    }
    source.resolution?.warnings.forEach((warning) => notes.push(warning));
  }
  selectedTracks.value.forEach((track) => {
    if (track.compatibility?.status === "warning" || track.compatibility?.status === "error") {
      notes.push(`${track.filename}: ${track.compatibility.message}`);
    }
    if (track.precomputeProbe && !track.precomputeProbe.cacheCurrent) {
      notes.push(`${track.filename}: 1D precompute cache is missing or stale.`);
    }
  });
  if (viewMode.value === "split") {
    notes.push(
      "Selection FASTA export will use primary source coordinates on the horizontal axis and secondary source coordinates on the vertical axis."
    );
  }
  if (requiresSecondarySource.value) {
    notes.push(
      `${overlayAssemblySource.value} is the authoritative assembly source. Its layout and hidden-contig state will be propagated to the other source for coupled overlay rendering.`
    );
  }
  if (requiresSecondarySource.value && secondaryAgp.value) {
    notes.push(
      overlayAssemblySource.value === "SECONDARY"
        ? "Secondary AGP is selected as the authoritative overlay assembly input."
        : "Secondary AGP is not authoritative in this run and will not replace the synchronized primary-driven overlay assembly."
    );
  }
  if (selectedHicSourceCount.value > 0) {
    notes.push(hicAssemblyAndFastaWarning.value);
  }
  if (primaryAgp.value && secondaryAgp.value) {
    notes.push(
      `Both AGPs are selected. Only the ${overlayAssemblySource.value.toLowerCase()} AGP is applied as the coupled overlay assembly; the other AGP is ignored for this wizard run.`
    );
  }
  if (usesExpectedPreset.value) {
    notes.push(
      "Expected and O/E are computed inside each scaffold. If the assembly has no scaffolds yet, each contig is treated as its own scaffold."
    );
  }
  return Array.from(new Set(notes));
});

const wizardCheckItems = computed<WizardCheckItem[]>(() => {
  const items: WizardCheckItem[] = [];
  if (primarySource.filename) {
    items.push({
      id: "primary-source",
      kind: "pass",
      title: "Primary source",
      message: describeConversionPlan(primarySource),
    });
  } else {
    items.push({
      id: "primary-source",
      kind: "error",
      title: "Primary source",
      message: "Primary matrix source is required.",
    });
  }
  if (requiresSecondarySource.value) {
    items.push(
      secondarySource.filename
        ? {
            id: "secondary-source",
            kind: "pass",
            title: "Secondary source",
            message: describeConversionPlan(secondarySource),
          }
        : {
            id: "secondary-source",
            kind: "error",
            title: "Secondary source",
            message: "Secondary matrix source is required for this view mode.",
          }
    );
  }
  if (primaryAgp.value) {
    const isAuthoritative = !requiresSecondarySource.value || overlayAssemblySource.value === "PRIMARY";
    items.push({
      id: "primary-assembly",
      kind: !isAuthoritative
        ? "warning"
        : primaryAgp.value.toLowerCase().endsWith(".agp") || primarySource.filename.toLowerCase().endsWith(".hic")
        ? "pass"
        : "warning",
      title: "Primary assembly",
      message: !isAuthoritative
        ? "Primary AGP is not authoritative in this run and will not replace the secondary-driven overlay assembly."
        : primaryAgp.value.toLowerCase().endsWith(".assembly")
        ? "Juicebox .assembly will be passed to .hic conversion. For already converted matrices, convert it to AGP before applying layout."
        : "AGP will be loaded after the primary matrix is opened.",
      fixable: isAuthoritative && primaryAgp.value.toLowerCase().endsWith(".assembly") && !primarySource.filename.toLowerCase().endsWith(".hic"),
    });
  }
  if (secondaryAgp.value && requiresSecondarySource.value) {
    const isAuthoritative = overlayAssemblySource.value === "SECONDARY";
    items.push({
      id: "secondary-assembly",
      kind: !isAuthoritative
        ? "warning"
        : secondaryAgp.value.toLowerCase().endsWith(".agp") || secondarySource.filename.toLowerCase().endsWith(".hic")
        ? "pass"
        : "warning",
      title: "Secondary assembly",
      message: !isAuthoritative
        ? "Secondary AGP is not authoritative in this run and will not replace the primary-driven overlay assembly."
        : secondaryAgp.value.toLowerCase().endsWith(".assembly")
        ? "Juicebox .assembly will be passed to .hic conversion. For already converted matrices, convert it to AGP before applying layout."
        : "AGP will be loaded after the secondary matrix is opened.",
      fixable: isAuthoritative && secondaryAgp.value.toLowerCase().endsWith(".assembly") && !secondarySource.filename.toLowerCase().endsWith(".hic"),
    });
  }
  if (selectedTracks.value.length === 0) {
    items.push({
      id: "tracks",
      kind: "pass",
      title: "1D tracks",
      message: "No tracks selected. This optional step will be skipped.",
    });
  } else {
    for (const track of selectedTracks.value) {
      const status = track.compatibility?.status ?? "ok";
      items.push({
        id: `track-${track.filename}`,
        kind: status === "error" ? "warning" : status === "warning" ? "warning" : "pass",
        title: `Track: ${track.displayName || track.filename}`,
        message: track.compatibility?.message ?? "Track will be opened and precomputed.",
        fixable: status === "error" || status === "warning",
      });
    }
  }
  if (primaryFasta.value) {
    items.push({
      id: "primary-fasta",
      kind: "pass",
      title: "Primary FASTA",
      message: "FASTA will be linked to the primary source.",
    });
  }
  if (requiresSecondarySource.value && secondaryFasta.value) {
    items.push({
      id: "secondary-fasta",
      kind: "pass",
      title: "Secondary FASTA",
      message: "FASTA will be linked to the secondary source.",
    });
  }
  if ([primarySource, secondarySource].some((source, index) => source.filename.toLowerCase().endsWith(".hic") && (index === 0 || requiresSecondarySource.value))) {
    items.push({
      id: "hic-conversion-guidance",
      kind: "warning",
      title: ".hic conversion guidance",
      message:
        "For the best conversion quality, pair each .hic source with the matching .assembly and FASTA. If .assembly is available but FASTA is missing, contig borders may be less accurate and may appear shifted at intermediate zoom levels.",
    });
  }
  if (toolchainStatus.value && !toolchainStatus.value.hicConversionAvailable) {
    const hasHicConversion = [primarySource, secondarySource]
      .filter((source, index) => index === 0 || requiresSecondarySource.value)
      .some((source) => {
        const lowered = source.filename.toLowerCase();
        return (lowered.endsWith(".hic") || isHictkLoadFilename(lowered)) && !isResolvedDirectly(source);
      });
    if (hasHicConversion) {
      items.push({
        id: "hictk",
        kind: "error",
        title: "hictk conversion",
        message: toolchainStatus.value.summary,
      });
    }
  }
  return items;
});

const canAdvanceFromCurrentStep = computed(() => {
  switch (currentStep.value?.id) {
    case "view-mode":
      return true;
    case "sources":
      return (
        primarySource.filename.length > 0 &&
        (!requiresSecondarySource.value || secondarySource.filename.length > 0)
      );
    case "visualization":
      return Boolean(primaryPreset.value) && (!requiresSecondarySource.value || Boolean(secondaryPreset.value));
    default:
      return true;
  }
});

const isOpenableAssemblyFilename = (name: string): boolean => {
  const lowered = name.toLowerCase();
  return (
    lowered.endsWith(".hict.hdf5") ||
    lowered.endsWith(".hic") ||
    lowered.endsWith(".cool") ||
    lowered.endsWith(".mcool") ||
    isHictkLoadFilename(lowered)
  );
};

const isCoolerFilename = (name: string): boolean => {
  const lowered = name.toLowerCase();
  return lowered.endsWith(".cool") || lowered.endsWith(".mcool");
};

const hasSelectedCoolerSource = computed(() =>
  isCoolerFilename(primarySource.filename) ||
  (requiresSecondarySource.value && isCoolerFilename(secondarySource.filename))
);

const stripCompressionSuffix = (name: string): string =>
  name.replace(/\.(gz|bgz|xz|zst|zstd|bz2|lz4|lzo)$/i, "");

const isHicProMatrixFilename = (name: string): boolean =>
  stripCompressionSuffix(name.toLowerCase()).endsWith(".matrix");

const isCooFilename = (name: string): boolean => {
  const lowered = stripCompressionSuffix(name.toLowerCase());
  return (
    lowered.endsWith(".coo") ||
    lowered.endsWith(".coo.tsv") ||
    lowered.endsWith(".coo.csv") ||
    lowered.endsWith(".tsv") ||
    lowered.endsWith(".csv")
  );
};

const isBg2Filename = (name: string): boolean => {
  const lowered = stripCompressionSuffix(name.toLowerCase());
  return lowered.endsWith(".bg2") || lowered.endsWith(".bedgraph2") || lowered.endsWith(".bedpe");
};

const isPairsFilename = (name: string): boolean =>
  stripCompressionSuffix(name.toLowerCase()).endsWith(".pairs");

const isValidPairsFilename = (name: string): boolean =>
  stripCompressionSuffix(name.toLowerCase()).endsWith(".validpairs");

const isHictkLoadFilename = (name: string): boolean =>
  isHicProMatrixFilename(name) ||
  isCooFilename(name) ||
  isBg2Filename(name) ||
  isPairsFilename(name) ||
  isValidPairsFilename(name);

const hictkLoadFormatLabel = (name: string): string => {
  if (isHicProMatrixFilename(name)) {
    return "Hi-C Pro .matrix";
  }
  if (isCooFilename(name)) {
    return "COO";
  }
  if (isBg2Filename(name)) {
    return "BEDPE/bedGraph2";
  }
  if (isPairsFilename(name)) {
    return "pairs";
  }
  if (isValidPairsFilename(name)) {
    return "validPairs";
  }
  return "matrix";
};

const isBinTableFilename = (name: string): boolean => name.toLowerCase().endsWith(".bed");

const isChromSizesFilename = (name: string): boolean => {
  const lowered = name.toLowerCase();
  return lowered.endsWith(".chrom.sizes") || lowered.endsWith(".chromsizes") || lowered.endsWith(".chrom_sizes.txt");
};

const isTrackFilename = (name: string): boolean => {
  const lowered = name.toLowerCase();
  return [
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
  ].some((suffix) => lowered.endsWith(suffix));
};

const isFastaFilename = (name: string): boolean => {
  const lowered = name.toLowerCase();
  return [
    ".fasta",
    ".fa",
    ".fna",
    ".fas",
    ".fasta.gz",
    ".fa.gz",
    ".fna.gz",
    ".fas.gz",
  ].some((suffix) => lowered.endsWith(suffix));
};

const isAssemblyLayoutFilename = (name: string): boolean => {
  const lowered = name.toLowerCase();
  return lowered.endsWith(".agp") || lowered.endsWith(".assembly");
};

const isResolvedDirectly = (source: SourceDraft): boolean =>
  source.resolution?.action === "OPEN_DIRECT";

const canConvertSource = (source: SourceDraft): boolean =>
  Boolean(source.resolution?.conversionDirection);

const humanizeMatrixAction = (action: string): string => {
  switch (action) {
    case "OPEN_DIRECT":
      return "Open directly";
    case "REUSE_CONVERTED":
      return "Reuse converted .hict.hdf5";
    case "CONVERSION_REQUIRED":
      return "Convert before opening";
    case "UNSUPPORTED":
      return "Unsupported";
    default:
      return action;
  }
};

const isStepComplete = (stepId: WizardStepId): boolean => {
  switch (stepId) {
    case "sources":
      return (
        primarySource.filename.length > 0 &&
        (!requiresSecondarySource.value || secondarySource.filename.length > 0)
      );
    case "visualization":
      return Boolean(primaryPreset.value) && (!requiresSecondarySource.value || Boolean(secondaryPreset.value));
    case "tracks":
      return selectedTracks.value.length > 0;
    case "finish":
      return runState.completed && !runState.error;
    default:
      return false;
  }
};

const openSelector = (kind: SelectorKind): void => {
  selectorState.kind = kind;
  if (kind === "primary-matrix") {
    selectorState.title = "Select primary matrix source";
    selectorState.fileType = matrixSelectorFileTypes;
    selectorState.note =
      "Current conversions will be reused when the original file fingerprint matches the cached record.";
    selectorState.predicate = isOpenableAssemblyFilename;
    return;
  }
  if (kind === "secondary-matrix") {
    selectorState.title = "Select secondary matrix source";
    selectorState.fileType = matrixSelectorFileTypes;
    selectorState.note =
      "Secondary sources may be padded if matrix sizes differ from the primary source.";
    selectorState.predicate = isOpenableAssemblyFilename;
    return;
  }
  if (kind === "track") {
    selectorState.title = "Select 1D track file";
    selectorState.fileType = ".bed, .vcf, .gff, .gtf, .bw, .bigwig, .bam";
    selectorState.note = "Track caches are fingerprinted and can be reused when unchanged.";
    selectorState.predicate = isTrackFilename;
    return;
  }
  if (kind === "primary-fasta" || kind === "secondary-fasta") {
    selectorState.title =
      kind === "primary-fasta"
        ? "Select primary FASTA"
        : "Select secondary FASTA";
    selectorState.fileType = ".fasta, .fa, .fna, .fas";
    selectorState.note = "FASTA linkage is optional but required for FASTA export.";
    selectorState.predicate = isFastaFilename;
    return;
  }
  if (kind === "primary-bin-table" || kind === "secondary-bin-table") {
    selectorState.title = kind === "primary-bin-table" ? "Select primary BED bin table" : "Select secondary BED bin table";
    selectorState.fileType = ".bed";
    selectorState.note = "BED3+ bin table used by hictk load for Hi-C Pro .matrix or generic COO input.";
    selectorState.predicate = isBinTableFilename;
    return;
  }
  if (kind === "primary-chrom-sizes" || kind === "secondary-chrom-sizes") {
    selectorState.title = kind === "primary-chrom-sizes" ? "Select primary chrom sizes" : "Select secondary chrom sizes";
    selectorState.fileType = ".chrom.sizes";
    selectorState.note = "Chromosome sizes used by hictk load for BEDPE/bedGraph2 or validPairs input.";
    selectorState.predicate = isChromSizesFilename;
    return;
  }
  selectorState.title =
    kind === "primary-agp" ? "Select primary assembly file" : "Select secondary assembly file";
  selectorState.fileType = ".agp, .assembly";
  selectorState.note = ".agp files are loaded after opening. Juicebox .assembly files are passed into .hic conversion when selected for a .hic source.";
  selectorState.predicate = isAssemblyLayoutFilename;
};

const closeSelector = (): void => {
  selectorState.kind = null;
  selectorState.title = "";
  selectorState.fileType = "";
  selectorState.note = "";
  selectorState.predicate = undefined;
};

const resolveMatrixSource = async (
  filename: string,
  role: SourceRole
): Promise<void> => {
  const source = role === "primary" ? primarySource : secondarySource;
  const requestId = ++source.resolveRequestId;
  source.filename = filename;
  source.resolution = null;
  source.resolving = true;
  try {
    const response = await props.networkManager.requestManager.resolveMatrixSource(filename);
    if (source.resolveRequestId !== requestId) {
      return;
    }
    source.resolution = response;
  } finally {
    if (source.resolveRequestId === requestId) {
      source.resolving = false;
    }
  }
};

const addTrack = async (filename: string): Promise<void> => {
  if (selectedTracks.value.some((track) => track.filename === filename)) {
    return;
  }
  const [compatibility, precomputeProbe] = await Promise.all([
    props.networkManager.requestManager
      .probeTrackCompatibility(filename, { suppressErrorToast: true })
      .catch(() => null),
    props.networkManager.requestManager
      .probeTrackPrecomputeCache(filename, { suppressErrorToast: true })
      .catch(() => null),
  ]);
  selectedTracks.value = [
    ...selectedTracks.value,
    {
      filename,
      displayName: filename.split("/").pop() ?? filename,
      compatibility,
      precomputeProbe,
    },
  ];
};

const removeTrack = (filename: string): void => {
  selectedTracks.value = selectedTracks.value.filter(
    (track) => track.filename !== filename
  );
};

const onSelectorPicked = async (filename: string): Promise<void> => {
  const kind = selectorState.kind;
  closeSelector();
  if (!kind) {
    return;
  }
  try {
    switch (kind) {
      case "primary-matrix":
        await resolveMatrixSource(filename, "primary");
        break;
      case "secondary-matrix":
        await resolveMatrixSource(filename, "secondary");
        break;
      case "track":
        await addTrack(filename);
        break;
      case "primary-fasta":
        primaryFasta.value = filename;
        break;
      case "secondary-fasta":
        secondaryFasta.value = filename;
        break;
      case "primary-agp":
        primaryAgp.value = filename;
        break;
      case "secondary-agp":
        secondaryAgp.value = filename;
        break;
      case "primary-bin-table":
        primarySource.binTableFilename = filename;
        break;
      case "secondary-bin-table":
        secondarySource.binTableFilename = filename;
        break;
      case "primary-chrom-sizes":
        primarySource.chromSizesFilename = filename;
        break;
      case "secondary-chrom-sizes":
        secondarySource.chromSizesFilename = filename;
        break;
    }
  } catch (error) {
    toast.error(String(error ?? "Failed to process selected file"));
  }
};

const convertAssemblySelectionToAgp = async (
  source: "primary" | "secondary"
): Promise<void> => {
  const filename = source === "primary" ? primaryAgp.value : secondaryAgp.value;
  if (!filename.toLowerCase().endsWith(".assembly")) {
    return;
  }
  const outputFilename = filename.replace(/\.assembly$/i, ".agp");
  if (
    !window.confirm(
      `Convert ${filename} to ${outputFilename}? An existing AGP copy will be overwritten.`
    )
  ) {
    return;
  }
  const result = await props.networkManager.requestManager.convertAssemblyToAgp({
    filename,
    outputFilename,
    overwrite: true,
  });
  if (source === "primary") {
    primaryAgp.value = result.outputFilename;
  } else {
    secondaryAgp.value = result.outputFilename;
  }
  toast.success(`Created ${result.outputFilename}`);
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

const waitForNextPaint = async (): Promise<void> => {
  await nextTick();
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
};

const describeConversionPlan = (source: SourceDraft): string => {
  if (!source.filename || !source.resolution) {
    return "no file selected";
  }
  if (
    (source.forceConversion && canConvertSource(source)) ||
    source.resolution.action === "CONVERSION_REQUIRED"
  ) {
    return `convert to ${
      source.resolution.expectedOutputFilename ?? source.resolution.resolvedFilename
    }`;
  }
  if (source.resolution.action === "REUSE_CONVERTED") {
    return `reuse ${source.resolution.resolvedFilename}`;
  }
  return `open ${source.resolution.resolvedFilename}`;
};

const waitForConversionJob = async (jobId: string): Promise<ConversionJobResponse> => {
  while (true) {
    const job = await props.networkManager.requestManager.getConversionJob(jobId);
    runState.currentConversion = job;
    runState.currentMessage = job.currentStageLabel || job.status;
    const normalizedStatus = (job.status ?? "").toLowerCase();
    if (
      normalizedStatus === "completed" ||
      normalizedStatus === "complete" ||
      normalizedStatus === "finished" ||
      normalizedStatus === "success" ||
      normalizedStatus === "succeeded"
    ) {
      return job;
    }
    if (
      normalizedStatus === "failed" ||
      normalizedStatus === "cancelled" ||
      normalizedStatus === "canceled"
    ) {
      throw new Error(job.error || `Conversion job ${jobId} ended with status ${job.status}`);
    }
    await sleep(750);
  }
};

const ensureOpenedFilename = async (source: SourceDraft): Promise<string> => {
  if (!source.filename) {
    throw new Error("Matrix file is not selected");
  }
  if (!source.resolution) {
    await resolveMatrixSource(
      source.filename,
      source === primarySource ? "primary" : "secondary"
    );
  }
  const resolution = source.resolution;
  if (!resolution) {
    throw new Error(`Failed to resolve source ${source.filename}`);
  }
  const forceCoolerPreparation =
    isCoolerFilename(source.filename) &&
    canConvertSource(source) &&
    (buildResolutionPyramid.value || balanceInputCoolers.value);
  if (
    (!(source.forceConversion && canConvertSource(source))) &&
    !forceCoolerPreparation &&
    (resolution.action === "OPEN_DIRECT" || resolution.action === "REUSE_CONVERTED")
  ) {
    return resolution.resolvedFilename;
  }
  runState.currentStepId = "conversion";
  runState.currentMessage = `Converting ${source.filename}`;
  const assemblyFilename =
    source === primarySource ? primaryAgp.value : secondaryAgp.value;
  const started = await props.networkManager.requestManager.startConversionJob(
    new StartConversionJobRequest({
      filename: source.filename,
      assemblyFilename: assemblyFilename || undefined,
      direction: resolution.conversionDirection ?? undefined,
      overwrite: true,
      binTableFilename: source.binTableFilename || undefined,
      chromSizesFilename: source.chromSizesFilename || undefined,
      binSize: source.binSize ?? undefined,
      countAsFloat: source.countAsFloat || undefined,
      buildResolutionPyramid: buildResolutionPyramid.value,
      balanceInputCoolers: balanceInputCoolers.value,
    })
  );
  const finishedJob = await waitForConversionJob(started.jobId);
  return finishedJob.outputFilename;
};

const waitForTrackPrecompute = async (): Promise<TracksPrecomputeStatusResponse> => {
  while (true) {
    const status = await props.networkManager.requestManager.getTracksPrecomputeStatus();
    runState.trackPrecomputeStatus = status;
    runState.currentMessage = `Running jobs: ${status.runningJobs}`;
    if (status.runningJobs <= 0) {
      return status;
    }
    await sleep(750);
  }
};

const applyWizardPresentationState = (): void => {
  matrixViewStore.setPresentationMode(viewMode.value);
  matrixViewStore.setLayersSwapped(false);
  if (viewMode.value === "split") {
    matrixViewStore.setSelectionFastaSources("PRIMARY", "SECONDARY");
  } else {
    matrixViewStore.setSelectionFastaSources("PRIMARY", "PRIMARY");
  }
};

const applyAssemblyInfoToMap = (assemblyInfo: AssemblyInfo): void => {
  const mapManager = props.networkManager.mapManager;
  mapManager?.contigDimensionHolder.updateContigData(assemblyInfo.contigDescriptors);
  mapManager?.scaffoldHolder.updateScaffoldData(assemblyInfo.scaffoldDescriptors);
  mapManager?.reloadVisuals();
  mapManager?.refreshOverviewMinimap();
  void mapManager?.linearTrackManager.clearCachesAndRender();
};

const setAuthoritativeAssemblySource = async (
  source: OverlayAssemblySource
): Promise<void> => {
  const result = await props.networkManager.requestManager.setAssemblyInfoSource(source);
  applyAssemblyInfoToMap(result.assemblyInfo);
};

const goBack = (): void => {
  currentStepIndex.value = Math.max(0, currentStepIndex.value - 1);
};

const goNext = (): void => {
  currentStepIndex.value = Math.min(
    visibleSteps.value.length - 1,
    currentStepIndex.value + 1
  );
};

const onFinishClicked = async (): Promise<void> => {
  if (runState.completed && !runState.running) {
    emit("dismissed");
    return;
  }
  await runWizard();
};

const runWizard = async (): Promise<void> => {
  if (!canRunWizard.value) {
    currentStepIndex.value = visibleSteps.value.findIndex((step) => step.id === "notes");
    return;
  }
  runState.running = true;
  runState.completed = false;
  runState.error = "";
  runState.currentMessage = "";
  runState.currentConversion = null;
  runState.trackPrecomputeStatus = null;
  runState.currentStepId = "finish";
  runState.currentMessage = "Final checks";
  currentStepIndex.value = visibleSteps.value.findIndex((step) => step.id === "finish");
  await waitForNextPaint();
  try {
    if (dropCachesBeforeRun.value) {
      runState.currentStepId = "conversion";
      runState.currentMessage = "Dropping cache metadata";
      await props.networkManager.requestManager.dropAllCaches();
    }

    const primaryOpenedFilename = await ensureOpenedFilename(primarySource);
    const secondaryOpenedFilename =
      requiresSecondarySource.value && secondarySource.filename
        ? await ensureOpenedFilename(secondarySource)
        : null;

    runState.currentStepId = "finish";
    runState.currentMessage = `Opening ${primaryOpenedFilename}`;
    await props.openPrimaryDataset(primaryOpenedFilename, primaryFasta.value || undefined, {
      applyDefaultPreset: false,
    });
    await nextTick();

    const mapManager =
      props.mapManager ?? props.networkManager.mapManager ?? undefined;
    if (!mapManager) {
      throw new Error("Primary dataset was opened, but the map manager is not ready");
    }

    if (requiresSecondarySource.value && secondaryOpenedFilename) {
      runState.currentStepId = "sources";
      runState.currentMessage = `Attaching ${secondaryOpenedFilename}`;
      let secondaryStatus =
        await props.networkManager.requestManager.openSecondarySource(
          secondaryOpenedFilename,
          false
        );
      if (secondaryStatus.requiresConfirmation) {
        secondaryStatus =
          await props.networkManager.requestManager.openSecondarySource(
            secondaryOpenedFilename,
            true
          );
      }
      mapManager.viewAndLayersManager.setSecondaryResolutionModel(
        secondaryStatus.compatibility
      );
      secondaryStatus.warnings.forEach((warning) =>
        toast(warning, {
          style: {
            "background-color": "lightyellow",
            color: "black",
          },
        })
      );
    } else {
      await props.networkManager.requestManager.closeSecondarySource().catch(() => undefined);
      mapManager.viewAndLayersManager.setSecondaryResolutionModel(undefined);
    }

    const primaryPresetRecord = primaryPreset.value?.preset;
    const secondaryPresetRecord = secondaryPreset.value?.preset;
    if (!primaryPresetRecord) {
      throw new Error("Primary preset is not selected");
    }
    const backgroundColor = new ColorTranslator(
      primaryPresetRecord.backgroundColor,
      { legacyCSS: true }
    );
    styleStore.setMapBackground(backgroundColor);
    visualizationOptionsStore.setVisualizationOptions(primaryPresetRecord.options);
    await mapManager.visualizationManager.sendVisualizationOptionsToServer();

    if (
      viewMode.value === "single" &&
      primaryPresetRecord.options.signalDisplayMode !== "OBSERVED"
    ) {
      await props.networkManager.requestManager.resetRenderPipelineConfig();
    } else {
      const pipelineConfig = buildWizardRenderPipelineConfig({
        viewMode: viewMode.value,
        primaryOptions: primaryPresetRecord.options,
        secondaryOptions: secondaryPresetRecord?.options,
        blendMode: blendMode.value,
        topOpacity: topOpacity.value,
        bottomOpacity: bottomOpacity.value,
      });
      await props.networkManager.requestManager.setRenderPipelineConfig(
        pipelineConfig
      );
    }
    await mapManager.reloadTilesFromBackend();
    applyWizardPresentationState();

    if (secondaryFasta.value && requiresSecondarySource.value) {
      runState.currentStepId = "fasta";
      runState.currentMessage = `Linking ${secondaryFasta.value}`;
      await props.networkManager.requestManager.linkFASTA(
        new LinkFASTARequest({
          fastaFilename: secondaryFasta.value,
          allowMismatch: true,
          source: "SECONDARY",
        })
      );
    }

    if (requiresSecondarySource.value) {
      runState.currentStepId = "agp";
      runState.currentMessage = `Synchronizing ${overlayAssemblySource.value.toLowerCase()} assembly source`;
      await setAuthoritativeAssemblySource(overlayAssemblySource.value);
      const authoritativeAgp =
        overlayAssemblySource.value === "PRIMARY"
          ? primaryAgp.value
          : secondaryAgp.value;
      if (authoritativeAgp && authoritativeAgp.toLowerCase().endsWith(".agp")) {
        runState.currentMessage = `Loading ${authoritativeAgp}`;
        await props.networkManager.requestManager.loadAGP(
          new LoadAGPRequest({
            agpFilename: authoritativeAgp,
            source: overlayAssemblySource.value,
          })
        );
      }
    } else if (primaryAgp.value && primaryAgp.value.toLowerCase().endsWith(".agp")) {
      runState.currentStepId = "agp";
      runState.currentMessage = `Loading ${primaryAgp.value}`;
      await props.networkManager.requestManager.loadAGP(
        new LoadAGPRequest({
          agpFilename: primaryAgp.value,
          source: "PRIMARY",
        })
      );
    }

    for (const track of selectedTracks.value) {
      runState.currentStepId = "tracks";
      runState.currentMessage = `Opening ${track.filename}`;
      await props.networkManager.requestManager.openTrack(
        track.filename,
        track.displayName || undefined
      );
    }
    await mapManager.linearTrackManager.refreshTrackList();

    if (precomputeTracks.value && selectedTracks.value.length > 0) {
      runState.currentStepId = "track-precompute";
      runState.currentMessage = "Starting track precompute";
      runState.trackPrecomputeStatus =
        await props.networkManager.requestManager.startTracksPrecompute(
          undefined,
          forceTrackPrecompute.value
        );
      await waitForTrackPrecompute();
    }

    runState.currentStepId = "finish";
    runState.currentMessage = "Done";
    runState.completed = true;
    toast.success("Wizard completed");
    await nextTick();
    emit("dismissed");
  } catch (error) {
    runState.error = extractErrorMessage(error, "Wizard failed");
    runState.completed = false;
    toast.error(runState.error);
  } finally {
    runState.running = false;
  }
};

onMounted(() => {
  primarySource.presetId = findPresetIdByName("Mosquitoes Demo");
  secondarySource.presetId = findPresetIdByName("Dotplot black");
  props.networkManager.requestManager
    .getConversionToolchainStatus()
    .then((status) => {
      toolchainStatus.value = status;
    })
    .catch(() => {
      toolchainStatus.value = null;
    });
});
</script>

<style scoped>
.wizard-shell {
  --wizard-sidebar-width: 248px;
}

.wizard-content {
  min-height: 720px;
}

.wizard-body {
  display: flex;
  gap: 20px;
  min-height: 620px;
}

.wizard-sidebar {
  width: var(--wizard-sidebar-width);
  flex: 0 0 var(--wizard-sidebar-width);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 8px;
  border-right: 1px solid rgba(15, 23, 38, 0.12);
}

.wizard-step-button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 1px solid rgba(15, 23, 38, 0.12);
  background: rgba(248, 250, 252, 0.95);
  border-radius: 12px;
  padding: 10px 12px;
  text-align: left;
  color: rgba(24, 30, 38, 0.95);
}

.wizard-step-button.active {
  background: rgba(219, 234, 254, 0.95);
  border-color: rgba(37, 99, 235, 0.35);
}

.wizard-step-button.completed {
  border-color: rgba(22, 163, 74, 0.28);
}

.wizard-step-button.running {
  border-color: rgba(202, 138, 4, 0.4);
}

.wizard-step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: rgba(15, 23, 38, 0.08);
  font-weight: 700;
}

.wizard-step-label {
  font-size: 0.93rem;
}

.wizard-main {
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
}

.wizard-section h6 {
  margin-bottom: 14px;
}

.wizard-choice-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  min-height: 132px;
  border: 1px solid rgba(15, 23, 38, 0.12);
  border-radius: 14px;
  padding: 16px;
  background: rgba(248, 250, 252, 0.95);
  text-align: left;
}

.wizard-choice-card.selected {
  border-color: rgba(37, 99, 235, 0.35);
  background: rgba(219, 234, 254, 0.92);
}

.wizard-source-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.wizard-card {
  border: 1px solid rgba(15, 23, 38, 0.12);
  border-radius: 14px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.96);
}

.wizard-card-header {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(15, 23, 38, 0.08);
  background: rgba(248, 250, 252, 0.92);
}

.wizard-card-body {
  padding: 16px;
}

.wizard-preset-preview {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(248, 250, 252, 0.92);
}

.wizard-track-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wizard-track-item {
  border: 1px solid rgba(15, 23, 38, 0.1);
  border-radius: 12px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.96);
}

.wizard-precompute-row + .wizard-precompute-row {
  margin-top: 12px;
}

@media (max-width: 992px) {
  .wizard-body {
    flex-direction: column;
  }

  .wizard-sidebar {
    width: 100%;
    flex: 0 0 auto;
    border-right: 0;
    border-bottom: 1px solid rgba(15, 23, 38, 0.12);
    padding-right: 0;
    padding-bottom: 12px;
  }
}
</style>
