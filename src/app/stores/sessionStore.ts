import { defineStore } from "pinia";
import { ref } from "vue";

export interface SessionSavedLocation {
  location_id: number;
  center_point: [number, number];
  resolution: number;
  rotation: number;
}

export type VisualizationPresetAction =
  | {
      type: "sequence-overlay";
      mode: "overlay" | "below";
      kind: "moddotplot" | "dotplot";
    }
  | {
      type: "active-source-palette";
      startColor: string;
      endColor: string;
    };

export interface SessionVisualizationPreset {
  option_id: number;
  options?: Record<string, unknown>;
  backgroundColor?: string;
  name: string;
  trackStyles?: Record<string, unknown>;
  signalThresholds?: { lowerSignalBound?: number; upperSignalBound?: number };
  action?: VisualizationPresetAction;
}

export const useSessionStore = defineStore("sessionStore", () => {
  const savedLocations = ref<SessionSavedLocation[]>([]);
  const savedVisualizationPresets = ref<SessionVisualizationPreset[]>([]);
  const lastAgpFilename = ref<string>("");

  function setSavedLocations(locations: SessionSavedLocation[]) {
    savedLocations.value = locations;
  }

  function setSavedVisualizationPresets(presets: SessionVisualizationPreset[]) {
    savedVisualizationPresets.value = presets;
  }

  function setLastAgpFilename(name: string) {
    lastAgpFilename.value = name;
  }

  return {
    savedLocations,
    savedVisualizationPresets,
    lastAgpFilename,
    setSavedLocations,
    setSavedVisualizationPresets,
    setLastAgpFilename,
  };
});
