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
  <div class="examples-dialog">
    <div class="modal-backdrop fade show examples-backdrop"></div>
    <div
      ref="dialog"
      class="modal fade show examples-modal"
      style="display: block"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="examples-title"
      @keydown="trapTab"
    >
      <div
        class="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable"
      >
        <div class="modal-content">
          <div class="modal-header">
            <h5 id="examples-title" class="modal-title">Examples</h5>
            <button
              type="button"
              class="btn-close"
              aria-label="Close"
              @click="emit('dismissed')"
            ></button>
          </div>
          <div class="modal-body">
            <p v-if="loading" role="status">Loading the examples…</p>
            <p v-else-if="loadError" class="text-danger" role="alert">
              {{ loadError }}
            </p>
            <template v-else-if="catalog">
              <div
                v-if="catalog.problems.length"
                id="examples-problems"
                class="alert alert-warning small"
                role="status"
              >
                Some catalog files were not used:
                <ul class="mb-0">
                  <li v-for="(problem, index) in catalog.problems" :key="index">
                    <strong>{{ problem.source }}</strong>
                    <span v-if="problem.pointer"> at {{ problem.pointer }}</span
                    >: {{ problem.message }}
                  </li>
                </ul>
              </div>
              <p v-if="catalog.examples.length === 0">
                There are no examples in the catalog.
              </p>
              <section
                v-for="section in groups"
                :key="section.id"
                class="mb-4"
                :aria-labelledby="'examples-section-' + section.id"
              >
                <h6 :id="'examples-section-' + section.id" class="mb-1">
                  {{ section.title }}
                </h6>
                <p v-if="section.description" class="small text-muted">
                  {{ section.description }}
                </p>
                <div class="row g-3">
                  <div
                    v-for="example in section.items"
                    :key="example.id"
                    class="col-12 col-lg-6"
                  >
                    <article
                      class="card h-100 example-card"
                      :data-example="example.id"
                    >
                      <div class="card-body">
                        <h6 class="card-title">{{ example.title }}</h6>
                        <p
                          v-if="example.organism"
                          class="small fst-italic text-muted mb-1"
                        >
                          {{ example.organism }}
                        </p>
                        <p class="small">{{ example.description }}</p>
                        <p
                          v-if="example.provenance?.reviewStatus === 'draft'"
                          class="small text-warning-emphasis"
                        >
                          Draft entry: not yet opened end to end by the HiCT
                          team.
                        </p>

                        <h6 class="small fw-bold mb-1">Files</h6>
                        <ul class="small ps-3 mb-2">
                          <li v-for="file in example.files" :key="file.id">
                            {{ file.filename }}
                            <span class="text-muted">
                              ({{ roleLabel(file.role)
                              }}{{
                                file.bytes
                                  ? ", " + formatBytes(file.bytes)
                                  : ""
                              }}{{ file.required ? "" : ", optional" }})
                            </span>
                          </li>
                        </ul>
                        <p class="small mb-2">
                          Total download:
                          <strong>{{
                            formatBytes(totalBytes(example))
                          }}</strong>
                        </p>

                        <h6 class="small fw-bold mb-1">Publications</h6>
                        <ul class="small ps-3 mb-2">
                          <li
                            v-for="(pub, index) in example.publications"
                            :key="index"
                          >
                            <template v-if="safeUrl(pub.url)">
                              <a
                                :href="pub.url"
                                target="_blank"
                                rel="noopener noreferrer"
                                >{{ pub.title }}</a
                              >
                            </template>
                            <template v-else>{{ pub.title }}</template>
                            <span class="text-muted">
                              — {{ pub.citation
                              }}{{
                                pub.kind ? " (" + pub.kind + ")" : ""
                              }}</span
                            >
                          </li>
                        </ul>

                        <h6 class="small fw-bold mb-1">Data provider</h6>
                        <p class="small mb-2">
                          <a
                            v-if="safeUrl(example.attribution.url)"
                            :href="example.attribution.url"
                            target="_blank"
                            rel="noopener noreferrer"
                            >{{ example.attribution.provider }}</a
                          >
                          <span v-else>{{ example.attribution.provider }}</span>
                          ·
                          <a
                            v-if="safeUrl(example.attribution.termsUrl)"
                            :href="example.attribution.termsUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                            >terms of use</a
                          >
                          <span v-if="example.attribution.licenseName">
                            · {{ example.attribution.licenseName }}</span
                          >
                          <br />
                          <span class="text-muted">{{
                            example.attribution.acknowledgement
                          }}</span>
                          <span
                            v-if="example.attribution.restrictions"
                            class="d-block text-muted"
                          >
                            {{ example.attribution.restrictions }}
                          </span>
                        </p>
                        <p v-if="!example.bundled" class="small text-muted">
                          From a local catalog ({{ example.source }}).
                        </p>
                      </div>
                      <div class="card-footer bg-transparent">
                        <div
                          v-if="
                            active?.exampleId === example.id &&
                            active.state === 'RUNNING'
                          "
                          class="example-progress"
                        >
                          <progress
                            :value="active.progress"
                            max="1"
                            class="w-100"
                            :aria-label="'Download of ' + example.title"
                          ></progress>
                          <div
                            class="small d-flex justify-content-between align-items-center"
                          >
                            <span role="status" aria-live="polite">
                              {{ active.message }}
                              {{ Math.round(active.progress * 100) }}% ({{
                                formatBytes(active.downloadedBytes)
                              }}
                              of {{ formatBytes(active.totalBytes) }})
                            </span>
                            <button
                              type="button"
                              class="btn btn-sm btn-outline-secondary example-cancel"
                              @click="cancel"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                        <div v-else-if="isReady(example)">
                          <p class="small text-success mb-1" role="status">
                            <template
                              v-if="
                                active?.exampleId === example.id &&
                                active.state === 'READY'
                              "
                            >
                              Downloaded: {{ active.files.join(", ") }}.
                              <span
                                v-if="active.skippedOptional.length"
                                class="text-warning-emphasis"
                              >
                                Not downloaded (optional):
                                {{ active.skippedOptional.join("; ") }}.
                              </span>
                            </template>
                            <template v-else>
                              Downloaded earlier and ready to open.
                            </template>
                          </p>
                          <button
                            type="button"
                            class="btn btn-primary btn-sm example-open"
                            @click="openExample(example)"
                          >
                            {{
                              example.openingRecipe.quickStart
                                ? "Open example"
                                : "Open in HiCT"
                            }}
                          </button>
                          <span
                            v-if="!example.openingRecipe.quickStart"
                            class="small text-muted ms-2"
                            >Opens the wizard with these files; a .hic map is
                            converted first.</span
                          >
                        </div>
                        <div v-else>
                          <p
                            v-if="
                              active?.exampleId === example.id &&
                              active.state === 'FAILED'
                            "
                            class="small text-danger mb-1 example-error"
                            role="alert"
                          >
                            {{ active.error }} Partial files are kept, so trying
                            again resumes.
                          </p>
                          <p
                            v-else-if="
                              active?.exampleId === example.id &&
                              active.state === 'CANCELLED'
                            "
                            class="small text-muted mb-1"
                          >
                            {{ active.message }}
                          </p>
                          <button
                            type="button"
                            class="btn btn-outline-primary btn-sm example-download"
                            :disabled="
                              startingDownload || busyElsewhere(example.id)
                            "
                            :title="
                              busyElsewhere(example.id)
                                ? 'Another example is downloading'
                                : undefined
                            "
                            @click="
                              download(
                                example,
                                example.openingRecipe.quickStart === true
                              )
                            "
                          >
                            {{
                              active?.exampleId === example.id &&
                              (active.state === "FAILED" ||
                                active.state === "CANCELLED")
                                ? "Resume download"
                                : example.openingRecipe.quickStart
                                ? "Open example"
                                : "Download"
                            }}
                          </button>
                        </div>
                      </div>
                    </article>
                  </div>
                </div>
              </section>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type {
  ExampleDownloadStatus,
  ExampleEntry,
  ExamplesCatalogResponse,
  RequestManager,
} from "@/app/core/net/api/RequestManager";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";

const props = defineProps<{ requests: RequestManager }>();
const emit = defineEmits<{
  (e: "dismissed"): void;
  (e: "open", payload: { example: ExampleEntry; folder: string }): void;
}>();

const dialog = ref<HTMLElement | null>(null);
const catalog = ref<ExamplesCatalogResponse | null>(null);
const loading = ref(true);
const loadError = ref("");
const active = ref<ExampleDownloadStatus | null>(null);
const startingDownload = ref(false);
let opener: HTMLElement | null = null;
let disposed = false;

const groups = computed(() => {
  const data = catalog.value;
  if (!data) return [];
  return data.sections
    .map((section) => ({
      ...section,
      items: data.examples.filter((e) => e.sectionId === section.id),
    }))
    .filter((section) => section.items.length > 0);
});

const ROLE_LABELS: Record<string, string> = {
  matrix: "Hi-C map",
  fasta: "sequence",
  agp: "AGP layout",
  assembly: "Assembly layout (.assembly)",
  track: "track",
};
const roleLabel = (role: string) => ROLE_LABELS[role] ?? role;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "size unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${
    value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)
  } ${units[unit]}`;
}
const totalBytes = (example: ExampleEntry) =>
  example.files.reduce((sum, file) => sum + (file.bytes ?? 0), 0);

/** Only https links are made clickable. Anything else is shown as plain text. */
const safeUrl = (url: string) => /^https:\/\/[^\s]+$/.test(url);

/** On disk from an earlier download, or finished in this dialog. */
const isReady = (example: ExampleEntry) =>
  example.downloaded === true ||
  (active.value?.exampleId === example.id && active.value.state === "READY");

const busyElsewhere = (id: string) =>
  active.value?.state === "RUNNING" && active.value.exampleId !== id;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function follow(): Promise<void> {
  while (!disposed) {
    try {
      active.value = await props.requests.exampleDownloadStatus();
    } catch (error) {
      console.debug("Download status unavailable", error);
      return;
    }
    if (active.value?.state !== "RUNNING") {
      if (active.value?.state === "READY")
        markDownloaded(active.value.exampleId);
      return;
    }
    await sleep(600);
  }
}

function markDownloaded(id: string | null): void {
  const entry = catalog.value?.examples.find((e) => e.id === id);
  if (entry) entry.downloaded = true;
}

async function download(
  example: ExampleEntry,
  openWhenReady = false
): Promise<void> {
  if (startingDownload.value) return;
  startingDownload.value = true;
  try {
    active.value = await props.requests.startExampleDownload(example.id);
  } catch (error) {
    const server = error as { response?: { data?: { error?: string } } };
    active.value = {
      state: "FAILED",
      exampleId: example.id,
      progress: 0,
      message: "Failed",
      error:
        server.response?.data?.error ?? "The download could not be started.",
      downloadedBytes: 0,
      totalBytes: 0,
      currentFile: null,
      files: [],
      skippedOptional: [],
      allRequiredPresent: false,
    };
    return;
  } finally {
    startingDownload.value = false;
  }
  await follow();
  if (
    openWhenReady &&
    !disposed &&
    active.value?.exampleId === example.id &&
    active.value.state === "READY"
  )
    openExample(example);
}

async function cancel(): Promise<void> {
  try {
    await props.requests.cancelExampleDownload();
  } catch (error) {
    console.debug("Cancel failed", error);
  }
}

function openExample(example: ExampleEntry): void {
  emit("open", { example, folder: `examples/${example.id}` });
}

useEscDismissableDialog({
  priority: 1050,
  isOpen: () => true,
  requestClose: () => emit("dismissed"),
});

function trapTab(event: KeyboardEvent): void {
  if (event.key !== "Tab") return;
  const items = Array.from(
    dialog.value?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])"
    ) ?? []
  );
  if (items.length === 0) {
    event.preventDefault();
    dialog.value?.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const current = document.activeElement;
  if (
    event.shiftKey &&
    (current === first || !dialog.value?.contains(current))
  ) {
    event.preventDefault();
    last.focus();
  } else if (
    !event.shiftKey &&
    (current === last || !dialog.value?.contains(current))
  ) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(async () => {
  opener = document.activeElement as HTMLElement | null;
  try {
    catalog.value = await props.requests.listExamples();
  } catch (error) {
    console.debug("Could not load the examples", error);
    loadError.value = "The examples could not be loaded from the server.";
  } finally {
    loading.value = false;
  }
  await nextTick();
  dialog.value
    ?.querySelector<HTMLElement>("button.example-download, .btn-close")
    ?.focus();
  // A download started earlier keeps running on the server; pick it up again.
  void follow();
});

onBeforeUnmount(() => {
  disposed = true;
  if (opener && document.contains(opener)) opener.focus();
});
</script>

<style scoped>
.examples-backdrop {
  z-index: 2090;
}
.examples-modal {
  z-index: 2100;
}
</style>
