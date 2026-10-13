<template>
  <div class="mb-3">
    <label class="form-label">Default gap length (Ns)
      <input v-model.number="settings.sequenceGapLengthBp" type="number" min="0" max="1000000" step="1" required class="form-control" :disabled="loading" @change="save" />
    </label>
    <small class="form-text d-block">Used for newly created scaffold gaps and between scaffolds in concatenated analysis sequences. Imported AGP gaps are preserved. Separate FASTA scaffold records need no separator. Zero explicitly permits joins without padding.</small>
    <p v-if="error" class="text-danger" role="alert">{{ error }}</p>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import { SequenceAnalysisRequest } from "@/app/core/net/api/SequenceAnalysisRequest";
const props = defineProps<{ requestManager: { sendRequest: (request: any) => Promise<any> } }>();
const settings = useUiSettingsStore(), error = ref(""), loading = ref(true);
onMounted(async () => {
  try {
    const { data: state } = await props.requestManager.sendRequest(new SequenceAnalysisRequest("/sequence/settings", {}));
    settings.sequenceGapLengthBp = state.gapLengthBp;
  } catch (e) { error.value = `Could not read the default gap: ${String(e)}`; }
  finally { loading.value = false; }
});
async function save() {
  error.value = "";
  if (!Number.isSafeInteger(settings.sequenceGapLengthBp) || settings.sequenceGapLengthBp < 0 || settings.sequenceGapLengthBp > 1000000) {
    error.value = "Choose an integer between 0 and 1,000,000."; return;
  }
  try { await props.requestManager.sendRequest(new SequenceAnalysisRequest("/sequence/settings", { gapLengthBp: settings.sequenceGapLengthBp })); }
  catch (e) { error.value = `Could not save the default gap: ${String(e)}`; }
}
</script>
