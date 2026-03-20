<template>
  <div class="fasta-link-backdrop" @click.self="emit('cancel')">
    <div class="fasta-link-modal">
      <div class="fasta-link-header">
        <h5 class="mb-0">Link FASTA with warnings</h5>
        <button type="button" class="btn-close" @click="emit('cancel')"></button>
      </div>
      <div class="fasta-link-body">
        <div class="mb-3">
          <strong>Selected FASTA:</strong> {{ report.fastaFilename }}
        </div>
        <ul class="mb-3">
          <li v-for="(warning, index) in report.warnings" :key="index">
            {{ warning }}
          </li>
        </ul>
        <div class="compatibility-grid mb-3">
          <div>FASTA sequences</div>
          <div>{{ report.compatibility.fastaRecordCount }}</div>
          <div>Assembly contigs</div>
          <div>{{ report.compatibility.assemblyContigCount }}</div>
          <div>Same order and length</div>
          <div>{{ yesNo(report.compatibility.sameOrderAndLength) }}</div>
          <div>Same length multiset</div>
          <div>{{ yesNo(report.compatibility.sameLengthMultiset) }}</div>
          <div>Names match current names</div>
          <div>{{ yesNo(report.compatibility.sameOrderLengthAndCurrentNames) }}</div>
          <div>Names match original names</div>
          <div>{{ yesNo(report.compatibility.sameOrderLengthAndOriginalNames) }}</div>
          <div>Names match source names</div>
          <div>{{ yesNo(report.compatibility.sameOrderLengthAndSourceNames) }}</div>
        </div>
        <div v-if="report.compatibility.mismatches.length > 0">
          <div class="fw-semibold mb-2">First mismatches</div>
          <div class="mismatch-list">
            <div
              v-for="mismatch in report.compatibility.mismatches"
              :key="mismatch.index"
              class="mismatch-item"
            >
              <div>#{{ mismatch.index + 1 }}</div>
              <div>
                FASTA: {{ mismatch.fastaName ?? "missing" }}
                <span v-if="mismatch.fastaLengthBp >= 0">
                  ({{ mismatch.fastaLengthBp.toLocaleString() }} bp)
                </span>
              </div>
              <div>
                Assembly: {{ mismatch.assemblyCurrentName ?? "missing" }}
                <span v-if="mismatch.assemblyLengthBp >= 0">
                  ({{ mismatch.assemblyLengthBp.toLocaleString() }} bp)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="fasta-link-footer">
        <button type="button" class="btn btn-secondary" @click="emit('cancel')">
          Cancel
        </button>
        <button type="button" class="btn btn-warning" @click="emit('proceed')">
          Proceed anyway
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FastaLinkResponse } from "@/app/core/net/api/response";

const props = defineProps<{
  report: FastaLinkResponse;
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "proceed"): void;
}>();

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}
</script>

<style scoped>
.fasta-link-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2200;
}

.fasta-link-modal {
  background: #ffffff;
  border-radius: 10px;
  width: min(860px, 92vw);
  max-height: 90vh;
  overflow: auto;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.2);
  padding: 18px 20px;
}

.fasta-link-header,
.fasta-link-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.fasta-link-body {
  margin: 16px 0;
}

.compatibility-grid {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 14px;
}

.mismatch-list {
  display: grid;
  gap: 8px;
}

.mismatch-item {
  border: 1px solid #dee2e6;
  border-radius: 6px;
  padding: 8px 10px;
  background: #f8f9fa;
}
</style>
