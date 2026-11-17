<template>
  <Teleport to="body">
    <div class="remote-results-backdrop"></div>
    <section
      ref="dialog"
      class="remote-results"
      role="dialog"
      aria-modal="true"
      aria-labelledby="remote-results-title"
    >
      <header>
        <h5 id="remote-results-title">NCBI BLAST results</h5>
        <button
          class="btn-close"
          type="button"
          aria-label="Close"
          @click="emit('dismissed')"
        ></button>
      </header>
      <div class="remote-results-body">
        <p v-if="loading" role="status">Loading external results…</p>
        <div v-else-if="error" role="alert">
          <p>{{ error }}</p>
          <button type="button" class="btn btn-outline-primary" @click="load">
            Retry loading results
          </button>
        </div>
        <template v-if="report && !loading">
          <p>
            <strong>{{ report.database }}</strong> ·
            {{ report.hitCount.toLocaleString() }} alignment rows · completed
            {{ new Date(report.completedAt).toLocaleString() }}
          </p>
          <p class="small">
            Coordinates refer to external database subjects (1-based,
            inclusive). Multiple rows may align to one subject.
          </p>
          <p v-if="report.truncated" class="alert alert-warning" role="status">
            The report shows the first
            {{ report.hits.length.toLocaleString() }} alignments. Export the raw
            TSV for all returned rows.
          </p>
          <details class="small mb-3">
            <summary>Queries and provenance</summary>
            <p v-if="report.remoteDatabaseName">
              Service database: {{ report.remoteDatabaseName }}
            </p>
            <ul>
              <li v-for="query in report.queries" :key="query.id">
                {{ query.id }} · {{ query.length.toLocaleString() }} bases ·
                {{ query.description }}
              </li>
            </ul>
            <p>
              Query file SHA-256: <code>{{ report.querySha256 }}</code>
            </p>
            <p>
              NCBI databases change over time. The report records this search's
              database, settings and completion date.
            </p>
          </details>
          <p
            v-if="report.hitCount === 0"
            class="alert alert-info"
            role="status"
          >
            NCBI returned no alignments matching these settings.
          </p>
          <template v-else>
            <div class="filters">
              <div>
                <label for="remote-results-query">Query</label>
                <select
                  id="remote-results-query"
                  v-model="queryFilter"
                  class="form-select form-select-sm"
                >
                  <option value="">All queries</option>
                  <option
                    v-for="query in report.queries"
                    :key="query.id"
                    :value="query.id"
                  >
                    {{ query.id }}
                  </option>
                </select>
              </div>
              <div>
                <label for="remote-results-filter"
                  >Subject accession or title</label
                >
                <input
                  id="remote-results-filter"
                  v-model="subjectFilter"
                  class="form-control form-control-sm"
                  type="search"
                />
              </div>
            </div>
            <div
              ref="tableScroll"
              class="result-table"
              tabindex="0"
              aria-label="External BLAST alignments, scroll horizontally for all columns"
            >
              <table class="table table-sm">
                <caption>
                  External alignments ·
                  {{
                    filtered.length.toLocaleString()
                  }}
                  matching rows · page
                  {{
                    page + 1
                  }}
                  of
                  {{
                    pages
                  }}
                </caption>
                <thead>
                  <tr>
                    <th>Query</th>
                    <th>Subject</th>
                    <th>Query interval</th>
                    <th>Subject interval</th>
                    <th>Strand</th>
                    <th>Identity</th>
                    <th>Query span</th>
                    <th>E-value</th>
                    <th>Bit score</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(hit, index) in visible" :key="page * 50 + index">
                    <td>{{ hit.queryId }}</td>
                    <td class="subject">
                      <a
                        v-if="ncbiAccessionUrl(hit.accession)"
                        :href="ncbiAccessionUrl(hit.accession)!"
                        target="_blank"
                        rel="noopener noreferrer"
                        >{{ hit.accession }}</a
                      ><span v-else>{{ hit.accession || hit.subjectId }}</span
                      ><small class="d-block">{{ hit.title }}</small>
                    </td>
                    <td>
                      {{ hit.queryStart.toLocaleString() }}–{{
                        hit.queryEnd.toLocaleString()
                      }}
                    </td>
                    <td>
                      {{ hit.subjectStart.toLocaleString() }}–{{
                        hit.subjectEnd.toLocaleString()
                      }}
                    </td>
                    <td>{{ hit.strand }}</td>
                    <td>{{ hit.identity.toFixed(2) }}%</td>
                    <td>
                      {{
                        (
                          (100 *
                            (Math.abs(hit.queryEnd - hit.queryStart) + 1)) /
                          hit.queryLength
                        ).toFixed(1)
                      }}%
                    </td>
                    <td>{{ hit.evalue }}</td>
                    <td>{{ hit.bitscore }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="pagination-controls">
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                :disabled="page === 0"
                @click="page--"
              >
                Previous page
              </button>
              <span class="small" role="status"
                >Page {{ page + 1 }} of {{ pages }}</span
              >
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                :disabled="page + 1 >= pages"
                @click="page++"
              >
                Next page
              </button>
            </div>
          </template>
          <p v-if="saveError" role="alert" class="text-danger">
            {{ saveError }}
          </p>
        </template>
      </div>
      <footer>
        <button
          v-if="report"
          type="button"
          class="btn btn-outline-primary"
          :disabled="saving"
          @click="save('JSON')"
        >
          Save JSON report…
        </button>
        <button
          v-if="report"
          type="button"
          class="btn btn-outline-primary"
          :disabled="saving"
          @click="save('TSV')"
        >
          Save raw TSV…
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          @click="emit('dismissed')"
        >
          Close
        </button>
      </footer>
    </section>
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
import type { RequestManager } from "@/app/core/net/api/RequestManager";
import { SequenceAnalysisRequest } from "@/app/core/net/api/SequenceAnalysisRequest";
import {
  parseRemoteBlastReport,
  ncbiAccessionUrl,
  type RemoteBlastReport,
} from "@/app/core/sequence/RemoteBlastReport";
import { prepareFileSave } from "@/app/core/export/FileSave";
import { notifyFileSave } from "@/app/ui/fileSaveNotice";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";
import { useModalFocus } from "@/app/ui/modalFocus";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";

const props = defineProps<{ requests: RequestManager; jobId: string }>();
const emit = defineEmits<{ (event: "dismissed"): void }>();
const dialog = ref<HTMLElement | null>(null);
const tableScroll = ref<HTMLElement | null>(null);
const report = ref<RemoteBlastReport | null>(null),
  loading = ref(true),
  error = ref("");
const saving = ref(false),
  saveError = ref("");
const queryFilter = ref(""),
  subjectFilter = ref(""),
  page = ref(0);
let disposed = false,
  generation = 0;
const filtered = computed(
  () =>
    report.value?.hits.filter(
      (hit) =>
        (!queryFilter.value || hit.queryId === queryFilter.value) &&
        (!subjectFilter.value ||
          `${hit.accession} ${hit.subjectId} ${hit.title}`
            .toLowerCase()
            .includes(subjectFilter.value.toLowerCase()))
    ) ?? []
);
const pages = computed(() =>
  Math.max(1, Math.ceil(filtered.value.length / 50))
);
const visible = computed(() =>
  filtered.value.slice(page.value * 50, (page.value + 1) * 50)
);
watch([queryFilter, subjectFilter], () => {
  page.value = 0;
});
watch([page, queryFilter, subjectFilter], () => {
  void nextTick(() => {
    if (tableScroll.value) tableScroll.value.scrollTop = 0;
  });
});
useModalFocus(dialog);
useEscDismissableDialog({
  priority: 1075,
  isOpen: () => true,
  requestClose: () => emit("dismissed"),
});
async function load() {
  const current = ++generation;
  loading.value = true;
  error.value = "";
  try {
    const response = await props.requests.sendRequest(
      new SequenceAnalysisRequest("/sequence/remote_blast/result", {
        jobId: props.jobId,
      })
    );
    if (!disposed && current === generation)
      report.value = parseRemoteBlastReport(response.data);
  } catch (failure) {
    if (!disposed && current === generation)
      error.value = extractErrorMessage(failure);
  } finally {
    if (!disposed && current === generation) loading.value = false;
  }
}
async function save(format: "JSON" | "TSV") {
  if (!report.value || saving.value) return;
  saving.value = true;
  saveError.value = "";
  try {
    const destination = await prepareFileSave(
      `hict_ncbi_${report.value.database}_${props.jobId.slice(
        0,
        8
      )}.${format.toLowerCase()}`,
      "other"
    );
    if (!destination || disposed) return;
    const content =
      format === "JSON"
        ? new Blob([JSON.stringify(report.value, null, 2)], {
            type: "application/json",
          })
        : (
            await props.requests.sendRequest(
              new SequenceAnalysisRequest("/sequence/remote_blast/result", {
                jobId: props.jobId,
                format: "TSV",
              }),
              {
                responseType: "blob",
                headers: { Accept: "text/tab-separated-values" },
              }
            )
          ).data;
    if (!(content instanceof Blob))
      throw new Error("The server returned an invalid TSV result.");
    if (!disposed)
      notifyFileSave(await destination.write(content), "BLAST result");
  } catch (failure) {
    if (!disposed) saveError.value = extractErrorMessage(failure);
  } finally {
    if (!disposed) saving.value = false;
  }
}
onMounted(load);
onBeforeUnmount(() => {
  disposed = true;
  generation++;
});
</script>

<style scoped>
.remote-results-backdrop {
  position: fixed;
  inset: 0;
  background: #0007;
  z-index: 1074;
}
.remote-results {
  position: fixed;
  top: 4vh;
  left: 50%;
  transform: translateX(-50%);
  width: min(1280px, 96vw);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  z-index: 1075;
  background: white;
  color: var(--hict-surface-fg, #172033);
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  box-shadow: 0 12px 40px #0003;
}
header,
footer {
  display: flex;
  align-items: center;
  padding: 1rem;
  gap: 0.7rem;
  flex-shrink: 0;
}
header {
  justify-content: space-between;
  border-bottom: 1px solid #cbd5e1;
}
footer {
  justify-content: flex-end;
  border-top: 1px solid #cbd5e1;
  flex-wrap: wrap;
}
.remote-results-body {
  padding: 1rem;
  overflow: auto;
  min-height: 0;
  overflow-wrap: anywhere;
}
.filters {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}
.filters > div {
  flex: 1 1 16rem;
}
.result-table {
  overflow: auto;
  max-height: min(45vh, 30rem);
}
thead th {
  position: sticky;
  top: 0;
  background: white;
  z-index: 1;
}
caption {
  caption-side: top;
}
table {
  color: inherit;
  min-width: 1000px;
}
th,
td {
  vertical-align: top;
}
.subject {
  min-width: 240px;
  max-width: 440px;
  overflow-wrap: anywhere;
}
.pagination-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 0.5rem;
}
code {
  overflow-wrap: anywhere;
}
</style>
