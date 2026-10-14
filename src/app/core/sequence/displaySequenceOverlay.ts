import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import type { SecondarySourceStatusResponse } from "@/app/core/net/api/RequestManager";
import { SetVisualizationOptionsRequest } from "@/app/core/net/api/request";
import { buildColorExpression } from "@/app/core/visualization/renderPipelineWizard";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import { modDotPlotLowerExpression } from "./modDotPlot";

export async function displaySequenceOverlay(manager: ContactMapManager,
    mode: "overlay" | "below", kind: "dotplot" | "moddotplot",
    status?: SecondarySourceStatusResponse, minimumIdentity = 80): Promise<void> {
  const api = manager.networkManager.requestManager;
  status ??= await api.getSecondarySourceStatus();
  if (!status.attached) throw new Error("Attach a generated overlay first using Tools → Generate ModDotPlot or View → Tracks and layers.");
  if (kind === "moddotplot" && status.sequenceAnalysis?.kind !== "moddotplot")
    throw new Error("This preset requires a ModDotPlot identity overlay. Alignment dotplots contain counts, not identity percentages.");
  manager.viewAndLayersManager.setSecondaryResolutionModel(status.compatibility);
  const options = useVisualizationOptionsStore();
  if (options.signalDisplayMode !== "OBSERVED") {
    options.signalDisplayMode = "OBSERVED";
    await api.setVisualizationOptions(new SetVisualizationOptionsRequest({ options: options.asVisualizationOptions(), preserveRenderPipeline: true }));
  }
  const primary = buildColorExpression("PRIMARY", options.asVisualizationOptions());
  const secondary = kind === "dotplot" ? { type: "colormap", mode: "LINEAR", input: { type: "source", source: "SECONDARY" },
    startColor: "#00008000", endColor: "#000080ff", minSignal: 0, maxSignal: 20 }
    : modDotPlotLowerExpression(status.sequenceAnalysis?.minimumIdentity ?? minimumIdentity, status.sequenceAnalysis?.scoreScale ?? 10000);
  const overlay = { type: "pixel_blend", mode: "OVER", top: secondary, bottom: primary, topOpacity: 0.65, bottomOpacity: 1 };
  await api.setRenderPipelineConfig({ enabled: true, swapUpperLower: false,
    upperExpression: mode === "overlay" ? overlay : primary,
    lowerExpression: mode === "overlay" ? overlay : secondary });
  await manager.reloadTilesFromBackend();
}
