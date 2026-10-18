import type { ContactMapManager } from "./ContactMapManager";
import type { MapAxisScopes } from "./HiCViewAndLayersManager";
import type { TrackStylePresetBundle } from "../tracks/TrackStylePreset";
import type { AxisTrackVisibilityState } from "./LinearTrackManager";
import { useMatrixViewStore } from "@/app/stores/matrixViewStore";
import { useStyleStore } from "@/app/stores/styleStore";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import { ColorTranslator } from "colortranslator";

export interface WorkspaceState {
  version: 1;
  background: string;
  trackStyles: TrackStylePresetBundle;
  axisTrackVisibility: AxisTrackVisibilityState;
  trackLogBases?: Record<string, number>;
  axisScopes: MapAxisScopes;
  enabledResolutions: number[];
  exportFlags: ReturnType<
    ContactMapManager["viewAndLayersManager"]["getExportTrackFlags"]
  >;
  matrixView: ReturnType<typeof useMatrixViewStore>["$state"];
  rulerMode: "global" | "contig" | "scaffold";
  view: { center?: number[]; resolution?: number; rotation: number };
}

export function captureWorkspace(manager: ContactMapManager): WorkspaceState {
  const layers = manager.viewAndLayersManager,
    view = manager.getView();
  return JSON.parse(
    JSON.stringify({
      version: 1,
      background: useStyleStore().mapBackgroundColor.RGBA,
      trackStyles: layers.getTrackStylePreset(),
      exportFlags: layers.getExportTrackFlags(),
      axisTrackVisibility:
        manager.linearTrackManager.getAxisTrackVisibilityState(),
      trackLogBases: Object.fromEntries(
        manager.linearTrackManager
          .getTracksSnapshot()
          .map((track) => [
            track.trackId,
            manager.linearTrackManager.getTrackLogBase(track.trackId),
          ])
      ),
      axisScopes: layers.getAxisScopes(),
      enabledResolutions: layers.getEnabledBpResolutions(),
      matrixView: useMatrixViewStore().$state,
      rulerMode: useUiSettingsStore().rulerCoordinateMode,
      view: {
        center: view.getCenter(),
        resolution: view.getResolution(),
        rotation: view.getRotation(),
      },
    })
  );
}

export function restoreWorkspace(
  manager: ContactMapManager,
  state?: WorkspaceState
): void {
  if (!state || state.version !== 1) return;
  const layers = manager.viewAndLayersManager;
  useStyleStore().setMapBackground(new ColorTranslator(state.background));
  layers.applyTrackStylePreset(state.trackStyles);
  Object.assign(layers.exportTrackFlags, state.exportFlags);
  manager.linearTrackManager.applyAxisTrackVisibilityState(
    state.axisTrackVisibility
  );
  for (const [trackId, base] of Object.entries(state.trackLogBases ?? {})) {
    manager.linearTrackManager.setTrackLogBase(trackId, base);
  }
  layers.setEnabledBpResolutions(state.enabledResolutions);
  layers.setAxisScopes(state.axisScopes.row, state.axisScopes.column);
  useMatrixViewStore().$patch(state.matrixView);
  useUiSettingsStore().rulerCoordinateMode = state.rulerMode;
  const view = manager.getView();
  if (
    state.view.center?.length === 2 &&
    state.view.center.every(Number.isFinite)
  )
    view.setCenter(state.view.center);
  if (Number.isFinite(state.view.resolution) && state.view.resolution! > 0)
    view.setResolution(state.view.resolution);
  if (Number.isFinite(state.view.rotation))
    view.setRotation(state.view.rotation);
  layers.updateCurrentHiCViewState();
  manager.scheduleWorkspaceLayoutRefresh();
}
