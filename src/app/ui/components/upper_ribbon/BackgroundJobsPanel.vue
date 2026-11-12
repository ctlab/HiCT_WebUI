<template>
  <button
    type="button"
    class="btn btn-sm btn-outline-secondary jobs-button"
    @click="show = true"
  >
    Jobs <span aria-label="active jobs">{{ activeCount }}</span>
  </button>
  <Teleport to="body">
    <div v-if="show" class="jobs-backdrop" @click.self="show = false">
      <section
        ref="dialog"
        class="jobs-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="background-jobs-title"
      >
        <header class="modal-header">
          <h5 id="background-jobs-title" class="modal-title">
            Background jobs
          </h5>
          <button
            type="button"
            class="btn-close"
            aria-label="Close"
            @click="show = false"
          ></button>
        </header>
        <div class="modal-body">
          <p v-if="statusError" role="alert">{{ statusError }}</p>
          <p v-else-if="jobs.length === 0">No jobs in this server session.</p>
          <article
            v-for="job in jobs"
            :key="job.id"
            class="job-row"
            :data-job-id="job.id"
          >
            <div class="d-flex justify-content-between gap-3">
              <strong>{{ labels[job.kind] ?? job.kind }}</strong>
              <span>{{ job.state }}</span>
            </div>
            <small v-if="job.createdAtMs">{{
              new Date(job.createdAtMs).toLocaleString()
            }}</small>
            <progress
              v-if="job.canCancel"
              :value="job.progress ?? undefined"
              max="1"
              :aria-label="`${labels[job.kind] ?? job.kind} progress`"
            ></progress>
            <p v-if="job.message">{{ job.message }}</p>
            <p v-if="job.error" class="text-danger job-error">
              {{ job.error }}
            </p>
            <div class="d-flex gap-2 flex-wrap">
              <button
                v-if="job.canCancel"
                type="button"
                class="btn btn-sm btn-outline-danger"
                :disabled="cancelling.has(job.id)"
                @click="cancel(job)"
              >
                {{ cancelling.has(job.id) ? "Cancelling…" : "Cancel" }}
              </button>
              <template v-if="job.state === 'finished'">
                <template v-for="(output, index) in job.outputs" :key="index">
                  <a
                    v-if="output.action === 'download'"
                    class="btn btn-sm btn-outline-primary"
                    :href="requests.backgroundDownloadUrl(output.filename)"
                    download
                    >Download result</a
                  >
                  <button
                    v-else
                    type="button"
                    class="btn btn-sm btn-primary"
                    @click="open(output)"
                  >
                    Open result
                  </button>
                  <small class="job-path">{{ output.filename }}</small>
                </template>
              </template>
            </div>
          </article>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type {
  BackgroundJob,
  BackgroundJobOutput,
  RequestManager,
} from "@/app/core/net/api/RequestManager";
import { useModalFocus } from "@/app/ui/modalFocus";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";
import { reportFailure } from "@/app/ui/reportFailure";

const props = defineProps<{ requests: RequestManager }>();
const emit = defineEmits<{
  (event: "open", output: BackgroundJobOutput): void;
}>();
const show = ref(false);
const dialog = ref<HTMLElement | null>(null);
const jobs = ref<BackgroundJob[]>([]);
const statusError = ref("");
const cancelling = ref(new Set<string>());
const activeCount = computed(
  () => jobs.value.filter((job) => job.canCancel).length
);
const labels: Record<string, string> = {
  conversion: "Conversion",
  legacy_dotplot: "Alignment dotplot",
  search: "Sequence search",
  moddotplot: "ModDotPlot",
  dotplot: "Sequence dotplot",
  alignment_detail: "Base alignment",
  track_precompute: "Track precompute",
  coverage: "Coverage",
  fasta_only: "FASTA assembly",
  example_download: "Example download",
};
let disposed = false;
let timer: ReturnType<typeof setTimeout> | undefined;
useModalFocus(dialog, () => show.value);
useEscDismissableDialog({
  priority: 1060,
  isOpen: () => show.value,
  requestClose: () => {
    show.value = false;
  },
});

async function refresh(): Promise<void> {
  try {
    const next = await props.requests.backgroundJobs();
    if (disposed) return;
    jobs.value = next;
    statusError.value = "";
    for (const id of cancelling.value)
      if (!next.some((job) => job.id === id && job.canCancel))
        cancelling.value.delete(id);
  } catch (failure) {
    if (!disposed) statusError.value = extractErrorMessage(failure);
  } finally {
    if (!disposed)
      timer = setTimeout(
        refresh,
        show.value || activeCount.value ? 1000 : 3000
      );
  }
}
async function cancel(job: BackgroundJob): Promise<void> {
  cancelling.value.add(job.id);
  try {
    await props.requests.cancelBackgroundJob(job.id);
  } catch (failure) {
    cancelling.value.delete(job.id);
    reportFailure("Cancel job", failure);
  }
}
function open(output: BackgroundJobOutput): void {
  show.value = false;
  emit("open", output);
}
onMounted(refresh);
onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(timer);
});
</script>

<style scoped>
.jobs-button {
  order: 3;
  white-space: nowrap;
}
.jobs-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1060;
  background: #0008;
  display: grid;
  place-items: center;
  padding: 1rem;
}
.jobs-dialog {
  width: min(42rem, 100%);
  max-height: 85vh;
  overflow-y: auto;
  background: var(--bs-body-bg, white);
  color: var(--bs-body-color, #222);
  border-radius: 0.5rem;
  box-shadow: 0 1rem 3rem #0005;
}
.jobs-dialog > .modal-header {
  padding: 1rem;
  border-bottom: 1px solid var(--bs-border-color, #ddd);
}
.jobs-dialog > .modal-body {
  padding: 1rem;
}
.job-row {
  padding: 1rem 0;
  border-bottom: 1px solid var(--bs-border-color, #ddd);
}
.job-row:first-child {
  padding-top: 0;
}
.job-row progress {
  display: block;
  width: 100%;
  margin: 0.5rem 0;
}
.job-row p {
  margin: 0.4rem 0;
}
.job-error,
.job-path {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>
