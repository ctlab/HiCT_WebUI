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
  <Toaster position="bottom-right" richColors closeButton />
  <!-- <button @click="() => toast('My first toast')">Render a toast</button> -->
  <div class="main-ui-component">
    <div v-if="openProgressVisible">
      <div class="modal-backdrop fade show open-progress-backdrop"></div>
      <div
        class="modal fade show open-progress-modal"
        style="display: block"
        tabindex="-1"
        role="dialog"
      >
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Opening file</h5>
              <button
                type="button"
                class="btn-close"
                @click="closeOpenProgress"
              ></button>
            </div>
            <div class="modal-body">
              <div class="mb-2">{{ openProgressStage }}</div>
              <div class="progress">
                <div
                  class="progress-bar"
                  role="progressbar"
                  :style="{ width: `${openProgressPct}%` }"
                  :aria-valuenow="openProgressPct"
                  aria-valuemin="0"
                  aria-valuemax="100"
                >
                  {{ openProgressPct }}%
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button
                type="button"
                class="btn btn-secondary"
                @click="closeOpenProgress"
              >
                Hide
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-if="coolerWeightsNaNPromptVisible">
      <div class="modal-backdrop fade show cooler-weights-nan-backdrop"></div>
      <div
        class="modal fade show cooler-weights-nan-modal"
        style="display: block"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cooler-weights-nan-title"
      >
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 id="cooler-weights-nan-title" class="modal-title">
                Cooler weights contain NaNs
              </h5>
              <button
                type="button"
                class="btn-close"
                aria-label="Close"
                @click="
                  chooseCoolerWeightsNaNPolicy('DISABLE_WEIGHTS', false)
                "
              ></button>
            </div>
            <div class="modal-body">
              <p>
                HiCT detected
                {{ visualizationOptionsStore.coolerWeightsNaNCount }}
                non-finite Cooler balancing weight{{
                  visualizationOptionsStore.coolerWeightsNaNCount === 1
                    ? ""
                    : "s"
                }}. These usually come from failed balancing iterations and can
                make the map disappear when Cooler weights are enabled.
              </p>
              <p class="mb-0">
                Choose how HiCT should render this dataset.
              </p>
            </div>
            <div class="modal-footer cooler-weights-nan-actions">
              <button
                type="button"
                class="btn btn-primary"
                @click="
                  chooseCoolerWeightsNaNPolicy('DISABLE_WEIGHTS', false)
                "
              >
                Do not use Cooler weights
              </button>
              <button
                type="button"
                class="btn btn-success"
                @click="
                  chooseCoolerWeightsNaNPolicy('REPLACE_NANS_WITH_ONE', true)
                "
              >
                Replace NaNs with weight 1.0
              </button>
              <button
                type="button"
                class="btn btn-danger"
                @click="
                  chooseCoolerWeightsNaNPolicy('REPLACE_NANS_WITH_ZERO', true)
                "
              >
                Replace NaNs with weight 0
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <UpperFrame
      :networkManager="networkManager"
      :mapManager="mapManager"
      @selected="onFileSelected"
      @closed="onClosed"
      @attached="onAttached"
      @saveSession="onSaveSession"
      @openSession="onOpenSession"
      @agpLoaded="onAgpLoaded"
      @fastaLinked="onFastaLinked"
      @wizardRequested="wizardOpen = true"
    ></UpperFrame>
    <WorkspaceComponent
      :mapManager="mapManager"
      :filename="filename"
    ></WorkspaceComponent>
    <NotificationCenterModal></NotificationCenterModal>
    <FileWizardModal
      v-if="wizardOpen"
      :network-manager="networkManager"
      :map-manager="mapManager"
      :open-primary-dataset="openPrimaryDatasetFromWizard"
      @dismissed="wizardOpen = false"
    />
    <div
      class="toast-container position-absolute top-0 end-0 p-3"
      id="toasts-container"
    ></div>
  </div>
</template>

<script setup lang="ts">
import UpperFrame from "@/app/ui/components/upper_ribbon/UpperFrame.vue";
import {
  ContactMapManager,
  // type ContactMapManagerOptions,
} from "@/app/core/mapmanagers/ContactMapManager";
import { onMounted, onUnmounted, ref, watch, type Ref } from "vue";
import { NetworkManager } from "@/app/core/net/NetworkManager";
import defaultOptions from "@/app/core/visualization/colormap/default_options.json";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import { useStyleStore } from "@/app/stores/styleStore";
import SimpleLinearGradient from "@/app/core/visualization/colormap/SimpleLinearGradient";
import VisualizationOptions, {
  type CoolerWeightsNaNPolicy,
} from "@/app/core/visualization/VisualizationOptions";
import { ColorTranslator } from "colortranslator";
import { LoadAGPRequest } from "@/app/core/net/api/request";
import { LinkFASTARequest } from "@/app/core/net/api/request";
import NotificationCenterModal from "@/app/ui/components/notifications/NotificationCenterModal.vue";
import FileWizardModal from "@/app/ui/components/upper_ribbon/FileWizardModal.vue";

import WorkspaceComponent from "@/app/ui/components/workspace/WorkspaceComponent.vue";
import { Toaster, toast } from "vue-sonner";
import { storeToRefs } from "pinia";
import { usehtmlElementReferencesStore } from "../stores/htmlElementReferencesStore";
import {
  useSessionStore,
  type SessionSavedLocation,
  type SessionVisualizationPreset,
} from "@/app/stores/sessionStore";
import { useMatrixViewStore } from "@/app/stores/matrixViewStore";
import {
  dismissTopmostEscDialog,
  hasAnyOpenEscDialog,
  useEscDismissableDialog,
} from "@/app/ui/escapeDialogRegistry";

// Reactively use these refs only inside component
// Pass them to Map Manager on creation as values, not Refs as objects
// Get notifications about state change using event handlers in MainComponent
// Change values in managers using their callbacks and watches in MainComponent

const filename: Ref<string | undefined> = ref("");
const fastaFilename: Ref<string | undefined> = ref("");
const tileSize: Ref<number> = ref(256);
const contigBorderColor: Ref<string> = ref("ffccee");
const mapManager: Ref<ContactMapManager | undefined> = ref(undefined);
const networkManager: NetworkManager = new NetworkManager(
  "http://localhost:5000/",
  undefined
);
const visualizationOptionsStore = useVisualizationOptionsStore();
const stylesStore = useStyleStore();
const { mapBackgroundColor } = storeToRefs(stylesStore);
const sessionStore = useSessionStore();
const matrixViewStore = useMatrixViewStore();

const htmlElementReferencesStore = usehtmlElementReferencesStore();
const { miniMapTarget } = storeToRefs(htmlElementReferencesStore);
const lastAgpFilename: Ref<string> = ref("");
let openProgressTimer: number | undefined;
const openProgressVisible = ref(false);
const openProgressStage = ref("starting");
const openProgressPct = ref(0);
let openProgressInFlight = false;
const wizardOpen = ref(false);
const coolerWeightsNaNPromptVisible = ref(false);
let lastCoolerWeightsNaNPromptKey = "";

useEscDismissableDialog({
  priority: 1050,
  isOpen: () => openProgressVisible.value,
  requestClose: closeOpenProgress,
});

useEscDismissableDialog({
  priority: 1060,
  isOpen: () => coolerWeightsNaNPromptVisible.value,
  requestClose: () =>
    void chooseCoolerWeightsNaNPolicy("DISABLE_WEIGHTS", false),
});

function startOpenProgress() {
  if (openProgressTimer !== undefined) {
    return;
  }
  openProgressStage.value = "starting";
  openProgressPct.value = 0;
  openProgressVisible.value = true;
  openProgressTimer = window.setInterval(() => {
    if (openProgressInFlight) return;
    openProgressInFlight = true;
    networkManager.requestManager
      .getOpenProgress()
      .then((p) => {
        openProgressStage.value = p.stage ?? "working";
        openProgressPct.value = Math.max(
          0,
          Math.min(100, Math.round((p.progress ?? 0) * 100))
        );
      })
      .catch(() => undefined)
      .finally(() => {
        openProgressInFlight = false;
      });
  }, 500);
}

function stopOpenProgress() {
  if (openProgressTimer !== undefined) {
    window.clearInterval(openProgressTimer);
    openProgressTimer = undefined;
  }
  openProgressInFlight = false;
  openProgressVisible.value = false;
}

function closeOpenProgress() {
  openProgressVisible.value = false;
}

function handleGlobalEscape(event: KeyboardEvent): void {
  if (event.key !== "Escape" || event.repeat) {
    return;
  }
  if (dismissTopmostEscDialog()) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (!hasAnyOpenEscDialog()) {
    mapManager.value?.eventManager.resetSelection();
    event.preventDefault();
    event.stopPropagation();
  }
}

function safeColorTranslator(
  value: unknown,
  fallback: string
): ColorTranslator {
  if (typeof value !== "string" || value.length > 128) {
    return new ColorTranslator(fallback, { legacyCSS: true });
  }
  try {
    return new ColorTranslator(value, { legacyCSS: true });
  } catch {
    return new ColorTranslator(fallback, { legacyCSS: true });
  }
}

async function maybePromptCoolerWeightsNaNs(): Promise<void> {
  const manager = mapManager.value;
  if (!manager) {
    return;
  }
  const options = await manager.visualizationManager
    .fetchVisualizationOptions()
    .catch(() => null);
  if (!options?.coolerWeightsHaveNaNs) {
    return;
  }
  const key = `${filename.value ?? ""}:${options.coolerWeightsNaNCount}`;
  if (lastCoolerWeightsNaNPromptKey === key) {
    return;
  }
  lastCoolerWeightsNaNPromptKey = key;
  coolerWeightsNaNPromptVisible.value = true;
}

async function chooseCoolerWeightsNaNPolicy(
  policy: CoolerWeightsNaNPolicy,
  keepWeights: boolean
): Promise<void> {
  coolerWeightsNaNPromptVisible.value = false;
  visualizationOptionsStore.coolerWeightsNaNPolicy = policy;
  visualizationOptionsStore.applyCoolerWeights = keepWeights;
  const manager = mapManager.value;
  if (!manager) {
    return;
  }
  try {
    await manager.visualizationManager.sendVisualizationOptionsToServer({
      skipAutoThresholdRefresh: true,
      preserveCustomPipeline: true,
    });
    await manager.visualizationManager.applyOpeningFullMapQuantileThreshold();
    await manager.reloadTilesFromBackend();
    await manager.stabilizeInitialViewport({ fit: false });
  } catch (error) {
    const message =
      (error as { response?: { data?: { error?: string } }; message?: string })
        ?.response?.data?.error ??
      (error as { message?: string })?.message ??
      "Failed to apply Cooler weight policy";
    toast.error(message);
  }
}

function syncUiChromePalette(): void {
  const root = document.documentElement;
  root.style.setProperty("--hict-ui-bg", "rgba(243, 246, 250, 0.98)");
  root.style.setProperty("--hict-ui-fg", "rgba(24, 30, 38, 0.95)");
  root.style.setProperty("--hict-ui-outline", "rgba(255, 255, 255, 0.92)");
  root.style.setProperty("--hict-ui-muted", "rgba(75, 82, 92, 0.86)");
  root.style.setProperty("--hict-ui-border", "rgba(15, 23, 38, 0.22)");
  root.style.setProperty("--hict-surface-bg", "rgba(255, 255, 255, 0.98)");
  root.style.setProperty(
    "--hict-surface-bg-muted",
    "rgba(248, 250, 252, 0.98)"
  );
  root.style.setProperty("--hict-surface-fg", "rgba(18, 25, 35, 0.96)");
  root.style.setProperty("--hict-surface-muted", "rgba(73, 84, 99, 0.88)");
  root.style.setProperty(
    "--hict-surface-border",
    "rgba(15, 23, 38, 0.18)"
  );
  root.style.setProperty(
    "--hict-surface-shadow",
    "0 20px 55px rgba(15, 23, 38, 0.18)"
  );
  root.style.setProperty("--hict-surface-close-filter", "none");
}

function resetState() {
  mapManager.value?.dispose();
  filename.value = "";
  fastaFilename.value = "";
  mapManager.value = undefined;
  matrixViewStore.reset();
}

function onClosed() {
  networkManager.requestManager
    .closeFile()
    .catch(() => undefined)
    .finally(() => resetState());
}

function onAttached() {
  networkManager.requestManager
    .attachSession()
    .then(
      ({
        filename: attachedName,
        fastaFilename: attachedFastaName,
        response,
      }) => {
        if (!attachedName) {
          toast.error("No active session to attach");
          return;
        }
        mapManager.value?.dispose();
        filename.value = attachedName;
        fastaFilename.value = attachedFastaName ?? "";
        const newManager = new ContactMapManager({
          response,
          filename: attachedName,
          fastaFilename: attachedFastaName ?? "",
          tileSize: tileSize.value,
          contigBorderColor: contigBorderColor.value,
          mapTargetSelector: "hic-contact-map",
          networkManager: networkManager,
          minimapTarget: miniMapTarget,
        });
        mapManager.value = newManager;
        networkManager.mapManager = mapManager.value;
        newManager.initializeMap();
        void newManager
          .stabilizeInitialViewport({ fit: false })
          .then(() => maybePromptCoolerWeightsNaNs());
        toast.success("Attached to session " + attachedName);
      }
    )
    .catch((err) => {
      const message =
        err?.response?.data?.error ??
        err?.message ??
        "Failed to attach session";
      toast.error(message);
    });
}

async function openFileWithOptions(
  fname: string,
  ffname: string | undefined,
  options?: { applyDefaultPreset?: boolean }
): Promise<void> {
  startOpenProgress();
  try {
    const openFileResponse = await networkManager.requestManager.openFile(
      fname,
      ffname
    );
    filename.value = fname;
    fastaFilename.value = ffname ?? "";
    mapManager.value?.dispose();
    const newManager = new ContactMapManager({
      response: openFileResponse,
      filename: fname,
      fastaFilename: ffname ?? "",
      tileSize: tileSize.value,
      contigBorderColor: contigBorderColor.value,
      mapTargetSelector: "hic-contact-map",
      networkManager: networkManager,
      minimapTarget: miniMapTarget,
    });
    mapManager.value = newManager;
    networkManager.mapManager = mapManager.value;
    newManager.initializeMap();
    await newManager.stabilizeInitialViewport({ fit: true });
    if (options?.applyDefaultPreset !== false) {
      await applyDefaultVisualizationPreset();
    } else {
      await maybePromptCoolerWeightsNaNs();
    }
    if (ffname && ffname.trim() !== "") {
      try {
        const linkResponse = await networkManager.requestManager.linkFASTA(
          new LinkFASTARequest({ fastaFilename: ffname, allowMismatch: true })
        );
        linkResponse.warnings.forEach((warning) =>
          toast(warning, {
            style: {
              "background-color": "lightyellow",
              color: "black",
            },
          })
        );
      } catch (error) {
        console.error(error);
        toast.error("Failed to link FASTA file " + ffname);
      }
    }
  } finally {
    stopOpenProgress();
  }
}

async function openPrimaryDatasetFromWizard(
  fname: string,
  ffname?: string,
  options?: { applyDefaultPreset?: boolean }
): Promise<void> {
  await openFileWithOptions(fname, ffname, options);
}

function displayNewMap() {
  const fname = filename.value;
  const ffname = fastaFilename.value;
  if (!fname) {
    const message =
      "Cannot open non-specified files: filename=" +
      fname +
      " fastaFilename=" +
      ffname;
    toast.error(message);
    throw new Error(message);
  }
  openFileWithOptions(fname, ffname)
    .then(() => {
      toast.success("Opened file " + fname);
    })
    .catch((a) => {
      console.log(a);
      toast.error(a);
      stopOpenProgress();
    });
}

async function applyDefaultVisualizationPreset(): Promise<void> {
  const presets =
    (
      defaultOptions as unknown as {
        data?: {
          savedLocations?: unknown[];
          savedVisualizationPresets?: unknown[];
        };
      }
    ).data?.savedLocations ??
    (
      defaultOptions as unknown as {
        data?: { savedVisualizationPresets?: unknown[] };
      }
    ).data?.savedVisualizationPresets ??
    [];
  if (!presets || presets.length === 0) {
    const manager = mapManager.value;
    if (manager) {
      await manager.visualizationManager.applyOpeningFullMapQuantileThreshold();
      await manager.reloadTilesFromBackend();
      await manager.stabilizeInitialViewport({ fit: false });
      await maybePromptCoolerWeightsNaNs();
    }
    return;
  }
  const first = presets[0] as Record<string, unknown>;
  const opt = (first["options"] as Record<string, unknown>) ?? {};
  const signalThresholds = first["signalThresholds"] as
    | { lowerSignalBound?: number; upperSignalBound?: number }
    | undefined;
  const trackStyles = first["trackStyles"] as
    | Record<string, unknown>
    | undefined;
  const cmap = (opt["colormap"] as Record<string, unknown>) ?? {};
  const startColor =
    (cmap["startColorRGBAString"] as string) ?? "rgba(0,255,0,0.0)";
  const endColor = (cmap["endColorRGBAString"] as string) ?? "rgba(0,96,0,1.0)";
  const minSignal = (cmap["minSignal"] as number) ?? 0;
  const maxSignal = (cmap["maxSignal"] as number) ?? 1;
  const preLogBase = (opt["preLogBase"] as number) ?? -1;
  const postLogBase = (opt["postLogBase"] as number) ?? 10;
  const applyCoolerWeights = (opt["applyCoolerWeights"] as boolean) ?? false;
  const resolutionScaling = (opt["resolutionScaling"] as boolean) ?? false;
  const resolutionLinearScaling =
    (opt["resolutionLinearScaling"] as boolean) ?? false;
  const autoThresholdEnabled =
    (opt["autoThresholdEnabled"] as boolean) ?? false;
  const autoThresholdQuantile =
    (opt["autoThresholdQuantile"] as number) ?? 0.995;
  const signalDisplayMode =
    opt["signalDisplayMode"] === "EXPECTED" ||
    opt["signalDisplayMode"] === "OBSERVED_OVER_EXPECTED"
      ? (opt["signalDisplayMode"] as "EXPECTED" | "OBSERVED_OVER_EXPECTED")
      : "OBSERVED";
  const cmapObj = new SimpleLinearGradient(
    safeColorTranslator(startColor, "rgba(0,255,0,0.0)"),
    safeColorTranslator(endColor, "rgba(0,96,0,1.0)"),
    minSignal,
    maxSignal
  );
  let finalCmap = cmapObj;
  if (
    signalThresholds &&
    typeof signalThresholds.lowerSignalBound === "number"
  ) {
    finalCmap = new SimpleLinearGradient(
      cmapObj.startColorRGBA,
      cmapObj.endColorRGBA,
      signalThresholds.lowerSignalBound,
      typeof signalThresholds.upperSignalBound === "number"
        ? signalThresholds.upperSignalBound
        : cmapObj.maxSignal
    );
  }
  visualizationOptionsStore.setVisualizationOptions(
    new VisualizationOptions(
      preLogBase,
      postLogBase,
      applyCoolerWeights,
      resolutionScaling,
      resolutionLinearScaling,
      finalCmap,
      autoThresholdEnabled,
      autoThresholdQuantile,
      signalDisplayMode
    )
  );
  const bg = (first["backgroundColor"] as string) ?? "rgba(255,255,255,1)";
  stylesStore.setMapBackground(safeColorTranslator(bg, "rgba(255,255,255,1)"));
  if (trackStyles && mapManager.value) {
    mapManager.value
      .getLayersManager()
      .applyTrackStylePreset(trackStyles as never);
  }
  const manager = mapManager.value;
  if (!manager) {
    return;
  }
  await manager.visualizationManager.sendVisualizationOptionsToServer({
    skipAutoThresholdRefresh: true,
  });
  await manager.visualizationManager.applyOpeningFullMapQuantileThreshold();
  await manager.reloadTilesFromBackend();
  await manager.stabilizeInitialViewport({ fit: false });
  await maybePromptCoolerWeightsNaNs();
}

function onAgpLoaded(filename: string): void {
  lastAgpFilename.value = filename;
  sessionStore.setLastAgpFilename(filename);
}

function onFastaLinked(filename: string): void {
  fastaFilename.value = filename;
}

function serializeCurrentVisualizationOptions(): Record<string, unknown> {
  const options = visualizationOptionsStore.asVisualizationOptions();
  const cmap = options.colormap;
  if (cmap instanceof SimpleLinearGradient) {
    return {
      preLogBase: options.preLogBase,
      postLogBase: options.postLogBase,
      applyCoolerWeights: options.applyCoolerWeights ?? false,
      resolutionScaling: options.resolutionScaling ?? false,
      resolutionLinearScaling: options.resolutionLinearScaling ?? false,
      autoThresholdEnabled: options.autoThresholdEnabled ?? false,
      autoThresholdQuantile: options.autoThresholdQuantile ?? 0.995,
      signalDisplayMode: options.signalDisplayMode ?? "OBSERVED",
      coolerWeightsNaNPolicy:
        options.coolerWeightsNaNPolicy ?? "REPLACE_NANS_WITH_ONE",
      coolerWeightsHaveNaNs: options.coolerWeightsHaveNaNs ?? false,
      coolerWeightsNaNCount: options.coolerWeightsNaNCount ?? 0,
      colormap: {
        colormapType: cmap.colormapType,
        startColorRGBAString: cmap.startColorRGBA.RGBA,
        endColorRGBAString: cmap.endColorRGBA.RGBA,
        minSignal: cmap.minSignal,
        maxSignal: cmap.maxSignal,
      },
    };
  }
  return {
    preLogBase: options.preLogBase,
    postLogBase: options.postLogBase,
    applyCoolerWeights: options.applyCoolerWeights ?? false,
    resolutionScaling: options.resolutionScaling ?? false,
    resolutionLinearScaling: options.resolutionLinearScaling ?? false,
    autoThresholdEnabled: options.autoThresholdEnabled ?? false,
    autoThresholdQuantile: options.autoThresholdQuantile ?? 0.995,
    signalDisplayMode: options.signalDisplayMode ?? "OBSERVED",
    coolerWeightsNaNPolicy:
      options.coolerWeightsNaNPolicy ?? "REPLACE_NANS_WITH_ONE",
    coolerWeightsHaveNaNs: options.coolerWeightsHaveNaNs ?? false,
    coolerWeightsNaNCount: options.coolerWeightsNaNCount ?? 0,
    colormap: {
      colormapType: options.colormap?.colormapType ?? "Unknown",
    },
  };
}

function onSaveSession(): void {
  const manager = mapManager.value;
  if (!manager) {
    toast.error("No open map to save session");
    return;
  }
  const view = manager.getView();
  const currentFilename =
    filename.value && filename.value.trim() !== ""
      ? filename.value
      : manager.getOptions().filename;
  const currentFastaFilename =
    fastaFilename.value && fastaFilename.value.trim() !== ""
      ? fastaFilename.value
      : manager.getOptions().fastaFilename;
  const session = {
    version: 1,
    filename: currentFilename ?? "",
    fastaFilename: currentFastaFilename ?? "",
    agpFilename: lastAgpFilename.value ?? "",
    visualizationOptions: serializeCurrentVisualizationOptions(),
    backgroundColor: mapBackgroundColor.value?.RGBA ?? "rgba(255,255,255,1)",
    trackStyles: manager.getLayersManager().getTrackStylePreset(),
    savedLocations: sessionStore.savedLocations,
    savedVisualizationPresets: sessionStore.savedVisualizationPresets,
    view: {
      center: view.getCenter(),
      resolution: view.getResolution(),
      rotation: view.getRotation(),
      bpResolution:
        manager.viewAndLayersManager.currentViewState.resolutionDesciptor
          .bpResolution,
    },
  };
  const blob = new Blob([JSON.stringify(session, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "hict_session.json";
  a.click();
  URL.revokeObjectURL(url);
}

async function resolveFilename(
  label: string,
  original: string,
  list: string[]
): Promise<string | null> {
  if (!original) return "";
  if (list.includes(original)) return original;
  const replacement = window.prompt(
    `${label} file '${original}' not found. Enter an alternative filename or leave empty to cancel:`
  );
  if (!replacement) return null;
  if (!list.includes(replacement)) {
    toast.error(`${label} file '${replacement}' not found`);
    return null;
  }
  return replacement;
}

function pathBasename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

function isHiCTMapFilename(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".hict.hdf5") || lower.endsWith(".hict");
}

function stripHiCTMapSuffix(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".hict.hdf5")) {
    return name.slice(0, -".hict.hdf5".length);
  }
  if (lower.endsWith(".hict")) {
    return name.slice(0, -".hict".length);
  }
  return name;
}

function sessionNameStem(sessionFileName: string): string {
  return pathBasename(sessionFileName)
    .replace(/\.json$/i, "")
    .replace(/(?:^|[._-])hict(?:[._-])?session$/i, "")
    .replace(/[._-]session$/i, "")
    .toLowerCase();
}

function scoreSessionMapCandidate(candidate: string, stem: string): number {
  if (!stem) return 0;
  const candidateBase = stripHiCTMapSuffix(pathBasename(candidate)).toLowerCase();
  const candidatePath = candidate.toLowerCase();
  if (candidateBase === stem) return 1000;
  if (candidateBase.startsWith(stem)) return 800;
  if (candidateBase.includes(stem)) return 700;
  if (stem.includes(candidateBase)) return 650;
  if (candidatePath.includes(`/${stem}/`)) return 500;
  if (candidatePath.includes(stem)) return 300;
  return 0;
}

async function resolveRequiredHiCTSessionFilename(
  original: string,
  list: string[],
  sessionFileName: string
): Promise<string | null> {
  if (original && original.trim() !== "") {
    return resolveFilename("HiCT", original, list);
  }

  const hictCandidates = list.filter(isHiCTMapFilename);
  if (hictCandidates.length === 1) {
    toast(
      `Session did not record a HiCT map filename; using ${hictCandidates[0]}`
    );
    return hictCandidates[0];
  }

  const stem = sessionNameStem(sessionFileName);
  const ranked = hictCandidates
    .map((candidate) => ({
      candidate,
      score: scoreSessionMapCandidate(candidate, stem),
    }))
    .sort(
      (a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate)
    );
  const likely = ranked.filter((entry) => entry.score > 0);
  const visibleCandidates = (likely.length > 0 ? likely : ranked)
    .slice(0, 10)
    .map((entry) => entry.candidate);
  const defaultCandidate = visibleCandidates[0] ?? "";
  const promptLines = [
    "This session does not record the HiCT map filename.",
    "Enter the relative .hict.hdf5 file path to open, or leave empty to cancel.",
  ];
  if (visibleCandidates.length > 0) {
    promptLines.push("", "Likely candidates:");
    visibleCandidates.forEach((candidate) => {
      promptLines.push(`- ${candidate}`);
    });
  }
  const replacement = window.prompt(promptLines.join("\n"), defaultCandidate);
  if (!replacement) return null;
  if (!list.includes(replacement)) {
    toast.error(`HiCT file '${replacement}' not found`);
    return null;
  }
  if (!isHiCTMapFilename(replacement)) {
    toast.error(`'${replacement}' is not a HiCT map file`);
    return null;
  }
  return replacement;
}

async function onOpenSession(file: File): Promise<void> {
  try {
    const text = await file.text();
    const session = JSON.parse(text) as Record<string, unknown>;
    const sessionFilename = (session["filename"] as string) ?? "";
    const sessionFasta = (session["fastaFilename"] as string) ?? "";
    const sessionAgp = (session["agpFilename"] as string) ?? "";

    const fileList = await networkManager.requestManager.listFiles();
    const fastaList = await networkManager.requestManager.listFASTAFiles();
    const agpList = await networkManager.requestManager.listAGPFiles();

    const resolvedFile = await resolveRequiredHiCTSessionFilename(
      sessionFilename,
      fileList,
      file.name
    );
    if (resolvedFile === null) return;

    const resolvedFasta = await resolveFilename(
      "FASTA",
      sessionFasta,
      fastaList
    );
    if (resolvedFasta === null) return;

    const resolvedAgp = await resolveFilename("AGP", sessionAgp, agpList);
    if (resolvedAgp === null) return;

    filename.value = resolvedFile ?? "";
    fastaFilename.value = resolvedFasta ?? "";
    await openFileWithOptions(filename.value, fastaFilename.value);

    if (resolvedAgp) {
      await networkManager.requestManager.loadAGP(
        new LoadAGPRequest({ agpFilename: resolvedAgp })
      );
      lastAgpFilename.value = resolvedAgp;
      sessionStore.setLastAgpFilename(resolvedAgp);
    }

    const visRaw = session["visualizationOptions"] as Record<string, unknown>;
    if (visRaw) {
      const cmap = (visRaw["colormap"] as Record<string, unknown>) ?? {};
      const startColor =
        (cmap["startColorRGBAString"] as string) ?? "rgba(0,255,0,0.0)";
      const endColor =
        (cmap["endColorRGBAString"] as string) ?? "rgba(0,96,0,1.0)";
      const minSignal = (cmap["minSignal"] as number) ?? 0;
      const maxSignal = (cmap["maxSignal"] as number) ?? 1;
      const preLogBase = (visRaw["preLogBase"] as number) ?? -1;
      const postLogBase = (visRaw["postLogBase"] as number) ?? 10;
      const applyCoolerWeights =
        (visRaw["applyCoolerWeights"] as boolean) ?? false;
      const resolutionScaling =
        (visRaw["resolutionScaling"] as boolean) ?? false;
      const resolutionLinearScaling =
        (visRaw["resolutionLinearScaling"] as boolean) ?? false;
      const autoThresholdEnabled =
        (visRaw["autoThresholdEnabled"] as boolean) ?? false;
      const autoThresholdQuantile =
        (visRaw["autoThresholdQuantile"] as number) ?? 0.995;
      const signalDisplayMode =
        visRaw["signalDisplayMode"] === "EXPECTED" ||
        visRaw["signalDisplayMode"] === "OBSERVED_OVER_EXPECTED"
          ? (visRaw["signalDisplayMode"] as "EXPECTED" | "OBSERVED_OVER_EXPECTED")
          : "OBSERVED";
      const coolerWeightsNaNPolicy =
        visRaw["coolerWeightsNaNPolicy"] === "DISABLE_WEIGHTS" ||
        visRaw["coolerWeightsNaNPolicy"] === "REPLACE_NANS_WITH_ZERO" ||
        visRaw["coolerWeightsNaNPolicy"] === "REPLACE_NANS_WITH_ONE"
          ? (visRaw["coolerWeightsNaNPolicy"] as CoolerWeightsNaNPolicy)
          : "REPLACE_NANS_WITH_ONE";
      const currentOptions = visualizationOptionsStore.asVisualizationOptions();
      const coolerWeightsHaveNaNs =
        typeof visRaw["coolerWeightsHaveNaNs"] === "boolean"
          ? visRaw["coolerWeightsHaveNaNs"]
          : (currentOptions.coolerWeightsHaveNaNs ?? false);
      const rawCoolerWeightsNaNCount = Number(visRaw["coolerWeightsNaNCount"]);
      const coolerWeightsNaNCount = Number.isFinite(rawCoolerWeightsNaNCount)
        ? Math.max(0, rawCoolerWeightsNaNCount)
        : (currentOptions.coolerWeightsNaNCount ?? 0);
      const cmapObj = new SimpleLinearGradient(
        safeColorTranslator(startColor, "rgba(0,255,0,0.0)"),
        safeColorTranslator(endColor, "rgba(0,96,0,1.0)"),
        minSignal,
        maxSignal
      );
      visualizationOptionsStore.setVisualizationOptions(
        new VisualizationOptions(
          preLogBase,
          postLogBase,
          applyCoolerWeights,
          resolutionScaling,
          resolutionLinearScaling,
          cmapObj,
          autoThresholdEnabled,
          autoThresholdQuantile,
          signalDisplayMode,
          coolerWeightsNaNPolicy,
          coolerWeightsHaveNaNs,
          coolerWeightsNaNCount
        )
      );
    }

    const bg = (session["backgroundColor"] as string) ?? null;
    if (bg) {
      stylesStore.setMapBackground(
        safeColorTranslator(bg, "rgba(255,255,255,1)")
      );
    }

    const trackStyles = session["trackStyles"] as Record<string, unknown>;
    if (trackStyles && mapManager.value) {
      mapManager.value
        .getLayersManager()
        .applyTrackStylePreset(trackStyles as never);
    }

    const savedLocs = (session["savedLocations"] as unknown[]) ?? [];
    sessionStore.setSavedLocations(savedLocs as SessionSavedLocation[]);

    const savedPresets =
      (session["savedVisualizationPresets"] as unknown[]) ?? [];
    sessionStore.setSavedVisualizationPresets(
      savedPresets as SessionVisualizationPreset[]
    );

    const viewState = session["view"] as Record<string, unknown>;
    if (viewState && mapManager.value) {
      const view = mapManager.value.getView();
      if (Array.isArray(viewState["center"])) {
        view.setCenter(viewState["center"] as [number, number]);
      }
      if (typeof viewState["resolution"] === "number") {
        view.setResolution(viewState["resolution"] as number);
      }
      if (typeof viewState["rotation"] === "number") {
        view.setRotation(viewState["rotation"] as number);
      }
      mapManager.value.viewAndLayersManager.updateCurrentHiCViewState();
    }

    await mapManager.value?.visualizationManager.sendVisualizationOptionsToServer();
    mapManager.value?.reloadTiles();
    toast.success("Session restored");
  } catch (e) {
    console.error(e);
    const message =
      (e as { response?: { data?: { error?: string } } })?.response?.data
        ?.error ??
      (e as Error)?.message ??
      "Failed to open session";
    toast.error(message);
  }
}

watch(
  () => tileSize.value,
  (newTileSize, oldTileSize) => {
    if (newTileSize && newTileSize !== oldTileSize) {
      mapManager.value?.getLayersManager().onTileSizeChanged(newTileSize);
    }
  }
);

watch(
  () => contigBorderColor.value,
  (newContigBorderColor, oldContigBorderColor) => {
    if (newContigBorderColor && newContigBorderColor !== oldContigBorderColor) {
      mapManager.value
        ?.getLayersManager()
        .onContigBorderColorChanged(newContigBorderColor);
    }
  }
);

watch(
  () => mapBackgroundColor.value.RGB,
  () => {
    syncUiChromePalette();
  }
);

onMounted(() => {
  window.addEventListener("keydown", handleGlobalEscape, true);
  syncUiChromePalette();
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleGlobalEscape, true);
  stopOpenProgress();
});

function onFileSelected(newFilename: string) {
  if (newFilename !== filename.value) {
    resetState();
    filename.value = newFilename;
    if (filename.value && filename.value !== "") {
      displayNewMap();
    }
  }
}
</script>

<style scoped>
.main-ui-component {
  width: 100%;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.open-progress-modal {
  z-index: 1055;
}
.open-progress-backdrop {
  z-index: 1050;
}
</style>
