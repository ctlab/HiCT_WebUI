<template>
  <div>
    <div class="d-flex flex-wrap align-items-center gap-3 mb-2">
      <label class="form-check"
        ><input v-model="logX" class="form-check-input" type="checkbox" /> Log
        X</label
      >
      <label class="form-check"
        ><input v-model="logY" class="form-check-input" type="checkbox" /> Log
        frequency</label
      >
      <label class="form-check"
        ><input
          v-model="omitZero"
          :disabled="logX"
          class="form-check-input"
          type="checkbox"
        />
        Exclude zero</label
      >
      <label class="d-flex align-items-center gap-2"
        >Bins
        <select v-model.number="bins" class="form-select form-select-sm">
          <option v-for="n in [32, 64, 128, 256]" :key="n" :value="n">
            {{ n }}
          </option>
        </select>
      </label>
      <button
        class="btn btn-sm btn-outline-secondary"
        title="Autoscale both axes"
        aria-label="Autoscale both axes"
        @click="autoscale"
      >
        <i class="bi bi-arrows-fullscreen" aria-hidden="true"></i>
      </button>
    </div>
    <div
      ref="chart"
      class="interactive-histogram"
      role="img"
      aria-label="Interactive signal value distribution"
    ></div>
    <p class="small mb-0" role="status">
      Zero: {{ distribution.zeros.toLocaleString() }}; negative:
      {{ distribution.negatives.toLocaleString() }}; non-finite:
      {{ distribution.nonfinite.toLocaleString() }}.
      <span v-if="logX">Log X excludes zero and negative values.</span>
      <span v-else-if="omitZero">Zero values excluded.</span>
      <span v-if="!distribution.counts.length"
        >No values in the selected domain.</span
      >
    </p>
    <p v-if="error" class="text-danger" role="alert">{{ error }}</p>
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { histogramPlotBins } from "@/app/core/visualization/histogramPlot";
const props = defineProps<{ values: Float32Array }>();
const chart = ref<HTMLElement>();
const logX = ref(false),
  logY = ref(true),
  omitZero = ref(false),
  bins = ref(64);
const error = ref("");
const distribution = computed(() =>
  histogramPlotBins(props.values, bins.value, logX.value, omitZero.value)
);
let plotly: typeof import("plotly.js-basic-dist-min").default | undefined;
let revision = 0;
let disposed = false;
async function autoscale() {
  if (chart.value && plotly)
    await plotly.relayout(chart.value, {
      "xaxis.autorange": true,
      "yaxis.autorange": true,
    });
}
watch(
  [distribution, logY, chart],
  async () => {
    const current = ++revision;
    if (!chart.value) return;
    try {
      plotly ??= (await import("plotly.js-basic-dist-min")).default;
      if (disposed || current !== revision || !chart.value) return;
      error.value = "";
      const d = distribution.value;
      await plotly.react(
        chart.value,
        [
          {
            type: "bar",
            x: d.x,
            y: d.counts,
            width: d.widths,
            marker: { color: "#337ab7" },
            customdata: d.counts.map((_, i) => [d.edges[i], d.edges[i + 1]]),
            hovertemplate:
              "%{customdata[0]:.5g} to %{customdata[1]:.5g}<br>%{y:,} values<extra></extra>",
          },
        ],
        {
          autosize: true,
          margin: { l: 65, r: 20, b: 55, t: 35 },
          font: { family: "system-ui, sans-serif", size: 12 },
          xaxis: {
            title: { text: "Signal" },
            type: logX.value ? "log" : "linear",
            autorange: true,
          },
          yaxis: {
            title: { text: "Frequency" },
            type: logY.value ? "log" : "linear",
            autorange: true,
          },
          dragmode: "zoom",
          bargap: 0.02,
        },
        {
          responsive: true,
          scrollZoom: true,
          displaylogo: false,
          displayModeBar: true,
          modeBarButtonsToRemove: ["toImage", "select2d", "lasso2d"],
        }
      );
    } catch (failure) {
      if (!disposed && current === revision)
        error.value = `Could not render histogram: ${
          (failure as Error).message
        }`;
    }
  },
  { flush: "post", immediate: true }
);
onBeforeUnmount(() => {
  disposed = true;
  ++revision;
  if (chart.value) plotly?.purge(chart.value);
});
</script>
<style scoped>
.interactive-histogram {
  width: 100%;
  height: 330px;
  min-width: 0;
}
.form-check {
  margin-bottom: 0;
}
</style>
