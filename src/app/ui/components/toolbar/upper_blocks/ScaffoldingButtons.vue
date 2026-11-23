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
  <div class="block-of-buttons">
    <button
      class="btn btn-outline-primary"
      type="button"
      :disabled="editDisabled"
      data-bs-toggle="tooltip"
      data-bs-placement="right"
      :title="
        props.mapManager
          ? 'Group selection into scaffold'
          : 'Open a map to use this control'
      "
      aria-label="Group selection into scaffold"
      @click="addScaffoldClicked"
    >
      <i class="bi bi-box-arrow-in-down-right"></i>
    </button>
    <button
      class="btn btn-outline-primary"
      type="button"
      :disabled="editDisabled"
      data-bs-toggle="tooltip"
      data-bs-placement="right"
      :title="
        props.mapManager
          ? 'Ungroup selection into singleton scaffolds'
          : 'Open a map to use this control'
      "
      aria-label="Ungroup selection into singleton scaffolds"
      @click="removeScaffoldClicked"
    >
      <i class="bi bi-box-arrow-up-left"></i>
    </button>

    <button
      class="btn btn-outline-primary"
      type="button"
      :title="
        !props.mapManager ? 'Open a map to edit'
          : scaffoldCount ? 'Remove all scaffolds…' : 'There are no scaffolds to remove'
      "
      aria-label="Remove all scaffolds…"
      :disabled="
        editDisabled || scaffoldCount === 0
      "
      @click="unscaffoldAllClicked"
    >
      <i class="bi bi-ui-checks-grid"></i>
    </button>
    <button
      class="btn btn-outline-primary"
      type="button"
      :disabled="!props.mapManager"
      data-bs-toggle="tooltip"
      data-bs-placement="right"
      :title="
        props.mapManager
          ? 'Export FASTA for selection'
          : 'Open a map to use this control'
      "
      aria-label="Export FASTA for selection"
      @click="exportFASTAForSelectionClicked"
    >
      <i class="bi bi-type"></i>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { askForConfirmation } from "@/app/ui/confirmAction";
import { reportFailure } from "@/app/ui/reportFailure";
import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";

const props = defineProps<{
  mapManager?: ContactMapManager | undefined;
}>();

const editDisabled = computed(() => {
  const api = props.mapManager?.networkManager.requestManager;
  return !api || api.history.busy > 0 || api.sequenceViewReadOnly;
});
const scaffoldCount = computed(() => props.mapManager?.scaffoldHolder.scaffoldTable.size ?? 0);

async function unscaffoldAllClicked() {
  const manager = props.mapManager;
  const count = scaffoldCount.value;
  if (!manager || !count || editDisabled.value) return;
  const history = manager.networkManager.requestManager.history.applied;
  const decision = await askForConfirmation({
    title: "Remove all scaffolds?",
    tone: "danger",
    icon: "bi-ui-checks-grid",
    confirmLabel: `Remove ${count} ${count === 1 ? "scaffold" : "scaffolds"}`,
    body: `All ${count} scaffolds will be split back into their ${manager.contigDimensionHolder.contigDescriptors.length} contigs. Contig order and orientation stay the same. You can undo this with Undo (Ctrl+Z).`,
  });
  if (decision !== "confirm" || manager !== props.mapManager || editDisabled.value ||
    history !== manager.networkManager.requestManager.history.applied) return;
  try {
    await manager.eventManager.onUnscaffoldAllClicked();
  } catch (error) {
    reportFailure("Ungroup all scaffolds", error);
  }
}

function addScaffoldClicked() {
  props.mapManager?.eventManager.onAddScaffoldClicked();
}

function removeScaffoldClicked() {
  props.mapManager?.eventManager.onRemoveScaffoldClicked();
}

function exportFASTAForSelectionClicked() {
  props.mapManager?.eventManager.onExportFASTAForSelectionClicked();
}
</script>

<style scoped>
.block-of-buttons {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
