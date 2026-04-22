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
      <a class="navbar-brand" href="#">HiCT</a>

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
                <a class="dropdown-item" href="#" @click="onOpenFile"
                  >Open...</a
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
              <li><hr class="dropdown-divider" /></li>
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
    :file-type="'.hict.hdf5, .hic, .cool, .mcool'"
    :note="'Files in .hic, .cool, and .mcool formats must be converted into HiCT internal format before opening.'"
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
  <CoolerConverter
    :network-manager="networkManager"
    :initial-cooler-filename="coolerToConvert"
    v-if="convertingCoolers"
    @dismissed="onConvertCoolersDismissed"
  >
  </CoolerConverter>
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
  <FastaLinkWarningModal
    v-if="fastaLinkReport"
    :report="fastaLinkReport"
    @cancel="cancelFastaLinkWarning"
    @proceed="proceedFastaLinkWarning"
  />
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
      <div class="about-body">
        <p class="about-authors">
          Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii
          Dravgelis and Computer Technologies Laboratory ITMO University team.
        </p>
        <pre class="about-license">{{ licenseText }}</pre>
        <div class="about-versions">
          <div><strong>Backend:</strong> {{ backendVersion }}</div>
          <div><strong>WebUI:</strong> {{ webuiVersion }}</div>
          <div><strong>Commit:</strong> {{ webuiCommit }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { NetworkManager } from "@/app/core/net/NetworkManager.js";
import { defineAsyncComponent, Ref, ref, watch } from "vue";
import {
  GetAGPForAssemblyRequest,
  GetFastaForAssemblyRequest,
  LinkFASTARequest,
  LoadAGPRequest,
} from "@/app/core/net/api/request";
import { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import CoolerConverter from "./CoolerConverter.vue";
import UniversalFileSelector from "@/app/ui/components/upper_ribbon/UniversalFileSelector.vue";
import TrackManager from "@/app/ui/components/upper_ribbon/TrackManager.vue";
import FastaLinkWarningModal from "@/app/ui/components/upper_ribbon/FastaLinkWarningModal.vue";
import WorkerDiagnosticsModal from "@/app/ui/components/upper_ribbon/WorkerDiagnosticsModal.vue";
import { toast } from "vue-sonner";
import { storeToRefs } from "pinia";
import { useErrorToastStore } from "@/app/stores/errorToastStore";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import type { FastaLinkResponse } from "@/app/core/net/api/response";
import pkg from "../../../../../package.json";
const openingFile = ref(false);
const openingFASTAFile = ref(false);
const openingAGPFile = ref(false);
const convertingCoolers = ref(false);
const coolerToConvert = ref<string | undefined>(undefined);
const trackManagerOpen = ref(false);
const renderingPipelineOpen = ref(false);
const workerDiagnosticsOpen = ref(false);
const saving = ref(false);
const gatewayAddress: Ref<string> = ref("http://localhost:5000/");
const aboutOpen = ref(false);
const pendingFastaFilename = ref<string | null>(null);
const fastaLinkReport = ref<FastaLinkResponse | null>(null);
const backendVersion = ref("loading...");
const webuiVersion = ref(String((pkg as { version?: string })?.version ?? "unknown"));
const webuiCommit = ref("unknown");
const RenderingPipelineModal = defineAsyncComponent(
  () => import("@/app/ui/components/upper_ribbon/RenderingPipelineModal.vue")
);
const licenseText = `MIT License

Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis and Computer Technologies Laboratory ITMO University team.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const emit = defineEmits<{
  (e: "selected", filename: string): void;
  (e: "closed"): void;
  (e: "attached"): void;
  (e: "saveSession"): void;
  (e: "openSession", file: File): void;
  (e: "agpLoaded", filename: string): void;
  (e: "fastaLinked", filename: string): void;
}>();

const props = defineProps<{
  networkManager: NetworkManager;
  mapManager?: ContactMapManager;
}>();

const errorMessage: Ref<unknown | null> = ref(null);
const errorToastStore = useErrorToastStore();
const uiSettingsStore = useUiSettingsStore();
const { requestErrorToastsEnabled, webuiErrorToastsEnabled } =
  storeToRefs(errorToastStore);
const { customZoomSliderEnabled, binaryTileTransportEnabled } =
  storeToRefs(uiSettingsStore);

function onOpenFile() {
  openingFile.value = true;
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

function onOpenApiDocs(): void {
  const base = props.networkManager.host.replace(/\/+$/, "");
  window.open(`${base}/api/v1/`, "_blank", "noopener,noreferrer");
}

function onLoadAGP() {
  openingAGPFile.value = true;
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

function onConvertCoolersDismissed(): void {
  coolerToConvert.value = undefined;
  convertingCoolers.value = false;
}

function openAbout(): void {
  aboutOpen.value = true;
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

function onFileSelected(filename: string) {
  if (filename && filename !== "") {
    const lowered = filename.toLowerCase();
    if (lowered.endsWith(".hict") || lowered.endsWith(".hict.hdf5")) {
      openingFile.value = false;
      emit("selected", filename);
    } else if (
      lowered.endsWith(".hic") ||
      lowered.endsWith(".cool") ||
      lowered.endsWith(".mcool")
    ) {
      openingFile.value = false;
      coolerToConvert.value = filename;
      convertingCoolers.value = true;
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
    lowered.endsWith(".mcool")
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

#connection-settings-menu-dropdown {
  width: 400%;
}

#set-gateway-btn {
  margin-right: 30px;
}

.about-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.about-modal {
  background: #ffffff;
  border-radius: 10px;
  width: min(720px, 90vw);
  max-height: 90vh;
  overflow: auto;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.2);
  padding: 20px 24px;
}

.about-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.about-body {
  margin-top: 12px;
}

.about-authors {
  margin-bottom: 12px;
}

.about-license {
  background: #f8f9fa;
  padding: 12px;
  border-radius: 6px;
  white-space: pre-wrap;
  font-size: 12px;
}

.about-versions {
  margin-top: 12px;
  display: grid;
  gap: 4px;
}
</style>
