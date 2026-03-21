import { defineStore } from "pinia";
import { ref } from "vue";

export const useErrorToastStore = defineStore("errorToast", () => {
  const requestErrorToastsEnabled = ref(true);
  const webuiErrorToastsEnabled = ref(true);

  return {
    requestErrorToastsEnabled,
    webuiErrorToastsEnabled,
  };
});
