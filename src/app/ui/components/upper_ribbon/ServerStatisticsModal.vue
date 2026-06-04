<template>
  <div class="modal-backdrop fade show"></div>
  <div class="modal fade show" style="display: block" tabindex="-1" role="dialog">
    <div class="modal-dialog modal-xl modal-dialog-scrollable" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Runtime Statistics</h5>
          <button type="button" class="btn-close" @click="emit('dismissed')"></button>
        </div>
        <div class="modal-body">
          <div v-if="loading" class="text-muted">Loading statistics...</div>
          <div v-else-if="error" class="text-danger">{{ error }}</div>
          <template v-else-if="statistics">
            <div class="statistics-grid mb-4">
              <div class="statistics-card">
                <div class="statistics-label">Requests/sec</div>
                <div class="statistics-value">
                  {{ formatNumber(statistics.requestsPerSecondLast10s) }}
                </div>
                <div class="statistics-subtitle">10 second window</div>
              </div>
              <div class="statistics-card">
                <div class="statistics-label">Requests/sec</div>
                <div class="statistics-value">
                  {{ formatNumber(statistics.requestsPerSecondLast60s) }}
                </div>
                <div class="statistics-subtitle">60 second window</div>
              </div>
              <div class="statistics-card">
                <div class="statistics-label">Total requests</div>
                <div class="statistics-value">{{ statistics.totalRequests }}</div>
                <div class="statistics-subtitle">
                  {{ formatDuration(statistics.uptimeSeconds) }} uptime
                </div>
              </div>
              <div class="statistics-card">
                <div class="statistics-label">In flight</div>
                <div class="statistics-value">{{ statistics.inFlightRequests }}</div>
                <div class="statistics-subtitle">HTTP requests</div>
              </div>
            </div>

            <div class="row g-3 mb-4">
              <div class="col-md-6">
                <h6>Native Processing</h6>
                <dl class="row mb-0">
                  <dt class="col-sm-5">Enabled</dt>
                  <dd class="col-sm-7">{{ statistics.nativeProcessing.enabled }}</dd>
                  <dt class="col-sm-5">Available</dt>
                  <dd class="col-sm-7">{{ statistics.nativeProcessing.available }}</dd>
                  <dt class="col-sm-5">Version</dt>
                  <dd class="col-sm-7 text-break">
                    {{ statistics.nativeProcessing.version }}
                  </dd>
                  <dt class="col-sm-5">Native ops</dt>
                  <dd class="col-sm-7">
                    {{ statistics.nativeProcessing.nativeOperationCount ?? 0 }}
                    <span class="text-muted">
                      (failed {{ statistics.nativeProcessing.nativeFailedOperationCount ?? 0 }})
                    </span>
                  </dd>
                </dl>
              </div>
              <div class="col-md-6">
                <h6>Runtime</h6>
                <dl class="row mb-0">
                  <dt class="col-sm-5">Heap used</dt>
                  <dd class="col-sm-7">
                    {{ formatBytes(statistics.heapUsedBytes) }} /
                    {{ formatBytes(statistics.heapCommittedBytes) }}
                    <span class="text-muted">
                      (max {{ formatBytes(statistics.heapMaxBytes) }})
                    </span>
                  </dd>
                  <dt class="col-sm-5">Non-heap used</dt>
                  <dd class="col-sm-7">{{ formatBytes(statistics.nonHeapUsedBytes) }}</dd>
                  <dt class="col-sm-5">Processors</dt>
                  <dd class="col-sm-7">{{ statistics.availableProcessors }}</dd>
                  <dt class="col-sm-5">Threads</dt>
                  <dd class="col-sm-7">
                    {{ statistics.liveThreads }} live,
                    {{ statistics.daemonThreads }} daemon,
                    {{ statistics.peakThreads }} peak
                  </dd>
                </dl>
              </div>
            </div>

            <h6>Endpoint Hotspots</h6>
            <div class="table-responsive">
              <table class="table table-sm table-striped align-middle">
                <thead>
                  <tr>
                    <th>Endpoint</th>
                    <th>Total</th>
                    <th>Req/sec 10s</th>
                    <th>Req/sec 60s</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="endpoint in statistics.endpoints" :key="endpoint.path">
                    <td class="text-break">{{ endpoint.path }}</td>
                    <td>{{ endpoint.totalRequests }}</td>
                    <td>{{ formatNumber(endpoint.requestsPerSecondLast10s) }}</td>
                    <td>{{ formatNumber(endpoint.requestsPerSecondLast60s) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
          <div v-else class="text-muted">No statistics data yet.</div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="emit('dismissed')">
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import type { NetworkManager } from "@/app/core/net/NetworkManager";
import type { ServerStatisticsResponse } from "@/app/core/net/api/RequestManager";

const emit = defineEmits<{ (e: "dismissed"): void }>();
const props = defineProps<{ networkManager: NetworkManager }>();

const loading = ref(true);
const error = ref("");
const statistics = ref<ServerStatisticsResponse | null>(null);
let pollTimer: number | undefined;
let inFlight = false;

async function fetchStatistics(): Promise<void> {
  if (inFlight) {
    return;
  }
  inFlight = true;
  try {
    statistics.value = await props.networkManager.requestManager.getServerStatistics();
    error.value = "";
  } catch (err) {
    error.value =
      (err as { response?: { data?: { error?: string } }; message?: string })
        ?.response?.data?.error ??
      (err as { message?: string })?.message ??
      "Failed to load runtime statistics";
  } finally {
    loading.value = false;
    inFlight = false;
  }
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return value >= 100 ? value.toFixed(0) : value.toFixed(2);
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KiB", "MiB", "GiB"];
  let scaled = value;
  let index = 0;
  while (scaled >= 1024 && index < units.length - 1) {
    scaled /= 1024;
    index++;
  }
  return `${scaled.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0s";
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
}

onMounted(() => {
  void fetchStatistics();
  pollTimer = window.setInterval(() => {
    void fetchStatistics();
  }, 1000);
});

onBeforeUnmount(() => {
  if (pollTimer !== undefined) {
    window.clearInterval(pollTimer);
    pollTimer = undefined;
  }
});
</script>

<style scoped>
.statistics-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.statistics-card {
  border: 1px solid #d1d5db;
  border-radius: 0.75rem;
  padding: 0.85rem 1rem;
  background: #f8fafc;
}

.statistics-label {
  color: #64748b;
  font-size: 0.85rem;
}

.statistics-value {
  color: #0f172a;
  font-size: 1.55rem;
  font-weight: 700;
  line-height: 1.2;
}

.statistics-subtitle {
  color: #64748b;
  font-size: 0.8rem;
}
</style>
