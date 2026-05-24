import { defineStore } from "pinia";
import { ref } from "vue";

export type MatrixPresentationMode = "single" | "overlay" | "split";
export type MatrixSourceName = "PRIMARY" | "SECONDARY";

export const useMatrixViewStore = defineStore("matrixViewStore", () => {
  const presentationMode = ref<MatrixPresentationMode>("single");
  const horizontalFastaSource = ref<MatrixSourceName>("PRIMARY");
  const verticalFastaSource = ref<MatrixSourceName>("PRIMARY");
  const activeVisualizationSource = ref<MatrixSourceName>("PRIMARY");
  const layersSwapped = ref(false);

  function setPresentationMode(mode: MatrixPresentationMode) {
    presentationMode.value = mode;
  }

  function setSelectionFastaSources(
    horizontal: MatrixSourceName,
    vertical: MatrixSourceName
  ) {
    horizontalFastaSource.value = horizontal;
    verticalFastaSource.value = vertical;
  }

  function setActiveVisualizationSource(source: MatrixSourceName) {
    activeVisualizationSource.value = source;
  }

  function setLayersSwapped(value: boolean) {
    layersSwapped.value = value;
  }

  function toggleLayersSwapped() {
    layersSwapped.value = !layersSwapped.value;
  }

  function reset() {
    presentationMode.value = "single";
    horizontalFastaSource.value = "PRIMARY";
    verticalFastaSource.value = "PRIMARY";
    activeVisualizationSource.value = "PRIMARY";
    layersSwapped.value = false;
  }

  return {
    presentationMode,
    horizontalFastaSource,
    verticalFastaSource,
    activeVisualizationSource,
    layersSwapped,
    setPresentationMode,
    setSelectionFastaSources,
    setActiveVisualizationSource,
    setLayersSwapped,
    toggleLayersSwapped,
    reset,
  };
});
