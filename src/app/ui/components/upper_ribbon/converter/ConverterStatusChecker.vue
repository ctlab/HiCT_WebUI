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
  <p v-if="errorMessage" role="alert" class="conversion-error">
    {{ errorMessage }}
  </p>
  <article v-if="job" class="conversion-job">
    <div class="job-header">
      <div
        class="job-name"
        :title="job.sourceFilename + ' → ' + job.outputFilename"
      >
        {{ basename(job.sourceFilename)
        }}<span class="job-arrow" aria-hidden="true">→</span
        >{{ basename(job.outputFilename) }}
      </div>
      <span class="status-pill" :class="job.status">{{ job.status }}</span>
      <button
        v-if="showStop && active(job)"
        type="button"
        class="job-stop ms-auto"
        @click="stopJob"
      >
        Stop
      </button>
    </div>
    <p v-if="stage" class="job-stage">{{ stage }}</p>
    <div
      class="job-progress"
      :class="job.status"
      role="progressbar"
      aria-label="Overall conversion progress"
      :aria-valuenow="progress"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <span :style="{ width: progress + '%' }"></span>
    </div>
    <div v-if="job.status === 'finished'" class="job-meta">
      <span
        >{{ basename(job.outputFilename) }} ·
        {{ formatBytes(job.outputSizeBytes) }}</span
      >
      <span>Took {{ formatDuration(job.elapsedMillis) }}</span>
    </div>
    <p v-else-if="job.error" class="conversion-error" role="alert">
      <i class="bi bi-exclamation-circle" aria-hidden="true"></i> {{ jobError }}
    </p>
    <div v-else class="job-meta">
      <span>{{ progress }}% overall</span>
      <span v-if="job.status === 'running'">
        Elapsed {{ formatDuration(job.elapsedMillis) }} ·
        {{
          job.etaMillis >= 0
            ? "about " + formatDuration(job.etaMillis) + " left"
            : "estimating time left…"
        }}
      </span>
    </div>
    <details
      v-if="job.logs.length"
      class="analysis-log-details"
      :open="logOpen"
    >
      <summary @click.prevent="toggleLog">
        {{ logOpen ? "Hide log" : "Show log" }}
      </summary>
      <pre
        ref="logElement"
        class="analysis-logs"
        aria-label="Conversion log"
        tabindex="0"
        @scroll="onLogScroll"
        >{{ log }}</pre
      >
      <button type="button" class="btn btn-link copy-log" @click="copyLog">
        <i class="bi bi-clipboard" aria-hidden="true"></i> Copy log
      </button>
    </details>
    <slot v-if="job.status === 'finished'" name="result" :job="job"></slot>
    <details v-if="showToolInfo && toolInfo.length" class="about-tools">
      <summary>About the bundled tools (hictk, licences and citations)</summary>
      <p v-for="line in toolInfo" :key="line">{{ line }}</p>
    </details>
  </article>
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
import type { NetworkManager } from "@/app/core/net/NetworkManager.js";
import type { ConversionJobResponse } from "@/app/core/net/api/response";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";

const props = withDefaults(
  defineProps<{
    networkManager: NetworkManager;
    jobId: string;
    showStop?: boolean;
    showToolInfo?: boolean;
  }>(),
  { showStop: true, showToolInfo: true }
);
const emit = defineEmits<{
  (e: "status-update", job: ConversionJobResponse): void;
}>();

const job = ref<ConversionJobResponse>();
const errorMessage = ref("");
const logElement = ref<HTMLElement>();
const logOpen = ref(false);
let followsLog = true;
let disposed = false;
let timer: number | undefined;
let missedRequests = 0;

function active(result: ConversionJobResponse): boolean {
  return result.status === "running" || result.status === "queued";
}

async function updateState(): Promise<void> {
  try {
    const response = await props.networkManager.requestManager.getConversionJob(
      props.jobId
    );
    if (disposed) return;
    missedRequests = 0;
    errorMessage.value = "";
    const newlyFailed =
      response.status === "failed" && job.value?.status !== "failed";
    job.value = response;
    if (newlyFailed) {
      followsLog = true;
      logOpen.value = true;
    }
    emit("status-update", response);
  } catch (error) {
    const timedOut =
      (error as { code?: string } | null)?.code === "ECONNABORTED";
    if (!timedOut || ++missedRequests > 10)
      errorMessage.value = extractErrorMessage(error);
  } finally {
    if (!disposed && (!job.value || active(job.value)))
      timer = window.setTimeout(updateState, 1000);
  }
}

async function stopJob(): Promise<void> {
  try {
    await props.networkManager.requestManager.stopConversionJob(props.jobId);
  } catch (error) {
    errorMessage.value = extractErrorMessage(error);
  }
}

const progress = computed(() =>
  job.value?.status === "finished"
    ? 100
    : Math.round((job.value?.overallProgress ?? 0) * 100)
);
const stage = computed(() => {
  const current = job.value;
  if (current?.status !== "running" || !current.currentStageLabel) return "";
  return [
    current.stageIndex && current.stageCount
      ? `Step ${current.stageIndex} of ${current.stageCount}`
      : "",
    current.currentStageLabel,
    current.currentResolution
      ? `resolution ${current.currentResolution.toLocaleString("en-US")} bp`
      : "",
    current.stageCount || current.stageProgress > 0
      ? Math.round(current.stageProgress * 100) + "%"
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
});
const log = computed(() => job.value?.logs.slice(-200).join("\n") ?? "");
const jobError = computed(() => {
  const message = job.value?.error ?? "";
  if (/\b(?:truncated file|file is truncated|truncated input|input is truncated|file truncation)\b/i.test(message)) {
    const resolution = job.value?.currentResolution;
    return resolution
      ? `hictk could not read resolution ${resolution.toLocaleString(
          "en-US"
        )}: the file is truncated.`
      : "hictk could not read the input: the file is truncated.";
  }
  if (message.startsWith("External command failed") || message.includes("\n")) {
    return "Conversion could not finish. See the log for details.";
  }
  return message;
});
const toolInfo = computed(() =>
  Array.from(
    new Set([
      ...(job.value?.toolchainNotices ?? []),
      ...(job.value?.toolchainCitations ?? []),
    ])
  )
);

watch([log, logOpen], async () => {
  await nextTick();
  if (logOpen.value && followsLog && logElement.value)
    logElement.value.scrollTop = logElement.value.scrollHeight;
});

function toggleLog(): void {
  logOpen.value = !logOpen.value;
  if (logOpen.value) followsLog = true;
}

function onLogScroll(): void {
  const element = logElement.value;
  if (logOpen.value && element) {
    followsLog =
      element.scrollHeight - element.clientHeight - element.scrollTop <= 4;
  }
}

async function copyLog(): Promise<void> {
  try {
    await navigator.clipboard.writeText(log.value);
  } catch (error) {
    errorMessage.value = extractErrorMessage(error);
  }
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function formatDuration(millis: number): string {
  const seconds = Math.floor(Math.max(0, millis) / 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unit = 0;
  while (bytes >= 1024 && unit < units.length - 1) {
    bytes /= 1024;
    ++unit;
  }
  return `${Number(bytes.toFixed(1))} ${units[unit]}`;
}

onMounted(updateState);
onBeforeUnmount(() => {
  disposed = true;
  window.clearTimeout(timer);
});
</script>

<style scoped>
.conversion-job {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  padding: 12px 14px;
  background: #fff;
}
.job-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.job-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: #1f2937;
}
.job-arrow {
  margin: 0 6px;
  color: #667085;
}
.status-pill {
  font-size: 12px;
  border-radius: 999px;
  padding: 1px 9px;
  font-weight: 600;
  white-space: nowrap;
  text-transform: capitalize;
  background: #eaecf0;
  color: #475467;
}
.status-pill.running {
  background: #d1e9ff;
  color: #175cd3;
}
.status-pill.finished {
  background: var(--hict-success-soft, #d1fae5);
  color: var(--hict-success, #027a48);
}
.status-pill.failed {
  background: var(--hict-danger-soft, #fee2e2);
  color: #b42318;
}
.job-stop {
  border: 1px solid #fda29b;
  color: #b42318;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 13px;
  background: #fff;
}
.job-stage,
.conversion-error {
  margin: 0;
  font-size: 13px;
}
.job-stage {
  color: #344054;
}
.conversion-error {
  color: #b42318;
}
.job-progress {
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: #eaecf0;
}
.job-progress span {
  display: block;
  height: 100%;
  background: var(--hict-primary, #0d6efd);
}
.job-progress.finished span {
  background: var(--hict-success, #027a48);
}
.job-progress.failed span {
  background: #f04438;
}
.job-meta {
  display: flex;
  justify-content: space-between;
  column-gap: 8px;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  color: #475467;
}
.analysis-log-details summary,
.about-tools summary {
  color: var(--hict-primary, #0d6efd);
  cursor: pointer;
  font-size: 13px;
}
.analysis-logs {
  max-height: 150px;
  margin: 6px 0 0;
  overflow: auto;
  background: #101828;
  color: #e4e7ec;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 11.5px;
  line-height: 1.45;
  white-space: pre-wrap;
}
.copy-log {
  float: right;
  margin-top: 4px;
  padding: 0;
  font-size: 12px;
  text-decoration: none;
}
.about-tools summary {
  color: #475467;
}
</style>
