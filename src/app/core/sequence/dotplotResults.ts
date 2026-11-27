import type { ContactMapManager } from "@/app/core/mapmanagers/ContactMapManager";
import type { DotplotResultMutation, RequestManager } from "@/app/core/net/api/RequestManager";
import { prepareFileSave } from "@/app/core/export/FileSave";
import { useMatrixViewStore } from "@/app/stores/matrixViewStore";
import { displaySequenceOverlay } from "./displaySequenceOverlay";

export async function applyDotplotResult(manager: ContactMapManager, result: DotplotResultMutation): Promise<void> {
  const status = result.secondarySource;
  if (!status) return;
  if (result.shown) {
    await displaySequenceOverlay(manager, result.displayMode, result.kind, status);
  } else {
    const view = useMatrixViewStore();
    view.setActiveVisualizationSource("PRIMARY");
    view.setLayersSwapped(false);
    manager.viewAndLayersManager.setSecondaryResolutionModel(undefined);
    await manager.reloadTilesFromBackend();
  }
}

export async function saveDotplotResult(api: RequestManager, id: string, filename: string): Promise<void> {
  const destination = await prepareFileSave(filename, "other");
  if (!destination) return;
  const response = await api.downloadDotplotResult(id);
  if (!response.ok) throw new Error("The dotplot result set is unavailable.");
  if (destination.writeStream && response.body) await destination.writeStream(response.body);
  else await destination.write(await response.blob());
}

export function formatDotplotSizes(levels: number[], format: (size: number) => string): string {
  if (!levels.length) return "";
  const first = levels[0], last = levels[levels.length - 1];
  return first === last ? format(first) : `${format(first)}–${format(last)}`;
}
