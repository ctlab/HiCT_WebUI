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
                <h6>View mode</h6>
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
                <h6>Sources selection</h6>
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
                          :value="primarySource.filename || 'Select .hict.hdf5, .hic, .cool, or .mcool'"
                        />
                        <button class="btn btn-outline-secondary" @click="openSelector('primary-matrix')">
                          Browse…
                        </button>
                      </div>
                      <div v-if="primarySource.resolution" class="alert alert-light border py-2 mb-0">
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
                          :value="secondarySource.filename || 'Select .hict.hdf5, .hic, .cool, or .mcool'"
                        />
                        <button class="btn btn-outline-secondary" @click="openSelector('secondary-matrix')">
                          Browse…
                        </button>
                      </div>
                      <div v-if="secondarySource.resolution" class="alert alert-light border py-2 mb-0">
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
                <div v-if="requiresSecondarySource" class="alert alert-warning mt-3 mb-0">
                  Two-source sessions are intended for comparative viewing. If matrix sizes, contig sets, or scaffold
                  composition differ, scaffolding edits, AGP imports, and FASTA export should be treated as
                  primary-source, view-only operations.
                </div>
              </div>

              <div v-else-if="currentStep?.id === 'visualization'" class="wizard-section">
                <h6>Visualization options</h6>
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

              <div v-else-if="currentStep?.id === 'fasta'" class="wizard-section">
                <h6>FASTA files</h6>
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
                <h6>Assembly file</h6>
                <div class="wizard-source-grid">
                  <div class="wizard-card">
                    <div class="wizard-card-header">
                      <strong>Primary assembly</strong>
                    </div>
                    <div class="wizard-card-body">
                      <div class="input-group">
                        <input class="form-control" type="text" readonly :value="primaryAgp || 'Optional .agp or Juicebox .assembly for primary source'" />
                        <button class="btn btn-outline-secondary" @click="openSelector('primary-agp')">Browse…</button>
                      </div>
                      <small class="text-muted d-block mt-2">
                        .agp is loaded after opening. .assembly is passed to .hic conversion; for already converted
                        matrices it must be converted to AGP before applying layout.
                      </small>
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
                      </div>
                    </div>
                  </div>
                </div>
                <div v-if="requiresSecondarySource" class="alert alert-warning mt-3 mb-0">
                  Prefer the primary AGP as the authoritative assembly input. Loading AGPs for both sources is supported
                  for comparison, but it can make layered views diverge and should not be treated as a coupled
                  scaffolding workflow.
                </div>
              </div>

              <div v-else-if="currentStep?.id === 'conversion'" class="wizard-section">
                <h6>Map files conversion</h6>
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
                    <div v-if="toolchainStatus && !toolchainStatus.hicConversionAvailable" class="alert alert-warning mt-3 mb-0">
                      {{ toolchainStatus.summary }}
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

              <div v-else-if="currentStep?.id === 'track-precompute'" class="wizard-section">
                <h6>Track precomputing</h6>
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
                <h6>Notes and warnings</h6>
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
                <h6>Final checks</h6>
                <div class="alert alert-light border">
                  <div><strong>View mode:</strong> {{ currentViewModeLabel }}</div>
                  <div><strong>Primary source:</strong> {{ primarySource.filename || "not selected" }}</div>
                  <div v-if="requiresSecondarySource"><strong>Secondary source:</strong> {{ secondarySource.filename || "not selected" }}</div>
                  <div><strong>Tracks:</strong> {{ selectedTracks.length }}</div>
                  <div><strong>Primary assembly:</strong> {{ primaryAgp || "not selected" }}</div>
                  <div v-if="requiresSecondarySource"><strong>Secondary assembly:</strong> {{ secondaryAgp || "not selected" }}</div>
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

type SourceDraft = {
  filename: string;
  resolution: MatrixSourceResolutionResponse | null;
  forceConversion: boolean;
  presetId: string;
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
  | "secondary-agp";

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

const sessionStore = useSessionStore();
const visualizationOptionsStore = useVisualizationOptionsStore();
const styleStore = useStyleStore();
const matrixViewStore = useMatrixViewStore();

const steps: Array<{ id: WizardStepId; label: string }> = [
  { id: "view-mode", label: "View mode" },
  { id: "sources", label: "Sources selection" },
  { id: "agp", label: "Assembly file" },
  { id: "conversion", label: "Map files conversion" },
  { id: "visualization", label: "Visualization options" },
  { id: "tracks", label: "1D tracks" },
  { id: "fasta", label: "FASTA file" },
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
});
const secondarySource = reactive<SourceDraft>({
  filename: "",
  resolution: null,
  forceConversion: false,
  presetId: "",
});
const primaryFasta = ref("");
const secondaryFasta = ref("");
const primaryAgp = ref("");
const secondaryAgp = ref("");
const selectedTracks = ref<SelectedTrack[]>([]);
const fixableIssuePolicy = reactive<Record<string, "ignore" | "discard">>({});
const precomputeTracks = ref(true);
const forceTrackPrecompute = ref(false);
const dropCachesBeforeRun = ref(false);
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
  () => steps.find((step) => step.id === runState.currentStepId)?.label ?? "Running"
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
      return lowered.endsWith(".hic") && !isResolvedDirectly(source);
    });
  if (
    sourcesNeedingToolchain.length > 0 &&
    toolchainStatus.value &&
    !toolchainStatus.value.hicConversionAvailable
  ) {
    issues.push(
      "Bundled/external hictk toolchain is required for .hic conversion but is currently unavailable."
    );
  }
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
      "Two-source overlay and split views are intended for comparative inspection. If sizes, contig lists, or scaffold composition differ, treat scaffolding operations as view-only and keep the primary source authoritative."
    );
  }
  if (requiresSecondarySource.value && secondaryAgp.value) {
    notes.push(
      "Secondary AGP input is best treated as comparative metadata. Use the primary AGP as the authoritative assembly when scaffolding operations are expected."
    );
  }
  const selectedHicSources = [primarySource, secondarySource]
    .filter((source, index) => index === 0 || requiresSecondarySource.value)
    .filter((source) => source.filename.toLowerCase().endsWith(".hic"));
  if (selectedHicSources.length > 0) {
    notes.push(
      ".hic sources do not reliably carry Juicebox/JBAT scaffold layout. Select the matching AGP after conversion; if the project only has a .assembly file, convert it to AGP before scaffolding-sensitive work."
    );
  }
  if (primaryAgp.value && secondaryAgp.value) {
    notes.push(
      "Both AGPs are selected. This is supported for comparison, but the resulting two-source view may become intentionally unaligned after assembly edits."
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
    items.push({
      id: "primary-assembly",
      kind: primaryAgp.value.toLowerCase().endsWith(".agp") || primarySource.filename.toLowerCase().endsWith(".hic")
        ? "pass"
        : "warning",
      title: "Primary assembly",
      message: primaryAgp.value.toLowerCase().endsWith(".assembly")
        ? "Juicebox .assembly will be passed to .hic conversion. For already converted matrices, convert it to AGP before applying layout."
        : "AGP will be loaded after the primary matrix is opened.",
      fixable: primaryAgp.value.toLowerCase().endsWith(".assembly") && !primarySource.filename.toLowerCase().endsWith(".hic"),
    });
  }
  if (secondaryAgp.value && requiresSecondarySource.value) {
    items.push({
      id: "secondary-assembly",
      kind: secondaryAgp.value.toLowerCase().endsWith(".agp") || secondarySource.filename.toLowerCase().endsWith(".hic")
        ? "pass"
        : "warning",
      title: "Secondary assembly",
      message: secondaryAgp.value.toLowerCase().endsWith(".assembly")
        ? "Juicebox .assembly will be passed to .hic conversion. For already converted matrices, convert it to AGP before applying layout."
        : "AGP will be loaded after the secondary matrix is opened.",
      fixable: secondaryAgp.value.toLowerCase().endsWith(".assembly") && !secondarySource.filename.toLowerCase().endsWith(".hic"),
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
  if (toolchainStatus.value && !toolchainStatus.value.hicConversionAvailable) {
    const hasHicConversion = [primarySource, secondarySource]
      .filter((source, index) => index === 0 || requiresSecondarySource.value)
      .some((source) => source.filename.toLowerCase().endsWith(".hic") && !isResolvedDirectly(source));
    if (hasHicConversion) {
      items.push({
        id: "hictk",
        kind: "error",
        title: ".hic conversion",
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
    lowered.endsWith(".mcool")
  );
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
    selectorState.fileType = ".hict.hdf5, .hic, .cool, .mcool";
    selectorState.note =
      "Current conversions will be reused when the original file fingerprint matches the cached record.";
    selectorState.predicate = isOpenableAssemblyFilename;
    return;
  }
  if (kind === "secondary-matrix") {
    selectorState.title = "Select secondary matrix source";
    selectorState.fileType = ".hict.hdf5, .hic, .cool, .mcool";
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
  const response = await props.networkManager.requestManager.resolveMatrixSource(
    filename
  );
  if (role === "primary") {
    primarySource.filename = filename;
    primarySource.resolution = response;
    return;
  }
  secondarySource.filename = filename;
  secondarySource.resolution = response;
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
    }
  } catch (error) {
    toast.error(String(error ?? "Failed to process selected file"));
  }
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

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
  if (
    (!(source.forceConversion && canConvertSource(source))) &&
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
  currentStepIndex.value = visibleSteps.value.findIndex((step) => step.id === "finish");
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
      mapManager.viewAndLayersManager.mergeSecondaryResolutionSupport(
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

    if (primaryAgp.value && primaryAgp.value.toLowerCase().endsWith(".agp")) {
      runState.currentStepId = "agp";
      runState.currentMessage = `Loading ${primaryAgp.value}`;
      await props.networkManager.requestManager.loadAGP(
        new LoadAGPRequest({
          agpFilename: primaryAgp.value,
          source: "PRIMARY",
        })
      );
    }
    if (secondaryAgp.value && requiresSecondarySource.value && secondaryAgp.value.toLowerCase().endsWith(".agp")) {
      runState.currentStepId = "agp";
      runState.currentMessage = `Loading ${secondaryAgp.value}`;
      await props.networkManager.requestManager.loadAGP(
        new LoadAGPRequest({
          agpFilename: secondaryAgp.value,
          source: "SECONDARY",
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
    runState.error = String(error ?? "Wizard failed");
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
