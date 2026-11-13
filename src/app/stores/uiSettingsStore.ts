import { defineStore } from "pinia";
import { ref, watch } from "vue";

const readStored = <T>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
};

// localStorage writes are synchronous: a slider or a pan that updates a setting every frame must
// not hit the disk each time. Writes are collected and flushed 200 ms after the last change, and
// immediately when the page is hidden or closed.
const pendingWrites = new Map<string, () => unknown>();
let flushTimer: number | undefined;

const flushPersistedSettings = (): void => {
  window.clearTimeout(flushTimer);
  flushTimer = undefined;
  for (const [key, read] of pendingWrites) {
    try {
      window.localStorage.setItem(key, JSON.stringify(read()));
    } catch {
      // Ignore storage failures; UI settings are non-critical.
    }
  }
  pendingWrites.clear();
};

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPersistedSettings);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPersistedSettings();
  });
}

const persistRef = <T>(key: string, value: { value: T }) => {
  watch(
    value,
    () => {
      pendingWrites.set(key, () => value.value);
      window.clearTimeout(flushTimer);
      flushTimer = window.setTimeout(flushPersistedSettings, 200);
    },
    { deep: true }
  );
};

export const useUiSettingsStore = defineStore("uiSettings", () => {
  const sequenceGapLengthBp = ref(
    readStored("hict.sequence.gapLengthBp", 1000)
  );
  persistRef("hict.sequence.gapLengthBp", sequenceGapLengthBp);
  const sequenceForwardColor = ref(
    readStored("hict.sequence.forwardColor", "#dc2626")
  );
  const sequenceReverseColor = ref(
    readStored("hict.sequence.reverseColor", "#2563eb")
  );
  const modDotPlotThreads = ref(
    readStored("hict.sequence.modDotPlotThreads", -1)
  );
  persistRef("hict.sequence.forwardColor", sequenceForwardColor);
  persistRef("hict.sequence.reverseColor", sequenceReverseColor);
  persistRef("hict.sequence.modDotPlotThreads", modDotPlotThreads);
  /** Draw a reverse-complement row under the forward FASTA row. */
  const sequenceShowReverseStrand = ref(
    readStored("hict.sequence.showReverseStrand", false)
  );
  persistRef("hict.sequence.showReverseStrand", sequenceShowReverseStrand);
  /** Keep the map's top-left corner against the rulers. On by default. */
  const mapAnchorTopLeft = ref(readStored("hict.ui.mapAnchorTopLeft", true));
  persistRef("hict.ui.mapAnchorTopLeft", mapAnchorTopLeft);
  const customZoomSliderEnabled = ref(false);
  const binaryTileTransportEnabled = ref(false);
  const rulerCoordinateMode = ref<"global" | "contig" | "scaffold">(
    readStored("hict.ui.rulerCoordinateMode", "global")
  );
  const fileSelectorMode = ref<"explorer" | "tree">(
    readStored("hict.ui.fileSelectorMode", "explorer")
  );
  const inheritTrackBackgroundFromMap = ref(true);
  const trackBackgroundColor = ref("rgba(244,247,251,0.98)");
  const developerToolsEnabled = ref(
    readStored("hict.ui.developerTools", false)
  );
  persistRef("hict.ui.developerTools", developerToolsEnabled);
  const osdOverlayVisible = ref(readStored("hict.ui.osd.visible", false));
  const osdOverlayPosition = ref<"top-right" | "bottom-left">(
    readStored("hict.ui.osd.position", "top-right")
  );
  const osdOverlayFields = ref<Record<string, boolean>>(
    readStored("hict.ui.osd.fields", {
      global: true,
      resolution: true,
      source: true,
      visibleResolutions: true,
      pixels: true,
      bins: true,
      basePairs: true,
      contigs: true,
      inContig: true,
      scaffolds: true,
      inScaffold: true,
    })
  );
  const osdOverlayFieldOrder = ref<string[]>(
    readStored("hict.ui.osd.fieldOrder", [
      "global",
      "resolution",
      "source",
      "visibleResolutions",
      "pixels",
      "bins",
      "basePairs",
      "contigs",
      "inContig",
      "scaffolds",
      "inScaffold",
    ])
  );

  persistRef("hict.ui.fileSelectorMode", fileSelectorMode);
  persistRef("hict.ui.rulerCoordinateMode", rulerCoordinateMode);
  persistRef("hict.ui.osd.visible", osdOverlayVisible);
  persistRef("hict.ui.osd.position", osdOverlayPosition);
  persistRef("hict.ui.osd.fields", osdOverlayFields);
  persistRef("hict.ui.osd.fieldOrder", osdOverlayFieldOrder);

  return {
    sequenceGapLengthBp,
    sequenceForwardColor,
    sequenceShowReverseStrand,
    sequenceReverseColor,
    modDotPlotThreads,
    mapAnchorTopLeft,
    customZoomSliderEnabled,
    binaryTileTransportEnabled,
    rulerCoordinateMode,
    fileSelectorMode,
    inheritTrackBackgroundFromMap,
    trackBackgroundColor,
    developerToolsEnabled,
    osdOverlayVisible,
    osdOverlayPosition,
    osdOverlayFields,
    osdOverlayFieldOrder,
  };
});
