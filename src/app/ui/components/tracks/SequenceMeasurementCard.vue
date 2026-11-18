<template>
  <Teleport to="body">
    <section
      class="sequence-measurement-card"
      role="region"
      aria-label="FASTA measurement"
    >
      <div class="d-flex justify-content-between gap-2">
        <strong>{{ selection.endBp - selection.startBp }} bp selected</strong>
        <button
          type="button"
          class="btn-close"
          aria-label="Clear FASTA measurement"
          @click="$emit('clear')"
        ></button>
      </div>
      <p class="small mb-1">
        {{ selection.axis === "horizontal" ? "Columns" : "Rows" }} · Assembly
        {{ selection.startBp + 1 }}–{{ selection.endBp }} (1-based inclusive),
        {{ selection.reverse ? "reverse" : "forward" }} strand.
      </p>
      <p class="small text-muted mb-2">
        Shift-arrow extends the selection on the FASTA strip. Ctrl/⌘-drag
        selects; plain drag pans.
      </p>
      <div class="d-flex flex-wrap gap-2 mb-2">
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          @click="copySequence"
        >
          Copy selected sequence
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          @click="copyCoordinates"
        >
          Copy assembly coordinates
        </button>
        <button
          v-if="busy"
          type="button"
          class="btn btn-sm btn-outline-danger"
          @click="cancel"
        >
          Cancel measurement
        </button>
        <button
          v-else
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="!supported"
          @click="estimate"
        >
          Estimate period
        </button>
      </div>
      <div aria-live="polite" class="small">
        <p v-if="!supported" class="mb-1">
          Period estimation requires a server with repeat measurement support.
        </p>
        <p v-if="busy" class="mb-1" role="status">
          Measuring repeat period… Also available in Jobs.
        </p>
        <p v-if="error" role="alert" class="text-danger mb-1">{{ error }}</p>
        <template v-if="job?.status === 'finished' && job.result">
          <p class="mb-1">
            <strong>{{
              job.result.periodBp === null
                ? "No supported period"
                : `Period: ${job.result.periodBp} bp`
            }}</strong
            ><template v-if="job.result.periodBp !== null">
              · {{ job.result.copies?.toFixed(2) }} copies ·
              {{ ((job.result.identity ?? 0) * 100).toFixed(1) }}% identity ({{
                job.result.matches
              }}/{{ job.result.comparedPairs }} informative pairs).</template
            >
          </p>
          <p class="mb-1">
            {{ job.result.message }} Ambiguous bases:
            {{ job.result.ambiguousBases }}.
          </p>
        </template>
        <p v-else-if="job?.status === 'cancelled'" class="mb-1">
          Measurement cancelled.
        </p>
      </div>
      <details class="small">
        <summary>How the estimate works</summary>
        <p class="mb-0">
          Tests lags up to half the selected length and reports the shortest
          supported lag. Exact periodicity allows a partial final copy.
          Imperfect candidates require at least 8 A/C/G/T pairs, 80% pair
          support, 80% identity and 20 percentage points above this interval's
          composition baseline. Ambiguous bases are excluded. This is an
          exploratory ungapped estimate, not a significance test or a repeat
          annotation.
        </p>
      </details>
    </section>
  </Teleport>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import type {
  RepeatPeriodJob,
  SequenceMeasurement,
} from "@/app/core/sequence/sequenceMeasurement";
import { SequenceAnalysisRequest } from "@/app/core/net/api/SequenceAnalysisRequest";
import { copyText } from "@/app/core/mapmanagers/contextMenuActions";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
const props = defineProps<{
  mapManager: ContactMapManager;
  selection: SequenceMeasurement;
  supported: boolean;
}>();
const emit = defineEmits<{ (event: "clear"): void }>();
const job = ref<RepeatPeriodJob>();
const submitting = ref(false),
  error = ref("");
const busy = computed(
  () =>
    submitting.value ||
    ["submitted", "running"].includes(job.value?.status ?? "")
);
let disposed = false,
  generation = 0,
  timer: ReturnType<typeof setTimeout> | undefined;
useEscDismissableDialog({
  priority: 1000,
  isOpen: () => true,
  requestClose: () => emit("clear"),
});
function copySequence() {
  void copyText(props.selection.sequence, "Selected sequence");
}
function copyCoordinates() {
  void copyText(
    `${props.selection.startBp + 1}-${props.selection.endBp}`,
    "Assembly coordinates"
  );
}
async function stop(id: string) {
  await props.mapManager.networkManager.requestManager.sendRequest(
    new SequenceAnalysisRequest(`/sequence/jobs/${id}/stop`)
  );
}
async function estimate() {
  if (busy.value || !props.supported) return;
  const current = ++generation;
  submitting.value = true;
  error.value = "";
  job.value = undefined;
  try {
    const response =
      await props.mapManager.networkManager.requestManager.sendRequest(
        new SequenceAnalysisRequest("/sequence/repeat_period", {
          startBp: props.selection.startBp,
          endBp: props.selection.endBp,
        })
      );
    const result = response.data as RepeatPeriodJob;
    if (disposed || current !== generation) {
      if (["submitted", "running"].includes(result.status))
        await stop(result.jobId);
      return;
    }
    job.value = result;
    if (["submitted", "running"].includes(result.status))
      timer = setTimeout(() => poll(current), 150);
    else if (result.status === "failed")
      error.value = result.error ?? "Repeat measurement failed.";
  } catch (failure) {
    if (!disposed && current === generation)
      error.value = extractErrorMessage(failure);
  } finally {
    if (!disposed && current === generation) submitting.value = false;
  }
}
async function poll(current: number) {
  const id = job.value?.jobId;
  if (!id || disposed || current !== generation) return;
  try {
    const response =
      await props.mapManager.networkManager.requestManager.sendRequest(
        new SequenceAnalysisRequest("/sequence/repeat_period", { jobId: id })
      );
    if (disposed || current !== generation) return;
    job.value = response.data as RepeatPeriodJob;
    if (job.value.status === "failed")
      error.value = job.value.error ?? "Repeat measurement failed.";
    if (["submitted", "running"].includes(job.value.status))
      timer = setTimeout(() => poll(current), 250);
  } catch (failure) {
    if (!disposed && current === generation) {
      error.value = extractErrorMessage(failure);
      job.value = undefined;
    }
  }
}
async function cancel() {
  ++generation;
  clearTimeout(timer);
  const id = job.value?.jobId;
  submitting.value = false;
  if (job.value) job.value = { ...job.value, status: "cancelled" };
  if (id)
    try {
      await stop(id);
    } catch (failure) {
      if (!disposed) error.value = extractErrorMessage(failure);
    }
}
onBeforeUnmount(() => {
  if (busy.value) void cancel();
  disposed = true;
  ++generation;
  clearTimeout(timer);
});
</script>
<style scoped>
.sequence-measurement-card {
  position: fixed;
  z-index: 1040;
  left: 80px;
  bottom: 16px;
  width: min(410px, calc(100vw - 96px));
  max-height: 60vh;
  overflow: auto;
  padding: 14px;
  border: 1px solid #94a3b8;
  border-radius: 8px;
  background: #fff;
  color: #0f172a;
  box-shadow: 0 5px 24px #0003;
}
</style>
