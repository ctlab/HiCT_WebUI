<template>
  <div class="modal-backdrop fade show"></div>
  <div class="modal fade show" style="display: block" tabindex="-1" role="dialog">
    <div class="modal-dialog modal-xl modal-dialog-scrollable" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Worker Diagnostics</h5>
          <button type="button" class="btn-close" @click="emit('dismissed')"></button>
        </div>
        <div class="modal-body">
          <div v-if="loading" class="text-muted">Loading diagnostics...</div>
          <div v-else-if="error" class="text-danger">{{ error }}</div>
          <template v-else-if="diagnostics">
            <div class="mb-3">
              <strong>Total workers:</strong> {{ diagnostics.totalMaxWorkers }} |
              <strong>Reserved:</strong> {{ diagnostics.reservedMinWorkers }} |
              <strong>Elastic in use:</strong> {{ diagnostics.elasticWorkersInUse }} |
              <strong>Elastic available:</strong> {{ diagnostics.elasticWorkersAvailable }}
            </div>

            <div class="table-responsive mb-4">
              <table class="table table-sm table-striped align-middle">
                <thead>
                  <tr>
                    <th>Priority</th>
                    <th>Active</th>
                    <th>Queue</th>
                    <th>Pool</th>
                    <th>Completed</th>
                    <th>Total Tasks</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in poolRows" :key="row.priority">
                    <td>{{ row.priority }}</td>
                    <td>{{ row.activeCount }}</td>
                    <td>{{ row.queueSize }}/{{ row.queueCapacity }}</td>
                    <td>{{ row.currentPoolSize }} (core {{ row.corePoolSize }}, max {{ row.maxPoolSize }})</td>
                    <td>{{ row.completedTaskCount }}</td>
                    <td>{{ row.taskCount }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="table-responsive">
              <table class="table table-sm table-striped align-middle">
                <thead>
                  <tr>
                    <th>Cancellation Domain</th>
                    <th>Generation</th>
                    <th>Tracked Tasks</th>
                    <th>Tracked by Generation</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in cancellationRows" :key="row.domain">
                    <td>{{ row.domain }}</td>
                    <td>{{ row.currentGeneration }}</td>
                    <td>{{ row.trackedTaskCount }}</td>
                    <td>{{ row.byGeneration }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
          <div v-else class="text-muted">No diagnostics data yet.</div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="emit('dismissed')">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { NetworkManager } from "@/app/core/net/NetworkManager";
import type { WorkerSchedulerDiagnosticsResponse } from "@/app/core/net/api/response";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";

const emit = defineEmits<{ (e: "dismissed"): void }>();

const props = defineProps<{ networkManager: NetworkManager }>();

useEscDismissableDialog({
  priority: 1060,
  isOpen: () => true,
  requestClose: () => {
    emit("dismissed");
  },
});

const loading = ref(true);
const error = ref("");
const diagnostics = ref<WorkerSchedulerDiagnosticsResponse | null>(null);
let pollTimer: number | undefined;
let inFlight = false;

const poolRows = computed(() => {
  const pools = diagnostics.value?.pools ?? {};
  return Object.entries(pools).map(([priority, payload]) => ({
    priority,
    ...payload,
  }));
});

const cancellationRows = computed(() => {
  const domains = diagnostics.value?.cancellationDomains ?? {};
  return Object.entries(domains).map(([domain, payload]) => {
    const byGeneration = Object.entries(payload.trackedTasksByGeneration ?? {})
      .map(([generation, count]) => `${generation}: ${count}`)
      .join(", ");
    return {
      domain,
      currentGeneration: payload.currentGeneration,
      trackedTaskCount: payload.trackedTaskCount,
      byGeneration: byGeneration || "-",
    };
  });
});

async function fetchDiagnostics(): Promise<void> {
  if (inFlight) {
    return;
  }
  inFlight = true;
  try {
    diagnostics.value = await props.networkManager.requestManager.getWorkerDiagnostics();
    error.value = "";
  } catch (err) {
    error.value =
      (err as { response?: { data?: { error?: string } }; message?: string })
        ?.response?.data?.error ??
      (err as { message?: string })?.message ??
      "Failed to load worker diagnostics";
  } finally {
    loading.value = false;
    inFlight = false;
  }
}

onMounted(() => {
  void fetchDiagnostics();
  pollTimer = window.setInterval(() => {
    void fetchDiagnostics();
  }, 1000);
});

onBeforeUnmount(() => {
  if (pollTimer !== undefined) {
    window.clearInterval(pollTimer);
    pollTimer = undefined;
  }
});
</script>
