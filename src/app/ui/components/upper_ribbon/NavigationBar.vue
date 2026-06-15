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
  <nav class="navbar-bar navbar navbar-expand">
    <div class="container-fluid">
      <!-- Logo -->
      <a class="navbar-brand hict-navbar-brand" href="#">
        <img :src="hictLogo" alt="" class="hict-navbar-logo" aria-hidden="true" />
        <span>HiCT</span>
      </a>

      <div id="navbarSupportedContent" class="collapse navbar-collapse">
        <ul class="navbar-nav me-auto mb-2 mb-lg-0">
          <!-- File -->
          <li class="nav-item dropdown">
            <a
              class="nav-link active dropdown-toggle"
              data-bs-toggle="dropdown"
              href="#"
              >File</a
            >
            <ul class="dropdown-menu">
              <li>
                <a class="dropdown-item" href="#" @click="onOpenWizard"
                  >Open Wizard...</a
                >
              </li>
              <li>
                <a class="dropdown-item" href="#" @click="onOpenFile"
                  >Manual Open...</a
                >
              </li>
              <!-- <li>
                <a class="dropdown-item" href="#" @click="onSaveClicked">Save</a>
                <div v-if="saving" class="spinner-border ms-auto" role="status"></div>
              </li> -->
              <li>
                <a class="dropdown-item" href="#" @click="onCloseClicked"
                  >Close</a
                >
              </li>
              <li>
                <a class="dropdown-item" href="#" @click="onAttachClicked"
                  >Attach</a
                >
              </li>
              <li>
                <a class="dropdown-item" href="#" @click="onSaveSessionClicked"
                  >Save session</a
                >
              </li>
              <li>
                <a class="dropdown-item" href="#" @click="onOpenSessionClicked"
                  >Open session</a
                >
                <input
                  ref="sessionFileInput"
                  type="file"
                  accept="application/json"
                  @change="onSessionFileSelected"
                  hidden
                />
              </li>
              <li>
                <a
                  class="dropdown-item"
                  href="#"
                  @click="onConvertCoolersClicked"
                  >Convert matrices</a
                >
              </li>
              <li>
                <a
                  class="dropdown-item"
                  href="#"
                  @click.prevent="exportingMatrix = true"
                  >Export matrix</a
                >
              </li>
              <li>
                <a
                  class="dropdown-item"
                  href="#"
                  @click.prevent="onGenerateDotplotClicked"
                  >Generate dotplot</a
                >
              </li>
              <li>
                <a class="dropdown-item" href="#" @click="onDropCachesClicked"
                  >Drop caches</a
                >
              </li>
              <li><hr class="dropdown-divider" /></li>
              <li>
                <a class="dropdown-item" href="#" @click.prevent="onQuitClicked"
                  >Quit</a
                >
              </li>
            </ul>
          </li>
          <!-- View -->
          <li class="nav-item dropdown">
            <a
              class="nav-link active dropdown-toggle"
              data-bs-toggle="dropdown"
              href="#"
              >View</a
            >
            <ul class="dropdown-menu">
              <li>
                <a class="dropdown-item" href="#" @click="onOpenTrackManager"
                  >Tracks and layers...</a
                >
              </li>
              <li>
                <a class="dropdown-item" href="#" @click="onOpenRenderingPipeline"
                  >Rendering pipeline...</a
                >
              </li>
              <li>
                <a
                  class="dropdown-item"
                  href="#"
                  @click.prevent="osdSettingsOpen = true"
                  >OSD settings...</a
                >
              </li>
              <li class="dropdown-submenu p-3 resolution-settings-menu" @click.stop>
                <div class="fw-semibold mb-2">Restrict resolution</div>
                <div class="resolution-limit-grid mb-2">
                  <label class="small">
                    Finest
                    <input
                      v-model.number="resolutionFinestLimit"
                      type="number"
                      class="form-control form-control-sm"
                      min="1"
                      step="1"
                    />
                  </label>
                  <label class="small">
                    Coarsest
                    <input
                      v-model.number="resolutionCoarsestLimit"
                      type="number"
                      class="form-control form-control-sm"
                      min="1"
                      step="1"
                    />
                  </label>
                </div>
                <button class="btn btn-sm btn-outline-primary w-100 mb-2" type="button" @click="applyResolutionLimits">
                  Set limits
                </button>
                <div class="resolution-list">
                  <div
                    v-for="resolution in availableResolutions"
                    :key="resolution"
                    class="form-check form-switch"
                  >
                    <input
                      :id="`resolution-${resolution}`"
                      :checked="enabledResolutionSet.has(resolution)"
                      class="form-check-input"
                      type="checkbox"
                      role="switch"
                      @change="toggleResolution(resolution, ($event.target as HTMLInputElement).checked)"
                    />
                    <label class="form-check-label" :for="`resolution-${resolution}`">
                      1:{{ resolution.toLocaleString() }}
                    </label>
                  </div>
                </div>
              </li>
              <li>
                <a class="dropdown-item" href="#" @click="onOpenApiDocs"
                  >API docs...</a
                >
              </li>
            </ul>
          </li>
          <!-- Bookmarks -->
          <!-- <li class="nav-item">
            <a aria-current="page" class="nav-link active" href="#"
              >Bookmarks</a
            >
          </li> -->
          <!-- Assembly -->
          <li class="nav-item dropdown">
            <a
              class="nav-link active dropdown-toggle"
              data-bs-toggle="dropdown"
              href="#"
              >Assembly</a
            >
            <ul class="dropdown-menu">
              <li>
                <a class="dropdown-item" href="#" @click="onOpenFASTAFile"
                  >Link FASTA</a
                >
              </li>
              <li>
                <a
                  class="dropdown-item"
                  href="#"
                  @click="onAssemblyFASTARequest"
                  >Export assembly</a
                >
              </li>
              <li>
                <a
                  class="dropdown-item"
                  href="#"
                  @click="onSelectionFASTARequest"
                  >Export FASTA for selection</a
                >
              </li>
              <li>
                <a class="dropdown-item" href="#" @click="onLoadAGP"
                  >Load AGP</a
                >
              </li>
              <li>
                <a class="dropdown-item" href="#" @click="onApplyJuiceboxAssembly"
                  >Apply Juicebox assembly</a
                >
              </li>
              <li>
                <a class="dropdown-item" href="#" @click="onAssemblyAGPRequest"
                  >Export to AGP</a
                >
              </li>
            </ul>
          </li>
          <!-- Dev -->
          <li class="nav-item dropdown">
            <a
              aria-current="page"
              class="nav-link active dropdown-toggle"
              data-bs-toggle="dropdown"
              href="#"
              >Dev</a
            >
            <ul class="dropdown-menu p-3">
              <li class="form-check">
                <input
                  id="toggle-request-errors"
                  class="form-check-input"
                  type="checkbox"
                  v-model="requestErrorToastsEnabled"
                />
                <label class="form-check-label" for="toggle-request-errors">
                  Show request error toasts
                </label>
              </li>
              <li class="form-check mt-2">
                <input
                  id="toggle-webui-errors"
                  class="form-check-input"
                  type="checkbox"
                  v-model="webuiErrorToastsEnabled"
                />
                <label class="form-check-label" for="toggle-webui-errors">
                  Show WebUI error toasts
                </label>
              </li>
              <li class="form-check mt-2">
                <input
                  id="toggle-custom-zoomslider"
                  class="form-check-input"
                  type="checkbox"
                  v-model="customZoomSliderEnabled"
                />
                <label class="form-check-label" for="toggle-custom-zoomslider">
                  Use custom ZoomSlider
                </label>
              </li>
              <li class="form-check mt-2">
                <input
                  id="toggle-binary-tiles"
                  class="form-check-input"
                  type="checkbox"
                  v-model="binaryTileTransportEnabled"
                />
                <label class="form-check-label" for="toggle-binary-tiles">
                  Render tiles from binary signal (experimental)
                </label>
              </li>
              <li class="form-check mt-2">
                <input
                  id="toggle-native-processing"
                  class="form-check-input"
                  type="checkbox"
                  v-model="nativeProcessingRequested"
                  :disabled="nativeProcessingBusy"
                  @change="onNativeProcessingChanged"
                />
                <label class="form-check-label" for="toggle-native-processing">
                  Use native code processing
                </label>
                <div class="native-processing-status" :class="nativeProcessingStatusClass">
                  {{ nativeProcessingStatusText }}
                </div>
              </li>
              <li class="mt-3" @click.stop>
                <label class="form-label mb-1" for="dotplot-aligner-preference">
                  Dotplot aligner
                </label>
                <select
                  id="dotplot-aligner-preference"
                  v-model="dotplotAlignerPreference"
                  class="form-select form-select-sm"
                  :disabled="dotplotAlignerBusy"
                  @change="onDotplotAlignerPreferenceChanged"
                >
                  <option value="auto">Auto (mm2-plus AVX-512 -> AVX2 -> minimap2)</option>
                  <option value="mm2plus">mm2-plus best available</option>
                  <option value="mm2plus-avx512" :disabled="!toolchainStatus?.mm2PlusAvx512Available">
                    mm2-plus AVX-512{{ toolchainStatus?.mm2PlusAvx512Available ? "" : " (not bundled)" }}
                  </option>
                  <option value="mm2plus-avx2" :disabled="!toolchainStatus?.mm2PlusAvx2Available">
                    mm2-plus AVX2{{ toolchainStatus?.mm2PlusAvx2Available ? "" : " (not bundled)" }}
                  </option>
                  <option value="minimap2" :disabled="!toolchainStatus?.minimap2Available">
                    minimap2{{ toolchainStatus?.minimap2Available ? "" : " (not bundled)" }}
                  </option>
                </select>
                <div class="native-processing-status" :class="dotplotAlignerStatusClass">
                  {{ dotplotAlignerStatusText }}
                </div>
              </li>
              <li><hr class="dropdown-divider" /></li>
              <li>
                <a class="dropdown-item px-0 mt-2" href="#" @click="onOpenServerStatistics">
                  Runtime statistics...
                </a>
              </li>
              <li>
                <a class="dropdown-item px-0 mt-2" href="#" @click="onOpenWorkerDiagnostics">
                  Worker diagnostics...
                </a>
              </li>
            </ul>
          </li>
          <!-- Connection settings -->
          <li class="nav-item dropdown">
            <a
              aria-current="page"
              class="nav-link active dropdown-toggle"
              data-bs-toggle="dropdown"
              href="#"
              >Connection</a
            >
            <ul class="dropdown-menu" id="connection-settings-menu-dropdown">
              <li id="connection-settings-input-group" class="input-group m-3">
                <input
                  id="global-search-input"
                  class="form-control m-0"
                  placeholder="http://localhost:5000/"
                  type="text"
                  v-model="gatewayAddress"
                />
                <button
                  class="btn btn-sm btn-outline-dark"
                  id="set-gateway-btn"
                  @click="onGatewayChanged"
                >
                  Set API gateway
                </button>
              </li>
            </ul>
          </li>
          <!-- Report a bug -->
          <li class="nav-item">
            <a
              aria-current="page"
              class="nav-link active"
              href="#"
              @click="openAbout"
              >About</a
            >
          </li>
          <li class="nav-item">
            <a
              aria-current="page"
              class="nav-link active"
              href="https://github.com/ctlab/HiCT/issues"
              >Report a bug</a
            >
          </li>
        </ul>
      </div>
    </div>
  </nav>
  <!-- <OpenFileSelector
    :network-manager="props.networkManager"
    v-if="openingFile"
    @selected="onFileSelected"
    @dismissed="onFileDismissed"
  ></OpenFileSelector> -->
  <UniversalFileSelector
    :network-manager="props.networkManager"
    v-if="openingFile"
    @selected="onFileSelected"
    @dismissed="onFileDismissed"
    :error-message="errorMessage"
    :title="'Open Hi-C dataset'"
    :file-type="'.hict.hdf5, .hic, .cool, .mcool, .matrix, .coo, .tsv, .csv, .bg2, .bedpe, .pairs, .validPairs'"
    :note="'Files outside .hict.hdf5 must be converted into HiCT internal format before opening. Text matrix formats are loaded through hictk.'"
    :file-name-predicate="isOpenableAssemblyFilename"
  ></UniversalFileSelector>
  <UniversalFileSelector
    :network-manager="props.networkManager"
    v-if="openingFASTAFile"
    @selected="linkFASTA"
    @dismissed="onFASTAFileDismissed"
    :error-message="errorMessage"
    :title="'Select FASTA file'"
    :file-name-predicate="isFastaFilename"
  ></UniversalFileSelector>
  <UniversalFileSelector
    :network-manager="props.networkManager"
    v-if="openingAGPFile"
    @selected="openAGP"
    @dismissed="onAGPFileDismissed"
    :error-message="errorMessage"
    :file-name-predicate="(name: string) => name.endsWith('.agp')"
  ></UniversalFileSelector>
  <UniversalFileSelector
    :network-manager="props.networkManager"
    v-if="openingJuiceboxAssemblyFile"
    @selected="onJuiceboxAssemblySelected"
    @dismissed="onJuiceboxAssemblyFileDismissed"
    :error-message="errorMessage"
    :title="'Apply Juicebox assembly'"
    :file-type="'.agp, .assembly'"
    :note="'Select a Juicebox .assembly to convert it to AGP and apply it to the current map state. If you also have the original contig FASTA, selecting it will improve contig-border matching; otherwise the apply step will run in best-effort mode.'"
    :file-name-predicate="isAssemblyFilename"
  ></UniversalFileSelector>
  <UniversalFileSelector
    :network-manager="props.networkManager"
    v-if="openingJuiceboxAssemblyFastaFile"
    @selected="onJuiceboxAssemblyFastaSelected"
    @dismissed="onJuiceboxAssemblyFastaFileDismissed"
    :error-message="errorMessage"
    :title="'Select original FASTA for exact assembly matching'"
    :file-type="'.fasta, .fa, .fna, .fas, .gz'"
    :note="'Optional. If selected, the assembly apply step will first link the FASTA so contig matching can be exact when the sequence names and lengths line up. Without it, the assembly will be applied in best-effort mode.'"
    :file-name-predicate="isFastaFilename"
  ></UniversalFileSelector>
  <CoolerConverter
    :network-manager="networkManager"
    :initial-cooler-filename="coolerToConvert"
    v-if="convertingCoolers"
    @dismissed="onConvertCoolersDismissed"
  >
  </CoolerConverter>
  <MatrixExportModal
    v-if="exportingMatrix"
    :network-manager="props.networkManager"
    :initial-source-filename="currentPrimaryHictFilename"
    @dismissed="exportingMatrix = false"
  />
  <DotplotGenerator
    v-if="generatingDotplots"
    :network-manager="networkManager"
    :initial-fasta-filename="lastLinkedFastaFilename"
    :initial-reference-map-filename="currentPrimaryHictFilename"
    @dismissed="onGenerateDotplotDismissed"
  />
  <TrackManager
    v-if="trackManagerOpen"
    :map-manager="props.mapManager"
    @dismissed="trackManagerOpen = false"
  />
  <RenderingPipelineModal
    v-if="renderingPipelineOpen"
    :map-manager="props.mapManager"
    @dismissed="renderingPipelineOpen = false"
  />
  <WorkerDiagnosticsModal
    v-if="workerDiagnosticsOpen"
    :network-manager="props.networkManager"
    @dismissed="workerDiagnosticsOpen = false"
  />
  <ServerStatisticsModal
    v-if="serverStatisticsOpen"
    :network-manager="props.networkManager"
    @dismissed="serverStatisticsOpen = false"
  />
  <FastaLinkWarningModal
    v-if="fastaLinkReport"
    :report="fastaLinkReport"
    @cancel="cancelFastaLinkWarning"
    @proceed="proceedFastaLinkWarning"
  />
  <div
    v-if="osdSettingsOpen"
    class="settings-backdrop"
    @click.self="osdSettingsOpen = false"
  >
    <div class="settings-modal osd-settings-modal" role="dialog" aria-modal="true">
      <div class="settings-header">
        <h2>OSD settings</h2>
        <button class="btn-close" @click="osdSettingsOpen = false"></button>
      </div>
      <div class="settings-body">
        <div class="form-check form-switch mb-3">
          <input
            id="toggle-osd-visible"
            v-model="osdOverlayVisible"
            class="form-check-input"
            type="checkbox"
            role="switch"
          />
          <label class="form-check-label" for="toggle-osd-visible">
            Show overlay
          </label>
        </div>
        <label class="form-label" for="osd-position-select">Position</label>
        <select
          id="osd-position-select"
          v-model="osdOverlayPosition"
          class="form-select form-select-sm mb-3"
        >
          <option value="top-right">Top right</option>
          <option value="bottom-left">Bottom left</option>
        </select>
        <div class="fw-semibold mb-2">Fields</div>
        <div
          v-for="field in osdFieldOrder"
          :key="field"
          class="osd-field-row"
        >
          <div class="form-check form-switch">
            <input
              :id="`osd-field-${field}`"
              v-model="osdOverlayFields[field]"
              class="form-check-input"
              type="checkbox"
              role="switch"
            />
            <label class="form-check-label" :for="`osd-field-${field}`">
              {{ osdFieldLabels[field] ?? field }}
            </label>
          </div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" type="button" @click="moveOsdField(field, -1)">Up</button>
            <button class="btn btn-outline-secondary" type="button" @click="moveOsdField(field, 1)">Down</button>
          </div>
        </div>
      </div>
      <div class="settings-footer">
        <button class="btn btn-primary" type="button" @click="osdSettingsOpen = false">
          Done
        </button>
      </div>
    </div>
  </div>
  <div
    v-if="aboutOpen"
    class="about-backdrop"
    @click.self="aboutOpen = false"
  >
    <div class="about-modal">
      <div class="about-header">
        <h2>HiCT</h2>
        <button class="btn-close" @click="aboutOpen = false"></button>
      </div>
      <div class="about-tabs" role="tablist" aria-label="About HiCT">
        <button
          type="button"
          class="about-tab"
          :class="{ active: aboutActiveTab === 'about' }"
          @click="aboutActiveTab = 'about'"
        >
          About
        </button>
        <button
          type="button"
          class="about-tab"
          :class="{ active: aboutActiveTab === 'attribution' }"
          @click="aboutActiveTab = 'attribution'"
        >
          Attribution
        </button>
      </div>
      <div v-if="aboutActiveTab === 'about'" class="about-body">
        <p class="about-authors">{{ projectAttribution.authors }}</p>
        <p class="about-note">{{ projectAttribution.note }}</p>
        <div class="about-versions">
          <div><strong>Backend:</strong> {{ backendVersion }}</div>
          <div><strong>WebUI:</strong> {{ webuiVersion }}</div>
          <div><strong>Commit:</strong> {{ webuiCommit }}</div>
        </div>
        <pre class="about-license">{{ licenseText }}</pre>
      </div>
      <div v-else class="about-body attribution-panel">
        <section class="attribution-section">
          <h3>Project</h3>
          <article class="attribution-card">
            <div class="attribution-title">{{ projectAttribution.name }}</div>
            <div>{{ projectAttribution.authors }}</div>
            <div><strong>License:</strong> {{ projectAttribution.license }}</div>
            <div v-if="projectAttribution.note">{{ projectAttribution.note }}</div>
            <div v-if="projectAttribution.links?.length" class="attribution-links">
              <a
                v-for="link in projectAttribution.links"
                :key="link.href"
                :href="link.href"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ link.label }}
              </a>
            </div>
          </article>
        </section>
        <section class="attribution-section">
          <h3>Runtime and Conversion</h3>
          <article
            v-for="entry in runtimeAttributions"
            :key="entry.name"
            class="attribution-card"
          >
            <div class="attribution-title">{{ entry.name }}</div>
            <div>{{ entry.authors }}</div>
            <div><strong>License:</strong> {{ entry.license }}</div>
            <div v-if="entry.note">{{ entry.note }}</div>
            <div v-if="entry.links?.length" class="attribution-links">
              <a
                v-for="link in entry.links"
                :key="link.href"
                :href="link.href"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ link.label }}
              </a>
            </div>
          </article>
        </section>
        <section class="attribution-section">
          <h3>WebUI</h3>
          <article
            v-for="entry in webAttributions"
            :key="entry.name"
            class="attribution-card"
          >
            <div class="attribution-title">{{ entry.name }}</div>
            <div>{{ entry.authors }}</div>
            <div><strong>License:</strong> {{ entry.license }}</div>
            <div v-if="entry.note">{{ entry.note }}</div>
            <div v-if="entry.links?.length" class="attribution-links">
              <a
                v-for="link in entry.links"
                :key="link.href"
                :href="link.href"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ link.label }}
              </a>
            </div>
          </article>
        </section>
        <section class="attribution-section">
          <h3>Redistribution Notes</h3>
          <ul class="attribution-notes">
            <li v-for="note in redistributionNotes" :key="note">{{ note }}</li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { NetworkManager } from "@/app/core/net/NetworkManager.js";
import { computed, defineAsyncComponent, onMounted, Ref, ref, watch } from "vue";
import {
  GetAGPForAssemblyRequest,
  GetFastaForAssemblyRequest,
  LinkFASTARequest,
  LoadAGPRequest,
  ApplyJuiceboxAssemblyRequest,
} from "@/app/core/net/api/request";
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import CoolerConverter from "./CoolerConverter.vue";
import MatrixExportModal from "./MatrixExportModal.vue";
import DotplotGenerator from "./DotplotGenerator.vue";
import UniversalFileSelector from "@/app/ui/components/upper_ribbon/UniversalFileSelector.vue";
import TrackManager from "@/app/ui/components/upper_ribbon/TrackManager.vue";
import FastaLinkWarningModal from "@/app/ui/components/upper_ribbon/FastaLinkWarningModal.vue";
import WorkerDiagnosticsModal from "@/app/ui/components/upper_ribbon/WorkerDiagnosticsModal.vue";
import ServerStatisticsModal from "@/app/ui/components/upper_ribbon/ServerStatisticsModal.vue";
import { toast } from "vue-sonner";
import { storeToRefs } from "pinia";
import { useErrorToastStore } from "@/app/stores/errorToastStore";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
import type {
  ConversionToolchainStatusResponse,
  FastaLinkResponse,
} from "@/app/core/net/api/response";
import type { NativeProcessingStatusResponse } from "@/app/core/net/api/RequestManager";
import {
  licenseText,
  projectAttribution,
  redistributionNotes,
  runtimeAttributions,
  webAttributions,
} from "@/app/core/attribution";
import pkg from "../../../../../package.json";
import hictLogo from "@/assets/hict-logo.png";
const openingFile = ref(false);
const openingFASTAFile = ref(false);
const openingAGPFile = ref(false);
const openingJuiceboxAssemblyFile = ref(false);
const openingJuiceboxAssemblyFastaFile = ref(false);
const convertingCoolers = ref(false);
const exportingMatrix = ref(false);
const generatingDotplots = ref(false);
const coolerToConvert = ref<string | undefined>(undefined);
const lastLinkedFastaFilename = ref<string | undefined>(undefined);
const trackManagerOpen = ref(false);
const renderingPipelineOpen = ref(false);
const workerDiagnosticsOpen = ref(false);
const serverStatisticsOpen = ref(false);
const saving = ref(false);
const gatewayAddress: Ref<string> = ref("http://localhost:5000/");
const aboutOpen = ref(false);
const osdSettingsOpen = ref(false);
const aboutActiveTab = ref<"about" | "attribution">("about");
const pendingFastaFilename = ref<string | null>(null);
const fastaLinkReport = ref<FastaLinkResponse | null>(null);
const pendingJuiceboxAssemblyFilename = ref("");
const pendingJuiceboxAssemblyFastaFilename = ref("");
const nativeProcessingStatus = ref<NativeProcessingStatusResponse | null>(null);
const nativeProcessingRequested = ref(false);
const nativeProcessingBusy = ref(false);
const toolchainStatus = ref<ConversionToolchainStatusResponse | null>(null);
const dotplotAlignerPreference = ref("auto");
const dotplotAlignerBusy = ref(false);
const backendVersion = ref("loading...");
const webuiVersion = ref(String((pkg as { version?: string })?.version ?? "unknown"));
const webuiCommit = ref("unknown");
const RenderingPipelineModal = defineAsyncComponent(
  () => import("@/app/ui/components/upper_ribbon/RenderingPipelineModal.vue")
);
const emit = defineEmits<{
  (e: "selected", filename: string): void;
  (e: "closed"): void;
  (e: "attached"): void;
  (e: "saveSession"): void;
  (e: "openSession", file: File): void;
  (e: "agpLoaded", filename: string): void;
  (e: "fastaLinked", filename: string): void;
  (e: "wizardRequested"): void;
}>();

useEscDismissableDialog({
  priority: 1040,
  isOpen: () => aboutOpen.value,
  requestClose: () => {
    aboutOpen.value = false;
  },
});

useEscDismissableDialog({
  priority: 1041,
  isOpen: () => osdSettingsOpen.value,
  requestClose: () => {
    osdSettingsOpen.value = false;
  },
});

useEscDismissableDialog({
  priority: 2200,
  isOpen: () => fastaLinkReport.value !== null,
  requestClose: () => {
    fastaLinkReport.value = null;
  },
});

const props = defineProps<{
  networkManager: NetworkManager;
  mapManager?: ContactMapManager;
}>();

const errorMessage: Ref<unknown | null> = ref(null);
const errorToastStore = useErrorToastStore();
const uiSettingsStore = useUiSettingsStore();
const { requestErrorToastsEnabled, webuiErrorToastsEnabled } =
  storeToRefs(errorToastStore);
const {
  customZoomSliderEnabled,
  binaryTileTransportEnabled,
  osdOverlayVisible,
  osdOverlayPosition,
  osdOverlayFields,
  osdOverlayFieldOrder,
} =
  storeToRefs(uiSettingsStore);

const osdFieldLabels: Record<string, string> = {
  global: "Global coordinates",
  resolution: "Resolution",
  source: "Guidance source",
  visibleResolutions: "Visible source resolutions",
  pixels: "Pixel position",
  bins: "Bin position",
  basePairs: "Genome bp position",
  contigs: "Contigs",
  inContig: "In-contig bp",
  scaffolds: "Scaffolds",
  inScaffold: "In-scaffold bp",
};

const osdFieldOrder = computed(() =>
  osdOverlayFieldOrder.value.filter((field) => field in osdFieldLabels)
);
const enabledResolutions = ref<number[]>([]);
const resolutionFinestLimit = ref<number | null>(null);
const resolutionCoarsestLimit = ref<number | null>(null);
const availableResolutions = computed(() =>
  props.mapManager?.getLayersManager().getAllNavigationBpResolutions() ?? []
);
const enabledResolutionSet = computed(() => new Set(enabledResolutions.value));

function moveOsdField(field: string, delta: number): void {
  const order = [...osdOverlayFieldOrder.value];
  const from = order.indexOf(field);
  if (from < 0) {
    return;
  }
  const to = Math.max(0, Math.min(order.length - 1, from + delta));
  if (from === to) {
    return;
  }
  order.splice(from, 1);
  order.splice(to, 0, field);
  osdOverlayFieldOrder.value = order;
}

function refreshResolutionRestrictionState(): void {
  const manager = props.mapManager?.getLayersManager();
  const all = manager?.getAllNavigationBpResolutions() ?? [];
  enabledResolutions.value = manager?.getEnabledBpResolutions() ?? all;
  resolutionFinestLimit.value = enabledResolutions.value[0] ?? all[0] ?? null;
  resolutionCoarsestLimit.value =
    enabledResolutions.value[enabledResolutions.value.length - 1] ??
    all[all.length - 1] ??
    null;
}

function applyEnabledResolutions(next: number[]): void {
  const all = availableResolutions.value;
  const normalized = next
    .filter((resolution) => all.includes(resolution))
    .sort((a, b) => a - b);
  if (normalized.length === 0 && all.length > 0) {
    toast.error("At least one map resolution must stay enabled.");
    return;
  }
  enabledResolutions.value = normalized;
  props.mapManager?.getLayersManager().setEnabledBpResolutions(normalized);
}

function toggleResolution(resolution: number, enabled: boolean): void {
  const next = new Set(enabledResolutions.value);
  if (enabled) {
    next.add(resolution);
  } else {
    next.delete(resolution);
  }
  applyEnabledResolutions([...next]);
}

function applyResolutionLimits(): void {
  const finest = Number(resolutionFinestLimit.value);
  const coarsest = Number(resolutionCoarsestLimit.value);
  if (!Number.isFinite(finest) || !Number.isFinite(coarsest) || finest > coarsest) {
    toast.error("Resolution limits must be valid and finest must not exceed coarsest.");
    return;
  }
  applyEnabledResolutions(
    availableResolutions.value.filter(
      (resolution) => resolution >= finest && resolution <= coarsest
    )
  );
}

watch(
  () => props.mapManager,
  () => refreshResolutionRestrictionState(),
  { immediate: true }
);

const currentPrimaryHictFilename = computed(() => {
  const filename = props.mapManager?.getOptions().filename ?? "";
  return filename.toLowerCase().endsWith(".hict.hdf5") ? filename : "";
});

const nativeProcessingStatusClass = computed(() => ({
  "text-success": nativeProcessingStatus.value?.enabled,
  "text-warning":
    nativeProcessingStatus.value?.requested && !nativeProcessingStatus.value?.enabled,
  "text-muted": !nativeProcessingStatus.value?.requested,
}));

const nativeProcessingStatusText = computed(() => {
  const status = nativeProcessingStatus.value;
  if (!status) {
    return "Status is not loaded yet.";
  }
  if (status.enabled) {
    return `Native backend active (${status.version}).`;
  }
  if (status.requested && !status.available) {
    return `Native backend unavailable: ${status.reason}`;
  }
  if (status.requested) {
    return `Native backend disabled: ${status.reason}`;
  }
  return status.available
    ? `Available (${status.version}), currently disabled.`
    : "Not bundled; Java backend is active.";
});

const dotplotAlignerStatusClass = computed(() => ({
  "text-success": toolchainStatus.value?.selectedDotplotAligner !== "none",
  "text-warning": toolchainStatus.value?.selectedDotplotAligner === "none",
  "text-muted": !toolchainStatus.value,
}));

const dotplotAlignerStatusText = computed(() => {
  const status = toolchainStatus.value;
  if (!status) {
    return "Toolchain status is not loaded yet.";
  }
  if (!status.selectedDotplotAlignerCommand) {
    return "No usable dotplot aligner for this preference.";
  }
  return `Selected: ${status.selectedDotplotAligner}.`;
});

type HictDesktopBridge = {
  platform?: string;
  quit?: () => Promise<unknown> | unknown;
};

type TauriBridge = {
  core?: {
    invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
  invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
};

function onOpenFile() {
  openingFile.value = true;
}

function onOpenWizard(): void {
  emit("wizardRequested");
}

function onGenerateDotplotClicked(): void {
  generatingDotplots.value = true;
}

function onGenerateDotplotDismissed(): void {
  generatingDotplots.value = false;
}

function onOpenTrackManager() {
  trackManagerOpen.value = true;
}

function onOpenRenderingPipeline() {
  renderingPipelineOpen.value = true;
}

function onOpenWorkerDiagnostics() {
  workerDiagnosticsOpen.value = true;
}

function onOpenServerStatistics() {
  serverStatisticsOpen.value = true;
}

async function refreshNativeProcessingStatus(): Promise<void> {
  nativeProcessingBusy.value = true;
  try {
    const status =
      await props.networkManager.requestManager.getNativeProcessingStatus();
    nativeProcessingStatus.value = status;
    nativeProcessingRequested.value = status.requested;
  } catch (error) {
    nativeProcessingStatus.value = {
      requested: false,
      enabled: false,
      available: false,
      version: "unknown",
      source: "",
      reason: "Failed to query native backend status: " + String(error),
      lastFailure: "",
    };
  } finally {
    nativeProcessingBusy.value = false;
  }
}

async function onNativeProcessingChanged(): Promise<void> {
  nativeProcessingBusy.value = true;
  try {
    const status =
      await props.networkManager.requestManager.setNativeProcessingEnabled(
        nativeProcessingRequested.value
      );
    nativeProcessingStatus.value = status;
    nativeProcessingRequested.value = status.requested;
    if (status.enabled) {
      toast.success("Native code processing enabled.");
    } else if (status.requested) {
      toast("Native code processing is unavailable; Java backend remains active.", {
        style: {
          "background-color": "lightyellow",
          color: "black",
        },
      });
    } else {
      toast("Native code processing disabled; Java backend is active.");
    }
    props.mapManager?.reloadTiles();
  } catch (error) {
    toast.error("Failed to update native processing setting: " + String(error));
    await refreshNativeProcessingStatus();
  } finally {
    nativeProcessingBusy.value = false;
  }
}

async function refreshConversionToolchainStatus(): Promise<void> {
  dotplotAlignerBusy.value = true;
  try {
    const status =
      await props.networkManager.requestManager.getConversionToolchainStatus();
    toolchainStatus.value = status;
    dotplotAlignerPreference.value = status.dotplotAlignerPreference || "auto";
  } catch (error) {
    toolchainStatus.value = null;
    console.error("Failed to query conversion toolchain status", error);
  } finally {
    dotplotAlignerBusy.value = false;
  }
}

async function onDotplotAlignerPreferenceChanged(): Promise<void> {
  dotplotAlignerBusy.value = true;
  try {
    const status =
      await props.networkManager.requestManager.setDotplotAlignerPreference(
        dotplotAlignerPreference.value
      );
    toolchainStatus.value = status;
    dotplotAlignerPreference.value = status.dotplotAlignerPreference || "auto";
    if (status.selectedDotplotAlignerCommand) {
      toast.success(`Dotplot aligner set to ${status.selectedDotplotAligner}.`);
    } else {
      toast("No usable dotplot aligner for this preference.", {
        style: {
          "background-color": "lightyellow",
          color: "black",
        },
      });
    }
  } catch (error) {
    toast.error("Failed to update dotplot aligner: " + String(error));
    await refreshConversionToolchainStatus();
  } finally {
    dotplotAlignerBusy.value = false;
  }
}

function onOpenApiDocs(): void {
  const base = props.networkManager.host.replace(/\/+$/, "");
  window.open(`${base}/api/v1/`, "_blank", "noopener,noreferrer");
}

function onQuitClicked(): void {
  const desktopBridge = (window as unknown as { hictDesktop?: HictDesktopBridge })
    .hictDesktop;
  if (typeof desktopBridge?.quit === "function") {
    void Promise.resolve(desktopBridge.quit()).catch((error) => {
      console.error("Failed to close Electron HiCT WebUI", error);
      toast.error("Failed to close bundled WebUI: " + String(error));
    });
    return;
  }

  const tauriBridge = (window as unknown as { __TAURI__?: TauriBridge }).__TAURI__;
  const invoke = tauriBridge?.core?.invoke ?? tauriBridge?.invoke;
  if (typeof invoke === "function") {
    void invoke("quit_app")
      .catch(() => invoke("quit-app"))
      .catch((error) => {
        console.error("Failed to close Tauri HiCT WebUI", error);
        toast.error("Failed to close bundled WebUI: " + String(error));
      });
    return;
  }

  const message =
    "File -> Quit closes only bundled Electron/Tauri WebUI windows. Use the browser tab/window controls here.";
  console.info(message);
  toast(message);
}

function onLoadAGP() {
  openingAGPFile.value = true;
}

function onApplyJuiceboxAssembly(): void {
  pendingJuiceboxAssemblyFilename.value = "";
  pendingJuiceboxAssemblyFastaFilename.value = "";
  openingJuiceboxAssemblyFile.value = true;
}

function onFileDismissed() {
  openingFile.value = false;
  errorMessage.value = null;
}

function onSaveClicked(): void {
  saving.value = true;
  props.networkManager.requestManager.save().finally(() => {
    saving.value = false;
  });
}

function onCloseClicked(): void {
  emit("closed");
  errorMessage.value = null;
}

function onAttachClicked(): void {
  emit("attached");
  errorMessage.value = null;
}

function onSaveSessionClicked(): void {
  emit("saveSession");
  errorMessage.value = null;
}

const sessionFileInput = ref<HTMLInputElement | null>(null);

function onOpenSessionClicked(): void {
  sessionFileInput.value?.click();
}

function onSessionFileSelected(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  emit("openSession", file);
  input.value = "";
  errorMessage.value = null;
}

function onConvertCoolersClicked(): void {
  coolerToConvert.value = undefined;
  convertingCoolers.value = true;
}

async function onDropCachesClicked(): Promise<void> {
  try {
    const result = await props.networkManager.requestManager.dropAllCaches();
    toast.success(
      `Dropped caches: ${result.matrixMetadataDeleted} matrix metadata entries, ${result.trackCacheEntriesDeleted} track cache files`
    );
  } catch (error) {
    errorMessage.value = error;
  }
}

function onConvertCoolersDismissed(): void {
  coolerToConvert.value = undefined;
  convertingCoolers.value = false;
}

function openAbout(): void {
  aboutOpen.value = true;
  aboutActiveTab.value = "about";
  backendVersion.value = "loading...";
  props.networkManager.requestManager
    .getBackendVersion()
    .then((v) => {
      if (typeof v === "string") {
        backendVersion.value = v;
      } else {
        backendVersion.value = v.version ?? "unknown";
        webuiVersion.value = v.webuiVersion ?? webuiVersion.value;
      }
    })
    .catch(() => (backendVersion.value = "unknown"));
}

function onOpenFASTAFile() {
  pendingFastaFilename.value = null;
  fastaLinkReport.value = null;
  openingFASTAFile.value = true;
}

function onFASTAFileDismissed() {
  openingFASTAFile.value = false;
  pendingFastaFilename.value = null;
  fastaLinkReport.value = null;
}

function onGatewayChanged() {
  props.networkManager.onHostChanged(gatewayAddress.value);
}

function onAGPFileDismissed() {
  openingAGPFile.value = false;
}

function onJuiceboxAssemblyFileDismissed(): void {
  openingJuiceboxAssemblyFile.value = false;
  pendingJuiceboxAssemblyFilename.value = "";
}

function onJuiceboxAssemblyFastaFileDismissed(): void {
  openingJuiceboxAssemblyFastaFile.value = false;
  pendingJuiceboxAssemblyFastaFilename.value = "";
  void applyPendingJuiceboxAssembly().catch((error) => {
    toast.error(String(error));
  });
}

async function onFileSelected(filename: string) {
  if (filename && filename !== "") {
    const lowered = filename.toLowerCase();
    if (lowered.endsWith(".hict") || lowered.endsWith(".hict.hdf5")) {
      openingFile.value = false;
      emit("selected", filename);
    } else if (
      lowered.endsWith(".hic") ||
      lowered.endsWith(".cool") ||
      lowered.endsWith(".mcool") ||
      isHictkLoadFilename(lowered)
    ) {
      try {
        const resolution =
          await props.networkManager.requestManager.resolveMatrixSource(
            filename
          );
        if (resolution.action === "REUSE_CONVERTED") {
          openingFile.value = false;
          resolution.warnings.forEach((warning) => toast(warning));
          emit("selected", resolution.resolvedFilename);
          return;
        }
        openingFile.value = false;
        coolerToConvert.value = filename;
        convertingCoolers.value = true;
        resolution.warnings.forEach((warning) =>
          toast(warning, {
            style: {
              "background-color": "lightyellow",
              color: "black",
            },
          })
        );
      } catch (error) {
        errorMessage.value = error;
      }
    } else if (lowered.endsWith(".agp")) {
      openAGP(filename);
    } else if (lowered.endsWith(".fasta") || lowered.endsWith(".fa")) {
      linkFASTA(filename);
    } else {
      errorMessage.value = "Unknown type of file to be opened: " + filename;
      toast.error(String(errorMessage.value));
    }
  }
}

function isOpenableAssemblyFilename(name: string): boolean {
  const lowered = name.toLowerCase();
  return (
    lowered.endsWith(".hict.hdf5") ||
    lowered.endsWith(".hic") ||
    lowered.endsWith(".cool") ||
    lowered.endsWith(".mcool") ||
    isHictkLoadFilename(lowered)
  );
}

function stripCompressionSuffix(name: string): string {
  return name.replace(/\.(gz|bgz|xz|zst|zstd|bz2|lz4|lzo)$/i, "");
}

function isHictkLoadFilename(name: string): boolean {
  const lowered = stripCompressionSuffix(name.toLowerCase());
  return (
    lowered.endsWith(".matrix") ||
    lowered.endsWith(".coo") ||
    lowered.endsWith(".coo.tsv") ||
    lowered.endsWith(".coo.csv") ||
    lowered.endsWith(".tsv") ||
    lowered.endsWith(".csv") ||
    lowered.endsWith(".bg2") ||
    lowered.endsWith(".bedgraph2") ||
    lowered.endsWith(".bedpe") ||
    lowered.endsWith(".pairs") ||
    lowered.endsWith(".validpairs")
  );
}

function openAGP(filename: string) {
  props.networkManager.requestManager
    .loadAGP(new LoadAGPRequest({ agpFilename: filename }))
    .then(() => {
      openingFile.value = false;
      openingAGPFile.value = false;
      errorMessage.value = null;
      emit("agpLoaded", filename);
      toast.message("Assembly loaded from AGP file " + filename);
    })
    .catch((e) => {
      errorMessage.value = e;
    });
}

function isAssemblyFilename(name: string): boolean {
  const lowered = name.toLowerCase();
  return lowered.endsWith(".agp") || lowered.endsWith(".assembly");
}

async function applyPendingJuiceboxAssembly(): Promise<void> {
  const assemblyFilename = pendingJuiceboxAssemblyFilename.value;
  if (!assemblyFilename) {
    return;
  }
  const fastaFilename = pendingJuiceboxAssemblyFastaFilename.value;
  if (!fastaFilename) {
    toast(
      "No original FASTA selected. Applying the Juicebox assembly in best-effort mode; contig-border issues may remain.",
      {
        style: {
          "background-color": "lightyellow",
          color: "black",
        },
      }
    );
  }
  const agpFilename = assemblyFilename.replace(/\.assembly$/i, ".agp");
  await props.networkManager.requestManager.applyJuiceboxAssembly(
    new ApplyJuiceboxAssemblyRequest({
      assemblyFilename,
      fastaFilename: fastaFilename || undefined,
    })
  );
  emit("agpLoaded", agpFilename);
  if (fastaFilename) {
    emit("fastaLinked", fastaFilename);
  }
  pendingJuiceboxAssemblyFilename.value = "";
  pendingJuiceboxAssemblyFastaFilename.value = "";
  openingJuiceboxAssemblyFile.value = false;
  openingJuiceboxAssemblyFastaFile.value = false;
}

function onJuiceboxAssemblySelected(filename: string): void {
  pendingJuiceboxAssemblyFilename.value = filename;
  openingJuiceboxAssemblyFile.value = false;
  const wantsFasta = window.confirm(
    "Select an original FASTA for exact contig matching? It is optional, but recommended when you have the contig-level FASTA used to build this Juicebox assembly."
  );
  if (wantsFasta) {
    openingJuiceboxAssemblyFastaFile.value = true;
    return;
  }
  void applyPendingJuiceboxAssembly().catch((error) => {
    toast.error(String(error));
  });
}

function onJuiceboxAssemblyFastaSelected(filename: string): void {
  pendingJuiceboxAssemblyFastaFilename.value = filename;
  openingJuiceboxAssemblyFastaFile.value = false;
  void applyPendingJuiceboxAssembly().catch((error) => {
    toast.error(String(error));
  });
}

function isFastaFilename(name: string): boolean {
  const lowered = name.toLowerCase();
  return (
    lowered.endsWith(".fasta") ||
    lowered.endsWith(".fa") ||
    lowered.endsWith(".fna") ||
    lowered.endsWith(".fas") ||
    lowered.endsWith(".fasta.gz") ||
    lowered.endsWith(".fa.gz") ||
    lowered.endsWith(".fna.gz") ||
    lowered.endsWith(".fas.gz")
  );
}

function cancelFastaLinkWarning(): void {
  pendingFastaFilename.value = null;
  fastaLinkReport.value = null;
}

function proceedFastaLinkWarning(): void {
  const filename = pendingFastaFilename.value;
  if (!filename) {
    cancelFastaLinkWarning();
    return;
  }
  linkFASTA(filename, true);
}

function linkFASTA(filename: string, allowMismatch = false) {
  props.networkManager.requestManager
    .linkFASTA(new LinkFASTARequest({ fastaFilename: filename, allowMismatch }))
    .then((response) => {
      if (response.requiresConfirmation && !allowMismatch) {
        openingFile.value = false;
        openingFASTAFile.value = false;
        pendingFastaFilename.value = filename;
        fastaLinkReport.value = response;
        return;
      }
      pendingFastaFilename.value = null;
      fastaLinkReport.value = null;
      openingFile.value = false;
      openingFASTAFile.value = false;
      errorMessage.value = null;
      lastLinkedFastaFilename.value = filename;
      emit("fastaLinked", filename);
      response.warnings.forEach((warning) =>
        toast(warning, {
          style: {
            "background-color": "lightyellow",
            color: "black",
          },
        })
      );
      toast.message("Linked FASTA file " + filename);
    })
    .catch((e) => {
      errorMessage.value = e;
    });
}

watch(
  () => errorMessage.value,
  (message) => {
    if (message) {
      toast.error(message);
    }
  }
);

watch(
  () => binaryTileTransportEnabled.value,
  () => {
    props.mapManager?.reloadTiles();
  }
);

onMounted(() => {
  void refreshNativeProcessingStatus();
  void refreshConversionToolchainStatus();
});

function onFASTAFileSelected() {
  openingFASTAFile.value = false;
}

function onAGPFileSelected() {
  openingAGPFile.value = false;
}

function onAssemblyFASTARequest() {
  props.networkManager.requestManager
    .getFASTAForAssembly(new GetFastaForAssemblyRequest())
    .then((data) => {
      // eslint-disable-next-line
      const blob = new Blob([data as BlobPart], { type: "text/plain" });
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = `assembly.fasta`;
      link.click();
    });
}

function onSelectionFASTARequest() {
  props.mapManager?.eventManager.onExportFASTAForSelectionClicked();
}

function onAssemblyAGPRequest() {
  props.networkManager.requestManager
    .getAGPForAssembly(new GetAGPForAssemblyRequest())
    .then((data) => {
      // eslint-disable-next-line
      const blob = new Blob([data as BlobPart], { type: "text/plain" });
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = `assembly.agp`;
      link.click();
    });
}
</script>

<style scoped>
.navbar-bar {
  /* Navbar */

  /* Auto layout */
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  padding: 8px 16px;

  /* width: 1440px; */
  width: 100%;
  height: 56px;

  background: var(--hict-ui-bg, #f8f9fa) !important;
  color: var(--hict-ui-fg, #1f2937);

  /* Shadows/02. Regular */
  box-shadow: 0px 8px 16px rgba(0, 0, 0, 0.15);

  /* Inside auto layout */
  flex: none;
  order: 0;
  flex-grow: 0;
}

.navbar-bar :deep(.navbar-brand),
.navbar-bar :deep(.nav-link),
.navbar-bar :deep(.dropdown-item),
.navbar-bar :deep(.form-check-label),
.navbar-bar :deep(#set-gateway-btn),
.navbar-bar :deep(button),
.navbar-bar :deep(input) {
  color: var(--hict-ui-fg, #1f2937) !important;
  text-shadow: 0 0 1px var(--hict-ui-outline, rgba(255, 255, 255, 0.9));
}

.navbar-bar :deep(.dropdown-menu) {
  border-color: var(--hict-ui-border, rgba(15, 23, 38, 0.22));
}

.hict-navbar-brand {
  align-items: center;
  display: inline-flex;
  gap: 8px;
  min-height: 32px;
}

.hict-navbar-logo {
  border-radius: 6px;
  display: block;
  flex: 0 0 auto;
  height: 28px;
  object-fit: cover;
  width: 28px;
}

#connection-settings-menu-dropdown {
  width: 400%;
}

#set-gateway-btn {
  margin-right: 30px;
}

.about-backdrop,
.settings-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.about-modal,
.settings-modal {
  background: var(--hict-surface-bg, #ffffff);
  color: var(--hict-surface-fg, #1f2937);
  border: 1px solid var(--hict-surface-border, rgba(15, 23, 38, 0.18));
  border-radius: 10px;
  width: min(840px, 90vw);
  max-height: 90vh;
  overflow: auto;
  box-shadow: var(--hict-surface-shadow, 0 24px 48px rgba(0, 0, 0, 0.2));
  padding: 20px 24px;
}

.about-header,
.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.about-body,
.settings-body {
  margin-top: 12px;
}

.settings-footer {
  border-top: 1px solid var(--hict-surface-border, rgba(15, 23, 38, 0.14));
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding-top: 14px;
}

.osd-settings-modal {
  width: min(560px, 92vw);
}

.about-tabs {
  display: flex;
  gap: 8px;
  margin-top: 14px;
  border-bottom: 1px solid var(--hict-surface-border, rgba(15, 23, 38, 0.18));
}

.about-tab {
  appearance: none;
  background: transparent;
  border: 0;
  color: var(--hict-surface-fg, #1f2937);
  cursor: pointer;
  font-weight: 600;
  padding: 8px 12px;
  position: relative;
}

.about-tab.active::after {
  background: #0d6efd;
  border-radius: 999px;
  bottom: -1px;
  content: "";
  height: 3px;
  left: 10px;
  position: absolute;
  right: 10px;
}

.about-authors {
  margin-bottom: 8px;
}

.about-note {
  color: var(--hict-surface-muted, #6b7280);
  margin-bottom: 12px;
}

.about-license {
  background: var(--hict-control-bg, #f8f9fa);
  border: 1px solid var(--hict-surface-border, rgba(15, 23, 38, 0.12));
  color: var(--hict-surface-fg, #1f2937);
  padding: 12px;
  border-radius: 6px;
  white-space: pre-wrap;
  font-size: 12px;
  margin-top: 12px;
}

.about-versions {
  margin-top: 12px;
  display: grid;
  gap: 4px;
}

.attribution-panel {
  display: grid;
  gap: 18px;
}

.attribution-section h3 {
  font-size: 15px;
  margin: 0 0 8px;
}

.attribution-card {
  background: var(--hict-control-bg, rgba(248, 249, 250, 0.88));
  border: 1px solid var(--hict-surface-border, rgba(15, 23, 38, 0.12));
  border-radius: 8px;
  color: var(--hict-surface-fg, #1f2937);
  display: grid;
  font-size: 13px;
  gap: 3px;
  margin-bottom: 8px;
  padding: 10px 12px;
}

.attribution-title {
  font-weight: 700;
}

.attribution-links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-top: 4px;
}

.attribution-links a {
  color: #0d6efd;
  font-weight: 600;
  text-decoration: none;
}

.attribution-links a:hover {
  text-decoration: underline;
}

.attribution-notes {
  margin: 0;
  padding-left: 18px;
}

.attribution-notes li {
  margin-bottom: 6px;
}

.native-processing-status {
  font-size: 12px;
  line-height: 1.25;
  margin-left: 0;
  margin-top: 2px;
  max-width: 260px;
  white-space: normal;
}

.resolution-settings-menu {
  min-width: 18rem;
}

.resolution-limit-grid {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: 1fr 1fr;
}

.resolution-list {
  display: grid;
  gap: 0.25rem;
  max-height: 18rem;
  overflow: auto;
}

.osd-field-row {
  align-items: center;
  display: flex;
  gap: 0.5rem;
  justify-content: space-between;
  margin-top: 0.35rem;
}

.osd-field-row .form-check-label {
  font-size: 0.86rem;
  white-space: nowrap;
}
</style>
