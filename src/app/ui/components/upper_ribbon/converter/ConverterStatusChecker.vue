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
  <div class="d-flex align-items-center" v-if="errorMessage">
    <p class="error-message">Error: {{ errorMessage }}</p>
  </div>
  <div v-if="job">
    <div class="status-header">
      <div>
        <p>
          <strong>Status:</strong>
          <span class="status-pill" :class="statusClass">{{ statusLabel }}</span>
        </p>
        <p>
          <strong>Input:</strong> {{ job.sourceFilename }} ({{
            formatBytes(job.inputSizeBytes)
          }})
        </p>
        <p>
          <strong>Output:</strong> {{ job.outputFilename }} ({{
            formatBytes(job.outputSizeBytes)
          }})
        </p>
        <p v-if="job.currentStageLabel">
          <strong>Current stage:</strong> {{ job.currentStageLabel }}
          <span v-if="job.stageDetail" class="stage-detail">
            {{ job.stageDetail }}
          </span>
        </p>
        <p v-if="job.currentResolution">
          <strong>Current resolution:</strong> {{ job.currentResolution }}
        </p>
        <p v-if="job.toolchainSummary">
          <strong>Toolchain:</strong> {{ job.toolchainSummary }}
        </p>
      </div>
      <div class="actions">
        <button
          v-if="showStop && isRunning"
          type="button"
          class="btn btn-danger"
          @click="onStopClicked"
        >
          Stop
        </button>
      </div>
    </div>

    <div class="progress-wrapper">
      <div class="some-progress">
        <p>
          {{ primaryProgressLabel }}:
          {{ formatPercent(primaryProgressValue) }}
          <span class="progress-meta" v-if="primaryProgressMeta">
            {{ primaryProgressMeta }}
          </span>
        </p>
        <div class="progress hict-progress">
          <div
            class="progress-bar bg-info"
            role="progressbar"
            :style="{ width: formatPercent(primaryProgressValue) }"
          ></div>
        </div>
      </div>
      <div class="some-progress">
        <p>
          Total progress:
          {{ formatPercent(overallProgressValue) }}
          <span class="progress-meta">
            (elapsed {{ formatDuration(job.elapsedMillis) }}, eta
            {{ formatDuration(job.etaMillis) }})
          </span>
        </p>
        <div class="progress hict-progress">
          <div
            class="progress-bar bg-success"
            role="progressbar"
            :style="{ width: formatPercent(overallProgressValue) }"
          ></div>
        </div>
      </div>
    </div>

    <div v-if="job.error" class="error-message">
      Error: {{ job.error }}
    </div>
    <div
      v-if="job.toolchainNotices.length || job.toolchainCitations.length"
      class="toolchain-meta"
    >
      <p
        v-for="(notice, index) in job.toolchainNotices"
        :key="'notice-' + index"
      >
        <strong>Notice:</strong> {{ notice }}
      </p>
      <p
        v-for="(citation, index) in job.toolchainCitations"
        :key="'citation-' + index"
      >
        <strong>Citation:</strong> {{ citation }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  type Ref,
  ref,
  onMounted,
  onBeforeUnmount,
  computed,
  withDefaults,
} from "vue";
import type { NetworkManager } from "@/app/core/net/NetworkManager.js";
import { ConversionJobResponse } from "@/app/core/net/api/response";

const props = withDefaults(
  defineProps<{
    networkManager: NetworkManager;
    jobId: string;
    showStop?: boolean;
  }>(),
  { showStop: true }
);

const emit = defineEmits<{
  (
    e: "status-update",
    payload: { jobId: string; status: string; overallProgress: number }
  ): void;
}>();

const job: Ref<ConversionJobResponse | undefined> = ref(undefined);
const errorMessage: Ref<unknown | undefined> = ref(undefined);
const timerId: Ref<string | number | undefined> = ref(undefined);
const missedRequestCount: Ref<number> = ref(0);
const MISSED_THRESHOLD = 10;

function updateState(): void {
  props.networkManager.requestManager
    .getConversionJob(props.jobId)
    .then((resp) => {
      missedRequestCount.value = 0;
      job.value = resp;
      emit("status-update", {
        jobId: props.jobId,
        status: resp.status ?? "unknown",
        overallProgress: resp.overallProgress ?? 0,
      });
      if (!isRunning.value) {
        stopTimer();
      }
    })
    .catch((err) => {
      if (err.code === "ECONNABORTED") {
        missedRequestCount.value++;
        if (missedRequestCount.value > MISSED_THRESHOLD) {
          errorMessage.value =
            "More than " +
            String(MISSED_THRESHOLD) +
            " status checks were timed out. Probably, converter has failed.";
        }
      } else {
        errorMessage.value = err;
      }
    });
}

function onStopClicked(): void {
  props.networkManager.requestManager.stopConversionJob(props.jobId).catch((e) => {
    errorMessage.value = e;
  });
}

function stopTimer(): void {
  if (timerId.value) {
    clearInterval(timerId.value);
    timerId.value = undefined;
  }
}

const isRunning = computed(() => {
  return job.value?.status === "running" || job.value?.status === "queued";
});

const statusLabel = computed(() => {
  return job.value?.status ?? "unknown";
});

const statusClass = computed(() => {
  switch (job.value?.status) {
    case "finished":
      return "finished";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "running":
      return "running";
    case "queued":
      return "queued";
    default:
      return "unknown";
  }
});

const overallProgressValue = computed(() => {
  if (job.value?.status === "finished") return 1;
  return job.value?.overallProgress ?? 0;
});

const resolutionProgressValue = computed(() => {
  if (job.value?.status === "finished") return 1;
  return job.value?.resolutionProgress ?? 0;
});

const primaryProgressValue = computed(() => {
  if (job.value?.currentStageLabel) {
    return job.value?.stageProgress ?? 0;
  }
  return resolutionProgressValue.value;
});

const primaryProgressLabel = computed(() => {
  if (job.value?.currentStageLabel) {
    return `Progress in ${job.value.currentStageLabel}`;
  }
  return "Progress in current resolution";
});

const primaryProgressMeta = computed(() => {
  if (job.value?.currentStageLabel && job.value?.stageDetail) {
    return `(${job.value.stageDetail})`;
  }
  return `(elapsed ${formatDuration(job.value?.resolutionElapsedMillis)}, eta ${formatDuration(job.value?.resolutionEtaMillis)})`;
});

function formatPercent(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) {
    return "0%";
  }
  return `${Math.round(value * 100)}%`;
}

function formatDuration(millis: number | undefined): string {
  if (!millis || millis <= 0) {
    return "00:00";
  }
  const totalSeconds = Math.floor(millis / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}

function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(1)} ${units[unit]}`;
}

onMounted(() => {
  // @ts-expect-error "Using default JS-style timer instead of NodeJS"
  timerId.value = setInterval(updateState, 3000);
  updateState();
});

onBeforeUnmount(() => {
  stopTimer();
});
</script>

<style scoped>
.error-message {
  color: red;
}

.progress-wrapper {
  width: 100%;
}
.stage-detail {
  display: inline-block;
  margin-left: 0.5rem;
  color: #6b7280;
}
.some-progress {
  width: 100%;
  margin-top: 10px;
  margin-bottom: 10px;
}

.hict-progress {
  width: 100%;
}
.status-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.actions {
  display: flex;
  align-items: flex-start;
}
.status-pill {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  text-transform: capitalize;
}
.status-pill.finished {
  background: #d1fae5;
  color: #065f46;
}
.status-pill.running {
  background: #bfdbfe;
  color: #1e3a8a;
}
.status-pill.queued {
  background: #fef3c7;
  color: #92400e;
}
.status-pill.failed {
  background: #fee2e2;
  color: #991b1b;
}
.status-pill.cancelled {
  background: #e5e7eb;
  color: #374151;
}
.status-pill.unknown {
  background: #e5e7eb;
  color: #374151;
}
.progress-meta {
  color: #6c757d;
  font-size: 0.85em;
  margin-left: 6px;
}
.toolchain-meta {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid #e5e7eb;
}
</style>
