<template>
  <button
    type="button"
    class="btn btn-sm btn-outline-secondary jobs-button"
    @click="ui.open()"
  >
    Jobs <span aria-label="active jobs">{{ activeCount }}</span>
  </button>
  <Teleport to="body">
    <div v-if="show" class="jobs-backdrop" @click.self="ui.dismiss()">
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
            @click="ui.dismiss()"
          ></button>
        </header>
        <div class="modal-body">
          <p v-if="ui.autoOpenJobId" class="small" role="status">
            This example will open when ready. Close Jobs to keep working; the
            download will continue.
          </p>
          <p v-if="statusError" role="alert">{{ statusError }}</p>
          <p v-else-if="jobs.length === 0">No jobs in this server session.</p>
          <article
            v-for="job in jobs"
            :key="job.id"
            class="job-row"
            :data-job-id="job.id"
            tabindex="-1"
            :class="{ 'job-focused': job.id === ui.focusedJobId }"
          >
            <div class="d-flex justify-content-between gap-3">
              <strong>{{ labels[job.kind] ?? job.kind }}</strong>
              <span>{{ job.state }}</span>
            </div>
            <small v-if="job.createdAtMs">{{
              new Date(job.createdAtMs).toLocaleString()
            }}</small>
            <p v-if="job.details?.title" class="job-title">
              {{ job.details.title }}
            </p>
            <progress
              v-if="job.canCancel"
              :value="
                job.details && !(Number(job.details.totalBytes) > 0)
                  ? undefined
                  : job.progress ?? undefined
              "
              max="1"
              :aria-label="`${labels[job.kind] ?? job.kind} progress`"
            ></progress>
            <p
              v-if="job.details?.completedBytes != null"
              class="small"
              role="status"
            >
              {{ formatBytes(job.details.completedBytes)
              }}<template v-if="Number(job.details.totalBytes) > 0">
                of {{ formatBytes(job.details.totalBytes!) }}</template
              ><template v-else> downloaded · total size unknown</template
              ><template
                v-if="
                  job.progress != null && Number(job.details.totalBytes) > 0
                "
              >
                · {{ Math.round(job.progress * 100) }}%</template
              >
            </p>
            <p v-if="job.message">{{ job.message }}</p>
            <div
              v-if="job.details?.warnings?.length"
              class="small text-warning-emphasis"
            >
              <p>Optional files not downloaded:</p>
              <ul>
                <li v-for="warning in job.details.warnings" :key="warning">
                  {{ warning }}
                </li>
              </ul>
            </div>
            <p v-if="job.error" class="text-danger job-error">
              {{ job.error }}
            </p>
            <div class="d-flex gap-2 flex-wrap">
              <button
                v-if="
                  job.kind === 'example_download' &&
                  (job.state === 'failed' || job.state === 'cancelled')
                "
                type="button"
                class="btn btn-sm btn-outline-primary"
                @click="
                  ui.dismiss();
                  ui.exampleToResumeId = job.details?.exampleId ?? null;
                  emit('examplesRequested');
                "
              >
                Open Examples to resume
              </button>
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
                  <small class="job-path">{{
                    output.displayName || output.filename
                  }}</small>
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
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { storeToRefs } from "pinia";
import { useBackgroundJobsUiStore } from "@/app/stores/backgroundJobsUiStore";
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
  (event: "examplesRequested"): void;
}>();
const ui = useBackgroundJobsUiStore();
const { show } = storeToRefs(ui);
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
  repeat_period: "Repeat measurement",
  track_precompute: "Track precompute",
  coverage: "Coverage",
  fasta_only: "FASTA assembly",
  example_download: "Example download",
};
let disposed = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false,
  refreshWanted = false,
  generation = 0;
let focusedRequest = -1;
useModalFocus(dialog, () => show.value);
useEscDismissableDialog({
  priority: 1060,
  isOpen: () => show.value,
  requestClose: () => {
    ui.dismiss();
  },
});

async function refresh(): Promise<void> {
  if (disposed) return;
  clearTimeout(timer);
  if (inFlight) {
    refreshWanted = true;
    return;
  }
  inFlight = true;
  refreshWanted = false;
  const requestGeneration = generation;
  const requests = props.requests;
  try {
    const next = await requests.backgroundJobs();
    if (disposed || requestGeneration !== generation) return;
    jobs.value = next;
    statusError.value = "";
    for (const id of cancelling.value)
      if (!next.some((job) => job.id === id && job.canCancel))
        cancelling.value.delete(id);
    const requested = ui.autoOpenJobId
      ? next.find((job) => job.id === ui.autoOpenJobId)
      : undefined;
    if (requested && ["failed", "cancelled"].includes(requested.state))
      ui.autoOpenJobId = null;
    const ready =
      show.value && ui.autoOpenJobId
        ? next.find(
            (job) => job.id === ui.autoOpenJobId && job.state === "finished"
          )
        : undefined;
    const output = ready?.outputs.find((output) => output.action === "example");
    if (output) {
      open(output);
      return;
    }
    await nextTick();
    if (show.value && ui.focusedJobId && focusedRequest !== ui.focusRequest) {
      const row = Array.from(
        dialog.value?.querySelectorAll<HTMLElement>("[data-job-id]") ?? []
      ).find((row) => row.dataset.jobId === ui.focusedJobId);
      if (row) {
        row.scrollIntoView({ block: "nearest" });
        focusedRequest = ui.focusRequest;
      }
    }
  } catch (failure) {
    if (!disposed && requestGeneration === generation)
      statusError.value = extractErrorMessage(failure);
  } finally {
    inFlight = false;
    if (!disposed)
      timer = setTimeout(
        refresh,
        refreshWanted ? 0 : show.value || activeCount.value ? 1000 : 3000
      );
  }
}
async function cancel(job: BackgroundJob): Promise<void> {
  if (ui.autoOpenJobId === job.id) ui.autoOpenJobId = null;
  cancelling.value.add(job.id);
  try {
    await props.requests.cancelBackgroundJob(job.id);
    void refresh();
  } catch (failure) {
    cancelling.value.delete(job.id);
    reportFailure("Cancel job", failure);
  }
}
function open(output: BackgroundJobOutput): void {
  ui.dismiss();
  emit("open", output);
}
onMounted(refresh);
watch(
  () => [show.value, ui.focusedJobId, ui.focusRequest],
  () => {
    if (!show.value) ui.autoOpenJobId = null;
    else void refresh();
  }
);
watch(
  () => props.requests.networkManager.host,
  () => {
    ++generation;
    jobs.value = [];
    ui.dismiss();
    void refresh();
  }
);
onBeforeUnmount(() => {
  disposed = true;
  ++generation;
  ui.dismiss();
  clearTimeout(timer);
});
function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "size unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    ++unit;
  }
  return `${unit && value < 100 ? value.toFixed(1) : Math.round(value)} ${
    units[unit]
  }`;
}
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
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bs-body-bg, white);
  color: var(--bs-body-color, #222);
  border-radius: 0.5rem;
  box-shadow: 0 1rem 3rem #0005;
}
.jobs-dialog > .modal-header {
  flex-shrink: 0;
  padding: 1rem;
  border-bottom: 1px solid var(--bs-border-color, #ddd);
}
.jobs-dialog > .modal-body {
  min-height: 0;
  overflow-y: auto;
  padding: 1rem;
}
.job-row {
  padding: 1rem 0;
  border-bottom: 1px solid var(--bs-border-color, #ddd);
}
.job-row:first-child {
  padding-top: 0;
}
.job-focused {
  border-left: 3px solid #0d6efd;
  padding-left: 0.75rem;
}
.job-title {
  font-weight: 600;
  overflow-wrap: anywhere;
}
.job-row progress {
  display: block;
  width: 100%;
  margin: 0.5rem 0;
}
.job-row p {
  margin: 0.4rem 0;
  overflow-wrap: anywhere;
}
.job-error,
.job-path {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>
