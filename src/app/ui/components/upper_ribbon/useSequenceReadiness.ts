import { computed, onMounted, ref } from "vue";
import { SequenceAnalysisRequest } from "@/app/core/net/api/SequenceAnalysisRequest";
import { extractErrorMessage } from "@/app/core/net/api/errorMessage";

type Tool = { available: boolean; reason?: string };
export function useSequenceReadiness(manager: { sendRequest: (request: any) => Promise<any> }) {
  const checking = ref(true), error = ref("");
  const mapOpen = ref(false), fastaLinked = ref(false);
  const tools = ref<Record<string, Tool>>({});
  async function refresh() {
    checking.value = true; error.value = "";
    try {
      const { data } = await manager.sendRequest(new SequenceAnalysisRequest("/sequence/settings", { checkTools: true }));
      mapOpen.value = data.mapOpen === true; fastaLinked.value = data.fastaLinked === true;
      tools.value = data.tools ?? {};
    } catch (failure) { error.value = extractErrorMessage(failure, "Could not check sequence tools. Please retry."); }
    finally { checking.value = false; }
  }
  const prerequisite = computed(() => checking.value ? "Checking the linked FASTA and local tools…"
    : error.value || (!mapOpen.value ? "Open a Hi-C map first." : !fastaLinked.value
      ? "Link the FASTA for the active map using Assembly → Link FASTA, or open the map and FASTA together in the Open Wizard." : ""));
  function available(name: string) { return !checking.value && tools.value[name]?.available === true; }
  function reason(name: string) { return prerequisite.value || (available(name) ? "" : tools.value[name]?.reason ?? "This tool is unavailable. Install a complete HiCT portable package, or rebuild with ./gradlew natives shadowJar."); }
  onMounted(refresh);
  return { checking, prerequisite, available, reason, refresh };
}
