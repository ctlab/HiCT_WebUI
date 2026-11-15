<!--
 Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis, Zakhar Lobanov, Nikita Zheleznov and Computer Technologies Laboratory ITMO University team.

 Permission is hereby granted, free of charge, to any person obtaining a copy of
 this software and associated documentation files (the "Software"), to deal in
 the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 -->

<template>
  <div class="fasta-only">
    <div class="modal-backdrop fade show fasta-only-backdrop"></div>
    <div
      ref="dialog"
      class="modal fade show fasta-only-modal"
      style="display: block"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fasta-only-title"
      aria-describedby="fasta-only-intro"
      @keydown="trapTab"
    >
      <div
        class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable"
      >
        <div class="modal-content">
          <div class="modal-header">
            <h5 id="fasta-only-title" class="modal-title">Open FASTA only</h5>
            <button
              type="button"
              class="btn-close"
              aria-label="Close"
              @click="requestClose"
            ></button>
          </div>
          <div class="modal-body">
            <p id="fasta-only-intro" class="small text-muted">
              Makes an assembly from a FASTA file with no contact data. Each
              sequence is one contig. Nothing is drawn as contacts, but you can
              move, reverse and group contigs, add tracks and export.
            </p>
            <UniversalFileSelector
              v-if="!busy"
              :network-manager="props.requests.networkManager"
              :file-name-predicate="isFastaFilename"
              title="Choose a FASTA file"
              file-type="FASTA files"
              note="Browse one folder at a time, or enter a relative folder or file path above."
              embedded
              require-selection
              @selected="selectFasta"
            />
            <p class="small mt-2 mb-3" aria-live="polite">
              <strong>FASTA file:</strong>
              <span id="fasta-only-file" class="fasta-only-path ms-1">{{
                selected || "Choose a FASTA file above."
              }}</span>
            </p>
            <div class="form-check mb-2">
              <input
                id="fasta-only-split"
                v-model="splitAtN"
                class="form-check-input"
                type="checkbox"
                :disabled="busy"
              />
              <label class="form-check-label" for="fasta-only-split">
                Split at runs of N
              </label>
            </div>
            <div v-if="splitAtN" class="mb-2 ms-4">
              <label for="fasta-only-min-n" class="form-label small mb-1">
                Minimum consecutive N (bp)
              </label>
              <input
                id="fasta-only-min-n"
                v-model="minRunText"
                class="form-control form-control-sm fasta-only-number"
                type="text"
                inputmode="numeric"
                :disabled="busy"
                :aria-invalid="runError ? 'true' : undefined"
                :aria-describedby="
                  runError ? 'fasta-only-run-error' : 'fasta-only-run-help'
                "
              />
              <p
                v-if="runError"
                id="fasta-only-run-error"
                class="small text-danger mb-0"
                role="alert"
              >
                {{ runError }}
              </p>
              <p v-else id="fasta-only-run-help" class="small text-muted mb-0">
                Runs of N (either case) at least this long cut a sequence into
                pieces. The gap keeps its length and the pieces keep their
                original positions.
              </p>
            </div>
            <div
              v-if="busy"
              id="fasta-only-progress"
              class="d-flex align-items-center gap-2 mt-3"
              role="status"
              aria-live="polite"
            >
              <progress
                :value="progress"
                max="1"
                class="flex-grow-1"
                aria-label="Progress"
              ></progress>
              <span class="small"
                >{{ message }} {{ Math.round(progress * 100) }}%</span
              >
            </div>
            <p
              v-if="error"
              id="fasta-only-error"
              class="text-danger small mt-3 mb-0"
              role="alert"
            >
              {{ error }}
            </p>
          </div>
          <div class="modal-footer">
            <button
              id="fasta-only-start"
              ref="startButton"
              type="button"
              class="btn btn-primary"
              :disabled="busy || !canStart"
              @click="start"
            >
              Create and open
            </button>
            <button
              id="fasta-only-cancel"
              type="button"
              class="btn btn-secondary"
              @click="requestClose"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
} from "vue";
import type {
  FastaOnlyStatus,
  RequestManager,
} from "@/app/core/net/api/RequestManager";
const UniversalFileSelector = defineAsyncComponent(
  () => import("@/app/ui/components/upper_ribbon/UniversalFileSelector.vue")
);
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";

const props = defineProps<{ requests: RequestManager }>();
const emit = defineEmits<{
  (e: "dismissed"): void;
  (e: "ready", result: FastaOnlyStatus): void;
}>();

const MAX_RUN = 1_000_000;
const dialog = ref<HTMLElement | null>(null);
const startButton = ref<HTMLButtonElement | null>(null);
const selected = ref("");
const splitAtN = ref(false);
const minRunText = ref("100");
const busy = ref(false);
const progress = ref(0);
const message = ref("");
const error = ref("");
let opener: HTMLElement | null = null;
let disposed = false;

/** The run length as a whole number, or null with the reason shown under the field. */
const parsedRun = computed<number | null>(() => {
  const text = minRunText.value.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return value >= 1 && value <= MAX_RUN ? value : null;
});
const runError = computed(() =>
  splitAtN.value && parsedRun.value === null
    ? `Enter a whole number from 1 to ${MAX_RUN.toLocaleString()}.`
    : ""
);
const canStart = computed(
  () => !!selected.value && (!splitAtN.value || parsedRun.value !== null)
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function start(): Promise<void> {
  if (!canStart.value || busy.value) return;
  busy.value = true;
  error.value = "";
  progress.value = 0;
  message.value = "Starting";
  try {
    let status = await props.requests.startFastaOnly({
      fastaFilename: selected.value,
      splitAtN: splitAtN.value,
      minNRun: parsedRun.value ?? 100,
    });
    for (;;) {
      if (disposed) return;
      progress.value = status.progress;
      message.value = status.message;
      if (status.state === "READY") {
        emit("ready", status);
        return;
      }
      if (status.state === "FAILED") {
        error.value = status.error
          ? `${status.error}`
          : "The FASTA could not be read.";
        return;
      }
      if (status.state === "CANCELLED") return;
      if (disposed) return;
      await sleep(400);
      status = await props.requests.fastaOnlyStatus();
    }
  } catch (failure) {
    console.debug("FASTA-only job failed", failure);
    const server = failure as { response?: { data?: { error?: string } } };
    error.value =
      server.response?.data?.error ?? "The FASTA could not be read.";
  } finally {
    busy.value = false;
  }
}

async function requestClose(): Promise<void> {
  emit("dismissed");
}

useEscDismissableDialog({
  priority: 1050,
  isOpen: () => true,
  requestClose: () => void requestClose(),
});

function focusable(): HTMLElement[] {
  return Array.from(
    dialog.value?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]'
    ) ?? []
  ).filter((element) => element.getClientRects().length > 0);
}

/** Keeps Tab inside the dialog: the page behind it is not usable while it is open. */
function trapTab(event: KeyboardEvent): void {
  if (event.key !== "Tab") return;
  const items = focusable();
  if (items.length === 0) {
    event.preventDefault();
    dialog.value?.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !dialog.value?.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (
    !event.shiftKey &&
    (active === last || !dialog.value?.contains(active))
  ) {
    event.preventDefault();
    first.focus();
  }
}

function isFastaFilename(name: string): boolean {
  return /\.(?:fa|fasta|fna|fas)(?:\.gz)?$/i.test(name);
}

function selectFasta(name: string): void {
  selected.value = isFastaFilename(name) ? name : "";
  error.value =
    name && !selected.value
      ? "Choose a FASTA file (.fa, .fasta, .fna or .fas, optionally .gz)."
      : "";
}

onMounted(async () => {
  opener = document.activeElement as HTMLElement | null;
  await nextTick();
  (
    dialog.value?.querySelector<HTMLInputElement>(
      ".embedded-file-browser input"
    ) ?? dialog.value
  )?.focus();
});

onBeforeUnmount(() => {
  disposed = true;
  if (opener && document.contains(opener)) opener.focus();
});
</script>

<style scoped>
.fasta-only-backdrop {
  z-index: 2090;
}
.fasta-only-modal {
  z-index: 2100;
}
.fasta-only-path {
  overflow-wrap: anywhere;
}

.fasta-only-number {
  width: 9rem;
}
</style>
