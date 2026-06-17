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

const persistRef = <T>(key: string, value: { value: T }) => {
  watch(
    value,
    (next) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Ignore storage failures; UI settings are non-critical.
      }
    },
    { deep: true }
  );
};

export const useUiSettingsStore = defineStore("uiSettings", () => {
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
  const osdOverlayVisible = ref(readStored("hict.ui.osd.visible", true));
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
    customZoomSliderEnabled,
    binaryTileTransportEnabled,
    rulerCoordinateMode,
    fileSelectorMode,
    inheritTrackBackgroundFromMap,
    trackBackgroundColor,
    osdOverlayVisible,
    osdOverlayPosition,
    osdOverlayFields,
    osdOverlayFieldOrder,
  };
});
