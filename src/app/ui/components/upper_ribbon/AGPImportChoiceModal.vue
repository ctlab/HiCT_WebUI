<template>
  <div v-if="agpImportChoice">
    <div class="modal-backdrop show" style="z-index: 1090"></div>
    <div class="modal show" style="display: block; z-index: 1091" role="dialog" aria-modal="true" aria-labelledby="agp-choice-title">
      <div class="modal-dialog modal-dialog-centered"><div class="modal-content">
        <div class="modal-header"><h5 id="agp-choice-title">Choose AGP assembly scope</h5></div>
        <div class="modal-body">
          <p v-if="agpImportChoice.omittedPieces">{{ agpImportChoice.omittedPieces }} sequence pieces ({{ agpImportChoice.omittedBp.toLocaleString() }} bp) are not covered by the AGP.</p>
          <p v-if="agpImportChoice.unscaffoldedPieces">{{ agpImportChoice.unscaffoldedPieces }} sequence pieces ({{ (agpImportChoice.unscaffoldedBp ?? 0).toLocaleString() }} bp) are explicitly unscaffolded in the AGP.</p>
          <p><strong>Scaffolded regions only</strong> excludes these regions from the heatmap, queries and FASTA export.</p>
          <p><strong>Full map</strong> keeps them visible and includes unscaffolded FASTA records. Sequence omitted from the AGP is appended at the end.</p>
          <p>The assembly has not changed. Your source files stay intact; Undo restores the previous assembly.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="completeAgpImportChoice(null)">Cancel import</button>
          <button class="btn btn-outline-primary" @click="completeAgpImportChoice('SCAFFOLDED_ONLY')">Scaffolded regions only</button>
          <button class="btn btn-primary" @click="completeAgpImportChoice('APPEND_UNPLACED')">Full map, including unscaffolded</button>
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
