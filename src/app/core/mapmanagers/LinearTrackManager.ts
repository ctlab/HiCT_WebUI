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
import type {
  TrackQueryResponse,
  TrackSummaryResponse,
} from "@/app/core/net/api/response";

type Orientation = "horizontal" | "vertical";
const DEFAULT_PREFETCH_EXTENT_SCREENS = 2;
const CACHE_MAX_AGE_MS = 1500;

class LinearTrackManager {
  private horizontalCanvas: HTMLCanvasElement | null = null;
  private verticalCanvas: HTMLCanvasElement | null = null;
  private horizontalResizeObserver: ResizeObserver | null = null;
  private verticalResizeObserver: ResizeObserver | null = null;
  private tracks: TrackSummaryResponse[] = [];
  private renderRequestId = 0;
  private readonly moveEndListener?: EventsKey;
  private readonly resolutionListener?: EventsKey;
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
  private readonly lastTrackErrors = new Map<string, string>();
  private readonly prefetchExtentScreens = DEFAULT_PREFETCH_EXTENT_SCREENS;
  private readonly queryCache: Record<Orientation, TrackQueryCache | null> = {
    horizontal: null,
    vertical: null,
  };

  constructor(private readonly mapManager: ContactMapManager) {
    const map = this.mapManager.getMap();
    this.moveEndListener = map.on("moveend", () => {
      void this.render();
    });
    this.resolutionListener = this.mapManager.getView().on("change:resolution", () => {
      void this.render();
    });
  }

  public dispose(): void {
    if (this.moveEndListener) {
      unByKey(this.moveEndListener);
    }
    if (this.resolutionListener) {
      unByKey(this.resolutionListener);
    }
    this.horizontalResizeObserver?.disconnect();
    this.verticalResizeObserver?.disconnect();
    this.horizontalCanvas = null;
    this.verticalCanvas = null;
    this.queryCache.horizontal = null;
    this.queryCache.vertical = null;
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
    this.invalidateQueryCache();
    this.notifyTrackListChanged();
    await this.render();
    return this.tracks.slice();
  }

  public async listTrackFiles(): Promise<string[]> {
    return this.mapManager.networkManager.requestManager.listTrackFiles();
  }

  public async openTrack(filename: string, name?: string): Promise<void> {
    await this.mapManager.networkManager.requestManager.openTrack(
      filename,
      name
    );
    await this.refreshTrackList();
  }

  public async removeTrack(trackId: string): Promise<void> {
    await this.mapManager.networkManager.requestManager.removeTrack(trackId);
    await this.refreshTrackList();
  }

  public async updateTrack(
    trackId: string,
    options: {
      visible?: boolean;
      color?: string;
      name?: string;
      renderMode?: string;
      aggregationMode?: string;
    }
  ): Promise<void> {
    await this.mapManager.networkManager.requestManager.updateTrack(
      trackId,
      options
    );
    await this.refreshTrackList();
  }

  public async render(): Promise<void> {
    if (!this.horizontalCanvas && !this.verticalCanvas) {
      return;
    }
    const requestId = ++this.renderRequestId;
    const horizontalPromise = this.renderOrientation("horizontal", requestId);
    const verticalPromise = this.renderOrientation("vertical", requestId);
    await Promise.all([horizontalPromise, verticalPromise]);
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
    this.queryCache.horizontal = null;
    this.queryCache.vertical = null;
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
    requestId: number
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
    try {
      const prefetch = this.buildPrefetchViewport(viewport);
      const cached = this.queryCache[orientation];
      const response =
        cached &&
        Date.now() - cached.fetchedAtMs <= CACHE_MAX_AGE_MS &&
        cached.bpResolution === viewport.bpResolution &&
        cached.prefetchStartPx <= viewport.startPx &&
        cached.prefetchEndPx >= viewport.endPx
          ? cached.response
          : await this.mapManager.networkManager.requestManager.queryTracks1D(
              prefetch.prefetchStartPx,
              prefetch.prefetchEndPx,
              prefetch.prefetchWidthPx,
              viewport.bpResolution
            );
      if (
        !cached ||
        Date.now() - cached.fetchedAtMs > CACHE_MAX_AGE_MS ||
        cached.bpResolution !== viewport.bpResolution ||
        cached.prefetchStartPx > viewport.startPx ||
        cached.prefetchEndPx < viewport.endPx
      ) {
        this.queryCache[orientation] = {
          bpResolution: viewport.bpResolution,
          prefetchStartPx: prefetch.prefetchStartPx,
          prefetchEndPx: prefetch.prefetchEndPx,
          fetchedAtMs: Date.now(),
          response,
        };
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
    ctx.fillStyle = "rgba(248,249,250,0.98)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const fallbackTracks = this.tracks
      .filter((track) => track.visible)
      .map((track) => ({
        trackId: track.trackId,
        name: track.name,
        type: track.type,
        color: track.color,
        bins: [],
        maxValue: 0,
        error: null,
      }));
    const tracks =
      (response.tracks ?? []).length > 0 ? response.tracks : fallbackTracks;
    if (tracks.length === 0) {
      ctx.fillStyle = "rgba(120,120,120,0.6)";
      ctx.font = "12px sans-serif";
      ctx.fillText(statusMessage ?? "No tracks loaded", 8, 8);
      this.setRenderState(orientation, {
        statusMessage: statusMessage ?? "No tracks loaded",
        trackCount: 0,
      });
      return;
    }
    const descriptor =
      this.mapManager.getLayersManager().currentViewState.resolutionDesciptor;
    const bpResolution = descriptor.bpResolution;
    const laneSize =
      orientation === "horizontal"
        ? canvas.height / tracks.length
        : canvas.width / tracks.length;
    tracks.forEach((track, trackIndex) => {
      const laneStart = laneSize * trackIndex;
      const laneEnd = laneStart + laneSize;
      const laneInnerStart = laneStart + 2;
      const laneInnerEnd = laneEnd - 2;
      const maxValue = Math.max(track.maxValue, 1);

      ctx.fillStyle = "rgba(226,232,240,0.95)";
      if (orientation === "horizontal") {
        ctx.fillRect(0, laneStart, canvas.width, laneSize - 1);
        ctx.strokeStyle = "rgba(120,130,145,0.55)";
        ctx.strokeRect(0.5, laneStart + 0.5, canvas.width - 1, laneSize - 1);
      } else {
        ctx.fillRect(laneStart, 0, laneSize - 1, canvas.height);
        ctx.strokeStyle = "rgba(120,130,145,0.55)";
        ctx.strokeRect(laneStart + 0.5, 0.5, laneSize - 1, canvas.height - 1);
      }
      ctx.fillStyle = track.color ?? "#4e79a7";
      for (const bin of track.bins) {
        const hasProjectedPx =
          typeof bin.startPx === "number" &&
          Number.isFinite(bin.startPx) &&
          typeof bin.endPx === "number" &&
          Number.isFinite(bin.endPx);
        const startPx = hasProjectedPx
          ? Math.max(0, Math.min(bin.startPx ?? 0, bin.endPx ?? 0))
          : this.mapManager
              .getContigDimensionHolder()
              .getPxContainingBp(
                Math.max(0, Math.min(bin.startBp, bin.endBp)),
                bpResolution
              );
        const endPx = hasProjectedPx
          ? Math.max(startPx + 1, Math.max(bin.startPx ?? startPx, bin.endPx ?? startPx))
          : this.mapManager
              .getContigDimensionHolder()
              .getPxContainingBp(
                Math.max(
                  Math.max(0, Math.min(bin.startBp, bin.endBp)),
                  Math.max(0, Math.max(bin.startBp, bin.endBp) - 1)
                ),
                bpResolution
              ) + 1;
        if (!hasProjectedPx) {
          const intervalStart = Math.max(0, Math.min(bin.startBp, bin.endBp));
          const intervalEnd = Math.max(intervalStart + 1, Math.max(bin.startBp, bin.endBp));
          const intervalProbeEnd = Math.max(intervalStart, intervalEnd - 1);
          if (
            !this.mapManager
              .getContigDimensionHolder()
              .isBpVisibleAtResolution(intervalStart, bpResolution) &&
            !this.mapManager
              .getContigDimensionHolder()
              .isBpVisibleAtResolution(intervalProbeEnd, bpResolution)
          ) {
            continue;
          }
        }
        const normalizedValue = Math.max(
          0,
          Math.min(1, (bin.value ?? 0) / maxValue)
        );
        if (orientation === "horizontal") {
          const x0ByPx = Math.floor(viewport.pxToScreen(startPx));
          const x1ByPx = Math.max(x0ByPx + 1, Math.ceil(viewport.pxToScreen(endPx)));
          const x0 = Math.max(0, Math.min(canvas.width - 1, x0ByPx));
          const x1 = Math.max(x0 + 1, Math.min(canvas.width, x1ByPx));
          if (x1 <= x0 || x1ByPx === x0ByPx) {
            continue;
          }
          const barHeight =
            (laneInnerEnd - laneInnerStart) * normalizedValue;
          const y = laneInnerEnd - barHeight;
          ctx.fillRect(x0, y, x1 - x0, Math.max(1, barHeight));
        } else {
          const y0ByPx = Math.floor(viewport.pxToScreen(startPx));
          const y1ByPx = Math.max(y0ByPx + 1, Math.ceil(viewport.pxToScreen(endPx)));
          const y0 = Math.max(0, Math.min(canvas.height - 1, y0ByPx));
          const y1 = Math.max(y0 + 1, Math.min(canvas.height, y1ByPx));
          if (y1 <= y0 || y1ByPx === y0ByPx) {
            continue;
          }
          const barWidth = (laneInnerEnd - laneInnerStart) * normalizedValue;
          const x = laneInnerEnd - Math.max(1, barWidth);
          ctx.fillRect(x, y0, Math.max(1, barWidth), y1 - y0);
        }
      }
      ctx.fillStyle = "rgba(20,20,20,0.85)";
      ctx.font = "bold 11px sans-serif";
      if (orientation === "horizontal") {
        ctx.fillText(track.name, 6, laneStart + 4);
        if (track.error) {
          ctx.fillStyle = "rgba(160, 30, 30, 0.88)";
          ctx.font = "10px sans-serif";
          ctx.fillText(track.error, 6, laneStart + 20);
        } else if (track.bins.length === 0) {
          ctx.fillStyle = "rgba(90,90,90,0.75)";
          ctx.font = "10px sans-serif";
          ctx.fillText(statusMessage ?? "No signal in current view", 6, laneStart + 20);
        }
      } else {
        ctx.save();
        ctx.translate(laneStart + 12, 6);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(track.name, 0, 0);
        ctx.restore();
        if (track.error) {
          ctx.save();
          ctx.translate(laneStart + 24, 6);
          ctx.rotate(Math.PI / 2);
          ctx.fillStyle = "rgba(160, 30, 30, 0.88)";
          ctx.font = "10px sans-serif";
          ctx.fillText(track.error, 0, 0);
          ctx.restore();
        } else if (track.bins.length === 0) {
          ctx.save();
          ctx.translate(laneStart + 24, 6);
          ctx.rotate(Math.PI / 2);
          ctx.fillStyle = "rgba(90,90,90,0.75)";
          ctx.font = "10px sans-serif";
          ctx.fillText(statusMessage ?? "No signal", 0, 0);
          ctx.restore();
        }
      }
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

  private getViewportGeometry(orientation: Orientation): ViewportGeometry {
    const descriptor =
      this.mapManager.getLayersManager().currentViewState.resolutionDesciptor;
    const bpResolution = descriptor.bpResolution;
    const map = this.mapManager.getMap();
    const view = this.mapManager.getView();
    const mapSize = map.getSize();
    const extent = view.calculateExtent(mapSize);
    const activeHiCLayer =
      this.mapManager.getLayersManager().getActiveHiCDataLayer();
    const targetProjection =
      activeHiCLayer.getSource()?.getProjection() ?? view.getProjection();
    const pixelResolution = view.getResolution() ?? 1;
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
    const maxStartPx = Math.max(0, totalPx - 1);
    const unclampedStartPx = screenToPx(visibleStartScreen);
    const unclampedEndPx = screenToPx(visibleEndScreen);
    const startPx = Math.max(0, Math.min(unclampedStartPx, maxStartPx));
    const endPx = Math.max(startPx + 1, Math.min(unclampedEndPx, totalPx));
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
      visibleWidthPx: Math.max(1, visibleEndScreen - visibleStartScreen),
    };
  }

  private buildPrefetchViewport(viewport: ViewportGeometry): {
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
    const prefetchStartPx = Math.max(0, viewport.startPx - paddingPx);
    const prefetchEndPx = Math.min(Math.max(prefetchStartPx + 1, totalPx), viewport.endPx + paddingPx);
    const prefetchSpan = Math.max(1, prefetchEndPx - prefetchStartPx);
    const prefetchWidthPx = Math.max(
      viewport.visibleWidthPx,
      Math.ceil((viewport.visibleWidthPx * prefetchSpan) / visibleSpanPx)
    );
    return { prefetchStartPx, prefetchEndPx, prefetchWidthPx };
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
};

type TrackQueryCache = {
  bpResolution: number;
  prefetchStartPx: number;
  prefetchEndPx: number;
  fetchedAtMs: number;
  response: TrackQueryResponse;
};
