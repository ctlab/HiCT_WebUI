<template>
  <div v-if="estimate.limitingLevel" class="estimate-callout estimate-danger" role="alert">
    <i class="bi bi-x-octagon" aria-hidden="true"></i>
    <div>
      <b>This size cannot run here.</b> {{ estimate.hardLimitReason }}
      <slot name="recovery" />
    </div>
  </div>
  <div v-else-if="estimate.warningLevel" class="estimate-callout estimate-warning">
    <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
    <div>
      <div role="status">
        Expected output ≈ {{ formatEstimateBytes(estimate.expectedBytes) }}.
        In the worst case, {{ estimate.warningLevel.toLocaleString() }} bp could need
        {{ formatEstimateBytes(estimate.worstCaseBytes) }}, more than the free-space budget
        ({{ formatEstimateBytes(estimate.diskBudgetBytes) }}).
        Dotplots are usually sparse, so this often fits. HiCT stops the job safely if free space runs low.
      </div>
      <label>
        <input
          type="checkbox"
          :checked="acceptLargeOutput"
          @change="$emit('update:acceptLargeOutput', ($event.target as HTMLInputElement).checked)"
        />
        Generate anyway
      </label>
    </div>
  </div>
  <div v-else class="estimate-fit" role="status">
    <span :title="`${estimate.expectedBytes.toLocaleString()} bytes`">
      Expected output ≈ {{ formatEstimateBytes(estimate.expectedBytes) }}
      <span class="text-muted">(at most {{ formatEstimateBytes(estimate.worstCaseBytes) }})</span>
    </span>
    <span class="estimate-fit-status"><i class="bi bi-check-circle" aria-hidden="true"></i> fits</span>
  </div>
</template>

<script setup lang="ts">
import type { SequenceAnalysisEstimate } from "@/app/core/net/api/SequenceAnalysisRequest";
import { formatEstimateBytes } from "@/app/core/sequence/formatEstimateBytes";

defineProps<{ estimate: SequenceAnalysisEstimate; acceptLargeOutput: boolean }>();
defineEmits<{ (event: "update:acceptLargeOutput", value: boolean): void }>();
</script>

<style scoped>
.estimate-fit,
.estimate-callout {
  display: flex;
  gap: 10px;
  border-radius: 8px;
  font-size: 13px;
  padding: 8px 12px;
}
.estimate-fit {
  justify-content: space-between;
  flex-wrap: wrap;
  background: #f9fafb;
  border: 1px solid #eaecf0;
}
.estimate-fit-status {
  color: #067647;
}
.estimate-warning {
  background: var(--hict-warning-soft);
  border: 1px solid #fedf89;
  color: #7a2e0e;
}
.estimate-warning > i {
  color: var(--hict-warning);
  font-size: 17px;
}
.estimate-danger {
  background: #fef3f2;
  border: 1px solid #fecdca;
  color: #912018;
}
.estimate-danger > i {
  font-size: 17px;
}
.estimate-callout label {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
  font-weight: 600;
  color: #1f2937;
}
</style>
