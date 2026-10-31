<template>
  <div class="histogram-backdrop" @click.self="$emit('dismissed')">
    <section
      class="histogram-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="histogram-title"
    >
      <header class="d-flex align-items-center justify-content-between mb-3">
        <h5 id="histogram-title" class="m-0">Signal histogram</h5>
        <button
          class="btn-close"
          aria-label="Close"
          @click="$emit('dismissed')"
        ></button>
      </header>
      <div v-if="!expression" class="d-flex flex-wrap gap-2 mb-3">
        <label
          >Source<select v-model="source" class="form-select form-select-sm">
            <option>PRIMARY</option>
            <option>SECONDARY</option>
          </select></label
        >
        <label
          >Values<select
            v-model="signalMode"
            class="form-select form-select-sm"
          >
            <option value="RAW_COUNTS">Raw counts</option>
            <option value="COOLER_WEIGHTED">Counts x balancing weights</option>
            <option value="PIPELINE_SIGNAL">Processed signal</option>
          </select></label
        >
        <label
          >Triangle<select
            v-model="triangle"
            class="form-select form-select-sm"
          >
            <option value="both">Both</option>
            <option value="upper">Upper</option>
            <option value="lower">Lower</option>
          </select></label
        >
      </div>
      <InteractiveHistogram v-if="result" :values="result.values" />
      <div v-if="loading" class="histogram-chart">
        <span
          v-if="loading"
          class="spinner-border"
          role="status"
          aria-label="Computing histogram"
        ></span>
      </div>
      <p v-if="result" class="small mt-2">
        {{ result.count.toLocaleString() }}
        {{ result.sampled ? "sampled" : "measured" }} {{ domainLabel }};
        resolution {{ result.resolution.toLocaleString() }} bp
      </p>
      <p v-if="error" class="text-danger" role="alert">{{ error }}</p>
      <button class="btn btn-primary" :disabled="loading" @click="compute">
        {{ result ? "Refresh" : "Compute" }}
      </button>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import InteractiveHistogram from "./InteractiveHistogram.vue";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import {
  diagnosticBounds,
  querySignalHistogram,
  type SignalHistogram,
  type SignalMode,
} from "@/app/core/visualization/signalDiagnostics";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
const props = defineProps<{
  mapManager: ContactMapManager;
  selection?: boolean;
  expression?: Record<string, unknown>;
}>();
const emit = defineEmits<{ (event: "dismissed"): void }>();
const source = ref<"PRIMARY" | "SECONDARY">("PRIMARY"),
  signalMode = ref<SignalMode>("RAW_COUNTS");
const triangle = ref<"both" | "upper" | "lower">("both");
const result = shallowRef<SignalHistogram>(),
  loading = ref(false),
  error = ref("");
const domainLabel = computed(
  () =>
    ({
      matrix: "matrix values",
      row: "row samples",
      column: "column samples",
      scalar: "scalar value",
    }[result.value?.domain ?? "matrix"])
);
let controller: AbortController | undefined;
let generation = 0;
useEscDismissableDialog({
  priority: 1080,
  isOpen: () => true,
  requestClose: () => emit("dismissed"),
});
onBeforeUnmount(() => {
  ++generation;
  controller?.abort();
});
async function compute() {
  const requestGeneration = ++generation;
  controller?.abort();
  const requestController = new AbortController();
  controller = requestController;
  loading.value = true;
  error.value = "";
  result.value = undefined;
  try {
    let expression = props.expression;
    if (!expression && signalMode.value === "PIPELINE_SIGNAL") {
      expression =
        await props.mapManager.visualizationManager.getSourceSignalExpression(
          source.value
        );
    }
    if (requestController.signal.aborted) return;
    const response = await querySignalHistogram(
      props.mapManager,
      diagnosticBounds(props.mapManager, props.selection),
      {
        source: expression ? "PRIMARY" : source.value,
        signalMode: expression ? "PIPELINE_SIGNAL" : signalMode.value,
        expression,
        triangle: triangle.value,
        signal: requestController.signal,
        domain: props.expression ? "auto" : "matrix",
      }
    );
    if (requestGeneration === generation) result.value = response;
  } catch (e) {
    if (!requestController.signal.aborted && requestGeneration === generation)
      error.value = (e as Error).message;
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}
watch(
  [source, signalMode, triangle, () => props.expression],
  () => void compute(),
  { immediate: true }
);
</script>
<style scoped>
.histogram-backdrop {
  position: fixed;
  inset: 0;
  background: #0006;
  z-index: 1080;
  display: grid;
  place-items: center;
}
.histogram-dialog {
  width: min(720px, 96vw);
  max-height: 95vh;
  overflow: auto;
  background: white;
  padding: 20px;
  border-radius: 6px;
}
.histogram-chart {
  height: 230px;
  display: grid;
  place-items: center;
}
</style>
