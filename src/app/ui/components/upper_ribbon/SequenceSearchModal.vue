<template>
  <Teleport to="body">
    <div class="sequence-backdrop"></div>
    <section
      class="sequence-modal"
      ref="modalFocusElement"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sequence-search-title"
    >
      <form class="modal-content" @submit.prevent="start">
        <header class="modal-header">
          <h5 id="sequence-search-title" class="modal-title">
            {{ isRemote ? "Search NCBI databases" : "Find sequences" }}
          </h5>
          <button
            type="button"
            class="btn-close"
            aria-label="Close"
            @click="emit('dismissed')"
          ></button>
        </header>
        <div class="modal-body">
          <p v-if="error" class="alert alert-danger" role="alert">
            {{ error }}
          </p>
          <div
            v-if="unavailableReason"
            class="alert alert-warning"
            role="status"
          >
            {{ unavailableReason }}
            <button
              v-if="readiness.needsFasta.value"
              type="button"
              class="btn btn-sm btn-primary me-2"
              :disabled="busy"
              @click="emit('linkFasta')"
            >
              Link FASTA…
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary"
              :disabled="readiness.checking.value || busy"
              @click="readiness.refresh"
            >
              Check again
            </button>
          </div>
          <fieldset :disabled="busy">
            <label class="form-label" for="search-sequences"
              >FASTA records, or one DNA sequence per line</label
            >
            <textarea
              id="search-sequences"
              v-model="queries"
              class="form-control sequence-input"
              rows="7"
              required
              spellcheck="false"
              placeholder=">my motif&#10;ACGTACGT&#10;>another motif&#10;TTGCAACC"
            ></textarea>
            <p class="form-text">
              FASTA descriptions appear in hit tooltips. Plain sequences receive
              query_1, query_2, … IDs. Input is case-insensitive.
            </p>
            <p
              v-if="!blastAvailable && !readiness.prerequisite.value"
              class="alert alert-info"
            >
              {{ blastUnavailableReason }}
            </p>
            <div class="row g-3">
              <div v-if="!isRemote" class="col-sm-6">
                <label for="search-scope" class="form-label"
                  >Search scope</label
                >
                <select id="search-scope" v-model="scope" class="form-select">
                  <option value="assembly">Whole active assembly</option>
                  <option value="selection" :disabled="!selection">
                    Selected assembly interval
                  </option>
                </select>
                <small
                  v-if="scope === 'selection' && selection"
                  class="form-text"
                  >Bases {{ selection.startBp.toLocaleString() }}–{{
                    selection.endBp.toLocaleString()
                  }}
                  (zero-based, end excluded). This is the bounding interval of
                  the selection.</small
                >
              </div>
              <div class="col-sm-6">
                <label for="search-strands" class="form-label"
                  >DNA strands</label
                >
                <select
                  id="search-strands"
                  v-model="bothStrands"
                  class="form-select"
                >
                  <option :value="true">Both strands</option>
                  <option :value="false">
                    {{
                      isRemote
                        ? "Forward query strand only"
                        : "Forward assembly strand only"
                    }}
                  </option>
                </select>
              </div>
              <div class="col-sm-6">
                <label for="search-mode" class="form-label">Matching</label>
                <select id="search-mode" v-model="mode" class="form-select">
                  <option
                    value="exact"
                    :disabled="!readiness.available('seqkit')"
                  >
                    Exact match
                  </option>
                  <option
                    value="substitutions"
                    :disabled="!readiness.available('seqkit')"
                  >
                    Allow substitutions (SeqKit)
                  </option>
                  <option value="blast" :disabled="!blastAvailable">
                    Similarity search (BLAST+)
                  </option>
                </select>
                <small class="form-text"
                  >SeqKit finds exact/full-length substitution matches. BLAST
                  finds similar subsequences with insertions and deletions; a
                  hit is an alignment, not an exact occurrence. BLAST can search
                  locally or submit queries to NCBI.</small
                >
              </div>
              <div v-if="mode === 'substitutions'" class="col-sm-6">
                <label for="search-mismatches" class="form-label"
                  >Maximum substitutions per match</label
                >
                <input
                  id="search-mismatches"
                  v-model.number="mismatches"
                  type="number"
                  min="1"
                  step="1"
                  class="form-control"
                  required
                />
              </div>
              <div
                v-else-if="mode === 'exact'"
                class="col-sm-6 form-check align-self-center ps-4"
              >
                <input
                  id="search-degenerate"
                  v-model="degenerate"
                  type="checkbox"
                  class="form-check-input"
                />
                <label for="search-degenerate" class="form-check-label"
                  >Expand IUPAC ambiguity codes in queries</label
                >
                <small class="form-text d-block"
                  >Otherwise letters such as N are matched literally.</small
                >
              </div>
              <template v-if="mode === 'blast'">
                <div class="col-sm-6">
                  <label for="blast-search-target" class="form-label"
                    >BLAST target</label
                  >
                  <select
                    id="blast-search-target"
                    v-model="searchTarget"
                    class="form-select"
                  >
                    <option value="LOCAL_ASSEMBLY">Local assembly</option>
                    <option value="NCBI_REMOTE">NCBI remote</option>
                  </select>
                </div>
                <template v-if="isRemote">
                  <div class="col-sm-6">
                    <label for="blast-remote-database" class="form-label"
                      >NCBI database</label
                    >
                    <select
                      id="blast-remote-database"
                      v-model="remoteDatabase"
                      class="form-select"
                    >
                      <option value="nt">Nucleotide collection (nt)</option>
                      <option value="refseq_rna">RefSeq RNA</option>
                      <option value="16S_ribosomal_RNA">
                        16S ribosomal RNA
                      </option>
                    </select>
                  </div>
                  <div class="col-sm-6">
                    <label for="blast-remote-timeout" class="form-label"
                      >Timeout (minutes)</label
                    >
                    <input
                      id="blast-remote-timeout"
                      v-model.number="remoteTimeoutMinutes"
                      type="number"
                      min="1"
                      max="30"
                      step="1"
                      required
                      class="form-control"
                    />
                  </div>
                  <div class="col-12">
                    <details :open="recoverExisting" @toggle="toggleRecovery">
                      <summary>Recover an existing NCBI request</summary>
                      <label for="blast-remote-rid" class="form-label mt-2"
                        >NCBI request ID (RID)</label
                      >
                      <input
                        id="blast-remote-rid"
                        v-model="remoteRequestId"
                        class="form-control"
                        maxlength="64"
                        pattern="[A-Za-z0-9]{8,64}"
                        autocomplete="off"
                        spellcheck="false"
                        :disabled="busy || !recoverExisting"
                        :required="recoverExisting"
                      />
                      <p class="small mt-2 mb-0">
                        Paste the original queries and FASTA headers above. HiCT
                        downloads the completed request and checks its labels,
                        lengths and available aligned bases. Identity, e-value,
                        per-HSP coverage and target limits filter the downloaded
                        alignments.
                      </p>
                    </details>
                  </div>
                  <div
                    class="col-12 alert mb-0"
                    :class="isRetrieval ? 'alert-info' : 'alert-warning'"
                  >
                    <p v-if="!isRetrieval">
                      NCBI remote sends these queries over the network. Use it
                      only for sequences you may share with NCBI. Cancel stops
                      HiCT waiting; a submitted search may continue at NCBI. No
                      automatic resubmission is made.
                    </p>
                    <p v-else>
                      HiCT sends only the RID to NCBI. Pasted sequences are
                      checked on the HiCT server. Recovery never submits a new
                      search.
                    </p>
                    <div class="form-check">
                      <input
                        id="blast-remote-consent"
                        v-model="remoteConsent"
                        type="checkbox"
                        class="form-check-input"
                        required
                      />
                      <label
                        for="blast-remote-consent"
                        class="form-check-label"
                        >{{
                          isRetrieval
                            ? "Allow download of this request. I confirm it belongs to the queries above."
                            : "I agree to send these query sequences to NCBI."
                        }}</label
                      >
                    </div>
                    <small
                      >At most 10 queries and 100,000 total bases per job.
                      Progress and cancellation remain available in Jobs.</small
                    >
                  </div>
                </template>
              </template>
            </div>
            <AdvancedSection dialog-id="sequence-search">
              <SequenceGapSettings v-if="!isRemote" :request-manager="manager" />
              <div v-if="mode === 'blast'" class="row g-3">
                <div class="col-sm-6">
                  <label class="form-label"
                    >Maximum E-value<input
                      v-model.number="blastEvalue"
                      type="number"
                      min="1e-100"
                      step="any"
                      required
                      class="form-control"
                  /></label>
                </div>
                <div class="col-sm-6">
                  <label class="form-label"
                    >Minimum identity (%)<input
                      v-model.number="identity"
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      required
                      class="form-control"
                  /></label>
                </div>
                <div class="col-sm-6">
                  <label class="form-label"
                    >Minimum query coverage per alignment (%)<input
                      v-model.number="coverage"
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      required
                      class="form-control"
                  /></label>
                </div>
                <div class="col-sm-6">
                  <label class="form-label"
                    >Maximum subject records per query<input
                      v-model.number="blastMaxTargets"
                      type="number"
                      min="1"
                      :max="isRemote ? 500 : 1000000"
                      step="1"
                      required
                      class="form-control"
                  /></label>
                </div>
                <small v-if="!isRemote" class="form-text"
                  >Uses blastn-short if any query is shorter than 50 bases,
                  otherwise blastn. Low-complexity masking is off. Separate
                  gap-free scaffold segments are searched as independent
                  subjects; the target limit can omit weaker matches.</small
                >
                <small v-else class="form-text"
                  >Low-complexity masking is on. The target limit applies to
                  subject records per query; a subject can have multiple
                  alignments.</small
                >
              </div>
              <template v-if="!isRemote">
                <div class="row g-3 mt-0">
                  <div class="col-sm-6">
                    <label for="search-forward-color" class="form-label"
                      >Forward strand color</label
                    >
                    <input
                      id="search-forward-color"
                      v-model="forwardColor"
                      type="color"
                      class="form-control form-control-color"
                    />
                  </div>
                  <div class="col-sm-6">
                    <label for="search-reverse-color" class="form-label"
                      >Reverse strand color</label
                    >
                    <input
                      id="search-reverse-color"
                      v-model="reverseColor"
                      type="color"
                      class="form-control form-control-color"
                    />
                  </div>
                </div>
              </template>
              <div v-if="!isRemote" class="form-check mt-3">
                <input
                  id="search-save-data"
                  v-model="saveReusable"
                  type="checkbox"
                  class="form-check-input"
                /><label for="search-save-data" class="form-check-label"
                  >Save a reusable BED file in the data folder</label
                >
              </div>
              <div v-if="saveReusable && !isRemote" class="row g-3 mt-0">
                <div class="col-sm-9">
                  <label for="search-output" class="form-label"
                    >BED output path</label
                  ><input
                    id="search-output"
                    v-model.trim="outputFilename"
                    class="form-control"
                    required
                    placeholder="sequence-analysis/search-results.bed"
                  /><small class="form-text"
                    >HiCT creates the path under the data folder.</small
                  >
                </div>
                <div class="col-sm-3 form-check align-self-end pb-2">
                  <input
                    id="search-overwrite"
                    v-model="overwrite"
                    type="checkbox"
                    class="form-check-input"
                  /><label for="search-overwrite" class="form-check-label"
                    >Overwrite</label
                  >
                </div>
              </div>
              <details class="small mb-3">
                <summary>How this works</summary>
                <p v-if="isRetrieval" class="mt-2">
                  Only the existing RID is sent to NCBI. Pasted queries are
                  checked on the HiCT server against returned labels, lengths
                  and available aligned bases. Results keep external database
                  coordinates.
                </p>
                <p v-else-if="isRemote" class="mt-2">
                  Only the pasted query sequences and generated query IDs are
                  sent to NCBI. Results use external database coordinates. Your
                  linked FASTA and assembly are not uploaded.
                </p>
                <p v-else class="mt-2">
                  The active assembly is searched in its current order and
                  orientation, preserving AGP gaps and using the configured
                  default between scaffolds. Excluded regions and debris are
                  omitted. Searches do not cross positive-length gaps.
                </p>
              </details>
            </AdvancedSection>
          </fieldset>
          <div v-if="job" class="mt-3" role="status" aria-live="polite">
            <span
              v-if="busy"
              class="spinner-border spinner-border-sm me-2"
              aria-hidden="true"
            ></span>
            {{ job.status
            }}<span v-if="job.status === 'finished'"
              >: {{ job.hits }} matches</span
            >
            <span v-if="displaying">; opening results...</span>
          </div>
          <p
            v-if="
              job?.status === 'finished' &&
              job.outputFile &&
              job.kind !== 'remote_blast'
            "
            class="small mt-2"
          >
            Saved BED: {{ job.outputFile }}
          </p>
          <p
            v-if="job?.status === 'finished' && job.hits === 0"
            class="alert alert-info"
          >
            No matching sequence found.
          </p>
          <pre
            v-if="job?.logs.length"
            class="sequence-logs mt-2"
            aria-label="Sequence search log"
            >{{ job.logs.join("\n") }}</pre
          >
        </div>
        <footer class="modal-footer">
          <button
            v-if="busy && job"
            type="button"
            class="btn btn-outline-danger"
            @click="cancel"
          >
            Cancel search
          </button>
          <button
            type="button"
            class="btn btn-outline-secondary"
            @click="emit('dismissed')"
          >
            Close
          </button>
          <button
            v-if="job?.status === 'finished' && job.hits > 0"
            type="button"
            class="btn btn-primary"
            :disabled="busy"
            @click="displayResult"
          >
            {{
              job?.kind === "remote_blast"
                ? "Open NCBI results"
                : "Open result track"
            }}
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="
              busy ||
              !!unavailableReason ||
              !queries.trim() ||
              (isRemote && !remoteConsent)
            "
          >
            {{ isRetrieval ? "Retrieve NCBI results" : "Search" }}
          </button>
        </footer>
      </form>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
import AdvancedSection from "@/app/ui/components/common/AdvancedSection.vue";
import { useModalFocus } from "@/app/ui/modalFocus";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";
import { ref, computed, onBeforeUnmount, watch } from "vue";
import { useRemoteBlastResultsStore } from "@/app/stores/remoteBlastResultsStore";
import { useSequenceReadiness } from "./useSequenceReadiness";
import SequenceGapSettings from "./SequenceGapSettings.vue";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import type { RequestManager } from "@/app/core/net/api/RequestManager";
import {
  SequenceAnalysisRequest,
  type SequenceAnalysisJob,
  type SequenceSearchSettings,
} from "@/app/core/net/api/SequenceAnalysisRequest";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
import { useNotificationCenterStore } from "@/app/stores/notificationCenterStore";

const props = defineProps<{
  mapManager?: ContactMapManager;
  requests?: RequestManager;
  initialRemote?: boolean;
  initialSelection?: boolean;
}>();
const emit = defineEmits<{ (e: "dismissed"): void; (e: "linkFasta"): void }>();
// Capture requests once per dialog. Local delivery is guarded by the original history session.
// eslint-disable-next-line vue/no-setup-props-destructure
const requestManager =
  props.requests ?? props.mapManager?.networkManager.requestManager;
if (!requestManager)
  throw new Error("Sequence search requires a request manager");
const manager: RequestManager = requestManager;
const notifications = useNotificationCenterStore();
// eslint-disable-next-line vue/no-setup-props-destructure
const borders =
  props.mapManager?.viewAndLayersManager.currentViewState.selectionBorders;
const selection =
  borders?.leftBP && borders.rightBP
    ? {
        startBp: Math.min(...borders.leftBP, ...borders.rightBP),
        endBp: Math.max(...borders.leftBP, ...borders.rightBP),
      }
    : null;
const queries = ref("");
const scope = ref<"assembly" | "selection">(
  props.initialSelection && selection ? "selection" : "assembly"
);
const bothStrands = ref(true),
  degenerate = ref(false),
  mismatches = ref(1);
const mode = ref<"exact" | "substitutions" | "blast">(
  props.initialRemote ? "blast" : "exact"
);
const searchTarget = ref<"LOCAL_ASSEMBLY" | "NCBI_REMOTE">(
  props.initialRemote ? "NCBI_REMOTE" : "LOCAL_ASSEMBLY"
);
const remoteDatabase = ref<"nt" | "refseq_rna" | "16S_ribosomal_RNA">("nt");
const recoverExisting = ref(false),
  remoteRequestId = ref("");
function toggleRecovery(event: Event) {
  const details = event.currentTarget as HTMLDetailsElement;
  if (busy.value) {
    details.open = recoverExisting.value;
    return;
  }
  recoverExisting.value = details.open;
}
const remoteTimeoutMinutes = ref(10),
  remoteConsent = ref(false);
const isRemote = computed(
  () => mode.value === "blast" && searchTarget.value === "NCBI_REMOTE"
);
const isRetrieval = computed(() => isRemote.value && recoverExisting.value);
const remoteEvalue = ref(1e-5),
  remoteMaxTargets = ref(50);
const evalue = ref(10),
  identity = ref(70),
  coverage = ref(50),
  maxTargets = ref(500);
const blastEvalue = computed({
  get: () => (isRemote.value ? remoteEvalue.value : evalue.value),
  set: (value) => {
    if (isRemote.value) remoteEvalue.value = value;
    else evalue.value = value;
  },
});
const blastMaxTargets = computed({
  get: () => (isRemote.value ? remoteMaxTargets.value : maxTargets.value),
  set: (value) => {
    if (isRemote.value) remoteMaxTargets.value = value;
    else maxTargets.value = value;
  },
});
watch(
  [mode, searchTarget, remoteDatabase, recoverExisting, remoteRequestId],
  () => {
    remoteConsent.value = false;
    if (mode.value !== "blast") searchTarget.value = "LOCAL_ASSEMBLY";
  }
);
const uiSettings = useUiSettingsStore();
const forwardColor = ref(uiSettings.sequenceForwardColor),
  reverseColor = ref(uiSettings.sequenceReverseColor);
const saveReusable = ref(false),
  overwrite = ref(false),
  outputFilename = ref("");
const readiness = useSequenceReadiness(manager);
const blastAvailable = computed(() => readiness.available("blastn"));
const blastUnavailableReason = computed(() => readiness.reason("blastn"));
const unavailableReason = computed(() =>
  isRemote.value
    ? isRetrieval.value
      ? readiness.retrievalReason() ||
        (!/^[A-Za-z0-9]{8,64}$/.test(remoteRequestId.value.trim())
          ? "Enter a valid NCBI request ID (RID)."
          : "")
      : readiness.toolReason("blastn")
    : readiness.reason(mode.value === "blast" ? "blastn" : "seqkit")
);
const submitting = ref(false),
  error = ref("");
const job = ref<SequenceAnalysisJob | null>(null);
const displaying = ref(false);
const busy = computed(
  () =>
    submitting.value ||
    displaying.value ||
    (!!job.value &&
      ["submitted", "preparing", "running"].includes(job.value.status))
);
let timer: number | undefined;
let delivered = false;
function deferResult(): void {
  if (!job.value || delivered) return;
  if (job.value.kind === "remote_blast") return; // Jobs opens external results independently of this map.
  const id = job.value.jobId;
  manager.backgroundResultDelivery.defer(
    "sequence/" + id,
    () => !!props.mapManager && !props.mapManager.isDisposed && !delivered,
    async () => {
      const jobs: SequenceAnalysisJob[] = (
        await manager.sendRequest(
          new SequenceAnalysisRequest("/sequence/jobs/list")
        )
      ).data;
      const current = jobs.find((item) => item.jobId === id);
      if (!current) return;
      job.value = current;
      sourceSession = manager.history.applied?.session;
      if (current.hits > 0) await displayResult();
      else
        notifications.add(
          "info",
          "Sequence search completed: no matching sequence found."
        );
    }
  );
}
let disposed = false;
let openingResult = false;
let sourceSession: string | undefined;
let tracksBeforeDelivery: Set<string> | undefined;
useEscDismissableDialog({
  priority: 1070,
  isOpen: () => true,
  requestClose: () => emit("dismissed"),
});
onBeforeUnmount(() => {
  disposed = true;
  window.clearTimeout(timer);
  deferResult();
});

async function start() {
  if (
    busy.value ||
    unavailableReason.value ||
    (isRemote.value && !remoteConsent.value)
  )
    return;
  error.value = "";
  submitting.value = true;
  openingResult = false;
  delivered = false;
  tracksBeforeDelivery = undefined;
  job.value = null;
  sourceSession = manager.history.applied?.session;
  const retrievalAtSubmit = isRetrieval.value;
  const ridAtSubmit = remoteRequestId.value.trim().toUpperCase();
  const settings: SequenceSearchSettings = {
    gapLengthBp: uiSettings.sequenceGapLengthBp,
    queries: queries.value,
    scope: isRemote.value ? "database" : scope.value,
    searchTarget: isRemote.value ? "NCBI_REMOTE" : "LOCAL_ASSEMBLY",
    ...(isRemote.value
      ? {
          remoteConsent: remoteConsent.value,
          remoteDatabase: remoteDatabase.value,
          remoteTimeoutMinutes: remoteTimeoutMinutes.value,
        }
      : {}),
    mode: mode.value,
    bothStrands: bothStrands.value,
    degenerate: mode.value === "exact" && degenerate.value,
    mismatches: mismatches.value,
    threads: -1,
    evalue: blastEvalue.value,
    identity: identity.value,
    coverage: coverage.value,
    maxTargets: blastMaxTargets.value,
    forwardColor: forwardColor.value,
    reverseColor: reverseColor.value,
    ...(saveReusable.value && !isRemote.value
      ? {
          outputFilename:
            outputFilename.value || "sequence-analysis/search-results.bed",
          overwrite: overwrite.value,
        }
      : {}),
    ...(!isRemote.value && scope.value === "selection" && selection
      ? selection
      : {}),
  };
  uiSettings.sequenceForwardColor = forwardColor.value;
  uiSettings.sequenceReverseColor = reverseColor.value;
  try {
    job.value = (
      await (retrievalAtSubmit
        ? manager.retrieveRemoteBlast({
            ...settings,
            mode: "blast",
            scope: "database",
            searchTarget: "NCBI_REMOTE",
            remoteRequestId: ridAtSubmit,
          })
        : manager.sendRequest(
            new SequenceAnalysisRequest("/sequence/search/jobs", settings)
          ))
    ).data;
    if (disposed) deferResult();
    notifications.add(
      "info",
      retrievalAtSubmit
        ? `NCBI request recovery started (${ridAtSubmit}). Progress and results are available in Jobs.`
        : isRemote.value
        ? `NCBI remote BLAST submitted (${remoteDatabase.value}). Progress and results are available in Jobs.`
        : `Sequence search submitted (${scope.value}, ${
            bothStrands.value ? "both strands" : "forward strand"
          }, ${mode.value}).`
    );
    timer = window.setTimeout(poll, 300);
  } catch (failure) {
    error.value = extractErrorMessage(failure);
    if (disposed) notifications.add("error", error.value);
  } finally {
    submitting.value = false;
  }
}

async function poll() {
  if (disposed || !job.value) return;
  try {
    const jobs: SequenceAnalysisJob[] = (
      await manager.sendRequest(
        new SequenceAnalysisRequest("/sequence/jobs/list")
      )
    ).data;
    const current = jobs.find((item) => item.jobId === job.value?.jobId);
    if (!current) {
      error.value =
        "The server no longer has this job. Its files may be retained in processed/sequence-analysis.";
      job.value = null;
      return;
    }
    job.value = current;
    if (current.status === "finished" && !openingResult) {
      openingResult = true;
      error.value = "";
      if (current.kind === "remote_blast" || current.hits > 0)
        await displayResult();
      else
        notifications.add(
          "info",
          "Sequence search completed: no matching sequence found."
        );
      return;
    }
    if (current.status === "failed") {
      error.value = current.error ?? "Sequence analysis failed";
      notifications.add("error", error.value);
      return;
    }
    if (current.status === "cancelled") {
      notifications.add("info", "Sequence search cancelled.");
      return;
    }
  } catch (failure) {
    error.value = `Could not refresh search progress: ${extractErrorMessage(
      failure
    )}. Retrying…`;
  }
  if (!disposed) timer = window.setTimeout(poll, 1000);
}

async function displayResult() {
  const current = job.value;
  if (!current || current.status !== "finished" || displaying.value) return;
  if (current.kind === "remote_blast") {
    delivered = true;
    useRemoteBlastResultsStore().open(current.jobId);
    emit("dismissed");
    return;
  }
  if (!props.mapManager) {
    error.value = "Open the original map to display this local result.";
    return;
  }
  if (sourceSession !== manager.history.applied?.session) {
    error.value = `The map changed while searching. Result saved at ${current.outputFile}; open it on the original map.`;
    notifications.add("warning", error.value);
    return;
  }
  if (!current.outputFile) {
    error.value =
      "Search finished without a BED output path. Check the server log.";
    return;
  }
  displaying.value = true;
  error.value = "";
  try {
    const tracks = props.mapManager.linearTrackManager;
    // A previous POST may have succeeded even if the subsequent refresh failed.
    // Reconcile before retrying so a temporary network error cannot duplicate tracks.
    // Delivery must not wait for unrelated tracks to finish their viewport queries.
    await tracks.refreshTrackList(false);
    tracksBeforeDelivery ??= new Set(
      tracks.getTracksSnapshot().map((t) => t.trackId)
    );
    const isResultTrack = (t: { trackId: string; sourceFile: string }) =>
      t.sourceFile === current.outputFile &&
      !tracksBeforeDelivery!.has(t.trackId);
    if (!tracks.getTracksSnapshot().some(isResultTrack))
      await tracks.openTrack(
        current.outputFile,
        `Sequence search (${current.hits} matches)`,
        false
      );
    const track = tracks.getTracksSnapshot().find(isResultTrack);
    if (!track)
      throw new Error(
        "The server did not return the result track. Try opening it again."
      );
    if (!track.visible)
      await tracks.updateTrack(track.trackId, { visible: true });
    tracks.setTrackVisibleOnAxis(track.trackId, "horizontal", true);
    tracks.setTrackVisibleOnAxis(track.trackId, "vertical", true);
    props.mapManager.scheduleWorkspaceLayoutRefresh();
    delivered = true;
    notifications.add(
      "success",
      `Sequence search completed: ${current.hits} matches. Result track added on both axes.`
    );
    emit("dismissed");
  } catch (failure) {
    error.value = `Search finished, but the track could not be opened: ${extractErrorMessage(
      failure
    )}. Use Open result track to retry without repeating the search.`;
    notifications.add("error", error.value);
  } finally {
    displaying.value = false;
  }
}

async function cancel() {
  if (!job.value) return;
  try {
    await manager.sendRequest(
      new SequenceAnalysisRequest(`/sequence/jobs/${job.value.jobId}/stop`)
    );
  } catch (failure) {
    error.value = extractErrorMessage(failure);
  }
}

const modalFocusElement = ref<HTMLElement | null>(null);
useModalFocus(modalFocusElement);
</script>

<style scoped>
.sequence-backdrop {
  position: fixed;
  inset: 0;
  background: #0007;
  z-index: 1065;
}
.sequence-modal {
  position: fixed;
  inset: 4vh auto auto 50%;
  transform: translateX(-50%);
  width: min(900px, 96vw);
  z-index: 1070;
}
.sequence-modal .modal-body {
  max-height: 75vh;
  overflow-y: auto;
}
.sequence-input {
  font-family: ui-monospace, monospace;
}
.sequence-logs {
  max-height: 13rem;
  overflow: auto;
  padding: 0.8rem;
  background: #eef2f7;
  color: #172b42;
  white-space: pre-wrap;
}

.sequence-modal {
  font-family: system-ui, sans-serif;
  color: var(--hict-surface-fg, #172033);
}
.sequence-modal .modal-content {
  border: 1px solid #cbd5e1;
  border-radius: 0.6rem;
  box-shadow: 0 12px 40px #0003;
  background: #fff;
  overflow: hidden;
}
.sequence-modal .modal-header,
.sequence-modal .modal-footer {
  padding: 1rem 1.4rem;
  display: flex;
  align-items: center;
  gap: 0.8rem;
}
.sequence-modal .modal-header {
  justify-content: space-between;
  border-bottom: 1px solid #cbd5e1;
}
.sequence-modal .modal-footer {
  justify-content: flex-end;
  border-top: 1px solid #cbd5e1;
}
.sequence-modal .modal-body {
  padding: 1.2rem 1.4rem;
}
.sequence-modal .form-check {
  padding-left: 1.7rem;
}
</style>
