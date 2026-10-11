<template>
  <div v-if="agpImportChoice">
    <div class="modal-backdrop show" style="z-index: 1090"></div>
    <div class="modal show" style="display: block; z-index: 1091" role="dialog" aria-modal="true" aria-labelledby="agp-choice-title">
      <div class="modal-dialog modal-dialog-centered"><div class="modal-content">
        <div class="modal-header"><h5 id="agp-choice-title">AGP omits sequence from this map</h5></div>
        <div class="modal-body">
          <p>{{ agpImportChoice.omittedPieces }} sequence pieces ({{ agpImportChoice.omittedBp.toLocaleString() }} bp) are not covered by the AGP.</p>
          <p>The assembly has not changed. Choose what to include in the map and subsequent FASTA export.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="completeAgpImportChoice(null)">Cancel import</button>
          <button class="btn btn-outline-primary" @click="completeAgpImportChoice('EXCLUDE')">Only AGP-covered sequence</button>
          <button class="btn btn-primary" @click="completeAgpImportChoice('APPEND_UNPLACED')">Append omitted as unplaced</button>
        </div>
      </div></div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { agpImportChoice, completeAgpImportChoice } from "@/app/core/net/agpImportChoice";
import { useEscDismissableDialog } from "@/app/ui/escapeDialogRegistry";
useEscDismissableDialog({ priority: 1091, isOpen: () => !!agpImportChoice.value, requestClose: () => completeAgpImportChoice(null) });
</script>
