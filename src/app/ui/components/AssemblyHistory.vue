<template>
  <div class="assembly-history-toolbar" role="toolbar" aria-label="Assembly history">
    <button class="btn btn-sm btn-outline-secondary" :disabled="busy || !summary?.canUndo"
      title="Undo (Ctrl+Z)" aria-label="Undo assembly edit" @click="restore('undo')">↶ Undo</button>
    <button class="btn btn-sm btn-outline-secondary" :disabled="busy || !summary?.canRedo"
      title="Redo (Ctrl+Y or Ctrl+Shift+Z)" aria-label="Redo assembly edit" @click="restore('redo')">↷ Redo</button>
    <button class="btn btn-sm btn-outline-secondary" :disabled="!summary" :aria-expanded="expanded"
      aria-controls="assembly-journal" @click="expanded = !expanded">Edit journal</button>
    <button v-if="outOfDate" class="btn btn-sm btn-warning" :disabled="busy"
      title="The server assembly changed in another client" @click="restore('restore', summary?.currentId)">Refresh assembly</button>
    <span class="small text-muted" aria-live="polite">{{ busy ? 'Updating assembly…' : summary ? `State ${summary.position + 1} of ${summary.size}` : 'No assembly open' }}</span>
    <section v-if="expanded && summary" id="assembly-journal" class="assembly-journal" aria-label="Edit journal">
      <div class="d-flex justify-content-between align-items-center">
        <strong>Edit journal</strong>
        <button class="btn-close" aria-label="Close edit journal" @click="expanded = false"></button>
      </div>
      <p class="small text-muted mt-2">Click a state to restore it. Later steps remain available until you make a new edit.
        History is kept in this server session; opening or closing a map, or switching assembly sources, starts a new journal.</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="d-flex justify-content-between mb-2">
        <button class="btn btn-sm btn-outline-secondary" :disabled="loading || offset === 0" @click="load(Math.max(0, offset - 100))">Earlier</button>
        <button class="btn btn-sm btn-outline-secondary" :disabled="loading || offset + entries.length >= summary.size" @click="load(offset + 100)">Later</button>
      </div>
      <ol :start="offset + 1" class="journal-entries" :aria-busy="loading">
        <li v-for="(entry, index) in entries" :key="entry.id">
          <button class="journal-entry" :class="{ current: entry.id === summary.currentId, future: offset + index > summary.position }"
            :aria-current="entry.id === summary.currentId ? 'step' : undefined"
            :disabled="busy || loading || entry.id === summary.currentId" :title="entry.timestamp"
            @click="restore('restore', entry.id)">{{ entry.label }}<span v-if="entry.id === summary.currentId"> (current)</span></button>
        </li>
      </ol>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type { NetworkManager } from "@/app/core/net/NetworkManager";
import type { HistoryPage } from "@/app/core/net/api/RequestManager";
import { hasAnyOpenEscDialog } from "@/app/ui/escapeDialogRegistry";

const props = defineProps<{ networkManager: NetworkManager }>();
const manager = props.networkManager.requestManager;
const summary = computed(() => manager.history.summary);
const busy = computed(() => manager.history.busy > 0);
const outOfDate = computed(() => summary.value && (
  summary.value.session !== manager.history.applied?.session || summary.value.revision !== manager.history.applied?.revision
));
const expanded = ref(false), loading = ref(false), error = ref("");
const offset = ref(0), entries = ref<HistoryPage["entries"]>([]);
let requestId = 0;
async function load(start?: number) {
  const id = ++requestId;
  loading.value = true;
  try {
    const page = await manager.getAssemblyHistory(start);
    if (id !== requestId) return;
    offset.value = page.offset ?? 0; entries.value = page.entries; error.value = "";
  } catch (err) { if (id === requestId) error.value = String(err); }
  finally { if (id === requestId) loading.value = false; }
}
async function restore(action: "undo" | "redo" | "restore", id?: number) {
  try { await manager.restoreAssemblyHistory(action, id); error.value = ""; }
  catch (err) { error.value = String(err); }
}
watch(() => [expanded.value, summary.value?.session, summary.value?.revision], () => {
  if (expanded.value && summary.value) void load();
  else { requestId++; entries.value = []; loading.value = false; }
});
function keyboard(event: KeyboardEvent) {
  if (event.defaultPrevented || event.repeat || event.altKey || !(event.ctrlKey || event.metaKey)) return;
  const element = event.target instanceof Element ? event.target : null;
  if (element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
  if (hasAnyOpenEscDialog() || document.querySelector('.modal.show, [role="dialog"][aria-modal="true"]')) return;
  const key = event.key.toLowerCase();
  const action = key === "z" ? (event.shiftKey ? "redo" : "undo") : key === "y" && !event.shiftKey ? "redo" : null;
  if (!action || !summary.value) return;
  event.preventDefault();
  if (busy.value || !(action === "undo" ? summary.value.canUndo : summary.value.canRedo)) return;
  void restore(action);
}
onMounted(() => window.addEventListener("keydown", keyboard));
onUnmounted(() => { requestId++; window.removeEventListener("keydown", keyboard); });
</script>

<style scoped>
.assembly-history-toolbar { display: flex; align-items: center; gap: .4rem; padding: .25rem .65rem; position: relative; border-bottom: 1px solid var(--bs-border-color, #ccc); }
.assembly-journal { position: absolute; top: 100%; right: 1rem; z-index: 1025; width: min(26rem, 92vw); padding: 1rem; background: var(--bs-body-bg, white); color: var(--bs-body-color, #222); border: 1px solid #aaa; box-shadow: 0 4px 16px #0003; }
.journal-entries { max-height: 45vh; overflow-y: auto; margin: 0; padding-left: 2.3rem; }
.journal-entry { width: 100%; border: 0; padding: .35rem .5rem; text-align: left; color: inherit; background: transparent; border-radius: .2rem; }
.journal-entry:hover, .journal-entry:focus-visible { background: #cfe2ff; color: #123; }
.journal-entry.current { background: #0d6efd; color: white; }
.journal-entry.future { opacity: .65; }
</style>
