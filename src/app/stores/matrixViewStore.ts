import { defineStore } from "pinia";
import { ref } from "vue";

export type MatrixPresentationMode = "single" | "overlay" | "split";
export type MatrixSourceName = "PRIMARY" | "SECONDARY";

export const useMatrixViewStore = defineStore("matrixViewStore", () => {
  const presentationMode = ref<MatrixPresentationMode>("single");
  const horizontalFastaSource = ref<MatrixSourceName>("PRIMARY");
  const verticalFastaSource = ref<MatrixSourceName>("PRIMARY");

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

  function reset() {
    presentationMode.value = "single";
    horizontalFastaSource.value = "PRIMARY";
    verticalFastaSource.value = "PRIMARY";
  }

  return {
    presentationMode,
    horizontalFastaSource,
    verticalFastaSource,
    setPresentationMode,
    setSelectionFastaSources,
    reset,
  };
});
