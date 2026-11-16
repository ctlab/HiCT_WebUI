import { defineStore } from "pinia";
import { ref } from "vue";

/** Presentation and explicit opening intent, never ownership of the server job. */
export const useBackgroundJobsUiStore = defineStore("backgroundJobsUi", () => {
  const show = ref(false);
  const focusedJobId = ref<string | null>(null);
  const autoOpenJobId = ref<string | null>(null);
  const focusRequest = ref(0);
  const exampleToResumeId = ref<string | null>(null);
  function open(jobId: string | null = null, openWhenReady = false): void {
    focusedJobId.value = jobId;
    autoOpenJobId.value = openWhenReady ? jobId : null;
    ++focusRequest.value;
    show.value = true;
  }
  function dismiss(): void {
    autoOpenJobId.value = null;
    show.value = false;
  }
  return {
    show,
    focusedJobId,
    autoOpenJobId,
    focusRequest,
    exampleToResumeId,
    open,
    dismiss,
  };
});
