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

import { MapEvent } from "ol";
import {
  buildRulerTicks,
  type RulerInterval,
  type RulerTick,
} from "./rulerTicks";
import { placeFloatingPanel } from "../visualization/floatingPanel";
import { Control } from "ol/control";
import { Options as ControlOptions } from "ol/control/Control";
import { ContactMapManager } from "../mapmanagers/ContactMapManager";
import {
  HiCViewAndLayersManager,
  LayerResolutionDescriptor,
} from "../mapmanagers/HiCViewAndLayersManager";
import ContigDimensionHolder from "../mapmanagers/ContigDimensionHolder";
import { transform } from "ol/proj";
import { storeToRefs } from "pinia";
import { useStyleStore } from "@/app/stores/styleStore";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import { Ref } from "vue";
import { ColorTranslator } from "colortranslator";

interface Options extends ControlOptions {
  // position: "top" | "bottom" | "left" | "right";
  direction: "vertical" | "horizontal";
  mapManager: ContactMapManager;
}

const DEFAULT_CANVAS_SIZE = 200;
/** Labels keep at least this many pixels between their drawn extent and the canvas edge. */
const EDGE_MARGIN_PX = 2;

interface EntityBand {
  start: number;
  end: number;
  label: string;
  count: number;
}

interface SequenceBreak {
  screen: number;
  bp: number;
  count: number;
}

interface RulerLayout extends ReturnType<typeof buildRulerTicks> {
  contigs: EntityBand[];
  scaffolds: EntityBand[];
  breaks: SequenceBreak[];
}

class RulerControl extends Control {
  protected readonly canvas: HTMLCanvasElement;
  protected readonly mapManager: ContactMapManager;
  protected readonly viewAndLayersManager: HiCViewAndLayersManager;
  protected readonly contigDimensionHolder: ContigDimensionHolder;
  protected readonly tooltip: HTMLDivElement;
  private layout?: RulerLayout;

  protected readonly mapBackgroundColor: Ref<ColorTranslator>;
  protected readonly rulerCoordinateMode: Ref<"global" | "contig" | "scaffold">;

  public readonly canvasSize: number[];
  public readonly direction: "vertical" | "horizontal";

  public constructor(public readonly opt_options: Options) {
    const canvas = document.createElement("canvas");
    const tooltip = document.createElement("div");
    tooltip.className = "hict-ruler-tooltip";
    // Lives on <body> with fixed positioning so it can cover the map instead
    // of being clipped by the narrow ruler container.
    Object.assign(tooltip.style, {
      position: "fixed",
      left: "0px",
      top: "0px",
      zIndex: "1065",
      width: "max-content",
      maxWidth: "min(300px, calc(100vw - 24px))",
      padding: "6px 8px",
      borderRadius: "6px",
      border: "1px solid rgba(17, 24, 39, 0.35)",
      background: "rgba(17, 24, 39, 0.9)",
      color: "rgba(244, 247, 252, 0.98)",
      fontSize: "11px",
      lineHeight: "1.25",
      pointerEvents: "none",
      boxShadow: "0 6px 20px rgba(0, 0, 0, 0.28)",
      display: "none",
    });
    let canvasSize: number[];

    if (opt_options.target) {
      const parent =
        typeof opt_options.target === "string" ||
        opt_options.target instanceof String
          ? document.getElementById(opt_options.target as string)
          : (opt_options.target as HTMLElement);
      if (parent) {
        parent.appendChild(canvas);
        parent.style.position ||= "relative";
      } else {
        throw new Error(
          "Cannot find parent element for RulerControl with target " +
            opt_options.target
        );
      }
      const dim = parent.getBoundingClientRect();
      canvasSize = [Math.floor(dim.width), Math.floor(dim.height)];
    } else {
      const mapSize = opt_options.mapManager.getMap().getSize() as [
        number,
        number
      ];
      switch (opt_options.direction) {
        case "vertical":
          canvasSize = [DEFAULT_CANVAS_SIZE, mapSize[1]];
          break;
        case "horizontal":
          canvasSize = [mapSize[0], DEFAULT_CANVAS_SIZE];
          break;
      }
    }
    const newOptions = {
      ...opt_options,
      ...{
        element: canvas,
      },
    };
    super(newOptions);
    this.canvas = canvas;
    this.tooltip = tooltip;
    this.mapManager = opt_options.mapManager;
    this.viewAndLayersManager = this.mapManager.getLayersManager();
    this.contigDimensionHolder = this.mapManager.getContigDimensionHolder();
    this.direction = opt_options.direction;

    const stylesStore = useStyleStore();
    const { mapBackgroundColor } = storeToRefs(stylesStore);
    const uiSettingsStore = useUiSettingsStore();
    const { rulerCoordinateMode } = storeToRefs(uiSettingsStore);

    this.mapBackgroundColor = mapBackgroundColor as Ref<ColorTranslator>;
    this.rulerCoordinateMode = rulerCoordinateMode;

    this.canvasSize = canvasSize;
    this.canvas.addEventListener("mousemove", (event) =>
      this.showRulerTooltip(event)
    );
    this.canvas.addEventListener("mouseleave", () => this.hideRulerTooltip());
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  /** Hands the position under the pointer to the workspace, which owns the menu UI. */
  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    this.hideRulerTooltip();
    const hover = this.resolveRulerHover(event.offsetX, event.offsetY);
    if (!hover) return;
    window.dispatchEvent(
      new CustomEvent("hict:ruler-context-menu", {
        detail: {
          clientX: event.clientX,
          clientY: event.clientY,
          bp: hover.bp,
          direction: this.direction,
        },
      })
    );
  };

  render(mapEvent: MapEvent) {
    //this.updateCanvasSize();
    const map = mapEvent.map;
    const parent = this.canvas.parentElement;
    const width = parent
      ? Math.max(1, Math.floor(parent.clientWidth))
      : this.canvasSize[0];
    const height = parent
      ? Math.max(1, Math.floor(parent.clientHeight))
      : this.canvasSize[1];
    this.canvas.width = width;
    this.canvas.height = height;
    const context = this.canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.layout = undefined;

    const mapView = map.getView();

    const resolutionDescriptor =
      this.viewAndLayersManager.currentViewState.resolutionDesciptor;

    const activeHiCLayer = this.viewAndLayersManager.getActiveHiCDataLayer();
    const mapSize = map.getSize();
    const center = mapView.getCenter();
    const pixelResolution = mapView.getResolution();
    if (
      !mapSize ||
      !center ||
      center.length < 2 ||
      !center.every((value) => Number.isFinite(value)) ||
      pixelResolution === undefined ||
      !Number.isFinite(pixelResolution)
    ) {
      return;
    }
    const extent = mapView.calculateExtent(mapSize);
    const targetProjection = activeHiCLayer.getSource()?.getProjection();

    if (!targetProjection) {
      return;
    }

    const ps = this.contigDimensionHolder.prefix_sum_px.get(
      resolutionDescriptor.bpResolution
    );
    if (!ps) {
      return;
    }
    const pixelMapSize = ps[ps.length - 1];

    const layerPixelResolution = Number.isFinite(
      resolutionDescriptor.pixelResolution
    )
      ? resolutionDescriptor.pixelResolution
      : 1;
    const fraction1 =
      layerPixelResolution > 0 ? pixelResolution / layerPixelResolution : 1;

    const fixed_coordinates = transform(
      extent,
      map.getView().getProjection(),
      targetProjection
    ).map((c) => c / pixelResolution);

    const leftmostMapPx = -fixed_coordinates[0];
    const rightmostMapPx = fixed_coordinates[2];
    const topmostMapPx = fixed_coordinates[3];
    const bottommostMapPx = -fixed_coordinates[1];

    const mapBoxPixelCoordinates = {
      left: leftmostMapPx,
      right: rightmostMapPx,
      top: topmostMapPx,
      bottom: bottommostMapPx,
    };

    const visibleMapBoxExtentPixel = {
      left: Math.max(0, leftmostMapPx),
      right: Math.min(
        mapBoxPixelCoordinates.left + pixelMapSize / fraction1,
        this.canvas.width
      ),
      top: Math.max(0, topmostMapPx),
      bottom: Math.min(
        mapBoxPixelCoordinates.top + pixelMapSize / fraction1,
        this.canvas.height
      ),
    };
    if (
      !Number.isFinite(visibleMapBoxExtentPixel.left) ||
      !Number.isFinite(visibleMapBoxExtentPixel.right) ||
      !Number.isFinite(visibleMapBoxExtentPixel.top) ||
      !Number.isFinite(visibleMapBoxExtentPixel.bottom)
    ) {
      return;
    }

    const scopePixelBounds = this.viewAndLayersManager.getActiveMapPixelBounds(
      resolutionDescriptor.bpResolution
    );
    const scopedVisibleExtentPixel = this.getScopedVisibleRulerExtent({
      mapBoxPixelCoordinates,
      visibleMapBoxExtentPixel,
      fraction: fraction1,
      scopePixelBounds,
    });
    if (!scopedVisibleExtentPixel) {
      return;
    }

    // console.log(
    //   //   "Got extent",
    //   //   extent,
    //   "transformed into",
    //   extentInTargetProjection.map(Math.round),
    //   "fixedCoordinates",
    //   fixed_coordinates.map(Math.round),
    //   "mapBoxPixelCoordinates",
    //   mapBoxPixelCoordinates,
    //   "visibleMapBoxExtentPixel",
    //   visibleMapBoxExtentPixel,
    //   "mapViewResolution",
    //   mapView.getResolution(),
    //   "layerResolution",
    //   activeHiCLayer.get("pixelResolution"),
    //   "mapViewZoom",
    //   mapView.getZoom(),
    //   "resolutionBorders",
    //   resolutionDescriptor.layerResolutionBorders,
    //   "fraction1",
    //   fraction1
    // );

    const horizontal = this.direction === "horizontal";
    const depth = horizontal ? this.canvas.height : this.canvas.width;
    const axisStart = scopedVisibleExtentPixel.start;
    const axisEnd = scopedVisibleExtentPixel.end;
    const mapStartScreen = horizontal
      ? mapBoxPixelCoordinates.left
      : mapBoxPixelCoordinates.top;
    const { mainStroke } = this.getRulerStrokeColors();
    context.strokeStyle = mainStroke;
    context.lineWidth = 1;
    context.beginPath();
    if (horizontal) {
      context.moveTo(axisStart, depth - 0.5);
      context.lineTo(axisEnd, depth - 0.5);
    } else {
      context.moveTo(depth - 0.5, axisStart);
      context.lineTo(depth - 0.5, axisEnd);
    }
    context.stroke();

    this.layout = this.getRulerLayout({
      axisStart,
      axisEnd,
      mapStartScreen,
      fraction: fraction1,
      pixelMapSize,
      resolutionDescriptor,
    });
    this.drawRulerTicks(
      context,
      this.layout.ticks,
      this.layout.unit,
      axisStart,
      axisEnd
    );
    this.drawEntityBands(context, this.layout);
  }

  private updateCanvasSize(): void {
    const parent = this.canvas.parentElement;
    if (parent) {
      const dim = parent.getBoundingClientRect();
      const newWidth = Math.max(1, Math.floor(dim.width));
      const newHeight = Math.max(1, Math.floor(dim.height));
      this.canvasSize[0] = newWidth;
      this.canvasSize[1] = newHeight;
      return;
    }
    const mapSize = this.mapManager.getMap().getSize() as [number, number];
    if (!mapSize) return;
    if (this.direction === "vertical") {
      this.canvasSize[0] = DEFAULT_CANVAS_SIZE;
      this.canvasSize[1] = mapSize[1];
    } else {
      this.canvasSize[0] = mapSize[0];
      this.canvasSize[1] = DEFAULT_CANVAS_SIZE;
    }
  }

  private showRulerTooltip(event: MouseEvent): void {
    const horizontal = this.direction === "horizontal";
    const axis = horizontal ? event.offsetX : event.offsetY;
    const depth = horizontal ? event.offsetY : event.offsetX;
    const gap =
      depth < 13
        ? this.layout?.breaks.find((item) => Math.abs(item.screen - axis) < 6)
        : undefined;
    const band = this.layout?.contigs.find(
      (item) => item.count > 1 && axis >= item.start && axis < item.end
    );
    const locus = this.resolveRulerHover(event.offsetX, event.offsetY)?.html;
    const details = gap
      ? `${this.formatInteger(gap.bp)} bp hidden across ${gap.count} ${
          gap.count === 1 ? "contig" : "contigs"
        }`
      : band && locus
      ? `<strong>${band.count} contigs</strong><br />${locus}`
      : locus;
    if (!details) {
      this.hideRulerTooltip();
      return;
    }
    // Rulers are rendered manually rather than added to the map, so the
    // body-level tooltip is attached only while hovering (nothing leaks when
    // a map is replaced).
    if (!this.tooltip.isConnected) document.body.appendChild(this.tooltip);
    this.tooltip.innerHTML = details;
    this.tooltip.style.display = "block";
    const rect = this.tooltip.getBoundingClientRect();
    const position = placeFloatingPanel(
      event.clientX,
      event.clientY,
      rect.width,
      rect.height,
      window.innerWidth,
      window.innerHeight
    );
    this.tooltip.style.left = `${Math.round(position.left)}px`;
    this.tooltip.style.top = `${Math.round(position.top)}px`;
  }

  private hideRulerTooltip(): void {
    this.tooltip.style.display = "none";
    this.tooltip.remove();
  }

  protected override disposeInternal(): void {
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    this.tooltip.remove();
    super.disposeInternal();
  }

  private getScopedVisibleRulerExtent(options: {
    mapBoxPixelCoordinates: {
      left: number;
      top: number;
    };
    visibleMapBoxExtentPixel: {
      left: number;
      right: number;
      top: number;
      bottom: number;
    };
    fraction: number;
    scopePixelBounds: {
      colStartPx: number;
      colEndPx: number;
      rowStartPx: number;
      rowEndPx: number;
    };
  }): { start: number; end: number } | null {
    const axisIsHorizontal = this.direction === "horizontal";
    const mapStartScreen = axisIsHorizontal
      ? options.mapBoxPixelCoordinates.left
      : options.mapBoxPixelCoordinates.top;
    const visibleStart = axisIsHorizontal
      ? options.visibleMapBoxExtentPixel.left
      : options.visibleMapBoxExtentPixel.top;
    const visibleEnd = axisIsHorizontal
      ? options.visibleMapBoxExtentPixel.right
      : options.visibleMapBoxExtentPixel.bottom;
    const scopeStartPx = axisIsHorizontal
      ? options.scopePixelBounds.colStartPx
      : options.scopePixelBounds.rowStartPx;
    const scopeEndPx = axisIsHorizontal
      ? options.scopePixelBounds.colEndPx
      : options.scopePixelBounds.rowEndPx;
    const scopeStartScreen = mapStartScreen + scopeStartPx / options.fraction;
    const scopeEndScreen = mapStartScreen + scopeEndPx / options.fraction;
    const start = Math.max(
      visibleStart,
      Math.min(scopeStartScreen, scopeEndScreen)
    );
    const end = Math.min(
      visibleEnd,
      Math.max(scopeStartScreen, scopeEndScreen)
    );
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return null;
    }
    return { start, end };
  }

  private resolveRulerHover(
    offsetX: number,
    offsetY: number
  ): { html: string; bp: number } | null {
    const map = this.mapManager.getMap();
    const mapSize = map.getSize();
    if (!mapSize) {
      return null;
    }
    const mapView = map.getView();
    const center = mapView.getCenter();
    const pixelResolution = mapView.getResolution();
    if (
      !center ||
      center.length < 2 ||
      !center.every((value) => Number.isFinite(value)) ||
      pixelResolution === undefined ||
      !Number.isFinite(pixelResolution)
    ) {
      return null;
    }
    const resolutionDescriptor =
      this.viewAndLayersManager.currentViewState.resolutionDesciptor;
    const activeHiCLayer = this.viewAndLayersManager.getActiveHiCDataLayer();
    const targetProjection =
      activeHiCLayer.getSource()?.getProjection() ?? mapView.getProjection();
    const ps = this.contigDimensionHolder.prefix_sum_px.get(
      resolutionDescriptor.bpResolution
    );
    if (!ps) {
      return null;
    }
    const pixelMapSize = ps[ps.length - 1];
    const fixed = transform(
      mapView.calculateExtent(mapSize),
      mapView.getProjection(),
      targetProjection
    ).map((coordinate) => coordinate / pixelResolution);
    const layerPixelResolution = Number.isFinite(
      resolutionDescriptor.pixelResolution
    )
      ? resolutionDescriptor.pixelResolution
      : 1;
    const fraction =
      layerPixelResolution > 0 ? pixelResolution / layerPixelResolution : 1;
    const horizontal = this.direction === "horizontal";
    const mapStartScreen = horizontal ? -fixed[0] : fixed[3];
    const axisOffset = horizontal ? offsetX : offsetY;
    const unclampedPx = (axisOffset - mapStartScreen) * fraction;
    if (unclampedPx < 0 || unclampedPx >= pixelMapSize) return null;
    const px = Math.floor(unclampedPx);
    const scopePixelBounds = this.viewAndLayersManager.getActiveMapPixelBounds(
      resolutionDescriptor.bpResolution
    );
    const scopeStartPx =
      this.direction === "horizontal"
        ? scopePixelBounds.colStartPx
        : scopePixelBounds.rowStartPx;
    const scopeEndPx =
      this.direction === "horizontal"
        ? scopePixelBounds.colEndPx
        : scopePixelBounds.rowEndPx;
    if (px < scopeStartPx || px >= scopeEndPx) {
      return null;
    }
    const bp = Math.floor(
      this.contigDimensionHolder.getFractionalBpOfPx(
        unclampedPx,
        resolutionDescriptor.bpResolution
      )
    );
    const bin = this.contigDimensionHolder.pixelToBin(
      px,
      resolutionDescriptor.bpResolution
    );
    const contig = this.contigDimensionHolder.getContigLocusByBp(bp);
    const scaffold = this.mapManager.scaffoldHolder.getScaffoldLocusByBp(bp);
    const scaffoldLine = scaffold
      ? `Scaffold: ${this.escapeHtml(
          scaffold.scaffoldName
        )} +${this.formatInteger(scaffold.inScaffoldBp)} bp`
      : "Scaffold: n/a";
    const source = this.contigDimensionHolder.getSourceLocusByBp(bp);
    const html = [
      `<strong>${
        this.direction === "horizontal" ? "Horizontal" : "Vertical"
      } ruler</strong>`,
      `Assembly: ${this.formatInteger(bp)} bp, bin ${this.formatInteger(
        bin
      )}, px ${this.formatInteger(px)}`,
      `Contig: ${this.escapeHtml(contig.contigName)} +${this.formatInteger(
        contig.inContigBp
      )} bp`,
      scaffoldLine,
      `Source: ${this.escapeHtml(source.sourceContig)}:${this.formatInteger(
        source.sourceBp
      )} bp`,
    ].join("<br />");
    return { html, bp };
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  private formatInteger(value: number): string {
    return Math.round(value).toLocaleString();
  }

  private getRulerLayout(options: {
    axisStart: number;
    axisEnd: number;
    mapStartScreen: number;
    fraction: number;
    pixelMapSize: number;
    resolutionDescriptor: LayerResolutionDescriptor;
  }): RulerLayout {
    const { axisStart, axisEnd, mapStartScreen, fraction, pixelMapSize } =
      options;
    const resolution = options.resolutionDescriptor.bpResolution;
    const holder = this.contigDimensionHolder;
    const prefix = holder.prefix_sum_px.get(resolution);
    const intervals: RulerInterval[] = [];
    const contigs: EntityBand[] = [];
    const scaffolds: EntityBand[] = [];
    const breaks: SequenceBreak[] = [];
    const empty = { ticks: [], unit: "bp", contigs, scaffolds, breaks };
    if (
      !prefix ||
      !holder.contig_count ||
      !Number.isFinite(fraction) ||
      fraction <= 0
    )
      return empty;
    const visibleStart = Math.max(0, (axisStart - mapStartScreen) * fraction);
    const visibleEnd = Math.min(
      pixelMapSize,
      (axisEnd - mapStartScreen) * fraction
    );
    if (visibleEnd <= visibleStart) return empty;

    const first =
      visibleStart === 0
        ? 0
        : holder.getContigOrderByPx(visibleStart, resolution);
    const last =
      visibleEnd === pixelMapSize
        ? holder.contig_count - 1
        : holder.getContigOrderByPx(Math.ceil(visibleEnd) - 1, resolution);
    const mode = this.rulerCoordinateMode.value;
    let scaffoldId: number | undefined;
    let hiddenBp = 0;
    let hiddenCount = 0;
    const screenAt = (pixel: number) => mapStartScreen + pixel / fraction;
    const appendBreak = (screen: number) => {
      if (!hiddenCount) return;
      const previous = breaks[breaks.length - 1];
      if (previous && screen - previous.screen < 8) {
        previous.count += hiddenCount;
        previous.bp += hiddenBp;
      } else {
        breaks.push({ screen, count: hiddenCount, bp: hiddenBp });
      }
      hiddenBp = hiddenCount = 0;
      scaffoldId = undefined;
    };
    for (let index = first; index <= last; index++) {
      const contigStart = holder.prefix_sum_bp[index];
      const contigEnd = holder.prefix_sum_bp[index + 1];
      if (prefix[index] === prefix[index + 1]) {
        hiddenBp += contigEnd - contigStart;
        hiddenCount++;
        continue;
      }
      const startPx = Math.max(visibleStart, prefix[index]);
      const endPx = Math.min(visibleEnd, prefix[index + 1]);
      if (endPx <= startPx) continue;
      const start = screenAt(startPx);
      const end = screenAt(endPx);
      appendBreak(start);
      const contig = holder.contigDescriptors[index];
      this.appendContigBand(contigs, {
        start,
        end,
        label: contig.contigName,
        count: 1,
      });
      const scaffold =
        this.mapManager.scaffoldHolder.getScaffoldLocusByBp(contigStart);
      if (!scaffold) {
        scaffoldId = undefined;
      } else if (scaffold.scaffoldId === scaffoldId) {
        scaffolds[scaffolds.length - 1].end = end;
      } else {
        scaffolds.push({ start, end, label: scaffold.scaffoldName, count: 1 });
        scaffoldId = scaffold.scaffoldId;
      }

      if (mode !== "global" && end - start < 3) continue;
      const startBp =
        startPx === prefix[index]
          ? contigStart
          : Math.max(
              contigStart,
              Math.ceil(holder.getFractionalBpOfPx(startPx, resolution))
            );
      const endBp =
        endPx === prefix[index + 1]
          ? contigEnd
          : Math.min(
              contigEnd,
              Math.ceil(holder.getFractionalBpOfPx(endPx, resolution))
            );
      const originBp =
        mode === "global"
          ? 0
          : mode === "contig"
          ? contigStart
          : scaffold?.startBp ?? contigStart;
      intervals.push({ startBp, endBp, originBp });
    }
    appendBreak(screenAt(visibleEnd));
    const projected = buildRulerTicks(
      intervals,
      fraction * resolution,
      axisStart,
      axisEnd,
      (bp) => screenAt(holder.getFractionalPxOfBp(bp, resolution))
    );
    return { ...projected, contigs, scaffolds, breaks };
  }

  private appendContigBand(bands: EntityBand[], band: EntityBand): void {
    const previous = bands[bands.length - 1];
    if (
      band.end - band.start < 3 &&
      previous &&
      previous.end === band.start &&
      (previous.count > 1 || previous.end - previous.start < 3)
    ) {
      previous.end = band.end;
      previous.count++;
    } else {
      bands.push(band);
    }
  }

  private drawEntityBands(
    context: CanvasRenderingContext2D,
    layout: RulerLayout
  ): void {
    const horizontal = this.direction === "horizontal";
    const depth = horizontal ? this.canvas.height : this.canvas.width;
    const bands = [layout.contigs, layout.scaffolds];
    const { mainStroke } = this.getRulerStrokeColors();
    context.save();
    this.setFillStrokeContrastColors(context);
    context.strokeStyle = mainStroke;
    context.font = "10px HiCT Sans";
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (let row = 0; row < bands.length; row++) {
      const offset = horizontal ? depth - 41 - row * 14 : 24 - row * 14;
      for (const band of bands[row]) {
        const width = band.end - band.start;
        context.globalAlpha = row === 0 ? 0.14 : 0.22;
        if (horizontal)
          context.fillRect(band.start, offset, Math.max(1, width - 1), 12);
        else context.fillRect(offset, band.start, 12, Math.max(1, width - 1));
        const label = band.count > 1 ? `${band.count} contigs` : band.label;
        if (width < context.measureText(label).width + 6) continue;
        context.globalAlpha = 1;
        const center = (band.start + band.end) / 2;
        if (horizontal) {
          context.fillText(label, center, offset + 6);
        } else {
          context.save();
          context.translate(offset + 6, center);
          context.rotate(-Math.PI / 2);
          context.fillText(label, 0, 0);
          context.restore();
        }
      }
    }

    context.globalAlpha = 1;
    context.beginPath();
    for (const gap of layout.breaks) {
      const screen = gap.screen;
      if (horizontal) {
        context.moveTo(screen - 4, 3);
        context.lineTo(screen - 1, 9);
        context.moveTo(screen + 1, 3);
        context.lineTo(screen + 4, 9);
      } else {
        context.moveTo(2, screen - 4);
        context.lineTo(8, screen - 1);
        context.moveTo(2, screen + 1);
        context.lineTo(8, screen + 4);
      }
    }
    context.stroke();
    context.restore();
  }

  private drawRulerTicks(
    context: CanvasRenderingContext2D,
    ticks: readonly RulerTick[],
    unit: string,
    axisStart: number,
    axisEnd: number
  ): void {
    if (!ticks.length) return;
    const horizontal = this.direction === "horizontal";
    const axisLength = horizontal ? this.canvas.width : this.canvas.height;
    const depth = horizontal ? this.canvas.height : this.canvas.width;
    const { mainStroke } = this.getRulerStrokeColors();
    context.save();
    context.strokeStyle = mainStroke;
    context.lineWidth = 1;
    context.beginPath();
    for (const tick of ticks) {
      const length = tick.major ? 9 : 5;
      if (horizontal) {
        context.moveTo(tick.screen, depth);
        context.lineTo(tick.screen, depth - length);
      } else {
        context.moveTo(depth, tick.screen);
        context.lineTo(depth - length, tick.screen);
      }
    }
    context.stroke();

    this.setFillStrokeContrastColors(context);
    context.font = "11px HiCT Sans";
    context.textBaseline = "middle";
    context.textAlign = "right";
    const unitWidth = context.measureText(unit).width;
    const unitEnd = Math.min(
      axisLength - EDGE_MARGIN_PX,
      Math.max(unitWidth + EDGE_MARGIN_PX, axisEnd)
    );
    const unitStart = unitEnd - unitWidth;
    const unitY = Math.max(EDGE_MARGIN_PX + 6, axisStart + 6);
    if (horizontal) context.fillText(unit, unitEnd, depth - 18);
    else context.fillText(unit, depth - 12, unitY);

    let labelEnd = horizontal ? -Infinity : unitY + 7;
    for (const tick of ticks) {
      if (!tick.major) continue;
      if (horizontal) {
        const width = context.measureText(tick.label).width;
        const center = Math.max(
          EDGE_MARGIN_PX + width / 2,
          Math.min(unitStart - width / 2 - 4, tick.screen)
        );
        const left = center - width / 2;
        if (left <= labelEnd + 3 || left + width > unitStart - 3) continue;
        context.textAlign = "center";
        context.fillText(tick.label, center, depth - 18);
        labelEnd = center + width / 2;
      } else {
        const center = Math.max(7, Math.min(axisLength - 7, tick.screen));
        if (center - 6 <= labelEnd + 2) continue;
        context.fillText(tick.label, depth - 12, center, depth - 52);
        labelEnd = center + 6;
      }
    }
    context.restore();
  }

  protected setFillStrokeContrastColors(
    context: CanvasRenderingContext2D
  ): void {
    const backgroundColor = this.mapBackgroundColor.value;
    const darkBackground = backgroundColor.L <= 55;
    context.fillStyle = darkBackground
      ? "rgba(248,250,252,0.96)"
      : "rgba(17,24,39,0.96)";
    context.strokeStyle = darkBackground
      ? "rgba(17,24,39,0.96)"
      : "rgba(248,250,252,0.96)";
  }

  private getRulerStrokeColors(): {
    mainStroke: string;
    outlineStroke: string;
  } {
    const backgroundColor = this.mapBackgroundColor.value;
    const darkBackground = backgroundColor.L <= 55;
    if (darkBackground) {
      return {
        mainStroke: "rgba(248,250,252,0.95)",
        outlineStroke: "rgba(15,23,42,0.75)",
      };
    }
    return {
      mainStroke: "rgba(15,23,42,0.9)",
      outlineStroke: "rgba(248,250,252,0.8)",
    };
  }
}

export { RulerControl, type Options };
