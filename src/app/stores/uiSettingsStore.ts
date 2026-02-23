import { defineStore } from "pinia";
import { ref } from "vue";

export const useUiSettingsStore = defineStore("uiSettings", () => {
  const customZoomSliderEnabled = ref(false);

  return {
    customZoomSliderEnabled,
  };
});
