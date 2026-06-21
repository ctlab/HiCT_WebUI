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

type Orientation = "horizontal" | "vertical";
type TrackTextPalette = {
  primary: string;
  muted: string;
  error: string;
  axis: string;
  axisStroke: string;
  outline: string;
};
const DEFAULT_PREFETCH_EXTENT_SCREENS = 2;
const CACHE_MAX_AGE_MS = 1500;
const MAX_PREFETCH_QUERY_WIDTH_PX = 2048;
const MAX_CACHED_RESOLUTIONS_PER_ORIENTATION = 6;

class LinearTrackManager {
  private horizontalCanvas: HTMLCanvasElement | null = null;
  private verticalCanvas: HTMLCanvasElement | null = null;
  private horizontalResizeObserver: ResizeObserver | null = null;
  private verticalResizeObserver: ResizeObserver | null = null;
  private tracks: TrackSummaryResponse[] = [];
  private readonly trackLogBases = new Map<string, number>();
  private renderRequestId = 0;
  private readonly moveEndListener?: EventsKey;
  private readonly centerListener?: EventsKey;
  private readonly resolutionListener?: EventsKey;
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
  private readonly lastTrackErrors = new Map<string, string>();
  private readonly prefetchExtentScreens = DEFAULT_PREFETCH_EXTENT_SCREENS;
  private readonly queryCache: Record<Orientation, Map<number, TrackQueryCache>> = {
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
      viewport: ViewportGeometry;
      canvasWidth: number;
      canvasHeight: number;
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
  }

  public dispose(): void {
    if (this.moveEndListener) {
      unByKey(this.moveEndListener);
    }
    if (this.centerListener) {
      unByKey(this.centerListener);
    }
    if (this.resolutionListener) {
      unByKey(this.resolutionListener);
    }
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

  public async refreshTrackList(): Promise<TrackSummaryResponse[]> {
    this.tracks = await this.mapManager.networkManager.requestManager.listTracks();
    this.syncTrackRenderSettings();
    this.invalidateQueryCache();
    this.notifyTrackListChanged();
    await this.render();
    return this.tracks.slice();
  }

  public getTrackLogBase(trackId: string): number {
    return this.trackLogBases.get(trackId) ?? 10;
  }

  public setTrackLogBase(trackId: string, value: number): void {
    const normalized = Number.isFinite(value) ? Math.max(1.0000001, value) : 10;
    this.trackLogBases.set(trackId, normalized);
    void this.render({ allowFetch: false });
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

  public async openTrack(filename: string, name?: string): Promise<void> {
    await this.mapManager.networkManager.requestManager.openTrack(
      filename,
      name
    );
    await this.refreshTrackList();
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

  public async reorderTrack(trackId: string, targetIndex: number): Promise<void> {
    this.tracks = await this.mapManager.networkManager.requestManager.reorderTrack(
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
    const response = await this.mapManager.networkManager.requestManager.queryTracks1D(
      options.startPx,
      options.endPx,
      spanPx,
      options.bpResolution
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
    this.drawTrackCanvas(canvas, orientation, response, viewport);
    return canvas;
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
    crossOffsetPx: number
  ): TrackHoverInfo | null {
    const snapshot = this.lastRenderedSnapshot[orientation];
    if (!snapshot || snapshot.tracks.length === 0) {
      return null;
    }
    const laneSize =
      orientation === "horizontal"
        ? snapshot.canvasHeight / snapshot.tracks.length
        : snapshot.canvasWidth / snapshot.tracks.length;
    if (!Number.isFinite(laneSize) || laneSize <= 0) {
      return null;
    }
    const laneIndex = Math.floor(crossOffsetPx / laneSize);
    if (laneIndex < 0 || laneIndex >= snapshot.tracks.length) {
      return null;
    }
    const track = snapshot.tracks[laneIndex];
    const laneStart = laneIndex * laneSize;
    const laneEnd = laneStart + laneSize;
    if (crossOffsetPx < laneStart || crossOffsetPx > laneEnd) {
      return null;
    }
    const renderStyle = (track.renderStyle ?? "SIGNAL").toUpperCase();
    for (const bin of track.bins) {
      const interval = this.resolveBinIntervalPx(bin, snapshot.viewport.bpResolution);
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
      const end = Math.max(start + 1, Math.ceil(snapshot.viewport.pxToScreen(interval.endPx)));
      if (axisOffsetPx < start || axisOffsetPx > end) {
        continue;
      }
      if (renderStyle !== "FEATURE") {
        return {
          kind: "signal",
          trackId: track.trackId,
          trackName: track.name,
          trackType: track.type,
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
    const view = this.mapManager.getView();
    const map = this.mapManager.getMap();
    const currentResolution = view.getResolution() ?? 1;
    const mapSize = map.getSize() ?? [1200, 900];
    const spanBp = Math.max(1, entry.endBp - entry.startBp);
    const tuples = this.mapManager.getLayersManager().resolutionTuples;
    const finestBpResolution = tuples.reduce(
      (acc, tuple) => Math.min(acc, tuple.bpResolution),
      Number.POSITIVE_INFINITY
    );
    const safeFinestBpResolution =
      Number.isFinite(finestBpResolution) && finestBpResolution > 0
        ? finestBpResolution
        : this.mapManager.getLayersManager().currentViewState.resolutionDesciptor
            .bpResolution;
    const finestPixelResolution =
      this.mapManager
        .getLayersManager()
        .getPixelResolutionForBpResolution(safeFinestBpResolution) ??
      currentResolution;
    const targetSpanPx = Math.max(180, Math.min(mapSize[0], mapSize[1]) * 0.52);
    const spanPxAtFinest = spanBp / Math.max(1, safeFinestBpResolution);
    const minViewResolution = view.getMinResolution() ?? 0;
    const desiredScaleFactor =
      spanPxAtFinest > 0 ? Math.min(1, spanPxAtFinest / targetSpanPx) : 1;
    const pixelResolution = Math.max(
      minViewResolution,
      finestPixelResolution * desiredScaleFactor
    );
    const midpointBp = (entry.startBp + entry.endBp) / 2;
    const midpointPx = this.mapManager
      .getContigDimensionHolder()
      .getPxContainingBp(
        Math.max(0, Math.round(midpointBp)),
        safeFinestBpResolution
      );
    this.setSelectedFeature(entry);
    view.animate({
      center: [midpointPx, -midpointPx],
      resolution: pixelResolution,
      duration: 220,
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
    const hit = this.getFeatureHoverAt(orientation, axisOffsetPx, crossOffsetPx);
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
      Number.isFinite(options?.marginScreens) && (options?.marginScreens ?? 0) >= 0
        ? Number(options?.marginScreens)
        : this.prefetchExtentScreens;
    try {
      const context =
        await this.mapManager.networkManager.requestManager.getTrackFeatureContext({
          unit: "BP",
          start: Math.max(0, Math.floor(Math.min(startBp, endBp))),
          end: Math.max(
            Math.floor(Math.min(startBp, endBp)) + 1,
            Math.ceil(Math.max(startBp, endBp))
          ),
          widthPx,
          bpResolution,
          marginScreens,
        });
      const cachedAt = Date.now();
      const cacheRecord: TrackQueryCache = {
        bpResolution: context.query.bpResolution,
        prefetchStartPx: context.query.startPx,
        prefetchEndPx: context.query.endPx,
        fetchedAtMs: cachedAt,
        response: context.query,
      };
      this.queryCache.horizontal.set(context.query.bpResolution, { ...cacheRecord });
      this.queryCache.vertical.set(context.query.bpResolution, { ...cacheRecord });
      this.pruneCache("horizontal");
      this.pruneCache("vertical");
      for (const track of context.query.tracks) {
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

  private setRenderState(
    orientation: Orientation,
    state: RenderState
  ): void {
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
      orientation === "horizontal" ? this.horizontalCanvas : this.verticalCanvas;
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
        cached.prefetchEndPx >= viewport.endPx;
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
        response = await this.mapManager.networkManager.requestManager.queryTracks1D(
          prefetch.prefetchStartPx,
          prefetch.prefetchEndPx,
          prefetch.prefetchWidthPx,
          viewport.bpResolution
        );
        if (cacheEpoch !== this.cacheEpoch) {
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
      response.tracks.forEach((track) => {
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
      this.drawTrackCanvas(
        canvas,
        orientation,
        response,
        viewport
      );
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

  private drawTrackCanvas(
    canvas: HTMLCanvasElement,
    orientation: Orientation,
    response: TrackQueryResponse,
    viewport: ViewportGeometry,
    statusMessage?: string
  ): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.textBaseline = "top";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = this.resolveTrackBackgroundColor();
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const fallbackTracks = this.tracks
      .filter((track) => track.visible)
      .map((track) => ({
        trackId: track.trackId,
        name: track.name,
        type: track.type,
        color: track.color,
        renderStyle: track.renderStyle ?? "SIGNAL",
        bins: [],
        maxValue: 0,
        error: null,
      }));
    const tracks =
      (response.tracks ?? []).length > 0 ? response.tracks : fallbackTracks;
    this.lastRenderedSnapshot[orientation] = {
      tracks,
      viewport,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      renderedAtMs: Date.now(),
    };
    const textPalette = this.resolveTrackTextPalette();
    if (tracks.length === 0) {
      ctx.fillStyle = textPalette.muted;
      ctx.font = "12px sans-serif";
      this.drawOutlinedText(
        ctx,
        statusMessage ?? "No tracks loaded",
        8,
        8,
        textPalette
      );
      this.setRenderState(orientation, {
        statusMessage: statusMessage ?? "No tracks loaded",
        trackCount: 0,
      });
      return;
    }
    const descriptor =
      this.mapManager.getLayersManager().currentViewState.resolutionDesciptor;
    const bpResolution = descriptor.bpResolution;
    const laneBackgroundColor = this.resolveTrackBackgroundColor();
    const laneSize =
      orientation === "horizontal"
        ? canvas.height / tracks.length
        : canvas.width / tracks.length;
    tracks.forEach((track, trackIndex) => {
      const laneStart = laneSize * trackIndex;
      const laneEnd = laneStart + laneSize;
      const laneInnerStart = laneStart + 2;
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
      const useLogScale =
        renderStyle === "SIGNAL" && !!trackSummary?.logScale;
      const logBase = this.getTrackLogBase(track.trackId);
      const signalRange =
        renderStyle === "SIGNAL"
          ? this.resolveSignalRange(trackSummary, track.bins, viewport, bpResolution)
          : { min: 0, max: Math.max(track.maxValue, 0) };
      const scaleTransform = this.buildScaleTransform(
        signalRange.min,
        signalRange.max,
        useLogScale,
        logBase
      );
      const binsToRender =
        renderStyle === "FEATURE"
          ? this.sortFeatureBinsForDraw(track.bins)
          : track.bins;
      ctx.fillStyle = track.color ?? "#4e79a7";
      for (const bin of binsToRender) {
        const interval = this.resolveBinIntervalPx(bin, bpResolution);
        if (!interval.visible || interval.endPx <= viewport.startPx || interval.startPx >= viewport.endPx) {
          continue;
        }
        const startPx = interval.startPx;
        const endPx = interval.endPx;

        const isSelectedFeature =
          renderStyle === "FEATURE" &&
          this.matchesSelectedFeature(track.trackId, bin);

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
            const barHeight = (laneInnerEnd - laneInnerStart) * normalizedValue;
            const y = laneInnerEnd - barHeight;
            ctx.fillRect(x0, y, x1 - x0, Math.max(1, barHeight));
          } else {
            this.drawHorizontalFeatureBin(
              ctx,
              bin,
              viewport,
              laneInnerStart,
              laneInnerEnd,
              canvas.width,
              x0,
              x1,
              isSelectedFeature
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
            const barWidth = (laneInnerEnd - laneInnerStart) * normalizedValue;
            const x = laneInnerEnd - Math.max(1, barWidth);
            ctx.fillRect(x, y0, Math.max(1, barWidth), y1 - y0);
          } else {
            this.drawVerticalFeatureBin(
              ctx,
              bin,
              viewport,
              laneInnerStart,
              laneInnerEnd,
              canvas.height,
              y0,
              y1,
              isSelectedFeature
            );
          }
        }
      }
      ctx.fillStyle = textPalette.primary;
      ctx.font = "bold 11px sans-serif";
      if (orientation === "horizontal") {
        this.drawOutlinedText(ctx, track.name, 6, laneStart + 4, textPalette);
        if (track.error) {
          ctx.fillStyle = textPalette.error;
          ctx.font = "10px sans-serif";
          this.drawOutlinedText(ctx, track.error, 6, laneStart + 20, textPalette);
        } else if (track.bins.length === 0) {
          ctx.fillStyle = textPalette.muted;
          ctx.font = "10px sans-serif";
          this.drawOutlinedText(
            ctx,
            statusMessage ?? "No signal in current view",
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
        } else {
          this.drawFeatureLabels(
            ctx,
            orientation,
            laneInnerStart,
            laneInnerEnd,
            viewport,
            track.bins,
            textPalette
          );
        }
      } else {
        ctx.save();
        ctx.translate(laneStart + 10, canvas.height - 4);
        ctx.rotate(-Math.PI / 2);
        this.drawOutlinedText(ctx, track.name, 0, 0, textPalette);
        ctx.restore();
        if (track.error) {
          ctx.save();
          ctx.translate(laneStart + 22, canvas.height - 4);
          ctx.rotate(-Math.PI / 2);
          ctx.fillStyle = textPalette.error;
          ctx.font = "10px sans-serif";
          this.drawOutlinedText(ctx, track.error, 0, 0, textPalette);
          ctx.restore();
        } else if (track.bins.length === 0) {
          ctx.save();
          ctx.translate(laneStart + 22, canvas.height - 4);
          ctx.rotate(-Math.PI / 2);
          ctx.fillStyle = textPalette.muted;
          ctx.font = "10px sans-serif";
          this.drawOutlinedText(
            ctx,
            statusMessage ?? "No signal",
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
        } else {
          this.drawFeatureLabels(
            ctx,
            orientation,
            laneInnerStart,
            laneInnerEnd,
            viewport,
            track.bins,
            textPalette
          );
        }
      }
      this.refreshFeatureSearchCache(track, track.bins);
    });
    const hasAnySignal = tracks.some((track) => track.bins.length > 0);
    const firstError = tracks.find((track) => track.error)?.error;
    this.setRenderState(orientation, {
      statusMessage: firstError
        ? firstError
        : hasAnySignal
        ? ""
        : statusMessage ?? "No signal in current view",
      trackCount: tracks.length,
    });
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
    const label = hit.label?.trim() || `${hit.sourceName}:${hit.startBp}-${hit.endBp}`;
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

  private drawFeatureLabels(
    ctx: CanvasRenderingContext2D,
    orientation: Orientation,
    laneInnerStart: number,
    laneInnerEnd: number,
    viewport: ViewportGeometry,
    bins: TrackBinResponse[],
    textPalette: TrackTextPalette
  ): void {
    const minFeatureSpanPx = 22;
    const minLabelGapPx = 6;
    const maxLabelsPerLane = 32;
    let drawnCount = 0;
    let lastLabelEnd = Number.NEGATIVE_INFINITY;
    ctx.fillStyle = textPalette.primary;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    for (const bin of bins) {
      if (drawnCount >= maxLabelsPerLane) {
        break;
      }
      const label = (bin.label ?? "").trim();
      if (!label) {
        continue;
      }
      const interval = this.resolveBinIntervalPx(bin, viewport.bpResolution);
      if (!interval.visible) {
        continue;
      }
      if (interval.endPx <= viewport.startPx || interval.startPx >= viewport.endPx) {
        continue;
      }
      const axisStart = Math.floor(viewport.pxToScreen(interval.startPx));
      const axisEnd = Math.max(axisStart + 1, Math.ceil(viewport.pxToScreen(interval.endPx)));
      const axisSpan = axisEnd - axisStart;
      if (axisSpan < minFeatureSpanPx) {
        continue;
      }
      if (orientation === "horizontal") {
        const textWidth = ctx.measureText(label).width;
        if (textWidth > axisSpan - 4) {
          continue;
        }
        const drawX = axisStart + 2;
        if (drawX < lastLabelEnd + minLabelGapPx) {
          continue;
        }
        this.drawOutlinedText(ctx, label, drawX, laneInnerStart + 14, textPalette);
        lastLabelEnd = drawX + textWidth;
      } else {
        const textLength = ctx.measureText(label).width;
        if (textLength > axisSpan - 4) {
          continue;
        }
        const drawY = axisStart + 2;
        if (drawY < lastLabelEnd + minLabelGapPx) {
          continue;
        }
        ctx.save();
        ctx.translate(laneInnerStart + 10, drawY + textLength);
        ctx.rotate(-Math.PI / 2);
        this.drawOutlinedText(ctx, label, 0, 0, textPalette);
        ctx.restore();
        lastLabelEnd = drawY + textLength;
      }
      drawnCount += 1;
    }
  }

  private drawHorizontalFeatureBin(
    ctx: CanvasRenderingContext2D,
    bin: TrackBinResponse,
    viewport: ViewportGeometry,
    laneInnerStart: number,
    laneInnerEnd: number,
    canvasWidth: number,
    x0: number,
    x1: number,
    isSelectedFeature: boolean
  ): void {
    const laneCenter = (laneInnerStart + laneInnerEnd) / 2;
    const laneHeight = Math.max(1, laneInnerEnd - laneInnerStart);
    if (this.isFeatureDensityBin(bin)) {
      this.drawHorizontalFeatureDensityBin(
        ctx,
        laneInnerStart,
        laneInnerEnd,
        x0,
        x1,
        bin.count
      );
      return;
    }
    const connectorHeight = Math.max(1, Math.round(laneHeight * 0.12));
    const exonHeight = Math.max(2, Math.round(laneHeight * 0.34));
    const codingHeight = Math.max(exonHeight + 1, Math.round(laneHeight * 0.5));
    const connectorY = Math.floor(laneCenter - connectorHeight / 2);
    const exonY = Math.floor(laneCenter - exonHeight / 2);
    const codingY = Math.floor(laneCenter - codingHeight / 2);
    const projectedBlocks = this.resolveFeatureBlocksIntervals(
      bin,
      viewport.bpResolution
    )
      .filter(
        (block) =>
          block.visible &&
          block.endPx > viewport.startPx &&
          block.startPx < viewport.endPx
      )
      .map((block) => ({
        coding: block.coding,
        x0: Math.max(
          x0,
          Math.min(canvasWidth - 1, Math.floor(viewport.pxToScreen(block.startPx)))
        ),
        x1: Math.max(
          x0 + 1,
          Math.min(canvasWidth, Math.ceil(viewport.pxToScreen(block.endPx)))
        ),
      }))
      .filter((block) => block.x1 > block.x0);
    if (projectedBlocks.length > 0) {
      ctx.fillRect(x0, connectorY, Math.max(1, x1 - x0), connectorHeight);
      for (const block of projectedBlocks) {
        const blockY = block.coding ? codingY : exonY;
        const blockHeight = block.coding ? codingHeight : exonHeight;
        ctx.fillRect(block.x0, blockY, Math.max(1, block.x1 - block.x0), blockHeight);
      }
    } else {
      const thinHeight = Math.max(1, Math.round(laneHeight * 0.16));
      const thickHeight = Math.max(thinHeight + 1, Math.round(laneHeight * 0.48));
      const thinY = Math.floor(laneCenter - thinHeight / 2);
      const thickY = Math.floor(laneCenter - thickHeight / 2);
      ctx.fillRect(x0, thinY, x1 - x0, thinHeight);
      const hasThickPx =
        typeof bin.thickStartPx === "number" &&
        Number.isFinite(bin.thickStartPx) &&
        typeof bin.thickEndPx === "number" &&
        Number.isFinite(bin.thickEndPx);
      let thickX0 = x0;
      let thickX1 = x1;
      if (hasThickPx) {
        const thickStartPx = Math.max(
          0,
          Math.min(bin.thickStartPx ?? 0, bin.thickEndPx ?? 0)
        );
        const thickEndPx = Math.max(
          thickStartPx + 1,
          Math.max(bin.thickStartPx ?? thickStartPx, bin.thickEndPx ?? thickStartPx)
        );
        const thickX0ByPx = Math.floor(viewport.pxToScreen(thickStartPx));
        const thickX1ByPx = Math.max(
          thickX0ByPx + 1,
          Math.ceil(viewport.pxToScreen(thickEndPx))
        );
        thickX0 = Math.max(x0, Math.min(canvasWidth - 1, thickX0ByPx));
        thickX1 = Math.max(thickX0 + 1, Math.min(x1, thickX1ByPx));
      }
      ctx.fillRect(thickX0, thickY, Math.max(1, thickX1 - thickX0), thickHeight);
    }
    this.drawFeatureDirectionArrowsHorizontal(ctx, bin.strand, x0, x1, laneCenter);
    this.drawFeatureTerminalTriangleHorizontal(
      ctx,
      bin.strand,
      x0,
      x1,
      laneCenter,
      laneInnerStart,
      laneInnerEnd
    );
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
  }

  private drawVerticalFeatureBin(
    ctx: CanvasRenderingContext2D,
    bin: TrackBinResponse,
    viewport: ViewportGeometry,
    laneInnerStart: number,
    laneInnerEnd: number,
    canvasHeight: number,
    y0: number,
    y1: number,
    isSelectedFeature: boolean
  ): void {
    const laneCenter = (laneInnerStart + laneInnerEnd) / 2;
    const laneWidth = Math.max(1, laneInnerEnd - laneInnerStart);
    if (this.isFeatureDensityBin(bin)) {
      this.drawVerticalFeatureDensityBin(
        ctx,
        laneInnerStart,
        laneInnerEnd,
        y0,
        y1,
        bin.count
      );
      return;
    }
    const connectorWidth = Math.max(1, Math.round(laneWidth * 0.12));
    const exonWidth = Math.max(2, Math.round(laneWidth * 0.34));
    const codingWidth = Math.max(exonWidth + 1, Math.round(laneWidth * 0.5));
    const connectorX = Math.floor(laneCenter - connectorWidth / 2);
    const exonX = Math.floor(laneCenter - exonWidth / 2);
    const codingX = Math.floor(laneCenter - codingWidth / 2);
    const projectedBlocks = this.resolveFeatureBlocksIntervals(
      bin,
      viewport.bpResolution
    )
      .filter(
        (block) =>
          block.visible &&
          block.endPx > viewport.startPx &&
          block.startPx < viewport.endPx
      )
      .map((block) => ({
        coding: block.coding,
        y0: Math.max(
          y0,
          Math.min(canvasHeight - 1, Math.floor(viewport.pxToScreen(block.startPx)))
        ),
        y1: Math.max(
          y0 + 1,
          Math.min(canvasHeight, Math.ceil(viewport.pxToScreen(block.endPx)))
        ),
      }))
      .filter((block) => block.y1 > block.y0);
    if (projectedBlocks.length > 0) {
      ctx.fillRect(connectorX, y0, connectorWidth, Math.max(1, y1 - y0));
      for (const block of projectedBlocks) {
        const blockX = block.coding ? codingX : exonX;
        const blockWidth = block.coding ? codingWidth : exonWidth;
        ctx.fillRect(blockX, block.y0, blockWidth, Math.max(1, block.y1 - block.y0));
      }
    } else {
      const thinWidth = Math.max(1, Math.round(laneWidth * 0.16));
      const thickWidth = Math.max(thinWidth + 1, Math.round(laneWidth * 0.48));
      const thinX = Math.floor(laneCenter - thinWidth / 2);
      const thickX = Math.floor(laneCenter - thickWidth / 2);
      ctx.fillRect(thinX, y0, thinWidth, y1 - y0);
      const hasThickPx =
        typeof bin.thickStartPx === "number" &&
        Number.isFinite(bin.thickStartPx) &&
        typeof bin.thickEndPx === "number" &&
        Number.isFinite(bin.thickEndPx);
      let thickY0 = y0;
      let thickY1 = y1;
      if (hasThickPx) {
        const thickStartPx = Math.max(
          0,
          Math.min(bin.thickStartPx ?? 0, bin.thickEndPx ?? 0)
        );
        const thickEndPx = Math.max(
          thickStartPx + 1,
          Math.max(bin.thickStartPx ?? thickStartPx, bin.thickEndPx ?? thickStartPx)
        );
        const thickY0ByPx = Math.floor(viewport.pxToScreen(thickStartPx));
        const thickY1ByPx = Math.max(
          thickY0ByPx + 1,
          Math.ceil(viewport.pxToScreen(thickEndPx))
        );
        thickY0 = Math.max(y0, Math.min(canvasHeight - 1, thickY0ByPx));
        thickY1 = Math.max(thickY0 + 1, Math.min(y1, thickY1ByPx));
      }
      ctx.fillRect(thickX, thickY0, thickWidth, Math.max(1, thickY1 - thickY0));
    }
    this.drawFeatureDirectionArrowsVertical(ctx, bin.strand, y0, y1, laneCenter);
    this.drawFeatureTerminalTriangleVertical(
      ctx,
      bin.strand,
      y0,
      y1,
      laneCenter,
      laneInnerStart,
      laneInnerEnd
    );
    if (isSelectedFeature) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 218, 66, 0.98)";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        laneInnerStart + 0.5,
        y0 + 0.5,
        Math.max(1, laneInnerEnd - laneInnerStart - 1),
        Math.max(1, y1 - y0 - 1)
      );
      ctx.restore();
    }
  }

  private drawFeatureDirectionArrowsHorizontal(
    ctx: CanvasRenderingContext2D,
    strand: string | null,
    x0: number,
    x1: number,
    laneCenter: number
  ): void {
    if ((strand !== "+" && strand !== "-") || x1 - x0 <= 12) {
      return;
    }
    const arrowSpacing = 16;
    const arrowSize = 4;
    const arrowY = Math.floor(laneCenter);
    ctx.beginPath();
    if (strand === "+") {
      for (let x = x0 + 6; x < x1 - 4; x += arrowSpacing) {
        ctx.moveTo(x - arrowSize, arrowY - arrowSize);
        ctx.lineTo(x + arrowSize, arrowY);
        ctx.lineTo(x - arrowSize, arrowY + arrowSize);
      }
    } else {
      for (let x = x1 - 6; x > x0 + 4; x -= arrowSpacing) {
        ctx.moveTo(x + arrowSize, arrowY - arrowSize);
        ctx.lineTo(x - arrowSize, arrowY);
        ctx.lineTo(x + arrowSize, arrowY + arrowSize);
      }
    }
    this.strokeAndFillFeaturePath(ctx);
  }

  private drawFeatureDirectionArrowsVertical(
    ctx: CanvasRenderingContext2D,
    strand: string | null,
    y0: number,
    y1: number,
    laneCenter: number
  ): void {
    if ((strand !== "+" && strand !== "-") || y1 - y0 <= 12) {
      return;
    }
    const arrowSpacing = 16;
    const arrowSize = 4;
    const arrowX = Math.floor(laneCenter);
    ctx.beginPath();
    if (strand === "+") {
      for (let y = y0 + 6; y < y1 - 4; y += arrowSpacing) {
        ctx.moveTo(arrowX - arrowSize, y - arrowSize);
        ctx.lineTo(arrowX, y + arrowSize);
        ctx.lineTo(arrowX + arrowSize, y - arrowSize);
      }
    } else {
      for (let y = y1 - 6; y > y0 + 4; y -= arrowSpacing) {
        ctx.moveTo(arrowX - arrowSize, y + arrowSize);
        ctx.lineTo(arrowX, y - arrowSize);
        ctx.lineTo(arrowX + arrowSize, y + arrowSize);
      }
    }
    this.strokeAndFillFeaturePath(ctx);
  }

  private drawFeatureTerminalTriangleHorizontal(
    ctx: CanvasRenderingContext2D,
    strand: string | null,
    x0: number,
    x1: number,
    laneCenter: number,
    laneInnerStart: number,
    laneInnerEnd: number
  ): void {
    if ((strand !== "+" && strand !== "-") || x1 - x0 <= 8) {
      return;
    }
    const triangleSize = Math.max(3, Math.round((laneInnerEnd - laneInnerStart) * 0.22));
    const y = Math.floor(laneCenter);
    ctx.beginPath();
    if (strand === "+") {
      const x = x1 - 1;
      ctx.moveTo(x, y);
      ctx.lineTo(x - triangleSize, y - triangleSize);
      ctx.lineTo(x - triangleSize, y + triangleSize);
    } else {
      const x = x0 + 1;
      ctx.moveTo(x, y);
      ctx.lineTo(x + triangleSize, y - triangleSize);
      ctx.lineTo(x + triangleSize, y + triangleSize);
    }
    ctx.closePath();
    this.strokeAndFillFeaturePath(ctx);
  }

  private drawFeatureTerminalTriangleVertical(
    ctx: CanvasRenderingContext2D,
    strand: string | null,
    y0: number,
    y1: number,
    laneCenter: number,
    laneInnerStart: number,
    laneInnerEnd: number
  ): void {
    if ((strand !== "+" && strand !== "-") || y1 - y0 <= 8) {
      return;
    }
    const triangleSize = Math.max(3, Math.round((laneInnerEnd - laneInnerStart) * 0.22));
    const x = Math.floor(laneCenter);
    ctx.beginPath();
    if (strand === "+") {
      const y = y1 - 1;
      ctx.moveTo(x, y);
      ctx.lineTo(x - triangleSize, y - triangleSize);
      ctx.lineTo(x + triangleSize, y - triangleSize);
    } else {
      const y = y0 + 1;
      ctx.moveTo(x, y);
      ctx.lineTo(x - triangleSize, y + triangleSize);
      ctx.lineTo(x + triangleSize, y + triangleSize);
    }
    ctx.closePath();
    this.strokeAndFillFeaturePath(ctx);
  }

  private isFeatureDensityBin(bin: TrackBinResponse): boolean {
    return (
      (bin.count ?? 0) > 1 &&
      !(bin.label ?? "").trim() &&
      (bin.strand !== "+" && bin.strand !== "-") &&
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
    const intensity = Math.min(0.72, 0.22 + Math.log10(Math.max(1, count)) * 0.16);
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
    const intensity = Math.min(0.72, 0.22 + Math.log10(Math.max(1, count)) * 0.16);
    ctx.save();
    ctx.globalAlpha = intensity;
    ctx.fillRect(laneInnerStart, y0, laneWidth, Math.max(1, y1 - y0));
    ctx.globalAlpha = Math.min(0.95, intensity + 0.18);
    const centerX = Math.floor((laneInnerStart + laneInnerEnd) / 2);
    ctx.fillRect(centerX - 1, y0, 2, Math.max(1, y1 - y0));
    ctx.restore();
  }

  private strokeAndFillFeaturePath(ctx: CanvasRenderingContext2D): void {
    const fillStyle = ctx.fillStyle;
    ctx.save();
    ctx.strokeStyle = "rgba(15, 23, 42, 0.58)";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  private sortFeatureBinsForDraw(bins: TrackBinResponse[]): TrackBinResponse[] {
    if (bins.length <= 1) {
      return bins;
    }
    return [...bins].sort((left, right) => {
      const depthDiff =
        this.resolveFeatureHierarchyDepth(left.featureType) -
        this.resolveFeatureHierarchyDepth(right.featureType);
      if (depthDiff !== 0) {
        return depthDiff;
      }
      const leftSpan = Math.max(1, left.endBp - left.startBp);
      const rightSpan = Math.max(1, right.endBp - right.startBp);
      if (leftSpan !== rightSpan) {
        return rightSpan - leftSpan;
      }
      if (left.startBp !== right.startBp) {
        return left.startBp - right.startBp;
      }
      return left.endBp - right.endBp;
    });
  }

  private resolveFeatureHierarchyDepth(featureType: string | null): number {
    const normalized = (featureType ?? "").trim().toLowerCase();
    if (!normalized) {
      return 1;
    }
    if (normalized === "gene" || normalized === "pseudogene") {
      return 0;
    }
    if (
      normalized === "transcript" ||
      normalized === "mrna" ||
      normalized === "ncrna" ||
      normalized === "trna" ||
      normalized === "rrna" ||
      normalized === "snrna" ||
      normalized === "snorna" ||
      normalized === "lncrna" ||
      normalized === "mirna" ||
      normalized === "pirna" ||
      normalized === "guide_rna" ||
      normalized === "primary_transcript" ||
      normalized === "pseudogenic_transcript"
    ) {
      return 1;
    }
    if (
      normalized === "exon" ||
      normalized === "cds" ||
      normalized === "utr" ||
      normalized === "five_prime_utr" ||
      normalized === "three_prime_utr" ||
      normalized === "start_codon" ||
      normalized === "stop_codon"
    ) {
      return 2;
    }
    return 1;
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
      ? Math.max(startPx + 1, Math.max(block.startPx ?? startPx, block.endPx ?? startPx))
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
    const intervalEnd = Math.max(intervalStart + 1, Math.max(block.startBp, block.endBp));
    const intervalProbeEnd = Math.max(intervalStart, intervalEnd - 1);
    const visible =
      contigDimensionHolder.isBpVisibleAtResolution(intervalStart, bpResolution) ||
      contigDimensionHolder.isBpVisibleAtResolution(intervalProbeEnd, bpResolution);
    return {
      startPx,
      endPx,
      visible,
      coding: !!block.coding,
    };
  }

  private getVisibleSignalMax(
    bins: TrackBinResponse[],
    viewport: ViewportGeometry,
    bpResolution: number
  ): number {
    let maxValue = 0;
    for (const bin of bins) {
      const interval = this.resolveBinIntervalPx(bin, bpResolution);
      if (!interval.visible) {
        continue;
      }
      if (interval.endPx <= viewport.startPx || interval.startPx >= viewport.endPx) {
        continue;
      }
      const value = Number.isFinite(bin.value) ? Math.max(0, bin.value) : 0;
      if (value > maxValue) {
        maxValue = value;
      }
    }
    return maxValue;
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
    return {
      min: 0,
      max: this.getVisibleSignalMax(bins, viewport, bpResolution),
    };
  }

  private resolveBinIntervalPx(
    bin: TrackBinResponse,
    bpResolution: number
  ): { startPx: number; endPx: number; visible: boolean } {
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
      ? Math.max(startPx + 1, Math.max(bin.startPx ?? startPx, bin.endPx ?? startPx))
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
    const intervalEnd = Math.max(intervalStart + 1, Math.max(bin.startBp, bin.endBp));
    const intervalProbeEnd = Math.max(intervalStart, intervalEnd - 1);
    const visible =
      contigDimensionHolder.isBpVisibleAtResolution(intervalStart, bpResolution) ||
      contigDimensionHolder.isBpVisibleAtResolution(intervalProbeEnd, bpResolution);
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
            Math.min(1, ((Number.isFinite(value) ? value : safeMin) - safeMin) / span)
          ),
      };
    }
    const safeBase = Number.isFinite(logBase) && logBase > 1 ? logBase : 10;
    const logDenominator = Math.log(safeBase);
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
    ctx.font = "9px monospace";
    let lastLabelCoord = Number.NEGATIVE_INFINITY;
    const minLabelSpacing = 14;
    if (orientation === "horizontal") {
      ctx.textAlign = "left";
      const tickX0 = canvasWidth - 22;
      const tickX1 = canvasWidth - 15;
      const labelX = canvasWidth - 13;
      for (const tick of ticks) {
        const normalized = scale.normalize(tick);
        const y = laneInnerEnd - normalized * axisSpan;
        const iy = Math.max(laneStart + 4, Math.min(laneEnd - 12, y));
        if (Math.abs(iy - lastLabelCoord) < minLabelSpacing) {
          continue;
        }
        lastLabelCoord = iy;
        ctx.beginPath();
        ctx.moveTo(tickX0, iy + 3.5);
        ctx.lineTo(tickX1, iy + 3.5);
        ctx.stroke();
        this.drawOutlinedText(
          ctx,
          this.formatScaleValue(scale.display(tick)),
          labelX,
          iy - 2,
          textPalette
        );
      }
      if (scale.logScale) {
        ctx.fillStyle = textPalette.axis;
        ctx.font = "8px monospace";
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
    const labelAxisY = Math.max(1, laneStart + 2);
    const markY0 = labelAxisY + 16;
    const markY1 = markY0 + 6;
    ctx.textAlign = "center";
    for (const tick of ticks) {
      const normalized = scale.normalize(tick);
      const x = laneInnerEnd - normalized * axisSpan;
      const ix = Math.max(laneStart + 3, Math.min(laneEnd - 14, x));
      if (Math.abs(ix - lastLabelCoord) < minLabelSpacing) {
        continue;
      }
      lastLabelCoord = ix;
      ctx.beginPath();
      ctx.moveTo(ix + 3.5, markY0);
      ctx.lineTo(ix + 3.5, markY1);
      ctx.stroke();
      ctx.save();
      ctx.translate(ix + 9, labelAxisY + 1);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "left";
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
      ctx.translate(Math.max(laneStart + 2, laneEnd - 4), Math.max(14, canvasHeight - 6));
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
      return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
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
    const maxValue = Number.isFinite(scale.maxValue) ? scale.maxValue : minValue + 1;
    if (!Number.isFinite(maxValue) || maxValue <= minValue) {
      return [minValue];
    }
    if (!scale.logScale) {
      const step = this.niceStep((maxValue - minValue) / Math.max(1, maxTickCount - 1));
      const ticks: number[] = [minValue];
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

  private getViewportGeometry(orientation: Orientation): ViewportGeometry | null {
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
    const activeHiCLayer =
      this.mapManager.getLayersManager().getActiveHiCDataLayer();
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
            Math.min(mapBoxPixelCoordinates.left + pixelMapSize / fraction, panelSize)
          )
        : Math.round(
            Math.min(mapBoxPixelCoordinates.top + pixelMapSize / fraction, panelSize)
          );
    const safeFraction = Math.max(fraction, 1e-9);
    const pxToScreen = (px: number): number => px / safeFraction + offset;
    const screenToPx = (screen: number): number =>
      Math.round((screen - offset) * safeFraction);
    const totalPx = Math.max(0, pixelMapSize);
    const activePixelBounds =
      this.mapManager.getLayersManager().getActiveMapPixelBounds(bpResolution);
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
    const unclampedStartPx = screenToPx(visibleStartScreen);
    const unclampedEndPx = screenToPx(visibleEndScreen);
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
        .getStartBpOfPx(Math.max(startPx, endPx - 1), bpResolution) + bpResolution;
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
  } {
    const visibleSpanPx = Math.max(1, viewport.endPx - viewport.startPx);
    const paddingPx = Math.ceil(visibleSpanPx * this.prefetchExtentScreens);
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
      void this.mapManager.networkManager.requestManager
        .queryTracks1D(
          neighborPrefetch.prefetchStartPx,
          neighborPrefetch.prefetchEndPx,
          neighborPrefetch.prefetchWidthPx,
          neighborBpResolution
        )
        .then((response) => {
          if (cacheEpoch !== this.cacheEpoch) {
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
    const activePixelBounds =
      this.mapManager
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
    const endPx = Math.max(startPx + 1, Math.min(endPxRaw, totalPx, scopeEndPx));
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

type RenderState = {
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
