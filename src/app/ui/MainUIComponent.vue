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
  <Toaster position="bottom-right" />
  <!-- <button @click="() => toast('My first toast')">Render a toast</button> -->
  <div class="main-ui-component">
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
    ></UpperFrame>
    <WorkspaceComponent
      :mapManager="mapManager"
      :filename="filename"
    ></WorkspaceComponent>
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
import { ref, watch, type Ref } from "vue";
import { NetworkManager } from "@/app/core/net/NetworkManager";
import defaultOptions from "@/app/core/visualization/colormap/default_options.json";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import { useStyleStore } from "@/app/stores/styleStore";
import SimpleLinearGradient from "@/app/core/visualization/colormap/SimpleLinearGradient";
import VisualizationOptions from "@/app/core/visualization/VisualizationOptions";
import { ColorTranslator } from "colortranslator";
import { LoadAGPRequest } from "@/app/core/net/api/request";

import WorkspaceComponent from "@/app/ui/components/workspace/WorkspaceComponent.vue";
import { Toaster, toast } from "vue-sonner";
import { storeToRefs } from "pinia";
import { usehtmlElementReferencesStore } from "../stores/htmlElementReferencesStore";
import {
  useSessionStore,
  type SessionSavedLocation,
  type SessionVisualizationPreset,
} from "@/app/stores/sessionStore";

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

const htmlElementReferencesStore = usehtmlElementReferencesStore();
const { mapTarget, miniMapTarget } = storeToRefs(htmlElementReferencesStore);
const lastAgpFilename: Ref<string> = ref("");

function resetState() {
  mapManager.value?.dispose();
  filename.value = "";
  fastaFilename.value = "";
  mapManager.value = undefined;
  const hTrack = document.getElementById("horizontal-igv-track-div");
  if (hTrack) {
    hTrack.replaceChildren();
  }
  const vTrack = document.getElementById("vertical-igv-track-div");
  if (vTrack) {
    vTrack.replaceChildren();
  }
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
    .then(({ filename: attachedName, response }) => {
      if (!attachedName) {
        toast.error("No active session to attach");
        return;
      }
      mapManager.value?.dispose();
      filename.value = attachedName;
      const newManager = new ContactMapManager({
        response,
        filename: attachedName,
        fastaFilename: fastaFilename.value ?? "",
        tileSize: tileSize.value,
        contigBorderColor: contigBorderColor.value,
        mapTargetSelector: "hic-contact-map",
        networkManager: networkManager,
        minimapTarget: miniMapTarget,
      });
      mapManager.value = newManager;
      networkManager.mapManager = mapManager.value;
      newManager.initializeMap();
      toast.success("Attached to session " + attachedName);
    })
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
  ffname: string | undefined
): Promise<void> {
  const openFileResponse = await networkManager.requestManager.openFile(
    fname,
    ffname
  );
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
  applyDefaultVisualizationPreset();
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
    });
}

function applyDefaultVisualizationPreset() {
  const presets =
    (defaultOptions as unknown as {
      data?: { savedLocations?: unknown[]; savedVisualizationPresets?: unknown[] };
    }).data?.savedLocations ??
    (defaultOptions as unknown as {
      data?: { savedVisualizationPresets?: unknown[] };
    }).data?.savedVisualizationPresets ??
    [];
  if (!presets || presets.length === 0) {
    return;
  }
  const first = presets[0] as Record<string, unknown>;
  const opt = (first["options"] as Record<string, unknown>) ?? {};
  const cmap = (opt["colormap"] as Record<string, unknown>) ?? {};
  const startColor = (cmap["startColorRGBAString"] as string) ?? "rgba(0,255,0,0.0)";
  const endColor = (cmap["endColorRGBAString"] as string) ?? "rgba(0,96,0,1.0)";
  const minSignal = (cmap["minSignal"] as number) ?? 0;
  const maxSignal = (cmap["maxSignal"] as number) ?? 1;
  const preLogBase = (opt["preLogBase"] as number) ?? -1;
  const postLogBase = (opt["postLogBase"] as number) ?? 10;
  const applyCoolerWeights = (opt["applyCoolerWeights"] as boolean) ?? false;
  const resolutionScaling = (opt["resolutionScaling"] as boolean) ?? false;
  const resolutionLinearScaling =
    (opt["resolutionLinearScaling"] as boolean) ?? false;
  const cmapObj = new SimpleLinearGradient(
    new ColorTranslator(startColor, { legacyCSS: true }),
    new ColorTranslator(endColor, { legacyCSS: true }),
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
      cmapObj
    )
  );
  const bg = (first["backgroundColor"] as string) ?? "rgba(255,255,255,1)";
  stylesStore.setMapBackground(new ColorTranslator(bg, { legacyCSS: true }));
  mapManager.value?.visualizationManager.sendVisualizationOptionsToServer().then(() => {
    mapManager.value?.reloadTiles();
  });
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
    colormap: {
      colormapType: options.colormap?.colormapType ?? "Unknown",
    },
  };
}

function onSaveSession(): void {
  if (!mapManager.value) {
    toast.error("No open map to save session");
    return;
  }
  const view = mapManager.value.getView();
  const session = {
    version: 1,
    filename: filename.value ?? "",
    fastaFilename: fastaFilename.value ?? "",
    agpFilename: lastAgpFilename.value ?? "",
    visualizationOptions: serializeCurrentVisualizationOptions(),
    backgroundColor: mapBackgroundColor.value?.RGBA ?? "rgba(255,255,255,1)",
    trackStyles: mapManager.value.getLayersManager().getTrackStylePreset(),
    savedLocations: sessionStore.savedLocations,
    savedVisualizationPresets: sessionStore.savedVisualizationPresets,
    view: {
      center: view.getCenter(),
      resolution: view.getResolution(),
      rotation: view.getRotation(),
      bpResolution:
        mapManager.value.viewAndLayersManager.currentViewState
          .resolutionDesciptor.bpResolution,
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

    const resolvedFile = await resolveFilename(
      "HiCT",
      sessionFilename,
      fileList
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
      const cmapObj = new SimpleLinearGradient(
        new ColorTranslator(startColor, { legacyCSS: true }),
        new ColorTranslator(endColor, { legacyCSS: true }),
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
          cmapObj
        )
      );
    }

    const bg = (session["backgroundColor"] as string) ?? null;
    if (bg) {
      stylesStore.setMapBackground(new ColorTranslator(bg, { legacyCSS: true }));
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
    toast.error("Failed to open session");
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
}
</style>
