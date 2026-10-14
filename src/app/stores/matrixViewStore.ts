import { defineStore } from "pinia";
import { ref } from "vue";

export type MatrixPresentationMode = "single" | "overlay" | "split";
export type MatrixSourceName = "PRIMARY" | "SECONDARY";

export const useMatrixViewStore = defineStore("matrixViewStore", () => {
  const presentationMode = ref<MatrixPresentationMode>("single");
  const horizontalFastaSource = ref<MatrixSourceName>("PRIMARY");
  const verticalFastaSource = ref<MatrixSourceName>("PRIMARY");
  const activeVisualizationSource = ref<MatrixSourceName>("PRIMARY");
  const activeVisualizationTargetId = ref<string | null>(null);
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
    activeVisualizationTargetId.value = null;
  }

  function setActiveVisualizationTarget(id: string | null) {
    activeVisualizationTargetId.value = id;
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
    activeVisualizationTargetId.value = null;
    layersSwapped.value = false;
  }

  return {
    presentationMode,
    horizontalFastaSource,
    verticalFastaSource,
    activeVisualizationSource,
    activeVisualizationTargetId,
    layersSwapped,
    setPresentationMode,
    setSelectionFastaSources,
    setActiveVisualizationSource,
    setActiveVisualizationTarget,
    setLayersSwapped,
    toggleLayersSwapped,
    reset,
  };
});
