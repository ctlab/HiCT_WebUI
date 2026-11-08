import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import type { SecondarySourceStatusResponse } from "@/app/core/net/api/RequestManager";
import {
  GetVisualizationOptionsRequest,
  SetVisualizationOptionsRequest,
} from "@/app/core/net/api/request";
import { buildColorExpression } from "@/app/core/visualization/renderPipelineWizard";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import { useMatrixViewStore } from "@/app/stores/matrixViewStore";
import { modDotPlotLowerExpression } from "./modDotPlot";

export async function displaySequenceOverlay(
  manager: ContactMapManager,
  mode: "overlay" | "below",
  kind: "dotplot" | "moddotplot",
  status?: SecondarySourceStatusResponse,
  minimumIdentity = 80
): Promise<void> {
  const api = manager.networkManager.requestManager;
  status ??= await api.getSecondarySourceStatus();
  if (!status.attached)
    throw new Error(
      "Attach a generated overlay first using Tools → Generate ModDotPlot or View → Tracks and layers."
    );
  if (kind === "moddotplot" && status.sequenceAnalysis?.kind !== "moddotplot")
    throw new Error(
      "This preset requires a ModDotPlot identity overlay. Alignment dotplots contain counts, not identity percentages."
    );
  manager.viewAndLayersManager.setSecondaryResolutionModel(
    status.compatibility,
    {
      exactResolutionOnly: Boolean(status.sequenceAnalysis),
    }
  );
  const options = useVisualizationOptionsStore();
  const primaryOptions = await api.getVisualizationOptions(
    new GetVisualizationOptionsRequest({})
  );
  if (options.signalDisplayMode !== "OBSERVED") {
    options.signalDisplayMode = "OBSERVED";
    await api.setVisualizationOptions(
      new SetVisualizationOptionsRequest({
        options: { ...primaryOptions, signalDisplayMode: "OBSERVED" },
        preserveRenderPipeline: true,
      })
    );
  }
  const existing = await api.getRenderPipelineConfig();
  // The shared sidebar store may currently display SECONDARY. Read PRIMARY
  // from its existing graph before replacing or regenerating the overlay.
  const findPrimary = (node: unknown): Record<string, unknown> | undefined => {
    if (!node || typeof node !== "object") return undefined;
    const expression = node as Record<string, unknown>;
    const sources = new Set<string>();
    const visit = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      const item = value as Record<string, unknown>;
      if (item.type === "source") sources.add(String(item.source));
      Object.values(item).forEach(visit);
    };
    visit(expression);
    if (
      sources.size === 1 &&
      sources.has("PRIMARY") &&
      ["colormap", "pixel_blend", "rgb", "hsl", "hsv"].includes(
        String(expression.type)
      )
    )
      return expression;
    for (const child of Object.values(expression)) {
      const found = findPrimary(child);
      if (found) return found;
    }
    return undefined;
  };
  const primary = existing.enabled
    ? findPrimary(existing.upperExpression) ??
      findPrimary(existing.lowerExpression) ??
      buildColorExpression("PRIMARY", primaryOptions)
    : buildColorExpression("PRIMARY", primaryOptions);
  const secondary =
    kind === "dotplot"
      ? {
          type: "colormap",
          mode: "LINEAR",
          input: { type: "source", source: "SECONDARY" },
          startColor: "#00008000",
          endColor: "#000080ff",
          minSignal: 0,
          maxSignal: 20,
        }
      : modDotPlotLowerExpression(
          status.sequenceAnalysis?.minimumIdentity ?? minimumIdentity,
          status.sequenceAnalysis?.scoreScale ?? 10000
        );
  const overlay = {
    type: "pixel_blend",
    mode: "OVER",
    top: secondary,
    bottom: primary,
    topOpacity: 0.65,
    bottomOpacity: 1,
  };
  await api.setRenderPipelineConfig({
    enabled: true,
    swapUpperLower: false,
    upperExpression: mode === "overlay" ? overlay : primary,
    lowerExpression: mode === "overlay" ? overlay : secondary,
  });
  const matrixView = useMatrixViewStore();
  matrixView.setPresentationMode(mode === "overlay" ? "overlay" : "split");
  matrixView.setActiveVisualizationSource("SECONDARY");
  matrixView.setLayersSwapped(false);
  await manager.reloadTilesFromBackend();
}
