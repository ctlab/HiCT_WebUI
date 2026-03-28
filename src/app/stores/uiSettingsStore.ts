import { defineStore } from "pinia";
import { ref } from "vue";

export const useUiSettingsStore = defineStore("uiSettings", () => {
  const customZoomSliderEnabled = ref(false);
  const fileSelectorMode = ref<"explorer" | "tree">("explorer");
  const inheritTrackBackgroundFromMap = ref(true);
  const trackBackgroundColor = ref("rgba(244,247,251,0.98)");

  return {
    customZoomSliderEnabled,
    fileSelectorMode,
    inheritTrackBackgroundFromMap,
    trackBackgroundColor,
  };
});
