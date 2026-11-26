import { isValidLogBase } from "@/app/core/visualization/signalProfile";
import { useNotificationCenterStore } from "@/app/stores/notificationCenterStore";
/*
 Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis and Computer Technologies Laboratory ITMO University team.

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
 */

import type { EventsKey } from "ol/events";
import { unByKey } from "ol/Observable";
import { transform } from "ol/proj";
import { watch } from "vue";
import type { ContactMapManager } from "./ContactMapManager";
import { useStyleStore } from "@/app/stores/styleStore";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import type {
  FileEntryResponse,
  TrackBinBlockResponse,
  TrackFeatureSearchHitResponse,
  TrackBinResponse,
  TrackCompatibilityReportResponse,
  TrackQueryResponse,
  TrackRenderResponse,
  TrackSummaryResponse,
  TracksPrecomputeStatusResponse,
} from "@/app/core/net/api/response";
import { sequenceLetterMinimumPixels } from "../visualization/sequenceLetterMetrics";
import {
  DEFAULT_STRAND_COLORS,
  drawChevrons,
  drawClippedEdge,
  featureChevrons,
  featureGeometry,
  parseBedRgb,
  strandFill,
  type ScreenBlock,
  type Strand,
  type StrandColors,
} from "../visualization/strandArrows";
import { packIntervalsIntoLanes } from "./featurePacking";
import {
  projectSequenceTrackBins,
  type SequenceAxisSegment,
} from "../visualization/sequenceTrackProjection";

export type TrackOrientation = "horizontal" | "vertical";
type Orientation = TrackOrientation;
type RenderedFeatureHit = {
  trackId: string;
  bin: TrackBinResponse;
  axisStart: number;
  axisEnd: number;
  crossStart: number;
  crossEnd: number;
};
export interface AxisTrackVisibilityState {
  horizontalHidden: string[];
  verticalHidden: string[];
}
type TrackTextPalette = {
  primary: string;
  muted: string;
  error: string;
  axis: string;
  axisStroke: string;
  outline: string;
};
const DEFAULT_PREFETCH_EXTENT_SCREENS = 2;
const CACHE_MAX_AGE_MS = 60_000;
const MAX_PREFETCH_QUERY_WIDTH_PX = 2048;
const MAX_SEQUENCE_TRACK_WINDOW_BP = 1_048_576;
const MAX_CACHED_RESOLUTIONS_PER_ORIENTATION = 6;

class LinearTrackManager {
  /** Temporary label anchors for a cropped export; data coordinates stay unchanged. */
  public exportLabelBounds?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };

  private horizontalCanvas: HTMLCanvasElement | null = null;
  private verticalCanvas: HTMLCanvasElement | null = null;
  private horizontalResizeObserver: ResizeObserver | null = null;
  private verticalResizeObserver: ResizeObserver | null = null;
  private tracks: TrackSummaryResponse[] = [];
  private trackListRequestId = 0;
  private disposed = false;
  private readonly hiddenByAxis: Record<Orientation, Set<string>> = {
    horizontal: new Set<string>(),
    vertical: new Set<string>(),
  };
  private readonly trackLogBases = new Map<string, number>();
  private renderRequestId = 0;
  private readonly moveEndListener?: EventsKey;
  private readonly centerListener?: EventsKey;
  private readonly resolutionListener?: EventsKey;
  private readonly stopTrackBackgroundWatch: () => void;
  private interactiveRenderFramePending = false;
  private readonly listSubscribers = new Set<
    (tracks: TrackSummaryResponse[]) => void
  >();
  private readonly renderStateSubscribers = {
    horizontal: new Set<(state: RenderState) => void>(),
    vertical: new Set<(state: RenderState) => void>(),
  };
  private readonly renderStates: Record<Orientation, RenderState> = {
    horizontal: { statusMessage: "No tracks loaded", trackCount: 0 },
    vertical: { statusMessage: "No tracks loaded", trackCount: 0 },
  };
  private cacheEpoch = 0;
  private readonly analysisWarnings = new Map<string, string>();
  public getAnalysisWarning(trackId: string): string | undefined {
    return this.analysisWarnings.get(trackId);
  }
  private readonly lastTrackErrors = new Map<string, string>();
  private readonly prefetchExtentScreens = DEFAULT_PREFETCH_EXTENT_SCREENS;
  private pendingRefreshTimer: number | null = null;
  private readonly pendingTrackMessages = new Map<string, string>();
  private readonly queryCache: Record<
    Orientation,
    Map<number, TrackQueryCache>
  > = {
    horizontal: new Map<number, TrackQueryCache>(),
    vertical: new Map<number, TrackQueryCache>(),
  };
  private readonly prefetchInFlight = {
    horizontal: new Set<string>(),
    vertical: new Set<string>(),
  };
  private readonly lastRenderedSnapshot: Record<
    Orientation,
    {
      tracks: TrackRenderResponse[];
      featureHits: RenderedFeatureHit[];
      viewport: ViewportGeometry;
      laneBounds: TrackLaneBounds[];
      renderedAtMs: number;
    } | null
  > = {
    horizontal: null,
    vertical: null,
  };
  private readonly featureSearchCache = new Map<string, FeatureSearchEntry>();
  private selectedFeature: SelectedTrackFeature | null = null;

  constructor(private readonly mapManager: ContactMapManager) {
    const map = this.mapManager.getMap();
    const view = this.mapManager.getView();
    this.moveEndListener = map.on("moveend", () => {
      void this.render({ allowFetch: true });
    });
    this.centerListener = view.on("change:center", () => {
      if (this.isViewInteracting()) {
        this.scheduleInteractiveRender();
      }
    });
    this.resolutionListener = view.on("change:resolution", () => {
      if (this.isViewInteracting()) {
        this.scheduleInteractiveRender();
        return;
      }
      void this.render({ allowFetch: true });
    });
    this.stopTrackBackgroundWatch = watch(
      () => this.resolveTrackBackgroundColor(),
      () => {
        this.redrawTrackCanvas("horizontal");
        this.redrawTrackCanvas("vertical");
      }
    );
  }

  public dispose(): void {
    this.disposed = true;
    this.stopTrackBackgroundWatch();
    this.trackListRequestId++;
    if (this.moveEndListener) {
      unByKey(this.moveEndListener);
    }
    if (this.centerListener) {
      unByKey(this.centerListener);
    }
    if (this.resolutionListener) {
      unByKey(this.resolutionListener);
    }
    if (this.pendingRefreshTimer !== null)
      window.clearTimeout(this.pendingRefreshTimer);
    this.pendingRefreshTimer = null;
    this.horizontalResizeObserver?.disconnect();
    this.verticalResizeObserver?.disconnect();
    this.horizontalCanvas = null;
    this.verticalCanvas = null;
    this.invalidateQueryCache();
    this.listSubscribers.clear();
    this.renderStateSubscribers.horizontal.clear();
    this.renderStateSubscribers.vertical.clear();
  }

  public registerCanvas(
    orientation: Orientation,
    canvas: HTMLCanvasElement | null
  ): void {
    if (orientation === "horizontal") {
      this.horizontalResizeObserver?.disconnect();
      this.horizontalCanvas = canvas;
      this.horizontalResizeObserver = this.createResizeObserver(canvas);
    } else {
      this.verticalResizeObserver?.disconnect();
      this.verticalCanvas = canvas;
      this.verticalResizeObserver = this.createResizeObserver(canvas);
    }
    void this.render();
    window.requestAnimationFrame(() => {
      void this.render();
    });
    window.setTimeout(() => {
      void this.render();
    }, 0);
    window.setTimeout(() => {
      void this.render();
    }, 100);
  }

  public subscribeRenderState(
    orientation: Orientation,
    callback: (state: RenderState) => void
  ): () => void {
    this.renderStateSubscribers[orientation].add(callback);
    queueMicrotask(() => {
      if (this.renderStateSubscribers[orientation].has(callback)) {
        callback({ ...this.renderStates[orientation] });
      }
    });
    return () => {
      this.renderStateSubscribers[orientation].delete(callback);
    };
  }

  public subscribeTrackList(
    callback: (tracks: TrackSummaryResponse[]) => void
  ): () => void {
    this.listSubscribers.add(callback);
    queueMicrotask(() => {
      if (this.listSubscribers.has(callback)) {
        callback(this.tracks.slice());
      }
    });
    return () => {
      this.listSubscribers.delete(callback);
    };
  }

  public getTracksSnapshot(): TrackSummaryResponse[] {
    return this.tracks.slice();
  }

  public isTrackVisibleOnAxis(
    trackId: string,
    orientation: Orientation
  ): boolean {
    return !this.hiddenByAxis[orientation].has(trackId);
  }

  public getVisibleTracksForAxis(
    orientation: Orientation
  ): TrackSummaryResponse[] {
    return this.tracks.filter(
      (track) =>
        track.visible && this.isTrackVisibleOnAxis(track.trackId, orientation)
    );
  }

  public getAxisTrackVisibilityState(): AxisTrackVisibilityState {
    return {
      horizontalHidden: [...this.hiddenByAxis.horizontal].sort(),
      verticalHidden: [...this.hiddenByAxis.vertical].sort(),
    };
  }

  public applyAxisTrackVisibilityState(
    state?: Partial<AxisTrackVisibilityState>
  ): void {
    const known = new Set(this.tracks.map((track) => track.trackId));
    this.hiddenByAxis.horizontal = new Set(
      (state?.horizontalHidden ?? []).filter((trackId) => known.has(trackId))
    );
    this.hiddenByAxis.vertical = new Set(
      (state?.verticalHidden ?? []).filter((trackId) => known.has(trackId))
    );
    this.invalidateQueryCache();
    this.notifyTrackListChanged();
    void this.render({ allowFetch: false });
  }

  public setTrackVisibleOnAxis(
    trackId: string,
    orientation: Orientation,
    visible: boolean
  ): void {
    if (!this.tracks.some((track) => track.trackId === trackId)) return;
    if (visible) this.hiddenByAxis[orientation].delete(trackId);
    else this.hiddenByAxis[orientation].add(trackId);
    this.invalidateQueryCache();
    this.notifyTrackListChanged();
    void this.render({ allowFetch: false });
  }

  public async refreshTrackList(
    waitForRender = true
  ): Promise<TrackSummaryResponse[]> {
    if (this.disposed) return this.tracks.slice();
    const requestId = ++this.trackListRequestId;
    const snapshot =
      await this.mapManager.networkManager.requestManager.listTracks();
    // A late list response must not undo a newer edit or reset its local settings.
    if (this.disposed || requestId !== this.trackListRequestId)
      return this.tracks.slice();
    this.tracks = snapshot;
    this.syncTrackRenderSettings();
    this.invalidateQueryCache();
    this.notifyTrackListChanged();
    const rendering = this.render();
    if (waitForRender) await rendering;
    else
      void rendering.catch((error) =>
        console.error("Failed to render 1D tracks", error)
      );
    return this.tracks.slice();
  }

  public getTrackLogBase(trackId: string): number {
    return this.trackLogBases.get(trackId) ?? 10;
  }

  /**
   * Sets the base of a track's log(1 + x) scale. A base that is not a positive finite number
   * other than 1 is refused, the last valid base stays, and the reason is returned.
   */
  public setTrackLogBase(
    trackId: string,
    value: number
  ): { ok: true } | { ok: false; message: string } {
    if (!isValidLogBase(value)) {
      return {
        ok: false,
        message:
          "The log base must be a positive number other than 1. The previous base was kept.",
      };
    }
    this.trackLogBases.set(trackId, value);
    void this.render({ allowFetch: false });
    return { ok: true };
  }

  public async listTrackFiles(): Promise<string[]> {
    return this.mapManager.networkManager.requestManager.listTrackFiles();
  }

  public async listFilesDetailed(): Promise<FileEntryResponse[]> {
    return this.mapManager.networkManager.requestManager.listFilesDetailed();
  }

  public async probeTrackCompatibility(
    filename: string
  ): Promise<TrackCompatibilityReportResponse> {
    return this.mapManager.networkManager.requestManager.probeTrackCompatibility(
      filename
    );
  }

  public async openTrack(
    filename: string,
    name?: string,
    waitForRender = true
  ): Promise<readonly string[]> {
    const summary =
      await this.mapManager.networkManager.requestManager.openTrack(
        filename,
        name
      );
    await this.refreshTrackList(waitForRender);
    return summary.importWarnings;
  }

  public async openCoolerWeightsTrack(
    name?: string,
    source: "PRIMARY" | "SECONDARY" = "PRIMARY"
  ): Promise<void> {
    await this.mapManager.networkManager.requestManager.openCoolerWeightsTrack(
      name,
      undefined,
      source
    );
    await this.refreshTrackList();
  }

  public async removeTrack(trackId: string): Promise<void> {
    await this.mapManager.networkManager.requestManager.removeTrack(trackId);
    await this.refreshTrackList();
  }

  public async reorderTrack(
    trackId: string,
    targetIndex: number
  ): Promise<void> {
    this.tracks =
      await this.mapManager.networkManager.requestManager.reorderTrack(
        trackId,
        targetIndex
      );
    this.syncTrackRenderSettings();
    this.invalidateQueryCache();
    this.notifyTrackListChanged();
    await this.render({ allowFetch: true });
  }

  public async updateTrack(
    trackId: string,
    options: {
      visible?: boolean;
      color?: string;
      name?: string;
      renderMode?: string;
      aggregationMode?: string;
      logScale?: boolean;
      rangeAuto?: boolean;
      rangeMin?: number;
      rangeMax?: number;
    }
  ): Promise<void> {
    await this.mapManager.networkManager.requestManager.updateTrack(
      trackId,
      options
    );
    await this.refreshTrackList();
  }

  public async startPrecompute(
    trackId?: string,
    force = false
  ): Promise<TracksPrecomputeStatusResponse> {
    return this.mapManager.networkManager.requestManager.startTracksPrecompute(
      trackId,
      force
    );
  }

  public async getPrecomputeStatus(): Promise<TracksPrecomputeStatusResponse> {
    return this.mapManager.networkManager.requestManager.getTracksPrecomputeStatus();
  }

  public async render(options?: { allowFetch?: boolean }): Promise<void> {
    if (!this.horizontalCanvas && !this.verticalCanvas) {
      return;
    }
    const allowFetch = options?.allowFetch ?? true;
    const requestId = ++this.renderRequestId;
    const horizontalPromise = this.renderOrientation(
      "horizontal",
      requestId,
      allowFetch
    );
    const verticalPromise = this.renderOrientation(
      "vertical",
      requestId,
      allowFetch
    );
    await Promise.all([horizontalPromise, verticalPromise]);
  }

  public async renderFullExtentCanvasForExport(
    orientation: Orientation,
    options: {
      bpResolution: number;
      startPx: number;
      endPx: number;
      trackPanelSizePx?: number;
    }
  ): Promise<HTMLCanvasElement | null> {
    const spanPx = Math.max(1, options.endPx - options.startPx);
    const visibleTracks = this.tracks.filter((track) => track.visible);
    if (visibleTracks.length === 0) {
      return null;
    }
    const trackPanelSizePx = Math.max(60, options.trackPanelSizePx ?? 140);
    const canvas = document.createElement("canvas");
    if (orientation === "horizontal") {
      canvas.width = spanPx;
      canvas.height = trackPanelSizePx;
    } else {
      canvas.width = trackPanelSizePx;
      canvas.height = spanPx;
    }
    const response = this.refineTrackResponsePx(
      await this.mapManager.networkManager.requestManager.queryTracks1D(
        options.startPx,
        options.endPx,
        spanPx,
        options.bpResolution
      )
    );
    const viewport: ViewportGeometry = {
      startBp: response.startBp,
      endBp: response.endBp,
      startPx: options.startPx,
      endPx: options.endPx,
      bpResolution: options.bpResolution,
      visibleWidthPx: spanPx,
      scopeStartPx: options.startPx,
      scopeEndPx: options.endPx,
      pxToScreen: (px: number) => {
        const normalized = (px - options.startPx) / Math.max(1, spanPx);
        return normalized * spanPx;
      },
    };
    this.drawTrackCanvas(
      canvas,
      orientation,
      response,
      viewport,
      undefined,
      false
    );
    return canvas;
  }

  /** Render a padded sequence window using the same styles as map annotations.
   * This detached canvas never changes the map's hover/search/render caches. */
  public async renderSequenceTracks(
    canvas: HTMLCanvasElement,
    orientation: Orientation,
    options: {
      start: number;
      end: number;
      segments: readonly SequenceAxisSegment[];
      signal?: AbortSignal;
      isCurrent: () => boolean;
    },
    drawOrientation: Orientation = orientation
  ): Promise<{
    hover: (axis: number, cross: number) => TrackHoverInfo | null;
    errors: string[];
  } | null> {
    const visible = this.getVisibleTracksForAxis(orientation);
    if (!visible.length) return null;
    const real = options.segments.filter(
      (s) => !s.gap && s.assemblyStart !== null && s.end > s.start
    );
    const bpResolution =
      this.mapManager.getLayersManager().currentViewState.resolutionDesciptor
        .bpResolution;
    const width =
      drawOrientation === "horizontal" ? canvas.width : canvas.height;
    const api = this.mapManager.networkManager.requestManager;
    const version = api.history.applied;
    const response: TrackQueryResponse = real.length
      ? await this.mapManager.networkManager.requestManager.queryTracks1DByUnits(
          {
            unit: "BP",
            start: real[0].assemblyStart!,
            end:
              real[real.length - 1].assemblyStart! +
              real[real.length - 1].end -
              real[real.length - 1].start,
            widthPx: Math.max(1, width),
            bpResolution,
          },
          options.signal
        )
      : {
          startBp: 0,
          endBp: 0,
          startPx: 0,
          endPx: 0,
          widthPx: width,
          bpResolution,
          tracks: [],
        };
    if (options.signal?.aborted || !options.isCurrent()) return null;
    // Track queries run concurrently with edits. A read-after check rejects any
    // intervening journal revision instead of drawing annotations from a different
    // assembly than the already fetched sequence. History reads never advance the
    // client's applied coordinate version.
    if (real.length && version) {
      const page = await api.getAssemblyHistory();
      if (options.signal?.aborted || !options.isCurrent()) return null;
      if (
        page.summary?.session !== version.session ||
        page.summary?.revision !== version.revision
      )
        throw new Error(
          "The assembly changed in another client. Return to the contact map and refresh it before viewing sequence annotations."
        );
    }
    const ids = new Set(visible.map((t) => t.trackId));
    const tracks = response.tracks
      .filter((t) => ids.has(t.trackId))
      .map((t) => ({
        ...t,
        bins: projectSequenceTrackBins(t.bins, options.segments),
      }));
    // Preserve visible track labels even in an entirely synthetic gap.
    if (!real.length)
      for (const t of visible)
        tracks.push({
          trackId: t.trackId,
          name: t.name,
          type: t.type,
          color: t.color,
          renderStyle: t.renderStyle,
          bins: [],
          maxValue: 0,
          error: null,
          statusMessage: "Scaffold gap: no annotation data",
          analysisWarning: null,
        });
    const viewport: ViewportGeometry = {
      startBp: response.startBp,
      endBp: response.endBp,
      startPx: options.start,
      endPx: options.end,
      bpResolution,
      visibleWidthPx: width,
      scopeStartPx: options.start,
      scopeEndPx: options.end,
      pxToScreen: (px) =>
        ((px - options.start) * width) /
        Math.max(1, options.end - options.start),
    };
    const featureHits = this.drawTrackCanvas(
      canvas,
      drawOrientation,
      { ...response, tracks },
      viewport,
      undefined,
      false,
      orientation
    );
    const snapshot = {
      tracks,
      featureHits,
      viewport,
      laneBounds: this.trackLanePixels(canvas, drawOrientation, tracks),
      renderedAtMs: Date.now(),
    };
    return {
      hover: (axis, cross) =>
        this.getTrackHoverAt(drawOrientation, axis, cross, snapshot),
      errors: tracks.flatMap((t) => (t.error ? [`${t.name}: ${t.error}`] : [])),
    };
  }

  private isViewInteracting(): boolean {
    const view = this.mapManager.getView();
    return view.getInteracting() || view.getAnimating();
  }

  private scheduleInteractiveRender(): void {
    if (this.interactiveRenderFramePending) {
      return;
    }
    this.interactiveRenderFramePending = true;
    window.requestAnimationFrame(() => {
      this.interactiveRenderFramePending = false;
      if (!this.isViewInteracting()) {
        return;
      }
      void this.render({ allowFetch: false });
    });
  }

  private notifyTrackListChanged(): void {
    const snapshot = this.tracks.slice();
    this.listSubscribers.forEach((fn) => {
      queueMicrotask(() => {
        if (this.listSubscribers.has(fn)) {
          fn(snapshot);
        }
      });
    });
    const visibleCount = snapshot.filter((track) => track.visible).length;
    this.setRenderState("horizontal", {
      statusMessage: visibleCount > 0 ? "" : "No tracks loaded",
      trackCount: visibleCount,
    });
    this.setRenderState("vertical", {
      statusMessage: visibleCount > 0 ? "" : "No tracks loaded",
      trackCount: visibleCount,
    });
  }

  private invalidateQueryCache(): void {
    this.cacheEpoch += 1;
    this.featureSearchCache.clear();
    this.indexedSearchBins = new WeakSet();
    this.queryCache.horizontal.clear();
    this.queryCache.vertical.clear();
    this.prefetchInFlight.horizontal.clear();
    this.prefetchInFlight.vertical.clear();
  }

  private syncTrackRenderSettings(): void {
    const existingIds = new Set(this.tracks.map((track) => track.trackId));
    for (const trackId of [...this.trackLogBases.keys()]) {
      if (!existingIds.has(trackId)) {
        this.trackLogBases.delete(trackId);
      }
    }
    this.tracks.forEach((track) => {
      if (!this.trackLogBases.has(track.trackId)) {
        this.trackLogBases.set(track.trackId, 10);
      }
    });
    for (const [key, entry] of this.featureSearchCache.entries()) {
      if (!existingIds.has(entry.trackId)) {
        this.featureSearchCache.delete(key);
      }
    }
  }

  public async clearCachesAndRender(): Promise<void> {
    this.invalidateQueryCache();
    await this.render({ allowFetch: true });
  }

  public getFeatureHoverAt(
    orientation: Orientation,
    axisOffsetPx: number,
    crossOffsetPx: number
  ): FeatureHoverInfo | null {
    const hit = this.getTrackHoverAt(orientation, axisOffsetPx, crossOffsetPx);
    return hit?.kind === "feature" ? hit : null;
  }

  public getTrackHoverAt(
    orientation: Orientation,
    axisOffsetPx: number,
    crossOffsetPx: number,
    snapshot = this.lastRenderedSnapshot[orientation]
  ): TrackHoverInfo | null {
    if (!snapshot || snapshot.tracks.length === 0) {
      return null;
    }
    const laneIndex = snapshot.laneBounds.findIndex(
      ({ start, end }) => crossOffsetPx >= start && crossOffsetPx < end
    );
    if (laneIndex < 0) return null;
    const track = snapshot.tracks[laneIndex];
    const { start: laneStart, end: laneEnd } = snapshot.laneBounds[laneIndex];
    const laneSize = laneEnd - laneStart;
    const renderStyle = (track.renderStyle ?? "SIGNAL").toUpperCase();
    const bins =
      renderStyle === "FEATURE"
        ? snapshot.featureHits
            .filter(
              (hit) =>
                hit.trackId === track.trackId &&
                axisOffsetPx >= hit.axisStart &&
                axisOffsetPx < hit.axisEnd &&
                crossOffsetPx >= hit.crossStart &&
                crossOffsetPx < hit.crossEnd
            )
            .reverse()
            .map((hit) => hit.bin)
        : track.bins;
    for (const bin of bins) {
      const interval = this.resolveBinIntervalPx(
        bin,
        snapshot.viewport.bpResolution
      );
      if (!interval.visible) {
        continue;
      }
      if (
        interval.endPx <= snapshot.viewport.startPx ||
        interval.startPx >= snapshot.viewport.endPx
      ) {
        continue;
      }
      const start = Math.floor(snapshot.viewport.pxToScreen(interval.startPx));
      const end = Math.max(
        start + 1,
        Math.ceil(snapshot.viewport.pxToScreen(interval.endPx))
      );
      if (axisOffsetPx < start || axisOffsetPx >= end) {
        continue;
      }
      if (renderStyle !== "FEATURE") {
        return {
          kind: "signal",
          trackId: track.trackId,
          trackName: track.name,
          trackType: track.type,
          samplingBpResolution: track.samplingBpResolution,
          startBp: Math.min(bin.startBp, bin.endBp),
          endBp: Math.max(bin.startBp, bin.endBp),
          startPx: interval.startPx,
          endPx: interval.endPx,
          value: Number.isFinite(bin.value) ? bin.value : 0,
          count: bin.count,
        };
      }
      const label = (bin.label ?? "").trim();
      const featureType = (bin.featureType ?? "").trim();
      return {
        kind: "feature",
        trackId: track.trackId,
        trackName: track.name,
        label: label.length > 0 ? label : null,
        featureType: featureType.length > 0 ? featureType : null,
        strand: bin.strand,
        startBp: Math.min(bin.startBp, bin.endBp),
        endBp: Math.max(bin.startBp, bin.endBp),
        startPx: interval.startPx,
        endPx: interval.endPx,
        value: bin.value,
        attributes: bin.attributes,
      };
    }
    return null;
  }

  public searchFeatureSuggestions(
    queryRaw: string,
    limit = 50
  ): FeatureSearchEntry[] {
    const query = queryRaw.trim().toLowerCase();
    if (query.length < 2) {
      return [];
    }
    const now = Date.now();
    const maxAgeMs = 6 * 60 * 1000;
    const out: FeatureSearchEntry[] = [];
    for (const [key, entry] of this.featureSearchCache.entries()) {
      if (now - entry.updatedAtMs > maxAgeMs) {
        this.featureSearchCache.delete(key);
        continue;
      }
      if (
        entry.label.toLowerCase().includes(query) ||
        entry.trackName.toLowerCase().includes(query) ||
        (entry.featureType ?? "").toLowerCase().includes(query)
      ) {
        out.push(entry);
      }
    }
    out.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    return out.slice(0, Math.max(1, limit));
  }

  public async searchFeatureSuggestionsRemote(
    queryRaw: string,
    limit = 100
  ): Promise<FeatureSearchEntry[]> {
    const query = queryRaw.trim();
    if (query.length < 2) {
      return [];
    }
    const response =
      await this.mapManager.networkManager.requestManager.searchTrackFeatures({
        query,
        limit: Math.max(1, Math.min(300, limit)),
        offset: 0,
      });
    const now = Date.now();
    for (const hit of response.hits) {
      const entry = this.mapFeatureHitToSearchEntry(hit, now);
      this.featureSearchCache.set(entry.key, entry);
    }
    return this.searchFeatureSuggestions(query, limit);
  }

  public centerOnFeature(entry: FeatureSearchEntry): void {
    this.setSelectedFeature(entry);
    const view = this.mapManager.getView();
    const midpoint = (entry.startBp + entry.endBp) / 2;
    this.mapManager.getLayersManager().restoreViewPosition({
      centerBp: [midpoint, midpoint],
      resolution: view.getResolution(),
      rotation: view.getRotation(),
    });
  }

  /** Center the feature at measured, readable FASTA letter scale on both axes. */
  public zoomToFeature(entry: FeatureSearchEntry): void {
    if (!this.mapManager.networkManager.requestManager.hasLinkedFasta) return;
    const finest = this.getFinestBpResolution();
    const layers = this.mapManager.getLayersManager();
    const finestPixel = layers.getPixelResolutionForBpResolution(finest);
    if (finestPixel === undefined) return;
    const worldPerBase = finestPixel / finest;
    const resolution = worldPerBase / (sequenceLetterMinimumPixels() * 1.1);
    const midpoint = (entry.startBp + entry.endBp) / 2;
    if (![resolution, midpoint].every(Number.isFinite) || resolution <= 0)
      return;
    this.setSelectedFeature(entry);
    const view = this.mapManager.getView();
    layers.restoreViewPosition({
      centerBp: [midpoint, midpoint],
      resolution,
      rotation: view.getRotation(),
    });
  }

  /** Finest bp resolution of the open map; map units are pixels at this resolution. */
  public getFinestBpResolution(): number {
    if (this.mapManager.getLayersManager().isSequenceScale) return 1;
    const tuples = this.mapManager.getLayersManager().resolutionTuples;
    const finestBpResolution = tuples.reduce(
      (acc, tuple) => Math.min(acc, tuple.bpResolution),
      Number.POSITIVE_INFINITY
    );
    return Number.isFinite(finestBpResolution) && finestBpResolution > 0
      ? finestBpResolution
      : this.mapManager.getLayersManager().currentViewState.resolutionDesciptor
          .bpResolution;
  }

  /** The visible track whose lane contains the cross-axis offset, even when no feature is under the pointer. */
  public getTrackLaneAt(
    orientation: Orientation,
    crossOffsetPx: number
  ): { trackId: string; trackName: string } | null {
    const snapshot = this.lastRenderedSnapshot[orientation];
    if (!snapshot || snapshot.tracks.length === 0) {
      return null;
    }
    const index = snapshot.laneBounds.findIndex(
      ({ start, end }) => crossOffsetPx >= start && crossOffsetPx < end
    );
    const track = snapshot.tracks[index];
    return track ? { trackId: track.trackId, trackName: track.name } : null;
  }

  public centerOnBpRange(startBp: number, endBp: number): void {
    const view = this.mapManager.getView();
    const map = this.mapManager.getMap();
    const currentResolution = view.getResolution() ?? 1;
    const mapSize = map.getSize() ?? [1200, 900];
    const spanBp = Math.max(1, endBp - startBp);
    const safeFinestBpResolution = this.getFinestBpResolution();
    const finestPixelResolution =
      this.mapManager
        .getLayersManager()
        .getPixelResolutionForBpResolution(safeFinestBpResolution) ??
      currentResolution;
    const targetSpanPx = Math.max(180, Math.min(mapSize[0], mapSize[1]) * 0.52);
    const spanPxAtFinest = spanBp / Math.max(1, safeFinestBpResolution);
    const minViewResolution = view.getMinResolution() ?? 0;
    const desiredScaleFactor =
      spanPxAtFinest > 0 ? spanPxAtFinest / targetSpanPx : 1;
    const pixelResolution = Math.max(
      minViewResolution,
      finestPixelResolution * desiredScaleFactor
    );
    const midpointBp = (startBp + endBp) / 2;
    this.mapManager.getLayersManager().restoreViewPosition({
      centerBp: [midpointBp, midpointBp],
      resolution: pixelResolution,
      rotation: view.getRotation(),
    });
  }

  public setSelectedFeature(entry: {
    trackId: string;
    label: string;
    featureType: string | null;
    startBp: number;
    endBp: number;
  }): void {
    const startBp = Math.min(entry.startBp, entry.endBp);
    const endBp = Math.max(entry.startBp, entry.endBp);
    this.selectedFeature = {
      trackId: entry.trackId,
      label: (entry.label ?? "").trim(),
      featureType: (entry.featureType ?? "").trim() || null,
      startBp,
      endBp,
    };
    void this.render({ allowFetch: false });
  }

  public clearSelectedFeature(): void {
    this.selectedFeature = null;
    void this.render({ allowFetch: false });
  }

  public toggleFeatureSelectionAt(
    orientation: Orientation,
    axisOffsetPx: number,
    crossOffsetPx: number
  ): void {
    const hit = this.getFeatureHoverAt(
      orientation,
      axisOffsetPx,
      crossOffsetPx
    );
    if (!hit) {
      return;
    }
    const next: SelectedTrackFeature = {
      trackId: hit.trackId,
      label: (hit.label ?? "").trim(),
      featureType: (hit.featureType ?? "").trim() || null,
      startBp: Math.min(hit.startBp, hit.endBp),
      endBp: Math.max(hit.startBp, hit.endBp),
    };
    if (this.isSameSelectedFeature(this.selectedFeature, next)) {
      this.selectedFeature = null;
    } else {
      this.selectedFeature = next;
    }
    void this.render({ allowFetch: false });
  }

  public async prefetchFeatureContextAround(
    startBp: number,
    endBp: number,
    options?: {
      marginScreens?: number;
      widthPx?: number;
      bpResolution?: number;
    }
  ): Promise<void> {
    const descriptor =
      this.mapManager.getLayersManager().currentViewState.resolutionDesciptor;
    const mapSize = this.mapManager.getMap().getSize() ?? [1200, 900];
    const widthPx = Math.max(
      96,
      Math.round(options?.widthPx ?? Math.max(mapSize[0], mapSize[1]))
    );
    const bpResolution = Math.max(
      1,
      Math.round(options?.bpResolution ?? descriptor.bpResolution)
    );
    const marginScreens =
      Number.isFinite(options?.marginScreens) &&
      (options?.marginScreens ?? 0) >= 0
        ? Number(options?.marginScreens)
        : this.prefetchExtentScreens;
    try {
      const context =
        await this.mapManager.networkManager.requestManager.getTrackFeatureContext(
          {
            unit: "BP",
            start: Math.max(0, Math.floor(Math.min(startBp, endBp))),
            end: Math.max(
              Math.floor(Math.min(startBp, endBp)) + 1,
              Math.ceil(Math.max(startBp, endBp))
            ),
            widthPx,
            bpResolution,
            marginScreens,
          }
        );
      const cachedAt = Date.now();
      const query = this.refineTrackResponsePx(context.query);
      const cacheRecord: TrackQueryCache = {
        bpResolution: query.bpResolution,
        prefetchStartPx: query.startPx,
        prefetchEndPx: query.endPx,
        fetchedAtMs: cachedAt,
        response: query,
      };
      this.queryCache.horizontal.set(query.bpResolution, { ...cacheRecord });
      this.queryCache.vertical.set(query.bpResolution, { ...cacheRecord });
      this.pruneCache("horizontal");
      this.pruneCache("vertical");
      for (const track of query.tracks) {
        this.refreshFeatureSearchCache(track, track.bins);
      }
      await this.render({ allowFetch: false });
    } catch (error) {
      console.debug("Feature context prefetch failed", error);
    }
  }

  private createResizeObserver(
    canvas: HTMLCanvasElement | null
  ): ResizeObserver | null {
    const parent = canvas?.parentElement;
    if (!parent) {
      return null;
    }
    const observer = new ResizeObserver(() => {
      void this.render();
    });
    observer.observe(parent);
    return observer;
  }

  private setRenderState(orientation: Orientation, state: RenderState): void {
    this.renderStates[orientation] = state;
    this.renderStateSubscribers[orientation].forEach((callback) => {
      queueMicrotask(() => {
        if (this.renderStateSubscribers[orientation].has(callback)) {
          callback({ ...state });
        }
      });
    });
  }

  private async renderOrientation(
    orientation: Orientation,
    requestId: number,
    allowFetch: boolean
  ): Promise<void> {
    const canvas =
      orientation === "horizontal"
        ? this.horizontalCanvas
        : this.verticalCanvas;
    if (!canvas) {
      return;
    }

    const parent = canvas.parentElement;
    if (!parent) {
      return;
    }
    const parentRect = parent.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(parentRect.width));
    const cssHeight = Math.max(1, Math.floor(parentRect.height));
    if (canvas.width !== cssWidth || canvas.height !== cssHeight) {
      canvas.width = cssWidth;
      canvas.height = cssHeight;
    }
    if (cssWidth <= 2 || cssHeight <= 2) {
      this.setRenderState(orientation, {
        statusMessage: "Track panel is initializing",
        trackCount: this.tracks.filter((track) => track.visible).length,
      });
      return;
    }

    const viewport = this.getViewportGeometry(orientation);
    if (!viewport) {
      return;
    }
    const cacheEpoch = this.cacheEpoch;
    try {
      const prefetch = this.buildPrefetchViewport(viewport);
      if (!prefetch) return;
      const orientationCache = this.queryCache[orientation];
      const cached = orientationCache.get(viewport.bpResolution);
      const cacheMatchesResolution =
        !!cached && cached.bpResolution === viewport.bpResolution;
      const cacheFresh =
        !!cached && Date.now() - cached.fetchedAtMs <= CACHE_MAX_AGE_MS;
      const cacheCoversViewport =
        !!cached &&
        cacheMatchesResolution &&
        cached.prefetchStartPx <= viewport.startPx &&
        cached.prefetchEndPx >= viewport.endPx &&
        cached.response.widthPx /
          Math.max(1, cached.prefetchEndPx - cached.prefetchStartPx) >=
          (0.85 * prefetch.prefetchWidthPx) /
            Math.max(1, prefetch.prefetchEndPx - prefetch.prefetchStartPx);
      let response: TrackQueryResponse;
      if (
        cached &&
        cacheMatchesResolution &&
        (cacheCoversViewport ? cacheFresh || !allowFetch : !allowFetch)
      ) {
        response = cached.response;
      } else if (!allowFetch) {
        return;
      } else {
        response = await this.queryWindow(
          prefetch.prefetchStartPx,
          prefetch.prefetchEndPx,
          prefetch.prefetchWidthPx,
          viewport.bpResolution
        );
        if (
          cacheEpoch !== this.cacheEpoch ||
          requestId !== this.renderRequestId
        ) {
          return;
        }
        orientationCache.set(viewport.bpResolution, {
          bpResolution: viewport.bpResolution,
          prefetchStartPx: prefetch.prefetchStartPx,
          prefetchEndPx: prefetch.prefetchEndPx,
          fetchedAtMs: Date.now(),
          response,
        });
        this.pruneCache(orientation);
      }
      if (allowFetch) {
        this.prefetchNeighborResolutions(orientation, viewport, cacheEpoch);
      }
      if (requestId !== this.renderRequestId) {
        return;
      }
      if (
        response.tracks.some((track) => track.statusMessage) &&
        this.pendingRefreshTimer === null
      ) {
        this.pendingRefreshTimer = window.setTimeout(() => {
          this.pendingRefreshTimer = null;
          this.invalidateQueryCache();
          void this.render();
        }, 1000);
      }
      response.tracks.forEach((track) => {
        if (
          (this.analysisWarnings.get(track.trackId) ?? null) !==
          track.analysisWarning
        ) {
          if (track.analysisWarning) {
            this.analysisWarnings.set(track.trackId, track.analysisWarning);
            useNotificationCenterStore().add(
              "warning",
              `${track.name}: ${track.analysisWarning}`
            );
          } else this.analysisWarnings.delete(track.trackId);
          this.notifyTrackListChanged();
        }
        if (track.statusMessage) {
          if (
            this.pendingTrackMessages.get(track.trackId) !== track.statusMessage
          ) {
            this.pendingTrackMessages.set(track.trackId, track.statusMessage);
            useNotificationCenterStore().add(
              "info",
              `${track.name}: ${track.statusMessage}`
            );
          }
        } else {
          this.pendingTrackMessages.delete(track.trackId);
        }
        if (track.error) {
          const previous = this.lastTrackErrors.get(track.trackId);
          if (previous !== track.error) {
            this.lastTrackErrors.set(track.trackId, track.error);
            console.error(`Track ${track.name}: ${track.error}`);
          }
        } else {
          this.lastTrackErrors.delete(track.trackId);
        }
      });
      this.drawTrackCanvas(canvas, orientation, response, viewport);
    } catch (error) {
      if (requestId !== this.renderRequestId) {
        return;
      }
      console.error("Failed to render 1D tracks", error);
      this.drawTrackCanvas(
        canvas,
        orientation,
        {
          startBp: viewport.startBp,
          endBp: viewport.endBp,
          startPx: viewport.startPx,
          endPx: viewport.endPx,
          widthPx: orientation === "horizontal" ? canvas.width : canvas.height,
          bpResolution: viewport.bpResolution,
          tracks: [],
        },
        viewport,
        "Track query failed"
      );
    }
  }

  private readonly featureRows = new WeakMap<
    TrackBinResponse[],
    TrackBinResponse[][]
  >();
  private indexedSearchBins = new WeakSet<TrackBinResponse[]>();
  private readonly scrollOffsets = {
    horizontal: new Map<string, number>(),
    vertical: new Map<string, number>(),
  };

  private readonly laneWeights = {
    horizontal: new Map<string, number>(),
    vertical: new Map<string, number>(),
  };

  public getTrackLaneBounds(
    orientation: Orientation,
    trackIds: readonly string[]
  ): TrackLaneBounds[] {
    const weights = trackIds.map((id) => this.laneWeights[orientation].get(id) ?? 1);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let position = 0;
    return weights.map((weight) => {
      const start = position;
      position += weight / total;
      return { start, end: position };
    });
  }

  public resizeTrackLanePair(
    orientation: Orientation,
    firstId: string,
    secondId: string,
    firstShare: number
  ): void {
    const weights = this.laneWeights[orientation];
    const total = (weights.get(firstId) ?? 1) + (weights.get(secondId) ?? 1);
    weights.set(firstId, total * firstShare);
    weights.set(secondId, total * (1 - firstShare));
    this.scheduleTrackRedraw(orientation);
  }

  private readonly scrollFrames = new Set<Orientation>();
  public scrollTrack(
    orientation: Orientation,
    trackId: string,
    offset: number
  ): void {
    this.scrollOffsets[orientation].set(trackId, offset);
    this.scheduleTrackRedraw(orientation);
  }

  private scheduleTrackRedraw(orientation: Orientation): void {
    if (this.scrollFrames.has(orientation)) return;
    this.scrollFrames.add(orientation);
    requestAnimationFrame(() => {
      this.scrollFrames.delete(orientation);
      this.redrawTrackCanvas(orientation);
    });
  }

  private redrawTrackCanvas(orientation: Orientation): void {
    const snapshot = this.lastRenderedSnapshot[orientation];
    const canvas =
      orientation === "horizontal" ? this.horizontalCanvas : this.verticalCanvas;
    if (snapshot && canvas)
      this.drawTrackCanvas(canvas, orientation, snapshot, snapshot.viewport);
  }

  private rowsFor(bins: TrackBinResponse[], resolution: number) {
    let rows = this.featureRows.get(bins);
    if (rows) return rows;
    const start = (b: TrackBinResponse) =>
      this.resolveBinIntervalPx(b, resolution).startPx;
    const packed = packIntervalsIntoLanes(
      bins,
      start,
      (b) => this.resolveBinIntervalPx(b, resolution).endPx
    );
    rows = Array.from({ length: packed.laneCount }, () => []);
    for (const [bin, lane] of packed.lanes) rows[lane].push(bin);
    this.featureRows.set(bins, rows);
    return rows;
  }

  private trackLanePixels(
    canvas: HTMLCanvasElement,
    orientation: Orientation,
    tracks: readonly TrackRenderResponse[],
    useInteractiveSizes = false
  ): TrackLaneBounds[] {
    const depth = orientation === "horizontal" ? canvas.height : canvas.width;
    const bounds = useInteractiveSizes
      ? this.getTrackLaneBounds(orientation, tracks.map(({ trackId }) => trackId))
      : tracks.map((_, index) => ({
          start: index / tracks.length,
          end: (index + 1) / tracks.length,
        }));
    return bounds.map(({ start, end }) => ({ start: start * depth, end: end * depth }));
  }

  private drawTrackCanvas(
    canvas: HTMLCanvasElement,
    orientation: Orientation,
    response: TrackQueryResponse | Pick<TrackQueryResponse, "tracks">,
    viewport: ViewportGeometry,
    statusMessage?: string,
    publishState = true,
    visibilityOrientation: Orientation = orientation
  ): RenderedFeatureHit[] {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return [];
    }
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = this.resolveTrackBackgroundColor();
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const fallbackTracks = this.tracks
      .filter(
        (track) =>
          track.visible &&
          this.isTrackVisibleOnAxis(track.trackId, visibilityOrientation)
      )
      .map((track) => ({
        trackId: track.trackId,
        name: track.name,
        type: track.type,
        color: track.color,
        renderStyle: track.renderStyle ?? "SIGNAL",
        bins: [],
        maxValue: 0,
        error: null,
        statusMessage: null,
        analysisWarning: null,
      }));
    const responseTracks = (response.tracks ?? []).filter((track) =>
      this.isTrackVisibleOnAxis(track.trackId, visibilityOrientation)
    );
    const tracks: TrackRenderResponse[] =
      responseTracks.length > 0 ? responseTracks : fallbackTracks;
    const featureHits: RenderedFeatureHit[] = [];
    const laneBounds = this.trackLanePixels(canvas, orientation, tracks, publishState);
    if (publishState)
      this.lastRenderedSnapshot[orientation] = {
        tracks,
        featureHits,
        viewport,
        laneBounds,
        renderedAtMs: Date.now(),
      };
    const textPalette = this.resolveTrackTextPalette();
    if (tracks.length === 0) {
      ctx.fillStyle = textPalette.muted;
      ctx.font = "12px HiCT Sans";
      this.drawOutlinedText(
        ctx,
        statusMessage ?? "No tracks loaded",
        8,
        8,
        textPalette
      );
      if (publishState)
        this.setRenderState(orientation, {
          statusMessage: statusMessage ?? "No tracks loaded",
          trackCount: 0,
        });
      return featureHits;
    }
    const descriptor =
      this.mapManager.getLayersManager().currentViewState.resolutionDesciptor;
    const bpResolution = viewport.bpResolution;
    const laneBackgroundColor = this.resolveTrackBackgroundColor();
    const style = getComputedStyle(document.documentElement);
    const strandColors = {
      "+":
        style.getPropertyValue("--hict-strand-plus").trim() ||
        DEFAULT_STRAND_COLORS["+"],
      "-":
        style.getPropertyValue("--hict-strand-minus").trim() ||
        DEFAULT_STRAND_COLORS["-"],
    };
    const labelLeft = (this.exportLabelBounds?.left ?? 0) * canvas.width;
    const labelBottom = (this.exportLabelBounds?.bottom ?? 1) * canvas.height;
    const scrollSizes: Record<string, number> = {};
    tracks.forEach((track, trackIndex) => {
      const { start: laneStart, end: laneEnd } = laneBounds[trackIndex];
      const laneSize = laneEnd - laneStart;
      const titleSpace = Math.min(16, laneSize * 0.3);
      const laneInnerStart = laneStart + titleSpace + 2;
      const laneInnerEnd = laneEnd - 2;

      ctx.fillStyle = laneBackgroundColor;
      if (orientation === "horizontal") {
        ctx.fillRect(0, laneStart, canvas.width, laneSize - 1);
        ctx.strokeStyle = "rgba(120,130,145,0.35)";
        ctx.strokeRect(0.5, laneStart + 0.5, canvas.width - 1, laneSize - 1);
      } else {
        ctx.fillRect(laneStart, 0, laneSize - 1, canvas.height);
        ctx.strokeStyle = "rgba(120,130,145,0.35)";
        ctx.strokeRect(laneStart + 0.5, 0.5, laneSize - 1, canvas.height - 1);
      }
      const renderStyle =
        (track.renderStyle ?? "SIGNAL").toUpperCase() === "FEATURE"
          ? "FEATURE"
          : "SIGNAL";
      const trackSummary = this.tracks.find(
        (item) => item.trackId === track.trackId
      );
      const useLogScale = renderStyle === "SIGNAL" && !!trackSummary?.logScale;
      const logBase = this.getTrackLogBase(track.trackId);
      const signalRange =
        renderStyle === "SIGNAL"
          ? this.resolveSignalRange(
              trackSummary,
              track.bins,
              viewport,
              bpResolution
            )
          : { min: 0, max: Math.max(track.maxValue, 0) };
      const scaleTransform = this.buildScaleTransform(
        signalRange.min,
        signalRange.max,
        useLogScale,
        logBase
      );
      const crossSpan = Math.max(1, laneInnerEnd - laneInnerStart);
      const rows =
        renderStyle === "FEATURE" ? this.rowsFor(track.bins, bpResolution) : [];
      const rowHeight = 24;
      const offset = Math.min(
        this.scrollOffsets[orientation].get(track.trackId) ?? 0,
        Math.max(0, rows.length * rowHeight - crossSpan)
      );
      scrollSizes[track.trackId] = rows.length * rowHeight + 4 + titleSpace;
      const firstRow = Math.floor(offset / rowHeight);
      const lastRow = Math.min(
        rows.length,
        Math.ceil((offset + crossSpan) / rowHeight)
      );
      ctx.save();
      ctx.beginPath();
      if (orientation === "horizontal")
        ctx.rect(0, laneInnerStart, canvas.width, crossSpan);
      else ctx.rect(laneInnerStart, 0, crossSpan, canvas.height);
      ctx.clip();
      const defaultTrackColor = track.color ?? "#4e79a7";
      let usesStrandColors = false;
      for (
        let row = renderStyle === "SIGNAL" ? -1 : firstRow;
        row < (renderStyle === "SIGNAL" ? 0 : lastRow);
        row++
      ) {
        const binsToRender = row < 0 ? track.bins : rows[row];
        let low = 0,
          high = binsToRender.length;
        if (row >= 0)
          while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if (
              this.resolveBinIntervalPx(binsToRender[mid], bpResolution)
                .endPx <= viewport.startPx
            )
              low = mid + 1;
            else high = mid;
          }
        let previousEnd = 0;
        for (let i = low; i < binsToRender.length; i++) {
          const bin = binsToRender[i];
          if (row >= 0 && (bin.startPx ?? -Infinity) >= viewport.endPx) break;
          const interval = this.resolveBinIntervalPx(bin, bpResolution);
          if (
            !interval.visible ||
            interval.endPx <= viewport.startPx ||
            interval.startPx >= viewport.endPx
          ) {
            continue;
          }
          const startPx = interval.startPx;
          const endPx = interval.endPx;
          const strand =
            bin.strand === "+" || bin.strand === "-" ? bin.strand : undefined;
          const fileColor =
            renderStyle === "FEATURE"
              ? parseBedRgb(bin.attributes?.itemRgb) ??
                parseBedRgb(bin.attributes?.trackRgb)
              : undefined;
          ctx.fillStyle =
            renderStyle === "FEATURE"
              ? fileColor ??
                strandFill(
                  strand,
                  undefined,
                  undefined,
                  defaultTrackColor,
                  strandColors
                )
              : defaultTrackColor;
          usesStrandColors ||=
            renderStyle === "FEATURE" && !!strand && !fileColor;

          const isSelectedFeature =
            renderStyle === "FEATURE" &&
            this.matchesSelectedFeature(track.trackId, bin);
          const packedStart = laneInnerStart + row * rowHeight - offset;
          const packedEnd = packedStart + rowHeight;
          if (orientation === "horizontal") {
            const x0ByPx = Math.floor(viewport.pxToScreen(startPx));
            const x1ByPx = Math.max(
              x0ByPx + 1,
              Math.ceil(viewport.pxToScreen(endPx))
            );
            const x0 = Math.max(0, Math.min(canvas.width - 1, x0ByPx));
            const x1 = Math.max(x0 + 1, Math.min(canvas.width, x1ByPx));
            if (x1 <= x0 || x1ByPx === x0ByPx) {
              continue;
            }
            if (renderStyle === "SIGNAL") {
              const normalizedValue = scaleTransform.normalize(bin.value ?? 0);
              const baseline = scaleTransform.normalize(0);
              const y =
                laneInnerEnd - crossSpan * Math.max(baseline, normalizedValue);
              const barHeight =
                crossSpan * Math.abs(normalizedValue - baseline);
              if (barHeight > 0)
                ctx.fillRect(x0, y, x1 - x0, Math.max(1, barHeight));
            } else {
              if (!this.isFeatureDensityBin(bin))
                featureHits.push({
                  trackId: track.trackId,
                  bin,
                  axisStart: x0,
                  axisEnd: x1,
                  crossStart: Math.max(laneInnerStart, packedStart),
                  crossEnd: Math.min(laneInnerEnd, packedEnd),
                });
              this.drawFeatureBin(
                ctx,
                orientation,
                bin,
                viewport,
                packedStart,
                packedEnd,
                strand,
                x0ByPx,
                x1ByPx,
                x0,
                x1,
                isSelectedFeature,
                laneBackgroundColor
              );
            }
          } else {
            const y0ByPx = Math.floor(viewport.pxToScreen(startPx));
            const y1ByPx = Math.max(
              y0ByPx + 1,
              Math.ceil(viewport.pxToScreen(endPx))
            );
            const y0 = Math.max(0, Math.min(canvas.height - 1, y0ByPx));
            const y1 = Math.max(y0 + 1, Math.min(canvas.height, y1ByPx));
            if (y1 <= y0 || y1ByPx === y0ByPx) {
              continue;
            }
            if (renderStyle === "SIGNAL") {
              const normalizedValue = scaleTransform.normalize(bin.value ?? 0);
              const baseline = scaleTransform.normalize(0);
              const x =
                laneInnerEnd - crossSpan * Math.max(baseline, normalizedValue);
              const barWidth = crossSpan * Math.abs(normalizedValue - baseline);
              if (barWidth > 0)
                ctx.fillRect(x, y0, Math.max(1, barWidth), y1 - y0);
            } else {
              if (!this.isFeatureDensityBin(bin))
                featureHits.push({
                  trackId: track.trackId,
                  bin,
                  axisStart: y0,
                  axisEnd: y1,
                  crossStart: Math.max(laneInnerStart, packedStart),
                  crossEnd: Math.min(laneInnerEnd, packedEnd),
                });
              this.drawFeatureBin(
                ctx,
                orientation,
                bin,
                viewport,
                packedStart,
                packedEnd,
                strand,
                y0ByPx,
                y1ByPx,
                y0,
                y1,
                isSelectedFeature,
                laneBackgroundColor
              );
            }
          }
          if (renderStyle === "FEATURE") {
            const start = Math.max(0, viewport.pxToScreen(startPx));
            const end = Math.min(
              orientation === "horizontal" ? canvas.width : canvas.height,
              viewport.pxToScreen(endPx)
            );
            if (bin.label && start - previousEnd >= 8) {
              this.drawFeatureLabel(
                ctx,
                orientation,
                bin.label,
                previousEnd,
                start,
                packedStart,
                textPalette
              );
            }
            previousEnd = end;
          }
        }
      }
      ctx.restore();
      if (
        renderStyle === "SIGNAL" &&
        signalRange.min < 0 &&
        signalRange.max > 0
      ) {
        const zero = laneInnerEnd - crossSpan * scaleTransform.normalize(0);
        ctx.strokeStyle = textPalette.axisStroke;
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (orientation === "horizontal") {
          ctx.moveTo(0, zero);
          ctx.lineTo(canvas.width, zero);
        } else {
          ctx.moveTo(zero, 0);
          ctx.lineTo(zero, canvas.height);
        }
        ctx.stroke();
      }
      ctx.fillStyle = textPalette.primary;
      ctx.font = "bold 11px HiCT Sans";
      // Plot/scale renderers may change text alignment. Titles always start at
      // their inset, including after rotation on the vertical axis.
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const trackTitle = (track.analysisWarning ? "⚠ " : "") + track.name;
      if (orientation === "horizontal") {
        this.drawTrackTitle(
          ctx,
          trackTitle,
          labelLeft + 6,
          laneStart + 4,
          textPalette,
          usesStrandColors ? strandColors : undefined
        );
        if (track.error) {
          ctx.fillStyle = textPalette.error;
          ctx.font = "10px HiCT Sans";
          this.drawOutlinedText(
            ctx,
            track.error,
            labelLeft + 6,
            laneStart + 20,
            textPalette
          );
        } else if (track.bins.length === 0) {
          ctx.fillStyle = textPalette.muted;
          ctx.font = "10px HiCT Sans";
          this.drawOutlinedText(
            ctx,
            track.statusMessage ?? statusMessage ?? "No signal in current view",
            6,
            laneStart + 20,
            textPalette
          );
        }
        if ((track.renderStyle ?? "SIGNAL").toUpperCase() !== "FEATURE") {
          this.drawSignalScaleTicks(
            ctx,
            orientation,
            laneStart,
            laneEnd,
            laneInnerStart,
            laneInnerEnd,
            scaleTransform,
            canvas.width,
            canvas.height,
            textPalette
          );
        }
      } else {
        ctx.save();
        ctx.translate(laneStart + 10, labelBottom - 4);
        ctx.rotate(-Math.PI / 2);
        this.drawTrackTitle(
          ctx,
          trackTitle,
          0,
          0,
          textPalette,
          usesStrandColors ? strandColors : undefined
        );
        ctx.restore();
        if (track.error) {
          ctx.save();
          ctx.translate(laneStart + 22, labelBottom - 4);
          ctx.rotate(-Math.PI / 2);
          ctx.fillStyle = textPalette.error;
          ctx.font = "10px HiCT Sans";
          this.drawOutlinedText(ctx, track.error, 0, 0, textPalette);
          ctx.restore();
        } else if (track.bins.length === 0) {
          ctx.save();
          ctx.translate(laneStart + 22, labelBottom - 4);
          ctx.rotate(-Math.PI / 2);
          ctx.fillStyle = textPalette.muted;
          ctx.font = "10px HiCT Sans";
          this.drawOutlinedText(
            ctx,
            track.statusMessage ?? statusMessage ?? "No signal",
            0,
            0,
            textPalette
          );
          ctx.restore();
        }
        if ((track.renderStyle ?? "SIGNAL").toUpperCase() !== "FEATURE") {
          this.drawSignalScaleTicks(
            ctx,
            orientation,
            laneStart,
            laneEnd,
            laneInnerStart,
            laneInnerEnd,
            scaleTransform,
            canvas.width,
            canvas.height,
            textPalette
          );
        }
      }
      if (publishState && !this.indexedSearchBins.has(track.bins)) {
        this.refreshFeatureSearchCache(track, track.bins);
        this.indexedSearchBins.add(track.bins);
      }
    });
    const hasAnySignal = tracks.some((track) => track.bins.length > 0);
    const firstError = tracks.find((track) => track.error)?.error;
    const pendingMessage = tracks.find(
      (track) => track.statusMessage
    )?.statusMessage;
    if (publishState)
      this.setRenderState(orientation, {
        statusMessage: firstError
          ? firstError
          : hasAnySignal
          ? ""
          : pendingMessage ?? statusMessage ?? "No signal in current view",
        trackCount: tracks.length,
        scrollSizes,
      });
    return featureHits;
  }

  private refreshFeatureSearchCache(
    track: {
      trackId: string;
      name: string;
      renderStyle?: string;
    },
    bins: TrackBinResponse[]
  ): void {
    if ((track.renderStyle ?? "SIGNAL").toUpperCase() !== "FEATURE") {
      return;
    }
    const now = Date.now();
    for (const bin of bins) {
      const label = (bin.label ?? "").trim();
      if (!label) {
        continue;
      }
      const startBp = Math.min(bin.startBp, bin.endBp);
      const endBp = Math.max(bin.startBp, bin.endBp);
      const featureType = (bin.featureType ?? "").trim();
      const key = `${track.trackId}:${startBp}:${endBp}:${label}:${featureType}`;
      this.featureSearchCache.set(key, {
        key,
        trackId: track.trackId,
        trackName: track.name,
        label,
        featureType: featureType.length > 0 ? featureType : null,
        strand: bin.strand,
        startBp,
        endBp,
        updatedAtMs: now,
      });
    }
  }

  private mapFeatureHitToSearchEntry(
    hit: TrackFeatureSearchHitResponse,
    updatedAtMs: number
  ): FeatureSearchEntry {
    const featureType = (hit.featureType ?? "").trim();
    const label =
      hit.label?.trim() || `${hit.sourceName}:${hit.startBp}-${hit.endBp}`;
    const startBp = Math.min(hit.startBp, hit.endBp);
    const endBp = Math.max(hit.startBp, hit.endBp);
    const key = `${hit.trackId}:${startBp}:${endBp}:${label}:${featureType}`;
    return {
      key,
      trackId: hit.trackId,
      trackName: hit.trackName,
      label,
      featureType: featureType.length > 0 ? featureType : null,
      strand: hit.strand,
      startBp,
      endBp,
      updatedAtMs,
    };
  }

  private drawFeatureLabel(
    ctx: CanvasRenderingContext2D,
    orientation: Orientation,
    label: string,
    previousEnd: number,
    start: number,
    rowStart: number,
    palette: TrackTextPalette
  ): void {
    ctx.font = "10px HiCT Sans";
    ctx.textAlign = "left";
    const metrics = ctx.measureText(label);
    const leftOverhang = Math.max(0, metrics.actualBoundingBoxLeft);
    const rightExtent = Math.max(metrics.width, metrics.actualBoundingBoxRight);
    // The packed row has no room above a full-height block for outlined text.
    if (start - previousEnd < leftOverhang + rightExtent + 8) {
      return;
    }
    const cross = rowStart + 9;
    ctx.fillStyle = palette.primary;
    if (orientation === "horizontal") {
      this.drawOutlinedText(ctx, label, start - rightExtent - 4, cross, palette);
      return;
    }
    ctx.save();
    ctx.translate(cross, start - leftOverhang - 4);
    ctx.rotate(-Math.PI / 2);
    this.drawOutlinedText(ctx, label, 0, 0, palette);
    ctx.restore();
  }

  private drawFeatureBin(
    ctx: CanvasRenderingContext2D,
    orientation: Orientation,
    bin: TrackBinResponse,
    viewport: ViewportGeometry,
    laneInnerStart: number,
    laneInnerEnd: number,
    strand: Strand,
    rawStart: number,
    rawEnd: number,
    x0: number,
    x1: number,
    isSelectedFeature: boolean,
    background: string
  ): void {
    if (this.isFeatureDensityBin(bin)) {
      if (orientation === "horizontal")
        this.drawHorizontalFeatureDensityBin(
          ctx,
          laneInnerStart,
          laneInnerEnd,
          x0,
          x1,
          bin.count
        );
      else
        this.drawVerticalFeatureDensityBin(
          ctx,
          laneInnerStart,
          laneInnerEnd,
          x0,
          x1,
          bin.count
        );
      return;
    }

    const laneCenter = (laneInnerStart + laneInnerEnd) / 2;
    const { coding, utr, intron, chevronHalf } = featureGeometry(
      laneInnerEnd - laneInnerStart
    );
    const connectorY = Math.floor(laneCenter);
    const fill = String(ctx.fillStyle);
    ctx.save();
    // Draw both orientations in increasing genomic coordinates.
    if (orientation === "vertical") ctx.transform(0, 1, 1, 0, 0, 0);

    const drawBlock = (start: number, end: number, height: number) => {
      const left = Math.max(x0, start);
      const right = Math.min(x1, end);
      if (right > left)
        ctx.fillRect(
          left,
          Math.floor(laneCenter - height / 2),
          right - left,
          height
        );
    };
    const projected = this.resolveFeatureBlocksIntervals(
      bin,
      viewport.bpResolution
    )
      .filter((block) => block.visible)
      .map((block) => ({
        x0: Math.floor(viewport.pxToScreen(block.startPx)),
        x1: Math.ceil(viewport.pxToScreen(block.endPx)),
        coding: block.coding,
      }))
      .sort((a, b) => a.x0 - b.x0);
    const exons: ScreenBlock[] = [];
    if (bin.blocks?.length) {
      ctx.fillRect(x0, connectorY, x1 - x0, intron);
      for (const block of projected) {
        drawBlock(block.x0, block.x1, block.coding ? coding : utr);
        const previous = exons.at(-1);
        // BED12 coding and UTR portions from the server may belong to one exon.
        if (previous && previous.x1 >= block.x0)
          previous.x1 = Math.max(previous.x1, block.x1);
        else exons.push({ x0: block.x0, x1: block.x1 });
      }
    } else {
      const start = bin.thickStartPx;
      const end = bin.thickEndPx;
      if (start != null && end != null) {
        drawBlock(x0, x1, utr);
        drawBlock(
          Math.floor(viewport.pxToScreen(Math.min(start, end))),
          Math.ceil(viewport.pxToScreen(Math.max(start, end))),
          coding
        );
      } else {
        drawBlock(x0, x1, coding);
      }
      exons.push({ x0: rawStart, x1: rawEnd });
    }
    if (strand === "+" || strand === "-") {
      const visible = { x0, x1 };
      for (const run of featureChevrons(strand, exons, fill, visible)) {
        drawChevrons(
          ctx,
          strand,
          run.centres,
          laneCenter,
          chevronHalf,
          run.color
        );
      }
    }
    if (x1 - x0 >= 2 * (chevronHalf + 1)) {
      if (rawStart < x0)
        drawClippedEdge(
          ctx,
          "left",
          x0,
          laneCenter,
          chevronHalf,
          fill,
          background
        );
      if (rawEnd > x1)
        drawClippedEdge(
          ctx,
          "right",
          x1 - 1,
          laneCenter,
          chevronHalf,
          fill,
          background
        );
    }
    if (isSelectedFeature) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 218, 66, 0.98)";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        x0 + 0.5,
        laneInnerStart + 0.5,
        Math.max(1, x1 - x0 - 1),
        Math.max(1, laneInnerEnd - laneInnerStart - 1)
      );
      ctx.restore();
    }
    if (bin.attributes?.disruptedMatch === "true") {
      ctx.save();
      ctx.strokeStyle = "rgba(245, 124, 0, 0.98)";
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(
        x0 + 0.5,
        laneInnerStart + 0.5,
        Math.max(1, x1 - x0 - 1),
        Math.max(1, laneInnerEnd - laneInnerStart - 1)
      );
      ctx.restore();
    }
    ctx.restore();
  }

  private drawTrackTitle(
    ctx: CanvasRenderingContext2D,
    title: string,
    x: number,
    y: number,
    palette: TrackTextPalette,
    strandColors?: StrandColors
  ): void {
    this.drawOutlinedText(ctx, title, x, y, palette);
    if (!strandColors) return;
    const labelStart = x + ctx.measureText(title).width + 8;
    ctx.save();
    ctx.font = "11px HiCT Sans";
    for (const [index, strand] of (["+", "-"] as const).entries()) {
      const offset = labelStart + index * 23;
      ctx.fillStyle = strandColors[strand];
      ctx.fillRect(offset, y + 2, 9, 8);
      ctx.fillStyle = palette.primary;
      this.drawOutlinedText(
        ctx,
        strand === "-" ? "−" : strand,
        offset + 11,
        y,
        palette
      );
    }
    ctx.restore();
  }

  private isFeatureDensityBin(bin: TrackBinResponse): boolean {
    return (
      (bin.count ?? 0) > 1 &&
      !(bin.label ?? "").trim() &&
      bin.strand !== "+" &&
      bin.strand !== "-" &&
      (!bin.blocks || bin.blocks.length === 0)
    );
  }

  private drawHorizontalFeatureDensityBin(
    ctx: CanvasRenderingContext2D,
    laneInnerStart: number,
    laneInnerEnd: number,
    x0: number,
    x1: number,
    count: number
  ): void {
    const laneHeight = Math.max(1, laneInnerEnd - laneInnerStart);
    const intensity = Math.min(
      0.72,
      0.22 + Math.log10(Math.max(1, count)) * 0.16
    );
    ctx.save();
    ctx.globalAlpha = intensity;
    ctx.fillRect(x0, laneInnerStart, Math.max(1, x1 - x0), laneHeight);
    ctx.globalAlpha = Math.min(0.95, intensity + 0.18);
    const centerY = Math.floor((laneInnerStart + laneInnerEnd) / 2);
    ctx.fillRect(x0, centerY - 1, Math.max(1, x1 - x0), 2);
    ctx.restore();
  }

  private drawVerticalFeatureDensityBin(
    ctx: CanvasRenderingContext2D,
    laneInnerStart: number,
    laneInnerEnd: number,
    y0: number,
    y1: number,
    count: number
  ): void {
    const laneWidth = Math.max(1, laneInnerEnd - laneInnerStart);
    const intensity = Math.min(
      0.72,
      0.22 + Math.log10(Math.max(1, count)) * 0.16
    );
    ctx.save();
    ctx.globalAlpha = intensity;
    ctx.fillRect(laneInnerStart, y0, laneWidth, Math.max(1, y1 - y0));
    ctx.globalAlpha = Math.min(0.95, intensity + 0.18);
    const centerX = Math.floor((laneInnerStart + laneInnerEnd) / 2);
    ctx.fillRect(centerX - 1, y0, 2, Math.max(1, y1 - y0));
    ctx.restore();
  }

  private resolveFeatureBlocksIntervals(
    bin: TrackBinResponse,
    bpResolution: number
  ): FeatureBlockInterval[] {
    if (!Array.isArray(bin.blocks) || bin.blocks.length === 0) {
      return [];
    }
    return bin.blocks
      .map((block) => this.resolveFeatureBlockIntervalPx(block, bpResolution))
      .filter((block) => block.endPx > block.startPx);
  }

  private resolveFeatureBlockIntervalPx(
    block: TrackBinBlockResponse,
    bpResolution: number
  ): FeatureBlockInterval {
    if (block.startPx != null && block.endPx != null) {
      return {
        ...this.exactFeatureInterval(block, bpResolution),
        coding: !!block.coding,
      };
    }
    const hasProjectedPx =
      typeof block.startPx === "number" &&
      Number.isFinite(block.startPx) &&
      typeof block.endPx === "number" &&
      Number.isFinite(block.endPx);
    const contigDimensionHolder = this.mapManager.getContigDimensionHolder();
    const startPx = hasProjectedPx
      ? Math.max(0, Math.min(block.startPx ?? 0, block.endPx ?? 0))
      : contigDimensionHolder.getPxContainingBp(
          Math.max(0, Math.min(block.startBp, block.endBp)),
          bpResolution
        );
    const endPx = hasProjectedPx
      ? Math.max(
          startPx,
          Math.max(block.startPx ?? startPx, block.endPx ?? startPx)
        )
      : contigDimensionHolder.getPxContainingBp(
          Math.max(
            Math.max(0, Math.min(block.startBp, block.endBp)),
            Math.max(0, Math.max(block.startBp, block.endBp) - 1)
          ),
          bpResolution
        ) + 1;
    if (hasProjectedPx) {
      return {
        startPx,
        endPx,
        visible: true,
        coding: !!block.coding,
      };
    }
    const intervalStart = Math.max(0, Math.min(block.startBp, block.endBp));
    const intervalEnd = Math.max(
      intervalStart + 1,
      Math.max(block.startBp, block.endBp)
    );
    const intervalProbeEnd = Math.max(intervalStart, intervalEnd - 1);
    const visible =
      contigDimensionHolder.isBpVisibleAtResolution(
        intervalStart,
        bpResolution
      ) ||
      contigDimensionHolder.isBpVisibleAtResolution(
        intervalProbeEnd,
        bpResolution
      );
    return {
      startPx,
      endPx,
      visible,
      coding: !!block.coding,
    };
  }

  private getVisibleSignalRange(
    bins: TrackBinResponse[],
    viewport: ViewportGeometry,
    bpResolution: number
  ): { min: number; max: number } {
    let min = 0;
    let max = 0;
    for (const bin of bins) {
      const interval = this.resolveBinIntervalPx(bin, bpResolution);
      if (!interval.visible) {
        continue;
      }
      if (
        interval.endPx <= viewport.startPx ||
        interval.startPx >= viewport.endPx
      ) {
        continue;
      }
      const value = Number.isFinite(bin.value) ? bin.value : 0;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return { min, max };
  }

  private resolveSignalRange(
    trackSummary: TrackSummaryResponse | undefined,
    bins: TrackBinResponse[],
    viewport: ViewportGeometry,
    bpResolution: number
  ): { min: number; max: number } {
    if (
      trackSummary &&
      trackSummary.rangeAuto === false &&
      Number.isFinite(trackSummary.rangeMin) &&
      Number.isFinite(trackSummary.rangeMax) &&
      trackSummary.rangeMax > trackSummary.rangeMin
    ) {
      return { min: trackSummary.rangeMin, max: trackSummary.rangeMax };
    }
    return this.getVisibleSignalRange(bins, viewport, bpResolution);
  }

  /** The server reports feature extents in whole map pixels (bins), so an 11 bp
   * hit fills its entire 1 kb bin when zoomed to bases. Re-project every bp
   * coordinate with the same fractional mapping as the FASTA strip and ruler,
   * clamped to the server's bin span (which stays authoritative for hidden
   * contigs). Idempotent; sequence-axis projections never pass through here. */
  private refineTrackResponsePx(
    response: TrackQueryResponse
  ): TrackQueryResponse {
    const holder = this.mapManager.getContigDimensionHolder();
    if (this.mapManager.getLayersManager().isSequenceScale) {
      if (response.displayGrid === "SEQUENCE_BP") return response;
      return {
        ...response,
        samplingBpResolution: response.bpResolution,
        bpResolution: 1,
        startPx: response.startBp,
        endPx: response.endBp,
        tracks: response.tracks.map((track) => ({
          ...track,
          bins: track.bins.map((bin) => ({
            ...bin,
            startPx: bin.startBp,
            endPx: bin.endBp,
            thickStartPx: bin.thickStartBp,
            thickEndPx: bin.thickEndBp,
            blocks: bin.blocks.map((block) => ({
              ...block,
              startPx: block.startBp,
              endPx: block.endBp,
            })),
          })),
        })),
      };
    }
    const resolution = response.bpResolution;
    if (!(holder.contig_count > 0) || !(resolution > 0)) return response;
    const toPx = (bp: number, lo: number, hi: number): number => {
      const px = holder.getFractionalPxOfBp(Math.max(0, bp), resolution);
      return Number.isFinite(px) ? Math.min(hi, Math.max(lo, px)) : lo;
    };
    const finite = (value: number | null | undefined): value is number =>
      typeof value === "number" && Number.isFinite(value);
    return {
      ...response,
      tracks: response.tracks.map((track) => ({
        ...track,
        bins: track.bins.map((bin) => {
          if (!finite(bin.startPx) || !finite(bin.endPx)) return bin;
          const lo = Math.min(bin.startPx, bin.endPx);
          const hi = Math.max(bin.startPx, bin.endPx);
          const startBp = Math.min(bin.startBp, bin.endBp);
          const endBp = Math.max(bin.startBp, bin.endBp);
          const hasThick =
            finite(bin.thickStartBp) &&
            finite(bin.thickEndBp) &&
            finite(bin.thickStartPx) &&
            finite(bin.thickEndPx);
          return {
            ...bin,
            startPx: toPx(startBp, lo, hi),
            endPx: toPx(endBp, lo, hi),
            thickStartPx: hasThick
              ? toPx(Math.min(bin.thickStartBp!, bin.thickEndBp!), lo, hi)
              : bin.thickStartPx,
            thickEndPx: hasThick
              ? toPx(Math.max(bin.thickStartBp!, bin.thickEndBp!), lo, hi)
              : bin.thickEndPx,
            blocks: (bin.blocks ?? []).map((block) =>
              finite(block.startPx) && finite(block.endPx)
                ? {
                    ...block,
                    startPx: toPx(
                      Math.min(block.startBp, block.endBp),
                      Math.min(block.startPx, block.endPx),
                      Math.max(block.startPx, block.endPx)
                    ),
                    endPx: toPx(
                      Math.max(block.startBp, block.endBp),
                      Math.min(block.startPx, block.endPx),
                      Math.max(block.startPx, block.endPx)
                    ),
                  }
                : block
            ),
          };
        }),
      })),
    };
  }

  private readonly exactFeatureIntervals = new WeakMap<
    object,
    { startPx: number; endPx: number; visible: boolean }
  >();
  private exactFeatureInterval(
    feature: TrackBinResponse | TrackBinBlockResponse,
    resolution: number
  ) {
    const cached = this.exactFeatureIntervals.get(feature);
    if (cached) return cached;
    const holder = this.mapManager.getContigDimensionHolder();
    const left = feature.startPx ?? 0,
      right = feature.endPx ?? Infinity;
    const clamp = (bp: number) =>
      Math.min(
        right,
        Math.max(left, holder.getFractionalPxOfBp(bp, resolution))
      );
    const startPx = clamp(feature.startBp),
      endPx = clamp(feature.endBp);
    const result = { startPx, endPx, visible: endPx > startPx };
    this.exactFeatureIntervals.set(feature, result);
    return result;
  }

  private resolveBinIntervalPx(
    bin: TrackBinResponse,
    bpResolution: number
  ): { startPx: number; endPx: number; visible: boolean } {
    if (bin.featureType && bin.startPx != null && bin.endPx != null)
      return this.exactFeatureInterval(bin, bpResolution);
    const hasProjectedPx =
      typeof bin.startPx === "number" &&
      Number.isFinite(bin.startPx) &&
      typeof bin.endPx === "number" &&
      Number.isFinite(bin.endPx);
    const contigDimensionHolder = this.mapManager.getContigDimensionHolder();
    const startPx = hasProjectedPx
      ? Math.max(0, Math.min(bin.startPx ?? 0, bin.endPx ?? 0))
      : contigDimensionHolder.getPxContainingBp(
          Math.max(0, Math.min(bin.startBp, bin.endBp)),
          bpResolution
        );
    const endPx = hasProjectedPx
      ? Math.max(
          startPx,
          Math.max(bin.startPx ?? startPx, bin.endPx ?? startPx)
        )
      : contigDimensionHolder.getPxContainingBp(
          Math.max(
            Math.max(0, Math.min(bin.startBp, bin.endBp)),
            Math.max(0, Math.max(bin.startBp, bin.endBp) - 1)
          ),
          bpResolution
        ) + 1;
    if (hasProjectedPx) {
      return { startPx, endPx, visible: true };
    }
    const intervalStart = Math.max(0, Math.min(bin.startBp, bin.endBp));
    const intervalEnd = Math.max(
      intervalStart + 1,
      Math.max(bin.startBp, bin.endBp)
    );
    const intervalProbeEnd = Math.max(intervalStart, intervalEnd - 1);
    const visible =
      contigDimensionHolder.isBpVisibleAtResolution(
        intervalStart,
        bpResolution
      ) ||
      contigDimensionHolder.isBpVisibleAtResolution(
        intervalProbeEnd,
        bpResolution
      );
    return { startPx, endPx, visible };
  }

  private formatScaleValue(value: number): string {
    if (!Number.isFinite(value)) {
      return "n/a";
    }
    if (value === 0) {
      return "0";
    }
    if (Math.abs(value) >= 1000 || Math.abs(value) < 0.01) {
      return value.toExponential(2);
    }
    if (Math.abs(value) >= 10) {
      return value.toFixed(1);
    }
    return value.toFixed(3);
  }

  private resolveTrackBackgroundColor(): string {
    const uiSettingsStore = useUiSettingsStore();
    if (uiSettingsStore.inheritTrackBackgroundFromMap) {
      return useStyleStore().mapBackgroundColor.RGB;
    }
    return uiSettingsStore.trackBackgroundColor || "rgba(244,247,251,0.98)";
  }

  private buildScaleTransform(
    minValue: number,
    maxValue: number,
    logScale: boolean,
    logBase: number
  ): SignalScaleTransform {
    const safeMin = Number.isFinite(minValue) ? minValue : 0;
    const safeMax =
      Number.isFinite(maxValue) && maxValue > safeMin ? maxValue : safeMin + 1;
    const span = Math.max(Number.EPSILON, safeMax - safeMin);
    if (!logScale) {
      return {
        logScale: false,
        minValue: safeMin,
        maxValue: safeMax,
        logBase: 10,
        display: (value: number) => (Number.isFinite(value) ? value : safeMin),
        normalize: (value: number) =>
          Math.max(
            0,
            Math.min(
              1,
              ((Number.isFinite(value) ? value : safeMin) - safeMin) / span
            )
          ),
      };
    }
    const safeBase = Number.isFinite(logBase) && logBase > 1 ? logBase : 10;
    const logDenominator = Math.log(safeBase);
    if (safeMin < 0) {
      // Symmetric log1p preserves sign and a meaningful zero for signed signals.
      const transform = (value: number) =>
        (Math.sign(value) * Math.log1p(Math.abs(value))) / logDenominator;
      const lo = transform(safeMin),
        hi = transform(safeMax);
      return {
        logScale: true,
        minValue: safeMin,
        maxValue: safeMax,
        logBase: safeBase,
        display: (value: number) => (Number.isFinite(value) ? value : 0),
        normalize: (value: number) =>
          Math.max(
            0,
            Math.min(
              1,
              (transform(Number.isFinite(value) ? value : 0) - lo) / (hi - lo)
            )
          ),
      };
    }
    const toLog = (value: number): number =>
      Math.log1p(Math.max(0, value - safeMin)) / logDenominator;
    const maxLog = toLog(safeMax);
    const safeMaxLog = Number.isFinite(maxLog) && maxLog > 0 ? maxLog : 1;
    return {
      logScale: true,
      minValue: safeMin,
      maxValue: safeMax,
      logBase: safeBase,
      display: (value: number) => {
        if (!Number.isFinite(value)) {
          return safeMin;
        }
        return value;
      },
      normalize: (value: number) => {
        if (!Number.isFinite(value) || value <= safeMin) {
          return 0;
        }
        return Math.max(0, Math.min(1, toLog(value) / safeMaxLog));
      },
    };
  }

  private drawSignalScaleTicks(
    ctx: CanvasRenderingContext2D,
    orientation: Orientation,
    laneStart: number,
    laneEnd: number,
    laneInnerStart: number,
    laneInnerEnd: number,
    scale: SignalScaleTransform,
    canvasWidth: number,
    canvasHeight: number,
    textPalette: TrackTextPalette
  ): void {
    const axisSpan = Math.max(1, laneInnerEnd - laneInnerStart);
    const ticks = this.buildScaleTicks(scale, axisSpan);
    if (ticks.length === 0) {
      return;
    }
    ctx.fillStyle = textPalette.axis;
    ctx.strokeStyle = textPalette.axisStroke;
    ctx.font = "9px HiCT Mono";
    const widestLabel = Math.max(
      ...ticks.map(
        (tick) =>
          ctx.measureText(this.formatScaleValue(scale.display(tick))).width
      )
    );
    let lastLabelCoord = Number.NEGATIVE_INFINITY;
    const minLabelSpacing = 14;
    if (orientation === "horizontal") {
      ctx.textAlign = "right";
      const right = canvasWidth * (this.exportLabelBounds?.right ?? 1);
      const left = canvasWidth * (this.exportLabelBounds?.left ?? 0);
      if (right - left < widestLabel + 18) return;
      const labelX = right - 26;
      ctx.fillStyle = this.resolveTrackBackgroundColor();
      ctx.fillRect(
        labelX - widestLabel - 13,
        laneStart + 1,
        widestLabel + 16,
        laneEnd - laneStart - 2
      );
      ctx.fillStyle = textPalette.axis;
      const tickX1 = labelX - widestLabel - 4;
      const tickX0 = tickX1 - 7;
      for (const tick of ticks) {
        const normalized = scale.normalize(tick);
        const y = laneInnerEnd - normalized * axisSpan;
        const labelY = Math.max(laneStart + 2, Math.min(laneEnd - 12, y - 5));
        if (
          tick !== scale.maxValue &&
          (Math.abs(y - lastLabelCoord) < minLabelSpacing ||
            (tick !== scale.minValue && y - laneInnerStart < minLabelSpacing))
        ) {
          continue;
        }
        lastLabelCoord = y;
        ctx.beginPath();
        ctx.moveTo(tickX0, y);
        ctx.lineTo(tickX1, y);
        ctx.stroke();
        this.drawOutlinedText(
          ctx,
          this.formatScaleValue(scale.display(tick)),
          labelX,
          labelY,
          textPalette
        );
      }
      if (scale.logScale) {
        ctx.fillStyle = textPalette.axis;
        ctx.font = "8px HiCT Mono";
        ctx.textAlign = "left";
        this.drawOutlinedText(
          ctx,
          `log${this.formatScaleLogBase(scale.logBase)}`,
          2,
          Math.max(laneInnerStart, laneEnd - 12),
          textPalette
        );
      }
      ctx.textAlign = "left";
      return;
    }
    const labelAxisY = canvasHeight * (this.exportLabelBounds?.top ?? 0) + 25;
    const bottom = canvasHeight * (this.exportLabelBounds?.bottom ?? 1);
    if (bottom - labelAxisY < widestLabel + 13) return;
    ctx.fillStyle = this.resolveTrackBackgroundColor();
    ctx.fillRect(
      laneStart + 1,
      labelAxisY,
      laneEnd - laneStart - 2,
      widestLabel + 12
    );
    ctx.fillStyle = textPalette.axis;
    const markY0 = labelAxisY + widestLabel + 5;
    const markY1 = markY0 + 6;
    ctx.textAlign = "center";
    for (const tick of ticks) {
      const normalized = scale.normalize(tick);
      const x = laneInnerEnd - normalized * axisSpan;
      const ix = Math.max(laneInnerStart, Math.min(laneInnerEnd, x));
      if (
        tick !== scale.maxValue &&
        (Math.abs(ix - lastLabelCoord) < minLabelSpacing ||
          (tick !== scale.minValue && ix - laneInnerStart < minLabelSpacing))
      ) {
        continue;
      }
      lastLabelCoord = ix;
      ctx.beginPath();
      ctx.moveTo(ix, markY0);
      ctx.lineTo(ix, markY1);
      ctx.stroke();
      ctx.save();
      ctx.translate(
        Math.max(laneStart + 2, Math.min(laneEnd - 12, ix - 4)),
        labelAxisY + 1
      );
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "right";
      this.drawOutlinedText(
        ctx,
        this.formatScaleValue(scale.display(tick)),
        0,
        0,
        textPalette
      );
      ctx.restore();
    }
    if (scale.logScale) {
      ctx.save();
      ctx.fillStyle = textPalette.axis;
      ctx.translate(
        Math.max(laneStart + 2, laneEnd - 4),
        Math.max(14, canvasHeight - 6)
      );
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "left";
      this.drawOutlinedText(
        ctx,
        `log${this.formatScaleLogBase(scale.logBase)}`,
        0,
        0,
        textPalette
      );
      ctx.restore();
    }
  }

  private formatScaleLogBase(base: number): string {
    if (!Number.isFinite(base) || base <= 1) {
      return "10";
    }
    if (Math.abs(base - Math.round(base)) < 1e-9) {
      return String(Math.round(base));
    }
    return Number(base.toFixed(3)).toString();
  }

  private drawOutlinedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    palette: TrackTextPalette
  ): void {
    const previousLineWidth = ctx.lineWidth;
    const previousStrokeStyle = ctx.strokeStyle;
    ctx.lineWidth = 3;
    ctx.strokeStyle = palette.outline;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
    ctx.lineWidth = previousLineWidth;
    ctx.strokeStyle = previousStrokeStyle;
  }

  private resolveTrackTextPalette(): TrackTextPalette {
    const background = this.resolveTrackBackgroundColor();
    const dark = this.isDarkColor(background);
    return dark
      ? {
          primary: "rgba(245,248,252,0.96)",
          muted: "rgba(220,225,235,0.84)",
          error: "rgba(255,142,142,0.98)",
          axis: "rgba(238,244,250,0.92)",
          axisStroke: "rgba(235,241,250,0.66)",
          outline: "rgba(8,10,14,0.95)",
        }
      : {
          primary: "rgba(20,20,20,0.9)",
          muted: "rgba(80,86,96,0.84)",
          error: "rgba(165,28,28,0.96)",
          axis: "rgba(26,35,47,0.86)",
          axisStroke: "rgba(26,35,47,0.56)",
          outline: "rgba(255,255,255,0.95)",
        };
  }

  private isDarkColor(color: string): boolean {
    const normalized = color.trim().toLowerCase();
    const rgbMatch =
      normalized.match(
        /^rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)(?:\s*,\s*([0-9.]+))?\s*\)$/
      ) ?? null;
    if (rgbMatch) {
      const r = Number(rgbMatch[1]);
      const g = Number(rgbMatch[2]);
      const b = Number(rgbMatch[3]);
      return this.relativeLuminance(r, g, b) < 0.45;
    }
    const hexMatch = normalized.match(/^#([0-9a-f]{3,8})$/i);
    if (hexMatch) {
      const hex = hexMatch[1];
      if (hex.length === 3 || hex.length === 4) {
        const r = Number.parseInt(hex[0] + hex[0], 16);
        const g = Number.parseInt(hex[1] + hex[1], 16);
        const b = Number.parseInt(hex[2] + hex[2], 16);
        return this.relativeLuminance(r, g, b) < 0.45;
      }
      if (hex.length === 6 || hex.length === 8) {
        const r = Number.parseInt(hex.slice(0, 2), 16);
        const g = Number.parseInt(hex.slice(2, 4), 16);
        const b = Number.parseInt(hex.slice(4, 6), 16);
        return this.relativeLuminance(r, g, b) < 0.45;
      }
    }
    return useStyleStore().mapBackgroundColor.L <= 55;
  }

  private relativeLuminance(r: number, g: number, b: number): number {
    const normalize = (channel: number): number => {
      const srgb = Math.max(0, Math.min(255, channel)) / 255;
      return srgb <= 0.04045
        ? srgb / 12.92
        : Math.pow((srgb + 0.055) / 1.055, 2.4);
    };
    const nr = normalize(r);
    const ng = normalize(g);
    const nb = normalize(b);
    return 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
  }

  private buildScaleTicks(
    scale: SignalScaleTransform,
    pixelSpan: number
  ): number[] {
    const maxTickCount = Math.max(2, Math.min(7, Math.floor(pixelSpan / 16)));
    const minValue = Number.isFinite(scale.minValue) ? scale.minValue : 0;
    const maxValue = Number.isFinite(scale.maxValue)
      ? scale.maxValue
      : minValue + 1;
    if (!Number.isFinite(maxValue) || maxValue <= minValue) {
      return [minValue];
    }
    if (!scale.logScale || minValue < 0) {
      const step = this.niceStep(
        (maxValue - minValue) / Math.max(1, maxTickCount - 1)
      );
      const ticks: number[] =
        minValue < 0 && maxValue >= 0 ? [minValue, 0] : [minValue];
      for (let value = minValue + step; value < maxValue; value += step) {
        ticks.push(value);
      }
      ticks.push(maxValue);
      return this.uniqueSortedTicks(ticks);
    }
    const safeBase =
      Number.isFinite(scale.logBase) && scale.logBase > 1 ? scale.logBase : 10;
    const maxLog = Math.log1p(maxValue - minValue) / Math.log(safeBase);
    const stepLog = maxLog / Math.max(1, maxTickCount - 1);
    const ticks: number[] = [minValue];
    for (let i = 0; i < maxTickCount; i++) {
      ticks.push(minValue + Math.max(0, Math.pow(safeBase, i * stepLog) - 1));
    }
    ticks.push(maxValue);
    return this.uniqueSortedTicks(ticks);
  }

  private uniqueSortedTicks(values: number[]): number[] {
    return [...new Set(values.map((value) => Number(value.toFixed(6))))]
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
  }

  private niceStep(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 1;
    }
    const exponent = Math.floor(Math.log10(value));
    const base = Math.pow(10, exponent);
    const normalized = value / base;
    const multiplier =
      normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return multiplier * base;
  }

  private getViewportGeometry(
    orientation: Orientation
  ): ViewportGeometry | null {
    const descriptor =
      this.mapManager.getLayersManager().currentViewState.resolutionDesciptor;
    const bpResolution = descriptor.bpResolution;
    const map = this.mapManager.getMap();
    const view = this.mapManager.getView();
    const mapSize = map.getSize();
    const center = view.getCenter();
    const pixelResolution = view.getResolution();
    if (
      !mapSize ||
      !center ||
      center.length < 2 ||
      !center.every((value) => Number.isFinite(value)) ||
      pixelResolution === undefined ||
      !Number.isFinite(pixelResolution)
    ) {
      return null;
    }
    const extent = view.calculateExtent(mapSize);
    const activeHiCLayer = this.mapManager
      .getLayersManager()
      .getActiveHiCDataLayer();
    const targetProjection =
      activeHiCLayer.getSource()?.getProjection() ?? view.getProjection();
    const layerPixelResolution = Number.isFinite(descriptor.pixelResolution)
      ? descriptor.pixelResolution
      : 1;
    const fraction =
      layerPixelResolution > 0 ? pixelResolution / layerPixelResolution : 1;
    const fixedCoordinates = transform(
      extent,
      view.getProjection(),
      targetProjection
    ).map((coordinate) => coordinate / pixelResolution);
    const mapBoxPixelCoordinates = {
      left: Math.round(-fixedCoordinates[0]),
      right: Math.round(fixedCoordinates[2]),
      top: Math.round(fixedCoordinates[3]),
      bottom: Math.round(-fixedCoordinates[1]),
    };
    const pixelMapSize =
      this.mapManager
        .getContigDimensionHolder()
        .prefix_sum_px.get(bpResolution)?.[
        this.mapManager.getContigDimensionHolder().contig_count
      ] ?? 0;
    const panelSize =
      orientation === "horizontal"
        ? this.horizontalCanvas?.width ?? 1
        : this.verticalCanvas?.height ?? 1;
    const offset =
      orientation === "horizontal"
        ? mapBoxPixelCoordinates.left
        : mapBoxPixelCoordinates.top;
    const visibleStartScreen =
      orientation === "horizontal"
        ? Math.round(Math.max(0, mapBoxPixelCoordinates.left))
        : Math.round(Math.max(0, mapBoxPixelCoordinates.top));
    const visibleEndScreen =
      orientation === "horizontal"
        ? Math.round(
            Math.min(
              mapBoxPixelCoordinates.left + pixelMapSize / fraction,
              panelSize
            )
          )
        : Math.round(
            Math.min(
              mapBoxPixelCoordinates.top + pixelMapSize / fraction,
              panelSize
            )
          );
    const safeFraction = Math.max(fraction, 1e-9);
    const pxToScreen = (px: number): number => px / safeFraction + offset;
    // Floor the first and ceil the last visible bin. Rounding both dropped the
    // partially visible edge bin, so at base-pair zoom (less than one bin on
    // screen) features of the bin under the viewport were culled.
    const screenToPx = (screen: number, edge: "start" | "end"): number => {
      const px = (screen - offset) * safeFraction;
      const snapped =
        Math.abs(px - Math.round(px)) < 1e-6 ? Math.round(px) : px;
      return edge === "start" ? Math.floor(snapped) : Math.ceil(snapped);
    };
    const totalPx = Math.max(0, pixelMapSize);
    const activePixelBounds = this.mapManager
      .getLayersManager()
      .getActiveMapPixelBounds(bpResolution);
    const scopeStartPx =
      orientation === "horizontal"
        ? activePixelBounds.colStartPx
        : activePixelBounds.rowStartPx;
    const scopeEndPx =
      orientation === "horizontal"
        ? activePixelBounds.colEndPx
        : activePixelBounds.rowEndPx;
    if (scopeEndPx <= scopeStartPx) {
      return null;
    }
    const maxStartPx = Math.max(0, Math.min(totalPx - 1, scopeEndPx - 1));
    const unclampedStartPx = screenToPx(visibleStartScreen, "start");
    const unclampedEndPx = screenToPx(visibleEndScreen, "end");
    const startPx = Math.max(
      scopeStartPx,
      Math.min(unclampedStartPx, maxStartPx)
    );
    const endPx = Math.max(
      startPx + 1,
      Math.min(unclampedEndPx, totalPx, scopeEndPx)
    );
    const startBp = this.mapManager
      .getContigDimensionHolder()
      .getStartBpOfPx(startPx, bpResolution);
    const endBp =
      this.mapManager
        .getContigDimensionHolder()
        .getStartBpOfPx(Math.max(startPx, endPx - 1), bpResolution) +
      bpResolution;
    return {
      startBp,
      endBp,
      startPx,
      endPx,
      bpResolution,
      pxToScreen,
      visibleWidthPx: Math.max(
        1,
        Math.round(Math.abs(pxToScreen(endPx) - pxToScreen(startPx)))
      ),
      scopeStartPx,
      scopeEndPx,
    };
  }

  private buildPrefetchViewport(viewport: PrefetchViewport): {
    prefetchStartPx: number;
    prefetchEndPx: number;
    prefetchWidthPx: number;
  } | null {
    const visibleSpanPx = Math.max(1, viewport.endPx - viewport.startPx);
    let paddingPx = Math.ceil(visibleSpanPx * this.prefetchExtentScreens);
    if (
      viewport.bpResolution === 1 &&
      this.mapManager.getLayersManager().isSequenceScale
    ) {
      // A grid change can be rendered once with the previous view's extent.
      // Wait for its base-scale extent before requesting sequence tracks.
      if (visibleSpanPx > MAX_SEQUENCE_TRACK_WINDOW_BP) return null;
      paddingPx = Math.min(
        paddingPx,
        Math.floor((MAX_SEQUENCE_TRACK_WINDOW_BP - visibleSpanPx) / 2)
      );
    }
    const totalPx =
      this.mapManager
        .getContigDimensionHolder()
        .prefix_sum_px.get(viewport.bpResolution)?.[
        this.mapManager.getContigDimensionHolder().contig_count
      ] ?? viewport.endPx;
    const scopeStartPx = Math.max(0, viewport.scopeStartPx ?? 0);
    const scopeEndPx = Math.min(
      Math.max(scopeStartPx + 1, totalPx),
      viewport.scopeEndPx ?? totalPx
    );
    const prefetchStartPx = Math.max(
      scopeStartPx,
      viewport.startPx - paddingPx
    );
    const prefetchEndPx = Math.min(
      scopeEndPx,
      Math.max(prefetchStartPx + 1, viewport.endPx + paddingPx)
    );
    const prefetchSpan = Math.max(1, prefetchEndPx - prefetchStartPx);
    const prefetchWidthPx = Math.max(
      viewport.visibleWidthPx,
      Math.ceil((viewport.visibleWidthPx * prefetchSpan) / visibleSpanPx)
    );
    return {
      prefetchStartPx,
      prefetchEndPx,
      prefetchWidthPx: Math.min(MAX_PREFETCH_QUERY_WIDTH_PX, prefetchWidthPx),
    };
  }

  private pruneCache(orientation: Orientation): void {
    const cache = this.queryCache[orientation];
    if (cache.size <= MAX_CACHED_RESOLUTIONS_PER_ORIENTATION) {
      return;
    }
    const sortedKeysByRecency = [...cache.entries()]
      .sort((a, b) => b[1].fetchedAtMs - a[1].fetchedAtMs)
      .map(([bpResolution]) => bpResolution);
    const keep = new Set(
      sortedKeysByRecency.slice(0, MAX_CACHED_RESOLUTIONS_PER_ORIENTATION)
    );
    for (const bpResolution of cache.keys()) {
      if (!keep.has(bpResolution)) {
        cache.delete(bpResolution);
      }
    }
  }

  private readonly activeQueries = new Map<
    string,
    Promise<TrackQueryResponse>
  >();
  private queryWindow(
    start: number,
    end: number,
    width: number,
    resolution: number
  ) {
    const key = [this.cacheEpoch, start, end, width, resolution].join(":");
    const existing = this.activeQueries.get(key);
    if (existing) return existing;
    const request = this.mapManager.networkManager.requestManager
      .queryTracks1D(start, end, width, resolution)
      .then((response) => this.refineTrackResponsePx(response))
      .finally(() => this.activeQueries.delete(key));
    this.activeQueries.set(key, request);
    return request;
  }

  private prefetchNeighborResolutions(
    orientation: Orientation,
    viewport: ViewportGeometry,
    cacheEpoch: number
  ): void {
    if (cacheEpoch !== this.cacheEpoch) {
      return;
    }
    if (!this.tracks.some((track) => track.visible)) {
      return;
    }
    const orientationCache = this.queryCache[orientation];
    const inFlight = this.prefetchInFlight[orientation];
    const neighborBpResolutions = this.getNeighborBpResolutions(
      viewport.bpResolution
    );
    for (const neighborBpResolution of neighborBpResolutions) {
      const neighborViewport = this.projectViewportToResolution(
        viewport,
        neighborBpResolution,
        orientation
      );
      if (!neighborViewport) {
        continue;
      }
      const neighborPrefetch = this.buildPrefetchViewport(neighborViewport);
      if (!neighborPrefetch) continue;
      const cached = orientationCache.get(neighborBpResolution);
      const cacheFresh =
        !!cached && Date.now() - cached.fetchedAtMs <= CACHE_MAX_AGE_MS;
      const cacheCoversViewport =
        !!cached &&
        cached.prefetchStartPx <= neighborViewport.startPx &&
        cached.prefetchEndPx >= neighborViewport.endPx;
      if (cacheFresh && cacheCoversViewport) {
        continue;
      }
      const prefetchKey = [
        neighborBpResolution,
        neighborPrefetch.prefetchStartPx,
        neighborPrefetch.prefetchEndPx,
        neighborPrefetch.prefetchWidthPx,
      ].join(":");
      if (inFlight.has(prefetchKey)) {
        continue;
      }
      inFlight.add(prefetchKey);
      void this.queryWindow(
        neighborPrefetch.prefetchStartPx,
        neighborPrefetch.prefetchEndPx,
        neighborPrefetch.prefetchWidthPx,
        neighborBpResolution
      )
        .then((response) => {
          if (
            cacheEpoch !== this.cacheEpoch ||
            orientationCache.get(neighborBpResolution) !== cached
          ) {
            return;
          }
          orientationCache.set(neighborBpResolution, {
            bpResolution: neighborBpResolution,
            prefetchStartPx: neighborPrefetch.prefetchStartPx,
            prefetchEndPx: neighborPrefetch.prefetchEndPx,
            fetchedAtMs: Date.now(),
            response,
          });
          this.pruneCache(orientation);
        })
        .catch((error) => {
          console.debug(
            `Track prefetch for resolution ${neighborBpResolution} failed`,
            error
          );
        })
        .finally(() => {
          inFlight.delete(prefetchKey);
        });
    }
  }

  private getNeighborBpResolutions(currentBpResolution: number): number[] {
    const tuples = this.mapManager.getLayersManager().resolutionTuples;
    const currentIndex = tuples.findIndex(
      (tuple) => tuple.bpResolution === currentBpResolution
    );
    if (currentIndex < 0) {
      return [];
    }
    const neighbors: number[] = [];
    if (currentIndex > 0) {
      neighbors.push(tuples[currentIndex - 1].bpResolution);
    }
    if (currentIndex + 1 < tuples.length) {
      neighbors.push(tuples[currentIndex + 1].bpResolution);
    }
    return neighbors;
  }

  private projectViewportToResolution(
    viewport: ViewportGeometry,
    targetBpResolution: number,
    orientation: Orientation
  ): PrefetchViewport | null {
    const contigDimensionHolder = this.mapManager.getContigDimensionHolder();
    const totalPx =
      contigDimensionHolder.prefix_sum_px.get(targetBpResolution)?.[
        contigDimensionHolder.contig_count
      ] ?? 0;
    if (totalPx <= 0) {
      return null;
    }
    const startBp = Math.max(0, viewport.startBp);
    const endBp = Math.max(startBp + 1, viewport.endBp);
    const startPxRaw = contigDimensionHolder.getPxContainingBp(
      startBp,
      targetBpResolution
    );
    const endPxRaw =
      contigDimensionHolder.getPxContainingBp(
        Math.max(startBp, endBp - 1),
        targetBpResolution
      ) + 1;
    const maxStartPx = Math.max(0, totalPx - 1);
    const activePixelBounds = this.mapManager
      .getLayersManager()
      .getActiveMapPixelBounds(targetBpResolution);
    const scopeStartPx =
      orientation === "horizontal"
        ? activePixelBounds.colStartPx
        : activePixelBounds.rowStartPx;
    const scopeEndPx =
      orientation === "horizontal"
        ? activePixelBounds.colEndPx
        : activePixelBounds.rowEndPx;
    const startPx = Math.max(
      scopeStartPx,
      Math.min(startPxRaw, Math.min(maxStartPx, scopeEndPx - 1))
    );
    const endPx = Math.max(
      startPx + 1,
      Math.min(endPxRaw, totalPx, scopeEndPx)
    );
    return {
      startPx,
      endPx,
      bpResolution: targetBpResolution,
      visibleWidthPx: viewport.visibleWidthPx,
      scopeStartPx,
      scopeEndPx,
    };
  }

  private matchesSelectedFeature(
    trackId: string,
    bin: TrackBinResponse
  ): boolean {
    const selected = this.selectedFeature;
    if (!selected) {
      return false;
    }
    if (selected.trackId.trim().length > 0 && selected.trackId !== trackId) {
      return false;
    }
    const startBp = Math.min(bin.startBp, bin.endBp);
    const endBp = Math.max(bin.startBp, bin.endBp);
    if (startBp !== selected.startBp || endBp !== selected.endBp) {
      return false;
    }
    const label = (bin.label ?? "").trim();
    if (selected.label.length > 0 && label !== selected.label) {
      return false;
    }
    const featureType = (bin.featureType ?? "").trim();
    if (selected.featureType && featureType !== selected.featureType) {
      return false;
    }
    return true;
  }

  private isSameSelectedFeature(
    current: SelectedTrackFeature | null,
    next: SelectedTrackFeature
  ): boolean {
    if (!current) {
      return false;
    }
    return (
      current.trackId === next.trackId &&
      current.startBp === next.startBp &&
      current.endBp === next.endBp &&
      current.label === next.label &&
      current.featureType === next.featureType
    );
  }
}

export { LinearTrackManager, type Orientation };

type TrackLaneBounds = { start: number; end: number };

type RenderState = {
  scrollSizes?: Record<string, number>;
  statusMessage: string;
  trackCount: number;
};

type ViewportGeometry = {
  startBp: number;
  endBp: number;
  startPx: number;
  endPx: number;
  bpResolution: number;
  pxToScreen: (px: number) => number;
  visibleWidthPx: number;
  scopeStartPx: number;
  scopeEndPx: number;
};

type PrefetchViewport = {
  startPx: number;
  endPx: number;
  bpResolution: number;
  visibleWidthPx: number;
  scopeStartPx?: number;
  scopeEndPx?: number;
};

type TrackQueryCache = {
  bpResolution: number;
  prefetchStartPx: number;
  prefetchEndPx: number;
  fetchedAtMs: number;
  response: TrackQueryResponse;
};

type SignalScaleTransform = {
  logScale: boolean;
  minValue: number;
  maxValue: number;
  logBase: number;
  display: (value: number) => number;
  normalize: (value: number) => number;
};

type FeatureSearchEntry = {
  key: string;
  trackId: string;
  trackName: string;
  label: string;
  featureType: string | null;
  strand: string | null;
  startBp: number;
  endBp: number;
  updatedAtMs: number;
};

type FeatureHoverInfo = {
  kind: "feature";
  trackId: string;
  trackName: string;
  label: string | null;
  featureType: string | null;
  strand: string | null;
  startBp: number;
  endBp: number;
  startPx: number;
  endPx: number;
  value: number;
  attributes: Record<string, string>;
};

type SignalHoverInfo = {
  kind: "signal";
  trackId: string;
  trackName: string;
  trackType: string;
  samplingBpResolution?: number;
  startBp: number;
  endBp: number;
  startPx: number;
  endPx: number;
  value: number;
  count: number;
};

type TrackHoverInfo = FeatureHoverInfo | SignalHoverInfo;

type SelectedTrackFeature = {
  trackId: string;
  label: string;
  featureType: string | null;
  startBp: number;
  endBp: number;
};

type FeatureBlockInterval = {
  startPx: number;
  endPx: number;
  visible: boolean;
  coding: boolean;
};
