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
import { ScaleLine, OverviewMap, ZoomSlider } from "ol/control";
import { DoubleClickZoom, DragPan } from "ol/interaction";
import TileLayer from "ol/layer/Tile";
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
  public minimap: OverviewMap | null;

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
    this.map.addControl(
      new OverviewMap({
        collapsed: false,
        target: target,
        layers: this.viewAndLayersManager.layersHolder.hicDataLayers,
        collapsible: false,
      })
    );
  }

  public getOptions() {
    return this.options;
  }

  public getMap(): Map {
    return this.map;
  }

  public getMiniMap(): OverviewMap {
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
  }

  public async reloadTilesFromBackend(): Promise<void> {
    const version = await this.networkManager.requestManager.reloadTilesVersion();
    this.viewAndLayersManager.reloadTiles(version);
    void this.linearTrackManager.clearCachesAndRender();
  }

  private async buildCurrentMapSvg(
    progressCallback?: (progress: number) => void,
    options?: {
      backgroundColor?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<string> {
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
    }
  ): Promise<void> {
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
    }
  ): Promise<void> {
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

  public dispose() {
    this.linearTrackManager.dispose();
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
  }
}

export { ContactMapManager /*, type ContactMapManagerOptions*/ };
