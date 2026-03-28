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
import Fill from "ol/style/Fill";
import Stroke from "ol/style/Stroke";
import Style from "ol/style/Style";
import { transformExtent } from "ol/proj";
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
      style: new Style({
        stroke: new Stroke({
          color: "rgba(220,38,38,0.95)",
          width: 2,
        }),
        fill: new Fill({
          color: "rgba(220,38,38,0.10)",
        }),
      }),
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
    const imageSize =
      this.viewAndLayersManager.imageSizes[descriptor.imageSizeIndex];
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
    const tilesPerSide = Math.ceil(imageSize / tileSize);
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

    const width = imageSize;
    const height = imageSize;
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
            svgImages.push(
              `<image x=\"${x}\" y=\"${y}\" width=\"${tileWidth}\" height=\"${tileHeight}\" href=\"${escapeAttr(data.image)}\" />`
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

  public async exportCurrentMapSvg(
    progressCallback?: (progress: number) => void,
    options?: {
      backgroundColor?: string;
      metadata?: Record<string, unknown>;
      includeWorkspaceComposite?: boolean;
    }
  ): Promise<void> {
    const svg = await this.buildCurrentMapSvg(progressCallback, options);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.download = `${this.options.filename}.svg`;
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  }

  public async exportCurrentMapPng(
    progressCallback?: (progress: number) => void,
    options?: {
      backgroundColor?: string;
      metadata?: Record<string, unknown>;
      includeWorkspaceComposite?: boolean;
    }
  ): Promise<void> {
    if (options?.includeWorkspaceComposite ?? true) {
      const canvas = await this.renderWorkspaceCompositeCanvas(
        options?.backgroundColor
      );
      progressCallback?.(1);
      await new Promise<void>((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            resolve();
            return;
          }
          const a = document.createElement("a");
          a.download = `${this.options.filename}.png`;
          a.href = URL.createObjectURL(blob);
          a.click();
          URL.revokeObjectURL(a.href);
          resolve();
        }, "image/png");
      });
      return;
    }

    const svg = await this.buildCurrentMapSvg(progressCallback, options);
    const svgBlob = new Blob([svg], { type: "image/svg+xml" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const image = new Image();
    const descriptor =
      this.viewAndLayersManager.currentViewState.resolutionDesciptor;
    const imageSize =
      this.viewAndLayersManager.imageSizes[descriptor.imageSizeIndex];

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = (e) => reject(e);
      image.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = imageSize;
    canvas.height = imageSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(svgUrl);
      throw new Error("Cannot export PNG: canvas not available");
    }
    ctx.drawImage(image, 0, 0);

    await new Promise<void>((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve();
          return;
        }
        const a = document.createElement("a");
        a.download = `${this.options.filename}.png`;
        a.href = URL.createObjectURL(blob);
        a.click();
        URL.revokeObjectURL(a.href);
        resolve();
      }, "image/png");
    });
    URL.revokeObjectURL(svgUrl);
  }

  public async exportCurrentMapPdf(
    progressCallback?: (progress: number) => void,
    options?: {
      backgroundColor?: string;
      metadata?: Record<string, unknown>;
      includeWorkspaceComposite?: boolean;
    }
  ): Promise<void> {
    if (options?.includeWorkspaceComposite ?? true) {
      const canvas = await this.renderWorkspaceCompositeCanvas(
        options?.backgroundColor
      );
      progressCallback?.(1);
      const dataUrl = canvas.toDataURL("image/png");
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({
        orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
        unit: "px",
        format: [canvas.width, canvas.height],
      });
      pdf.addImage(dataUrl, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save(`${this.options.filename}.pdf`);
      return;
    }

    const svg = await this.buildCurrentMapSvg(progressCallback, options);
    const svgBlob = new Blob([svg], { type: "image/svg+xml" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const image = new Image();
    const descriptor =
      this.viewAndLayersManager.currentViewState.resolutionDesciptor;
    const imageSize =
      this.viewAndLayersManager.imageSizes[descriptor.imageSizeIndex];

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = (e) => reject(e);
      image.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = imageSize;
    canvas.height = imageSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(svgUrl);
      throw new Error("Cannot export PDF: canvas not available");
    }
    ctx.drawImage(image, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    const { jsPDF } = await import("jspdf");
    const orientation = imageSize >= imageSize ? "landscape" : "portrait";
    const pdf = new jsPDF({
      orientation,
      unit: "px",
      format: [imageSize, imageSize],
    });
    pdf.addImage(dataUrl, "PNG", 0, 0, imageSize, imageSize);
    pdf.save(`${this.options.filename}.pdf`);
    URL.revokeObjectURL(svgUrl);
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
    const prefixPx = this.contigDimensionHolder.prefix_sum_px.get(bpResolution);
    if (!prefixPx) {
      return "";
    }

    const measureCanvas =
      typeof document !== "undefined"
        ? document.createElement("canvas")
        : null;
    const measureCtx = measureCanvas?.getContext("2d") ?? null;
    const measureLabelWidth = (text: string, font: string): number => {
      if (!measureCtx) return text.length * 6;
      measureCtx.font = font;
      return measureCtx.measureText(text).width;
    };
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

    let svg = "";

    if (flags.contigBorders || flags.contigNames) {
      const borderStyle = contigTrack.getStyleType();
      const strokeColor = contigTrack.options.borderColor as string;
      const labelColor = contigTrack.getLabelColor() as string;
      const strokeWidth = contigTrack.options.width;
      const fillColor = contigTrack.options.fillColor as string;
      const labelSize = contigTrack.getLabelSize();
      const labelOffset = labelSize * contigTrack.getLabelOffsetMultiplier();
      const namePlacement = contigTrack.getNamePlacement();
      const labelFont = toFont(contigTrack);
      const labelStroke = contigTrack.getLabelOutline()
        ? `stroke="rgba(0,0,0,0.9)" stroke-width="${contigTrack.getLabelOutlineWidth()}" paint-order="stroke fill" stroke-linejoin="round"`
        : "";
      for (let i = 0; i < this.contigDimensionHolder.contigDescriptors.length; i++) {
        const cd = this.contigDimensionHolder.contigDescriptors[i];
        const startPx = prefixPx[i] ?? 0;
        const lenBins = cd.contigLengthBins.get(bpResolution) ?? 0;
        const endPx = startPx + lenBins;
        if (endPx <= startPx) continue;
        if (flags.contigBorders) {
          if (borderStyle === 0) {
            svg += `<rect x="${startPx}" y="${startPx}" width="${lenBins}" height="${lenBins}" fill="${escapeAttr(fillColor)}" stroke="${escapeAttr(strokeColor)}" stroke-width="${strokeWidth}" />`;
          } else if (borderStyle === 1) {
            svg += `<polyline points="${startPx},${startPx} ${endPx},${startPx} ${endPx},${endPx}" fill="none" stroke="${escapeAttr(strokeColor)}" stroke-width="${strokeWidth}" />`;
          } else if (borderStyle === 2) {
            svg += `<polyline points="${endPx},${endPx} ${startPx},${endPx} ${startPx},${startPx}" fill="none" stroke="${escapeAttr(strokeColor)}" stroke-width="${strokeWidth}" />`;
          }
        }
        if (flags.contigNames) {
          const rectWidth = endPx - startPx;
          const labelWidth = measureLabelWidth(cd.contigName, labelFont);
          if (rectWidth > 0 && labelWidth < rectWidth * 0.9) {
            let labelY = (startPx + endPx) / 2;
            if (namePlacement === 0) {
              labelY = startPx - labelOffset;
            } else if (namePlacement === 1) {
              labelY = endPx + labelOffset;
            }
            const midPx = (startPx + endPx) / 2;
            svg += `<text x="${midPx}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" fill="${escapeAttr(labelColor)}" font-size="${labelSize}" font-family="${escapeAttr(toFontFamily(contigTrack))}" font-weight="${contigTrack.getLabelBold() ? "bold" : "normal"}" ${labelStroke}>${escapeXml(cd.contigName)}</text>`;
          }
        }
      }
    }

    if (flags.scaffoldBorders || flags.scaffoldNames) {
      const borderStyle = scaffoldTrack.getStyleType();
      const strokeColor = scaffoldTrack.options.borderColor as string;
      const labelColor = scaffoldTrack.getLabelColor() as string;
      const strokeWidth = scaffoldTrack.options.width;
      const fillColor = scaffoldTrack.options.fillColor as string;
      const labelSize = scaffoldTrack.getLabelSize();
      const labelOffset = labelSize * scaffoldTrack.getLabelOffsetMultiplier();
      const namePlacement = scaffoldTrack.getNamePlacement();
      const labelFont = toFont(scaffoldTrack);
      const labelStroke = scaffoldTrack.getLabelOutline()
        ? `stroke="rgba(0,0,0,0.9)" stroke-width="${scaffoldTrack.getLabelOutlineWidth()}" paint-order="stroke fill" stroke-linejoin="round"`
        : "";
      for (const sd of this.scaffoldHolder.scaffoldTable.values()) {
        const borders = sd.scaffoldBordersBP;
        if (!borders) continue;
        const startPx = this.contigDimensionHolder.getPxContainingBp(
          borders.startBP,
          bpResolution
        );
        const endPx = this.contigDimensionHolder.getPxContainingBp(
          borders.endBP,
          bpResolution
        );
        if (endPx <= startPx) continue;
        const lenBins = endPx - startPx;
        if (flags.scaffoldBorders) {
          if (borderStyle === 0) {
            svg += `<rect x="${startPx}" y="${startPx}" width="${lenBins}" height="${lenBins}" fill="${escapeAttr(fillColor)}" stroke="${escapeAttr(strokeColor)}" stroke-width="${strokeWidth}" />`;
          } else if (borderStyle === 1) {
            svg += `<polyline points="${startPx},${startPx} ${endPx},${startPx} ${endPx},${endPx}" fill="none" stroke="${escapeAttr(strokeColor)}" stroke-width="${strokeWidth}" />`;
          } else if (borderStyle === 2) {
            svg += `<polyline points="${endPx},${endPx} ${startPx},${endPx} ${startPx},${startPx}" fill="none" stroke="${escapeAttr(strokeColor)}" stroke-width="${strokeWidth}" />`;
          }
        }
        if (flags.scaffoldNames) {
          const rectWidth = endPx - startPx;
          const labelWidth = measureLabelWidth(sd.scaffoldName, labelFont);
          if (rectWidth > 0 && labelWidth < rectWidth * 0.9) {
            let labelY = (startPx + endPx) / 2;
            if (namePlacement === 0) {
              labelY = startPx - labelOffset;
            } else if (namePlacement === 1) {
              labelY = endPx + labelOffset;
            }
            const midPx = (startPx + endPx) / 2;
            svg += `<text x="${midPx}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" fill="${escapeAttr(labelColor)}" font-size="${labelSize}" font-family="${escapeAttr(toFontFamily(scaffoldTrack))}" font-weight="${scaffoldTrack.getLabelBold() ? "bold" : "normal"}" ${labelStroke}>${escapeXml(sd.scaffoldName)}</text>`;
          }
        }
      }
    }

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
    const extentTuple = extent as [number, number, number, number];
    view.setCenter(getCenter(extentTuple));
    view.setResolution(this.estimateMinimapResolution(extentTuple, target));
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

  private syncMinimapViewport(): void {
    if (!this.minimap || !this.minimapViewportFeature) {
      return;
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
    const mainExtent = this.map.getView().calculateExtent(mainMapSize);
    const transformedMainExtent = transformExtent(
      mainExtent,
      this.map.getView().getProjection(),
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

  private clampExtentToBounds(
    extent: [number, number, number, number],
    bounds: [number, number, number, number]
  ): [number, number, number, number] {
    if (!intersects(extent, bounds)) {
      return bounds;
    }
    const clamp = (value: number, minValue: number, maxValue: number): number =>
      Math.max(minValue, Math.min(maxValue, value));
    let left = clamp(extent[0], bounds[0], bounds[2]);
    let right = clamp(extent[2], bounds[0], bounds[2]);
    let bottom = clamp(extent[1], bounds[1], bounds[3]);
    let top = clamp(extent[3], bounds[1], bounds[3]);
    if (right <= left) {
      right = Math.min(bounds[2], left + 1);
      left = Math.max(bounds[0], right - 1);
    }
    if (top <= bottom) {
      top = Math.min(bounds[3], bottom + 1);
      bottom = Math.max(bounds[1], top - 1);
    }
    return [left, bottom, right, top];
  }
}

export { ContactMapManager /*, type ContactMapManagerOptions*/ };
