import { defineStore } from "pinia";
import { ref } from "vue";

/** External results belong to a server job, independently of the currently open assembly. */
export const useRemoteBlastResultsStore = defineStore(
  "remoteBlastResults",
  () => {
    const jobId = ref<string | null>(null);
    function open(id: string) {
      jobId.value = id;
    }
    function dismiss() {
      jobId.value = null;
    }
    return { jobId, open, dismiss };
  }
);
