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

import { Map, View } from "ol";
import { ZoomSlider } from "ol/control";
import { DoubleClickZoom, DragPan } from "ol/interaction";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import Polygon, { fromExtent } from "ol/geom/Polygon";
import Stroke from "ol/style/Stroke";
import Style from "ol/style/Style";
import { transform, transformExtent } from "ol/proj";
import { getCenter, getHeight, getWidth, intersects } from "ol/extent";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import ContigDimensionHolder from "./ContigDimensionHolder";
import { ScaffoldHolder } from "./ScaffoldHolder";
import { HiCViewAndLayersManager } from "./HiCViewAndLayersManager";
import OSM from "ol/source/OSM";
import type { OpenFileResponse } from "../net/netcommon";
import type { NetworkManager } from "../net/NetworkManager";
import type { ContigDescriptor } from "../domain/ContigDescriptor";
import { CommonEventManager } from "./CommonEventManager";
import { CurrentSignalRangeResponse } from "../net/api/response";
import { VisualizationManager } from "./VisualizationManager";
import { Ref } from "vue";
import { VersionedXYZContactMapSource } from "../VersionedXYZSource";
import { LinearTrackManager } from "./LinearTrackManager";
import { useStyleStore } from "@/app/stores/styleStore";

class ContactMapManager {
  public readonly map: Map;
  public readonly contigDimensionHolder: ContigDimensionHolder;
  public readonly scaffoldHolder: ScaffoldHolder;
  public readonly viewAndLayersManager: HiCViewAndLayersManager;
  public readonly networkManager: NetworkManager;
  public readonly eventManager: CommonEventManager;
  public sizeObserver?: ResizeObserver;
  public readonly toastHandlers: (() => void)[] = [];
  public readonly visualizationManager: VisualizationManager;
  public readonly linearTrackManager: LinearTrackManager;
  public minimap: Map | null;
  private minimapViewportFeature: Feature<Polygon> | null;
  private minimapResizeObserver: ResizeObserver | null;
  private minimapSyncListeners: EventsKey[];
  private minimapPointerCleanup: (() => void)[];
  private minimapDragPointerId: number | null;
  private minimapRenderFramePending: boolean;

  constructor(
    protected readonly options: {
      readonly response: OpenFileResponse;
      readonly filename: string;
      readonly fastaFilename: string;
      readonly tileSize: number;
      readonly contigBorderColor: string;
      readonly mapTargetSelector: string;
      readonly networkManager: NetworkManager;
      readonly minimapTarget: Ref<HTMLElement | null>;
    }
  ) {
    const contigDescriptors: ContigDescriptor[] =
      options.response.assemblyInfo.contigDescriptors;
    this.contigDimensionHolder = new ContigDimensionHolder(contigDescriptors);
    this.scaffoldHolder = new ScaffoldHolder(
      this.contigDimensionHolder,
      options.response.assemblyInfo.scaffoldDescriptors
    );

    this.eventManager = new CommonEventManager(this);

    this.networkManager = options.networkManager;

    this.viewAndLayersManager = new HiCViewAndLayersManager(
      this,
      options.response
    );

    this.map = new Map({
      layers: [],
      interactions: [],
    });

    this.visualizationManager = new VisualizationManager(this);
    this.visualizationManager.fetchVisualizationOptions();
    this.linearTrackManager = new LinearTrackManager(this);

    this.minimap = null;
    this.minimapViewportFeature = null;
    this.minimapResizeObserver = null;
    this.minimapSyncListeners = [];
    this.minimapPointerCleanup = [];
    this.minimapDragPointerId = null;
    this.minimapRenderFramePending = false;
  }

  public initializeMap(): void {
    this.map.setTarget(this.options.mapTargetSelector);
    this.sizeObserver = new ResizeObserver(() => {
      this.map.updateSize();
    });
    this.sizeObserver.observe(
      document.querySelector("#" + this.options.mapTargetSelector) as Element
    );
    this.map.setView(this.viewAndLayersManager.getView());
    this.viewAndLayersManager.initializeMapsDataLayers();
    this.viewAndLayersManager.initializeTracks();
    this.initializeMapInteractions();
    this.initializeMapControls();
    void this.linearTrackManager.refreshTrackList();
    console.log("Map initialized. Contact map manager: ", this);
  }

  public initializeMapInteractions(): void {
    this.map.addInteraction(new DoubleClickZoom());
    this.map.addInteraction(new DragPan());
    this.viewAndLayersManager.initializeMapInteractions();
  }

  public initializeMapControls(): void {
    // Add some more controls:
    this.map.addControl(new ZoomSlider());
    // this.map.addInteraction(
    //   new SplitRulesInteraction({
    //     mapManager: this,
    //     selectionCallback: this.eventManager.onClickInScissorsMode,
    //   })
    // );
    /*
    // No more scale line in kilometers:
    this.map.addControl(
      new ScaleLine({
        bar: true,
        text: true,
      })
    );
    */
    this.viewAndLayersManager.initializeMapControls();
  }

  public addOverviewMapTarget(target: HTMLElement | string) {
    this.clearOverviewMapTarget();
    const resolvedTarget =
      typeof target === "string"
        ? document.getElementById(target)
        : target;
    if (!resolvedTarget) {
      return;
    }
    this.applyMinimapBackground(resolvedTarget);
    const coarsestLayer = this.createCoarsestMinimapLayer();
    const source = coarsestLayer?.getSource();
    const projection = source?.getProjection();
    const projectionExtent = projection?.getExtent();
    if (!coarsestLayer || !source || !projection || !projectionExtent) {
      return;
    }

    const viewportSource = new VectorSource();
    const viewportFeature = new Feature<Polygon>(fromExtent(projectionExtent));
    viewportSource.addFeature(viewportFeature);
    const viewportLayer = new VectorLayer({
      source: viewportSource,
      style: [
        new Style({
          stroke: new Stroke({
            color: "rgba(34, 211, 238, 0.98)",
            width: 5,
          }),
        }),
        new Style({
          stroke: new Stroke({
            color: "rgba(217, 70, 239, 0.98)",
            width: 2,
          }),
        }),
      ],
    });

    const projectionExtentTuple = projectionExtent as [number, number, number, number];
    const minimap = new Map({
      target: resolvedTarget,
      controls: [],
      interactions: [],
      layers: [coarsestLayer, viewportLayer],
      view: new View({
        projection,
        center: getCenter(projectionExtentTuple),
        resolution: this.estimateMinimapResolution(projectionExtentTuple, resolvedTarget),
        constrainResolution: false,
        extent: projectionExtentTuple,
      }),
    });
    this.minimap = minimap;
    this.minimapViewportFeature = viewportFeature;
    this.fitMinimapToFullExtent();
    this.bindMinimapPointerInteractions(resolvedTarget);
    this.minimapResizeObserver = new ResizeObserver(() => {
      this.minimap?.updateSize();
      this.fitMinimapToFullExtent();
      this.scheduleMinimapViewportSync();
    });
    this.minimapResizeObserver.observe(resolvedTarget);

    const mainView = this.map.getView();
    this.minimapSyncListeners.push(
      this.map.on("moveend", () => this.scheduleMinimapViewportSync())
    );
    this.minimapSyncListeners.push(
      mainView.on("change:center", () => this.scheduleMinimapViewportSync())
    );
    this.minimapSyncListeners.push(
      mainView.on("change:resolution", () => this.scheduleMinimapViewportSync())
    );
    this.scheduleMinimapViewportSync();
  }

  public clearOverviewMapTarget(): void {
    this.minimapResizeObserver?.disconnect();
    this.minimapResizeObserver = null;
    this.teardownMinimapPointerInteractions();
    if (this.minimapSyncListeners.length > 0) {
      unByKey(this.minimapSyncListeners);
      this.minimapSyncListeners = [];
    }
    this.minimapViewportFeature = null;
    if (!this.minimap) {
      return;
    }
    this.minimap.setTarget(undefined);
    this.minimap = null;
  }

  public getOptions() {
    return this.options;
  }

  public getMap(): Map {
    return this.map;
  }

  public getMiniMap(): Map {
    const minimap = this.minimap;
    if (minimap) {
      return minimap;
    } else {
      throw Error("Minimap is not yet initialized?");
    }
  }

  public getView(): View {
    return this.viewAndLayersManager.getView();
  }

  public getLayersManager(): HiCViewAndLayersManager {
    return this.viewAndLayersManager;
  }

  public getContigDimensionHolder(): ContigDimensionHolder {
    return this.contigDimensionHolder;
  }

  public setMapTarget(target?: string | HTMLElement): void {
    this.map.setTarget(target);
  }

  public reloadTiles(): void {
    this.viewAndLayersManager.reloadTiles();
    void this.linearTrackManager.clearCachesAndRender();
    this.scheduleMinimapViewportSync();
  }

  public async reloadTilesFromBackend(): Promise<void> {
    const version = await this.networkManager.requestManager.reloadTilesVersion();
    this.viewAndLayersManager.reloadTiles(version);
    void this.linearTrackManager.clearCachesAndRender();
    this.scheduleMinimapViewportSync();
  }

  private resolveExportMapSizePx(
    bpResolution: number,
    configuredMapSizePx: number
  ): number {
    const safeConfiguredSize = Math.max(1, Math.round(configuredMapSizePx || 1));
    const prefixPx = this.contigDimensionHolder.prefix_sum_px.get(bpResolution);
    const assemblyMapSizePx =
      prefixPx?.[this.contigDimensionHolder.contig_count] ?? safeConfiguredSize;
    return Math.max(
      1,
      Math.min(safeConfiguredSize, Math.round(assemblyMapSizePx))
    );
  }

  private async buildCurrentMapSvg(
    progressCallback?: (progress: number) => void,
    options?: {
      backgroundColor?: string;
      metadata?: Record<string, unknown>;
      includeWorkspaceComposite?: boolean;
    }
  ): Promise<string> {
    if (options?.includeWorkspaceComposite ?? true) {
      const composite = await this.renderWorkspaceCompositeCanvas(
        options?.backgroundColor
      );
      const dataUrl = composite.toDataURL("image/png");
      progressCallback?.(1);
      let svg =
        `<?xml version=\"1.0\" encoding=\"UTF-8\"?>` +
        `<svg xmlns=\"http://www.w3.org/2000/svg\" ` +
        `xmlns:xlink=\"http://www.w3.org/1999/xlink\" ` +
        `width=\"${composite.width}\" height=\"${composite.height}\" viewBox=\"0 0 ${composite.width} ${composite.height}\">`;
      svg += `<rect width=\"${composite.width}\" height=\"${composite.height}\" fill=\"${
        options?.backgroundColor ?? "rgba(255,255,255,1)"
      }\" />`;
      if (options?.metadata) {
        const metaJson = JSON.stringify(options.metadata);
        svg += `<metadata><![CDATA[${metaJson}]]></metadata>`;
      }
      svg += `<image x=\"0\" y=\"0\" width=\"${composite.width}\" height=\"${composite.height}\" href=\"${ContactMapManager.escapeXml(
        dataUrl
      )}\" />`;
      svg += `</svg>`;
      return svg;
    }

    const descriptor =
      this.viewAndLayersManager.currentViewState.resolutionDesciptor;
    const mapSizePx = this.resolveExportMapSizePx(
      descriptor.bpResolution,
      this.viewAndLayersManager.imageSizes[descriptor.imageSizeIndex] ?? 1
    );
    const tileSize = this.options.tileSize;

    const layer =
      this.viewAndLayersManager.layersHolder.bpResolutionToHiCDataLayer.get(
        descriptor.bpResolution
      );
    if (!layer) {
      throw new Error(
        `Cannot export SVG: no data layer for resolution ${descriptor.bpResolution}`
      );
    }
    const source = layer.getSource();
    if (!(source instanceof VersionedXYZContactMapSource)) {
      throw new Error("Cannot export SVG: unexpected data source type");
    }

    const tileUrlFn = source.getTileUrlFunction();
    const projection = this.map.getView().getProjection();
    const pixelRatio = window.devicePixelRatio ?? 1;
    const tilesPerSide = Math.ceil(mapSizePx / tileSize);
    const tiles: { col: number; row: number; url: string }[] = [];
    for (let row = 0; row < tilesPerSide; row++) {
      for (let col = 0; col < tilesPerSide; col++) {
        const url = tileUrlFn([0, col, row], pixelRatio, projection);
        if (url) {
          const withPriority =
            url.indexOf("?") >= 0 ? `${url}&priority=low` : `${url}?priority=low`;
          tiles.push({ col, row, url: withPriority });
        }
      }
    }

    const width = mapSizePx;
    const height = mapSizePx;
    const backgroundColor = options?.backgroundColor ?? "rgba(255,255,255,0)";
    const escapeAttr = ContactMapManager.escapeXml;
    const svgImages: string[] = [];
    let completed = 0;
    let nextIndex = 0;
    const concurrency = 8;
    const worker = async () => {
      while (true) {
        const idx = nextIndex++;
        if (idx >= tiles.length) {
          return;
        }
        const tile = tiles[idx];
        try {
          const response = await fetch(tile.url);
          const data = await response.json();
          if (data && data.image) {
            const x = tile.col * tileSize;
            const y = tile.row * tileSize;
            const tileWidth = Math.min(tileSize, width - x);
            const tileHeight = Math.min(tileSize, height - y);
            const imageHref =
              tileWidth < tileSize || tileHeight < tileSize
                ? await this.cropTileImageDataUrl(
                    String(data.image),
                    tileWidth,
                    tileHeight
                  )
                : String(data.image);
            svgImages.push(
              `<image x=\"${x}\" y=\"${y}\" width=\"${tileWidth}\" height=\"${tileHeight}\" href=\"${escapeAttr(imageHref)}\" />`
            );
          }
          completed += 1;
          if (progressCallback) {
            progressCallback(completed / Math.max(tiles.length, 1));
          }
        } catch (e) {
          console.error("Failed to export tile", tile, e);
          completed += 1;
          if (progressCallback) {
            progressCallback(completed / Math.max(tiles.length, 1));
          }
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    let svg =
      `<?xml version=\"1.0\" encoding=\"UTF-8\"?>` +
      `<svg xmlns=\"http://www.w3.org/2000/svg\" ` +
      `xmlns:xlink=\"http://www.w3.org/1999/xlink\" ` +
      `width=\"${width}\" height=\"${height}\" viewBox=\"0 0 ${width} ${height}\">`;

    svg += `<rect width=\"${width}\" height=\"${height}\" fill=\"${backgroundColor}\" />`;
    if (options?.metadata) {
      const metaJson = JSON.stringify(options.metadata);
      svg += `<metadata><![CDATA[${metaJson}]]></metadata>`;
    }

    svg += svgImages.join("");
    svg += this.exportTracksSvg(descriptor.bpResolution);
    svg += `</svg>`;

    if (typeof DOMParser !== "undefined") {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svg, "image/svg+xml");
      const errorNode = doc.querySelector("parsererror");
      if (errorNode) {
        const errorText = errorNode.textContent ?? "Unknown SVG parse error";
        let context = "";
        const match = errorText.match(/line\s+(\d+)\s+at\s+column\s+(\d+)/i);
        if (match) {
          const column = Number(match[2]);
          if (Number.isFinite(column)) {
            const idx = Math.max(0, column - 1);
            const start = Math.max(0, idx - 200);
            const end = Math.min(svg.length, idx + 200);
            context = svg.slice(start, end);
          }
        }
        throw new Error(
          `SVG export failed validation: ${errorText}${
            context ? `\nContext:\n${context}` : ""
          }`
        );
      }
    }

    return svg;
  }

  private async loadSvgImage(svg: string): Promise<HTMLImageElement> {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    try {
      return await this.loadImageUrl(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private async loadImageUrl(url: string): Promise<HTMLImageElement> {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = (error) => reject(error);
      image.src = url;
    });
    return image;
  }

  private async cropTileImageDataUrl(
    dataUrl: string,
    targetWidth: number,
    targetHeight: number
  ): Promise<string> {
    const width = Math.max(1, Math.round(targetWidth));
    const height = Math.max(1, Math.round(targetHeight));
    const image = await this.loadImageUrl(dataUrl);
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    if (naturalWidth === width && naturalHeight === height) {
      return dataUrl;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return dataUrl;
    }
    context.clearRect(0, 0, width, height);
    const sourceWidth = Math.min(width, Math.max(1, naturalWidth));
    const sourceHeight = Math.min(height, Math.max(1, naturalHeight));
    context.drawImage(
      image,
      0,
      0,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight
    );
    return canvas.toDataURL("image/png");
  }

  private drawOutlinedCanvasText(
    context: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number
  ): void {
    context.strokeText(text, x, y);
    context.fillText(text, x, y);
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

  private buildRulerTickPositions(pixelSpan: number): number[] {
    const desiredTickCount = Math.max(
      3,
      Math.min(12, Math.floor(pixelSpan / 90))
    );
    const stepPx = this.niceStep(pixelSpan / Math.max(1, desiredTickCount - 1));
    const ticks: number[] = [0];
    for (let value = stepPx; value < pixelSpan; value += stepPx) {
      ticks.push(Math.round(value));
    }
    ticks.push(pixelSpan);
    return [...new Set(ticks.map((value) => Math.max(0, Math.min(pixelSpan, value))))].sort(
      (a, b) => a - b
    );
  }

  private formatRulerTickLabel(
    bpValue: number,
    previousRawLabel: string | null,
    previousBpValue: number | null
  ): { text: string; compact: boolean; rawLabel: string } {
    const rawLabel = this.formatBpLabel(bpValue, 0);
    if (previousRawLabel === rawLabel && previousBpValue !== null) {
      const delta = Math.max(0, Math.round(bpValue - previousBpValue));
      if (delta > 0) {
        return {
          text: this.formatBpLabel(bpValue, 1),
          compact: true,
          rawLabel,
        };
      }
    }
    return {
      text: rawLabel,
      compact: false,
      rawLabel,
    };
  }

  private formatBpLabel(bpValue: number, precision: number): string {
    const value = Math.max(0, Math.round(bpValue));
    const units: Array<[number, string]> = [
      [1_000_000_000, "G"],
      [1_000_000, "M"],
      [1_000, "K"],
    ];
    const [scale, suffix] =
      units.find(([candidate]) => value >= candidate) ?? [1, ""];
    const scaled = value / scale;
    const digits = precision > 0 && scaled < 100 ? precision : 0;
    return `${scaled.toFixed(digits).replace(/\.0+$/, "")}${suffix}`;
  }

  private drawFullExtentExportRulers(
    context: CanvasRenderingContext2D,
    options: {
      mapOffset: number;
      mapSizePx: number;
      trackPanelSizePx: number;
      rulerPanelSizePx: number;
      bpResolution: number;
      backgroundColor: string;
    }
  ): void {
    const { mapOffset, mapSizePx, trackPanelSizePx, rulerPanelSizePx, bpResolution } =
      options;
    const palette = (() => {
      const darkBackground = useStyleStore().mapBackgroundColor.L <= 55;
      return darkBackground
        ? {
            line: "rgba(239,244,251,0.95)",
            text: "rgba(245,248,252,0.96)",
            outline: "rgba(0,0,0,0.88)",
          }
        : {
            line: "rgba(16,24,36,0.92)",
            text: "rgba(22,28,38,0.94)",
            outline: "rgba(255,255,255,0.92)",
          };
    })();

    context.save();
    context.fillStyle = options.backgroundColor;
    context.fillRect(mapOffset, trackPanelSizePx, mapSizePx, rulerPanelSizePx);
    context.fillRect(trackPanelSizePx, mapOffset, rulerPanelSizePx, mapSizePx);

    const axisY = trackPanelSizePx + rulerPanelSizePx - 8;
    context.strokeStyle = palette.line;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(mapOffset, axisY);
    context.lineTo(mapOffset + mapSizePx, axisY);
    context.stroke();

    const axisX = trackPanelSizePx + rulerPanelSizePx - 8;
    context.beginPath();
    context.moveTo(axisX, mapOffset);
    context.lineTo(axisX, mapOffset + mapSizePx);
    context.stroke();

    const tickPositions = this.buildRulerTickPositions(mapSizePx);
    context.strokeStyle = palette.line;
    context.fillStyle = palette.text;
    context.lineWidth = 1.5;
    context.textAlign = "center";
    context.textBaseline = "top";
    context.strokeStyle = palette.outline;

    let previousHorizontalRaw: string | null = null;
    let previousHorizontalBp: number | null = null;
    for (const tickPx of tickPositions) {
      const mapPx = Math.max(0, Math.min(mapSizePx - 1, tickPx));
      const bpValue = this.contigDimensionHolder.getStartBpOfPx(
        mapPx,
        bpResolution
      );
      const label = this.formatRulerTickLabel(
        bpValue,
        previousHorizontalRaw,
        previousHorizontalBp
      );
      previousHorizontalRaw = label.rawLabel;
      previousHorizontalBp = bpValue;

      const x = mapOffset + tickPx;
      context.beginPath();
      context.moveTo(x + 0.5, axisY);
      context.lineTo(x + 0.5, axisY - 8);
      context.stroke();

      context.save();
      context.translate(x + 2, axisY - 12);
      context.rotate(-Math.PI / 5);
      context.font = label.compact ? "9px sans-serif" : "bold 11px sans-serif";
      context.lineWidth = label.compact ? 2 : 2.5;
      this.drawOutlinedCanvasText(context, label.text, 0, 0);
      context.restore();
    }

    let previousVerticalRaw: string | null = null;
    let previousVerticalBp: number | null = null;
    for (const tickPx of tickPositions) {
      const mapPx = Math.max(0, Math.min(mapSizePx - 1, tickPx));
      const bpValue = this.contigDimensionHolder.getStartBpOfPx(
        mapPx,
        bpResolution
      );
      const label = this.formatRulerTickLabel(
        bpValue,
        previousVerticalRaw,
        previousVerticalBp
      );
      previousVerticalRaw = label.rawLabel;
      previousVerticalBp = bpValue;

      const y = mapOffset + tickPx;
      context.beginPath();
      context.moveTo(axisX, y + 0.5);
      context.lineTo(axisX - 8, y + 0.5);
      context.stroke();

      context.save();
      context.translate(axisX - 10, y + 2);
      context.rotate(-Math.PI / 2);
      context.textAlign = "left";
      context.font = label.compact ? "9px sans-serif" : "bold 11px sans-serif";
      context.lineWidth = label.compact ? 2 : 2.5;
      this.drawOutlinedCanvasText(context, label.text, 0, 0);
      context.restore();
    }
    context.restore();
  }

  private getCurrentViewportInMapPixels(
    mapSizePx: number
  ): { left: number; top: number; width: number; height: number } | null {
    const mapSize = this.map.getSize();
    if (!mapSize) {
      return null;
    }
    const mapView = this.map.getView();
    const activeHiCLayer = this.viewAndLayersManager.getActiveHiCDataLayer();
    const targetProjection =
      activeHiCLayer.getSource()?.getProjection() ?? mapView.getProjection();
    const extent = mapView.calculateExtent(mapSize);
    const pixelResolution = mapView.getResolution() ?? 1;
    const fixed = transform(extent, mapView.getProjection(), targetProjection).map(
      (coordinate) => coordinate / pixelResolution
    );
    const unclampedLeft = -fixed[0];
    const unclampedRight = fixed[2];
    const unclampedTop = fixed[3];
    const unclampedBottom = -fixed[1];
    const left = Math.max(0, Math.min(mapSizePx, unclampedLeft));
    const right = Math.max(left + 1, Math.min(mapSizePx, unclampedRight));
    const top = Math.max(0, Math.min(mapSizePx, unclampedTop));
    const bottom = Math.max(top + 1, Math.min(mapSizePx, unclampedBottom));
    return {
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  }

  private drawExportMinimap(
    context: CanvasRenderingContext2D,
    mapImage: HTMLImageElement,
    options: {
      mapSizePx: number;
      mapOffset: number;
      totalWidth: number;
      totalHeight: number;
      backgroundColor: string;
    }
  ): void {
    const minimapMaxWidth = Math.max(56, options.mapOffset - 16);
    const minimapMaxHeight = Math.max(56, options.mapOffset - 16);
    const minimapSize = Math.max(
      56,
      Math.min(
        180,
        Math.round(options.mapSizePx * 0.18),
        minimapMaxWidth,
        minimapMaxHeight
      )
    );
    const x = 8;
    const y = 8;
    context.save();
    context.fillStyle = options.backgroundColor;
    context.fillRect(x, y, minimapSize, minimapSize);
    context.strokeStyle = "rgba(31,41,55,0.55)";
    context.lineWidth = 1;
    context.strokeRect(x + 0.5, y + 0.5, minimapSize - 1, minimapSize - 1);
    const sourceSize = Math.max(
      1,
      Math.min(options.mapSizePx, mapImage.width, mapImage.height)
    );
    context.drawImage(
      mapImage,
      0,
      0,
      sourceSize,
      sourceSize,
      x,
      y,
      minimapSize,
      minimapSize
    );

    const viewport = this.getCurrentViewportInMapPixels(options.mapSizePx);
    if (viewport) {
      const scale = minimapSize / Math.max(1, options.mapSizePx);
      const rectX = x + viewport.left * scale;
      const rectY = y + viewport.top * scale;
      const rectW = Math.max(2, viewport.width * scale);
      const rectH = Math.max(2, viewport.height * scale);
      context.strokeStyle = "rgba(255,255,255,0.98)";
      context.lineWidth = 3;
      context.strokeRect(rectX, rectY, rectW, rectH);
      context.strokeStyle = "rgba(220,38,38,0.98)";
      context.lineWidth = 1.5;
      context.strokeRect(rectX, rectY, rectW, rectH);
    }
    context.restore();
  }

  private async buildDataDrivenExportCompositeCanvas(
    progressCallback?: (progress: number) => void,
    options?: {
      backgroundColor?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<HTMLCanvasElement> {
    const descriptor =
      this.viewAndLayersManager.currentViewState.resolutionDesciptor;
    const bpResolution = descriptor.bpResolution;
    const configuredMapSizePx =
      this.viewAndLayersManager.imageSizes[descriptor.imageSizeIndex] ?? 1;
    const mapSizePx = this.resolveExportMapSizePx(
      bpResolution,
      configuredMapSizePx
    );
    const visibleTrackCount = this.linearTrackManager
      .getTracksSnapshot()
      .filter((track) => track.visible).length;
    const trackPanelSizePx = visibleTrackCount > 0 ? 140 : 0;
    const rulerPanelSizePx = 44;
    const mapOffset = trackPanelSizePx + rulerPanelSizePx;
    const totalWidth = mapOffset + mapSizePx;
    const totalHeight = mapOffset + mapSizePx;
    const backgroundColor =
      options?.backgroundColor ?? useStyleStore().mapBackgroundColor.RGBA;

    const canvas = document.createElement("canvas");
    canvas.width = totalWidth;
    canvas.height = totalHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Cannot export: canvas context is unavailable");
    }
    context.clearRect(0, 0, totalWidth, totalHeight);
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, totalWidth, totalHeight);

    const mapSvg = await this.buildCurrentMapSvg(
      (progress) => progressCallback?.(progress * 0.64),
      {
        ...options,
        includeWorkspaceComposite: false,
      }
    );
    const mapImage = await this.loadSvgImage(mapSvg);
    const sourceSize = Math.min(mapSizePx, mapImage.width, mapImage.height);
    context.drawImage(
      mapImage,
      0,
      0,
      sourceSize,
      sourceSize,
      mapOffset,
      mapOffset,
      mapSizePx,
      mapSizePx
    );
    progressCallback?.(0.68);

    if (visibleTrackCount > 0) {
      const [horizontalTrackCanvas, verticalTrackCanvas] = await Promise.all([
        this.linearTrackManager.renderFullExtentCanvasForExport("horizontal", {
          bpResolution,
          startPx: 0,
          endPx: mapSizePx,
          trackPanelSizePx,
        }),
        this.linearTrackManager.renderFullExtentCanvasForExport("vertical", {
          bpResolution,
          startPx: 0,
          endPx: mapSizePx,
          trackPanelSizePx,
        }),
      ]);
      if (horizontalTrackCanvas) {
        context.drawImage(
          horizontalTrackCanvas,
          mapOffset,
          0,
          mapSizePx,
          trackPanelSizePx
        );
      }
      if (verticalTrackCanvas) {
        context.drawImage(
          verticalTrackCanvas,
          0,
          mapOffset,
          trackPanelSizePx,
          mapSizePx
        );
      }
    }
    progressCallback?.(0.84);

    this.drawFullExtentExportRulers(context, {
      mapOffset,
      mapSizePx,
      trackPanelSizePx,
      rulerPanelSizePx,
      bpResolution,
      backgroundColor,
    });

    // this.drawExportMinimap(context, mapImage, {
    //   mapSizePx,
    //   mapOffset,
    //   totalWidth,
    //   totalHeight,
    //   backgroundColor,
    // });
    progressCallback?.(1);
    return canvas;
  }

  public async exportCurrentMapSvg(
    progressCallback?: (progress: number) => void,
    options?: {
      backgroundColor?: string;
      metadata?: Record<string, unknown>;
      includeWorkspaceComposite?: boolean;
    }
  ): Promise<void> {
    let svg: string;
    if (options?.includeWorkspaceComposite === true) {
      const workspaceCanvas = await this.renderWorkspaceCompositeCanvas(
        options?.backgroundColor
      );
      progressCallback?.(1);
      const dataUrl = workspaceCanvas.toDataURL("image/png");
      svg =
        `<?xml version=\"1.0\" encoding=\"UTF-8\"?>` +
        `<svg xmlns=\"http://www.w3.org/2000/svg\" ` +
        `xmlns:xlink=\"http://www.w3.org/1999/xlink\" ` +
        `width=\"${workspaceCanvas.width}\" height=\"${workspaceCanvas.height}\" viewBox=\"0 0 ${workspaceCanvas.width} ${workspaceCanvas.height}\">` +
        `${
          options?.metadata
            ? `<metadata><![CDATA[${JSON.stringify(options.metadata)}]]></metadata>`
            : ""
        }` +
        `<rect width=\"${workspaceCanvas.width}\" height=\"${workspaceCanvas.height}\" fill=\"${
          options?.backgroundColor ?? "rgba(255,255,255,1)"
        }\" />` +
        `<image x=\"0\" y=\"0\" width=\"${workspaceCanvas.width}\" height=\"${workspaceCanvas.height}\" href=\"${ContactMapManager.escapeXml(
          dataUrl
        )}\" />` +
        `</svg>`;
    } else {
      const composite = await this.buildDataDrivenExportCompositeCanvas(
        progressCallback,
        options
      );
      const dataUrl = composite.toDataURL("image/png");
      svg =
        `<?xml version=\"1.0\" encoding=\"UTF-8\"?>` +
        `<svg xmlns=\"http://www.w3.org/2000/svg\" ` +
        `xmlns:xlink=\"http://www.w3.org/1999/xlink\" ` +
        `width=\"${composite.width}\" height=\"${composite.height}\" viewBox=\"0 0 ${composite.width} ${composite.height}\">` +
        `${
          options?.metadata
            ? `<metadata><![CDATA[${JSON.stringify(options.metadata)}]]></metadata>`
            : ""
        }` +
        `<rect width=\"${composite.width}\" height=\"${composite.height}\" fill=\"${
          options?.backgroundColor ?? "rgba(255,255,255,1)"
        }\" />` +
        `<image x=\"0\" y=\"0\" width=\"${composite.width}\" height=\"${composite.height}\" href=\"${ContactMapManager.escapeXml(
          dataUrl
        )}\" />` +
        `</svg>`;
    }
    const blob = new Blob([svg], { type: "image/svg+xml" });
    await this.saveExportBlob(blob, `${this.options.filename}.svg`);
  }

  public async exportCurrentMapPng(
    progressCallback?: (progress: number) => void,
    options?: {
      backgroundColor?: string;
      metadata?: Record<string, unknown>;
      includeWorkspaceComposite?: boolean;
    }
  ): Promise<void> {
    const canvas =
      options?.includeWorkspaceComposite === true
        ? await this.renderWorkspaceCompositeCanvas(options?.backgroundColor)
        : await this.buildDataDrivenExportCompositeCanvas(
            progressCallback,
            options
          );
    if (options?.includeWorkspaceComposite === true) {
      progressCallback?.(1);
    }
    await new Promise<void>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve();
          return;
        }
        this.saveExportBlob(blob, `${this.options.filename}.png`)
          .then(resolve)
          .catch(reject);
      }, "image/png");
    });
  }

  public async exportCurrentMapPdf(
    progressCallback?: (progress: number) => void,
    options?: {
      backgroundColor?: string;
      metadata?: Record<string, unknown>;
      includeWorkspaceComposite?: boolean;
    }
  ): Promise<void> {
    const canvas =
      options?.includeWorkspaceComposite === true
        ? await this.renderWorkspaceCompositeCanvas(options?.backgroundColor)
        : await this.buildDataDrivenExportCompositeCanvas(
            progressCallback,
            options
          );
    if (options?.includeWorkspaceComposite === true) {
      progressCallback?.(1);
    }
    const dataUrl = canvas.toDataURL("image/png");
    const { jsPDF } = await import("jspdf");
    const orientation = canvas.width >= canvas.height ? "landscape" : "portrait";
    const pdf = new jsPDF({
      orientation,
      unit: "px",
      format: [canvas.width, canvas.height],
    });
    pdf.addImage(dataUrl, "PNG", 0, 0, canvas.width, canvas.height);
    const blob = pdf.output("blob");
    await this.saveExportBlob(blob, `${this.options.filename}.pdf`);
  }

  private async saveExportBlob(blob: Blob, filename: string): Promise<void> {
    const sanitizedFilename = ContactMapManager.sanitizeDownloadFilename(filename);
    const desktopBridge = (window as unknown as {
      hictDesktop?: {
        saveExport?: (payload: {
          filename: string;
          bytes: number[];
        }) => Promise<unknown> | unknown;
      };
    }).hictDesktop;
    if (typeof desktopBridge?.saveExport === "function") {
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      await Promise.resolve(
        desktopBridge.saveExport({ filename: sanitizedFilename, bytes })
      );
      return;
    }

    const tauriBridge = (window as unknown as {
      __TAURI__?: {
        core?: {
          invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
        };
        invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
    }).__TAURI__;
    const invoke = tauriBridge?.core?.invoke ?? tauriBridge?.invoke;
    if (typeof invoke === "function") {
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      await invoke("save_export", { filename: sanitizedFilename, bytes });
      return;
    }

    const a = document.createElement("a");
    a.download = sanitizedFilename;
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private static sanitizeDownloadFilename(filename: string): string {
    const safe = filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
    return safe.length > 0 ? safe : "hict-export.bin";
  }

  private exportTracksSvg(bpResolution: number): string {
    const flags = this.viewAndLayersManager.getExportTrackFlags();
    if (
      !flags.contigBorders &&
      !flags.scaffoldBorders &&
      !flags.contigNames &&
      !flags.scaffoldNames
    ) {
      return "";
    }

    const contigTrack = this.viewAndLayersManager.track2DHolder.contigBordersTrack;
    const scaffoldTrack =
      this.viewAndLayersManager.track2DHolder.scaffoldBordersTrack;
    const pixelResolution =
      this.viewAndLayersManager.getPixelResolutionForBpResolution(bpResolution) ??
      1;
    if (!Number.isFinite(pixelResolution) || pixelResolution <= 0) {
      return "";
    }
    const escapeXml = ContactMapManager.escapeXml;
    const escapeAttr = ContactMapManager.escapeXml;

    const toFont = (track: typeof contigTrack) => {
      const fontFamily =
        typeof window !== "undefined"
          ? window.getComputedStyle(document.body).fontFamily
          : "sans-serif";
      return `${track.getLabelBold() ? "bold " : ""}${track.getLabelSize()}px ${fontFamily}`;
    };
    const toFontFamily = (track: typeof contigTrack) =>
      toFont(track).replace(/^[^ ]+ /, "");
    const toSvgPoint = (coordinate: [number, number]): [number, number] => [
      coordinate[0] / pixelResolution,
      -coordinate[1] / pixelResolution,
    ];
    const polylineSvg = (coordinates: [number, number][]): string =>
      coordinates
        .map((coordinate) => {
          const [x, y] = toSvgPoint(coordinate);
          return `${x},${y}`;
        })
        .join(" ");
    const renderTrackFeatures = (
      featureSource: typeof contigTrack,
      borderEnabled: boolean,
      namesEnabled: boolean,
      borderTrackType: "contigBorders" | "scaffoldBorders",
      namesTrackType: "contigNames" | "scaffoldNames",
      labelExtractor: (featureName: unknown) => string
    ): string => {
      const features = featureSource.features.get(bpResolution) ?? [];
      if (features.length === 0) {
        return "";
      }
      const strokeColor = featureSource.options.borderColor as string;
      const labelColor = featureSource.getLabelColor() as string;
      const strokeWidth = featureSource.options.width;
      const fillColor = featureSource.options.fillColor as string;
      const labelSize = featureSource.getLabelSize();
      const labelStroke = featureSource.getLabelOutline()
        ? `stroke="rgba(0,0,0,0.9)" stroke-width="${featureSource.getLabelOutlineWidth()}" paint-order="stroke fill" stroke-linejoin="round"`
        : "";
      let result = "";
      for (const feature of features) {
        const trackType = String(feature.get("trackType") ?? "");
        const geometry = feature.getGeometry();
        if (!geometry) {
          continue;
        }
        if (borderEnabled && trackType === borderTrackType) {
          const geometryType = geometry.getType();
          if (geometryType === "Polygon") {
            const ring = (geometry as unknown as { getCoordinates(): [number, number][][] })
              .getCoordinates()[0] as [number, number][];
            result += `<polygon points="${polylineSvg(ring)}" fill="${escapeAttr(fillColor)}" stroke="${escapeAttr(strokeColor)}" stroke-width="${strokeWidth}" />`;
          } else if (geometryType === "LineString") {
            const line = (geometry as unknown as { getCoordinates(): [number, number][] })
              .getCoordinates() as [number, number][];
            result += `<polyline points="${polylineSvg(line)}" fill="none" stroke="${escapeAttr(strokeColor)}" stroke-width="${strokeWidth}" />`;
          }
        } else if (namesEnabled && trackType === namesTrackType) {
          if (geometry.getType() !== "Point") {
            continue;
          }
          const point = (geometry as unknown as { getCoordinates(): [number, number] })
            .getCoordinates();
          const [x, y] = toSvgPoint(point);
          const labelText = labelExtractor(feature.get("name"));
          result += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" fill="${escapeAttr(labelColor)}" font-size="${labelSize}" font-family="${escapeAttr(toFontFamily(featureSource))}" font-weight="${featureSource.getLabelBold() ? "bold" : "normal"}" ${labelStroke}>${escapeXml(labelText)}</text>`;
        }
      }
      return result;
    };
    const extractFeatureName = (raw: unknown): string => {
      const value = String(raw ?? "");
      const firstDash = value.indexOf("-");
      const secondDash = value.lastIndexOf("-bp");
      if (firstDash >= 0 && secondDash > firstDash) {
        return value.slice(firstDash + 1, secondDash);
      }
      return value;
    };

    let svg = "";
    svg += renderTrackFeatures(
      contigTrack,
      flags.contigBorders,
      flags.contigNames,
      "contigBorders",
      "contigNames",
      extractFeatureName
    );
    svg += renderTrackFeatures(
      scaffoldTrack,
      flags.scaffoldBorders,
      flags.scaffoldNames,
      "scaffoldBorders",
      "scaffoldNames",
      extractFeatureName
    );

    return svg;
  }

  private static escapeXml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  private async renderWorkspaceCompositeCanvas(
    backgroundColor?: string
  ): Promise<HTMLCanvasElement> {
    const workspace = document.querySelector(
      ".interactive-workspace"
    ) as HTMLElement | null;
    if (!workspace) {
      throw new Error("Cannot export composite: workspace is not available");
    }
    const { default: html2canvas } = await import("html2canvas");
    return html2canvas(workspace, {
      backgroundColor: backgroundColor ?? null,
      useCORS: true,
      scale: Math.min(2, window.devicePixelRatio || 1),
      logging: false,
    });
  }

  public dispose() {
    this.visualizationManager.dispose();
    this.linearTrackManager.dispose();
    this.clearOverviewMapTarget();
    this.viewAndLayersManager?.dispose?.();
    this.map.setTarget(undefined);
  }

  public addOSM() {
    this.map.addLayer(
      new TileLayer({
        source: new OSM(),
      })
    );
  }

  public addContrastSliderCallback(
    callbackfn: (ranges: CurrentSignalRangeResponse) => void
  ): void {
    this.viewAndLayersManager.addContrastSliderCallback(callbackfn);
  }

  public deactivateTranslocation(): void {
    // Deactivate selection:
    this.viewAndLayersManager.currentViewState.activeTool = undefined;
    this.viewAndLayersManager.selectionInteractions.translocationArrowHoverInteraction.setActive(
      false
    );
    this.viewAndLayersManager.selectionInteractions.translocationArrowSelectionInteraction.setActive(
      false
    );
    this.viewAndLayersManager.selectionInteractions.contigSelectionInteraction.setActive(
      true
    );
    this.viewAndLayersManager.selectionInteractions.contigSelectExtent.setActive(
      true
    );
    this.viewAndLayersManager.selectionInteractions.translocationArrowSelectionInteraction.unset(
      "startContigId"
    );
    this.viewAndLayersManager.selectionInteractions.translocationArrowSelectionInteraction.unset(
      "endContigId"
    );
  }

  public deactivateScissors(): void {
    // Deactivate selection:
    this.viewAndLayersManager.currentViewState.activeTool = undefined;
    this.viewAndLayersManager.deferredInitializationInteractions.scissorsGuideInteraction?.setActive(
      false
    );
    this.viewAndLayersManager.selectionInteractions.contigSelectionInteraction.setActive(
      true
    );
    this.viewAndLayersManager.selectionInteractions.contigSelectExtent.setActive(
      true
    );
  }

  public reloadVisuals(): void {
    this.viewAndLayersManager.reloadVisuals();
    void this.linearTrackManager.clearCachesAndRender();
    this.scheduleMinimapViewportSync();
  }

  public refreshOverviewMinimap(): void {
    this.scheduleMinimapViewportSync();
  }

  private createCoarsestMinimapLayer():
    | TileLayer<VersionedXYZContactMapSource>
    | null {
    if (this.viewAndLayersManager.resolutionTuples.length === 0) {
      return null;
    }
    const coarsestDescriptor = this.viewAndLayersManager.resolutionTuples.reduce(
      (accumulator, descriptor) =>
        descriptor.pixelResolution > accumulator.pixelResolution
          ? descriptor
          : accumulator
    );
    const layer = this.viewAndLayersManager.layersHolder.bpResolutionToHiCDataLayer.get(
      coarsestDescriptor.bpResolution
    );
    if (!(layer instanceof TileLayer)) {
      return null;
    }
    const source = layer.getSource();
    if (!(source instanceof VersionedXYZContactMapSource)) {
      return null;
    }
    return new TileLayer({
      source,
      preload: 0,
    });
  }

  private estimateMinimapResolution(
    projectionExtent: [number, number, number, number],
    target: HTMLElement
  ): number {
    const width = Math.max(1, target.clientWidth || 1);
    const height = Math.max(1, target.clientHeight || 1);
    const widthResolution = getWidth(projectionExtent) / width;
    const heightResolution = getHeight(projectionExtent) / height;
    const estimatedResolution = Math.max(widthResolution, heightResolution);
    return Number.isFinite(estimatedResolution) && estimatedResolution > 0
      ? estimatedResolution
      : 1;
  }

  private fitMinimapToFullExtent(): void {
    if (!this.minimap) {
      return;
    }
    const view = this.minimap.getView();
    const extent = view.getProjection().getExtent();
    const target = this.minimap.getTargetElement();
    if (!extent || !target) {
      return;
    }
    this.applyMinimapBackground(target);
    const extentTuple = extent as [number, number, number, number];
    view.setCenter(getCenter(extentTuple));
    view.setResolution(this.estimateMinimapResolution(extentTuple, target));
  }

  private bindMinimapPointerInteractions(target: HTMLElement): void {
    this.teardownMinimapPointerInteractions();
    target.style.cursor = "grab";
    target.style.touchAction = "none";

    const stopDragging = (pointerId?: number): void => {
      if (
        pointerId != null &&
        this.minimapDragPointerId != null &&
        pointerId !== this.minimapDragPointerId
      ) {
        return;
      }
      if (pointerId != null && target.hasPointerCapture?.(pointerId)) {
        try {
          target.releasePointerCapture(pointerId);
        } catch {
          // Ignore stale pointer capture state during teardown.
        }
      }
      this.minimapDragPointerId = null;
      target.style.cursor = "grab";
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || !this.minimap) {
        return;
      }
      this.minimapDragPointerId = event.pointerId;
      target.style.cursor = "grabbing";
      try {
        target.setPointerCapture?.(event.pointerId);
      } catch {
        // Some browsers may reject capture during rapid target swaps.
      }
      event.preventDefault();
      this.recenterMainViewFromMinimapEvent(event);
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (this.minimapDragPointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      this.recenterMainViewFromMinimapEvent(event);
    };

    const onPointerUp = (event: PointerEvent): void => {
      if (this.minimapDragPointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      stopDragging(event.pointerId);
    };

    const onPointerCancel = (event: PointerEvent): void => {
      stopDragging(event.pointerId);
    };

    const onWheel = (event: WheelEvent): void => {
      if (!this.minimap) {
        return;
      }
      event.preventDefault();
      this.zoomMainViewFromMinimapEvent(event);
    };

    target.addEventListener("pointerdown", onPointerDown);
    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp);
    target.addEventListener("pointercancel", onPointerCancel);
    target.addEventListener("wheel", onWheel, { passive: false });

    this.minimapPointerCleanup = [
      () => target.removeEventListener("pointerdown", onPointerDown),
      () => target.removeEventListener("pointermove", onPointerMove),
      () => target.removeEventListener("pointerup", onPointerUp),
      () => target.removeEventListener("pointercancel", onPointerCancel),
      () => target.removeEventListener("wheel", onWheel),
      () => stopDragging(),
      () => {
        target.style.removeProperty("cursor");
        target.style.removeProperty("touch-action");
      },
    ];
  }

  private teardownMinimapPointerInteractions(): void {
    if (this.minimapPointerCleanup.length === 0) {
      this.minimapDragPointerId = null;
      return;
    }
    this.minimapPointerCleanup.forEach((cleanup) => cleanup());
    this.minimapPointerCleanup = [];
    this.minimapDragPointerId = null;
  }

  private scheduleMinimapViewportSync(): void {
    if (this.minimapRenderFramePending) {
      return;
    }
    this.minimapRenderFramePending = true;
    window.requestAnimationFrame(() => {
      this.minimapRenderFramePending = false;
      this.syncMinimapViewport();
    });
  }

  private resolveMainCoordinateFromMinimapEvent(
    event: MouseEvent | PointerEvent | WheelEvent
  ): [number, number] | null {
    if (!this.minimap) {
      return null;
    }
    const minimapView = this.minimap.getView();
    const minimapProjection = minimapView.getProjection();
    const minimapBounds = minimapProjection.getExtent();
    if (!minimapBounds) {
      return null;
    }
    const minimapCoordinate = this.minimap.getEventCoordinate(event);
    if (
      !Array.isArray(minimapCoordinate) ||
      minimapCoordinate.length < 2 ||
      !minimapCoordinate.every((value) => Number.isFinite(value))
    ) {
      return null;
    }
    const clampedCoordinate = this.clampCoordinateToBounds(
      minimapCoordinate as [number, number],
      this.getMinimapVisibleBounds(
        minimapBounds as [number, number, number, number]
      )
    );
    const mainProjection = this.map.getView().getProjection();
    const transformedCoordinate = transform(
      clampedCoordinate,
      minimapProjection,
      mainProjection
    ) as [number, number];
    if (!transformedCoordinate.every((value) => Number.isFinite(value))) {
      return null;
    }
    return transformedCoordinate;
  }

  private recenterMainViewFromMinimapEvent(
    event: MouseEvent | PointerEvent | WheelEvent
  ): boolean {
    const nextCenter = this.resolveMainCoordinateFromMinimapEvent(event);
    if (!nextCenter) {
      return false;
    }
    this.map.getView().setCenter(nextCenter);
    return true;
  }

  private zoomMainViewFromMinimapEvent(event: WheelEvent): void {
    const mainView = this.map.getView();
    const nextCenter = this.resolveMainCoordinateFromMinimapEvent(event);
    const currentResolution = mainView.getResolution();
    if (!nextCenter || !Number.isFinite(currentResolution ?? NaN)) {
      return;
    }
    const resolutionRatio = event.deltaY > 0 ? 1.25 : 0.8;
    const minResolution = mainView.getMinResolution() ?? currentResolution ?? 1;
    const maxResolution = mainView.getMaxResolution() ?? currentResolution ?? 1;
    const nextResolution = Math.max(
      minResolution,
      Math.min(maxResolution, (currentResolution ?? 1) * resolutionRatio)
    );
    mainView.cancelAnimations();
    mainView.setCenter(nextCenter);
    mainView.setResolution(nextResolution);
  }

  private syncMinimapViewport(): void {
    if (!this.minimap || !this.minimapViewportFeature) {
      return;
    }
    const minimapTarget = this.minimap.getTargetElement();
    if (minimapTarget) {
      this.applyMinimapBackground(minimapTarget);
    }
    const minimapView = this.minimap.getView();
    const minimapProjection = minimapView.getProjection();
    const minimapProjectionExtent = minimapProjection.getExtent();
    if (!minimapProjectionExtent) {
      return;
    }
    const mainMapSize = this.map.getSize();
    if (!mainMapSize) {
      return;
    }
    const mainView = this.map.getView();
    const mainCenter = mainView.getCenter();
    const mainResolution = mainView.getResolution();
    if (
      !mainCenter ||
      mainCenter.length < 2 ||
      !mainCenter.every((value) => Number.isFinite(value)) ||
      mainResolution === undefined ||
      !Number.isFinite(mainResolution)
    ) {
      return;
    }
    const mainExtent = mainView.calculateExtent(mainMapSize);
    const transformedMainExtent = transformExtent(
      mainExtent,
      mainView.getProjection(),
      minimapProjection
    );
    if (!transformedMainExtent.every((value) => Number.isFinite(value))) {
      return;
    }
    const clampedExtent = this.clampExtentToBounds(
      transformedMainExtent as [number, number, number, number],
      minimapProjectionExtent as [number, number, number, number]
    );
    this.minimapViewportFeature.setGeometry(fromExtent(clampedExtent));
    this.minimap.render();
  }

  private applyMinimapBackground(target: HTMLElement): void {
    const color = useStyleStore().mapBackgroundColor.RGB;
    target.style.backgroundColor = color;
  }

  private getMinimapVisibleBounds(
    bounds: [number, number, number, number]
  ): [number, number, number, number] {
    const minimapResolution = this.minimap?.getView().getResolution() ?? 1;
    // Keep the viewport stroke inside the minimap projection. Vector strokes
    // clipped exactly at the projection boundary become invisible at map edges.
    const inset = Math.max(1e-6, Math.abs(minimapResolution) * 5);
    const maxInsetX = Math.max(0, (getWidth(bounds) - 1e-6) / 2);
    const maxInsetY = Math.max(0, (getHeight(bounds) - 1e-6) / 2);
    const insetX = Math.min(inset, maxInsetX);
    const insetY = Math.min(inset, maxInsetY);
    return [
      bounds[0] + insetX,
      bounds[1] + insetY,
      bounds[2] - insetX,
      bounds[3] - insetY,
    ];
  }

  private clampCoordinateToBounds(
    coordinate: [number, number],
    bounds: [number, number, number, number]
  ): [number, number] {
    return [
      Math.max(bounds[0], Math.min(bounds[2], coordinate[0])),
      Math.max(bounds[1], Math.min(bounds[3], coordinate[1])),
    ];
  }

  private clampExtentToBounds(
    extent: [number, number, number, number],
    bounds: [number, number, number, number]
  ): [number, number, number, number] {
    const visibleBounds = this.getMinimapVisibleBounds(bounds);
    if (!intersects(extent, bounds)) {
      return visibleBounds;
    }
    const visibleWidth = Math.max(1e-6, getWidth(visibleBounds));
    const visibleHeight = Math.max(1e-6, getHeight(visibleBounds));
    const minimapResolution = Math.abs(this.minimap?.getView().getResolution() ?? 1);
    const minimumVisibleSize = Math.max(1e-6, minimapResolution * 4);
    const requestedWidth = Math.max(1e-6, extent[2] - extent[0]);
    const requestedHeight = Math.max(1e-6, extent[3] - extent[1]);
    const width = Math.min(
      visibleWidth,
      Math.max(requestedWidth, minimumVisibleSize)
    );
    const height = Math.min(
      visibleHeight,
      Math.max(requestedHeight, minimumVisibleSize)
    );
    const clamp = (value: number, minValue: number, maxValue: number): number =>
      Math.max(minValue, Math.min(maxValue, value));
    const centerX = clamp(
      (extent[0] + extent[2]) / 2,
      visibleBounds[0] + width / 2,
      visibleBounds[2] - width / 2
    );
    const centerY = clamp(
      (extent[1] + extent[3]) / 2,
      visibleBounds[1] + height / 2,
      visibleBounds[3] - height / 2
    );
    return [
      centerX - width / 2,
      centerY - height / 2,
      centerX + width / 2,
      centerY + height / 2,
    ];
  }
}

export { ContactMapManager /*, type ContactMapManagerOptions*/ };
