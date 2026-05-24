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
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import { Ref } from "vue";
import Colormap from "../visualization/colormap/Colormap";
import { ColorTranslator } from "colortranslator";

interface Options extends ControlOptions {
  // position: "top" | "bottom" | "left" | "right";
  direction: "vertical" | "horizontal";
  mapManager: ContactMapManager;
}

const DEFAULT_CANVAS_SIZE = 200;

interface RulerTick {
  screen: number;
  mapPx: number;
  bp: number;
  label: string;
  major: boolean;
  boundary?: "start" | "end";
}

class RulerControl extends Control {
  protected readonly canvas: HTMLCanvasElement;
  protected readonly mapManager: ContactMapManager;
  protected readonly viewAndLayersManager: HiCViewAndLayersManager;
  protected readonly contigDimensionHolder: ContigDimensionHolder;
  protected readonly tooltip: HTMLDivElement;

  protected readonly mapBackgroundColor: Ref<ColorTranslator>;
  protected readonly colormap: Ref<Colormap>;

  public readonly canvasSize: number[];
  public readonly direction: "vertical" | "horizontal";

  public constructor(public readonly opt_options: Options) {
    const canvas = document.createElement("canvas");
    const tooltip = document.createElement("div");
    tooltip.className = "hict-ruler-tooltip";
    Object.assign(tooltip.style, {
      position: "absolute",
      zIndex: "18",
      maxWidth: "250px",
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
        parent.appendChild(tooltip);
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

    const visualizationOptionsStore = useVisualizationOptionsStore();
    const { colormap } = storeToRefs(visualizationOptionsStore);
    const stylesStore = useStyleStore();
    const { mapBackgroundColor } = storeToRefs(stylesStore);

    this.colormap = colormap;
    this.mapBackgroundColor = mapBackgroundColor as Ref<ColorTranslator>;

    this.canvasSize = canvasSize;
    this.canvas.addEventListener("mousemove", (event) =>
      this.showRulerTooltip(event)
    );
    this.canvas.addEventListener("mouseleave", () => this.hideRulerTooltip());
  }

  render(mapEvent: MapEvent) {
    //this.updateCanvasSize();
    const map = mapEvent.map;
    const parent = this.canvas.parentElement;
    const width = parent ? Math.max(1, Math.floor(parent.clientWidth)) : this.canvasSize[0];
    const height = parent ? Math.max(1, Math.floor(parent.clientHeight)) : this.canvasSize[1];
    this.canvas.width = width;
    this.canvas.height = height;
    const context = this.canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const mapView = map.getView();

    const resolutionDescriptor =
      this.viewAndLayersManager.currentViewState.resolutionDesciptor;

    const activeHiCLayer = this.viewAndLayersManager.getActiveHiCDataLayer();
    const extent = mapView.calculateExtent(map.getSize());
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

    const pixelResolution = mapView.getResolution() ?? 1;

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
      left: Math.round(leftmostMapPx),
      right: Math.round(rightmostMapPx),
      top: Math.round(topmostMapPx),
      bottom: Math.round(bottommostMapPx),
    };

    const visibleMapBoxExtentPixel = {
      left: Math.round(Math.max(0, leftmostMapPx)),
      right: Math.round(
        Math.min(
          mapBoxPixelCoordinates.left + pixelMapSize / fraction1,
          this.canvas.width
        )
      ),
      top: Math.round(Math.max(0, topmostMapPx)),
      bottom: Math.round(
        Math.min(
          mapBoxPixelCoordinates.top + pixelMapSize / fraction1,
          this.canvas.height
        )
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

    const [start, end, deltaDir]: [
      [number, number],
      [number, number],
      [number, number]
    ] = (() => {
      switch (this.opt_options.direction) {
        case "vertical":
          return [
            [Math.round(this.canvas.width), visibleMapBoxExtentPixel.top],
            [Math.round(this.canvas.width), visibleMapBoxExtentPixel.bottom],
            [0, 1],
          ];
        case "horizontal":
          return [
            [visibleMapBoxExtentPixel.left, Math.round(this.canvas.height)],
            [visibleMapBoxExtentPixel.right, Math.round(this.canvas.height)],
            [1, 0],
          ];
      }
    })();

    // TODO: Fix this part so that ruler is not overlaid by something else:
    /*
    if ((end[0] - start[0]) * deltaDir[0] + (end[1] - start[1]) * deltaDir[1]) {
      start[0] += (this.canvas.width / 20) * deltaDir[0];
      start[1] += (this.canvas.height / 20) * deltaDir[1];
      end[0] -= (this.canvas.width / 20) * deltaDir[0];
      end[1] -= (this.canvas.height / 20) * deltaDir[1];
    }
    */

    // const startX = visibleMapBoxExtentPixel.left;
    // const endX = visibleMapBoxExtentPixel.right;
    // const y0 = Math.round(this.canvas.height / 2);
    // context.save();
    const { mainStroke, outlineStroke } = this.getRulerStrokeColors();
    context.strokeStyle = outlineStroke;
    context.lineWidth = 10;
    context.beginPath();
    context.moveTo(start[0], start[1]);
    context.lineTo(end[0], end[1]);
    context.stroke();
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(start[0], start[1]);
    context.lineTo(end[0], end[1]);
    context.strokeStyle = mainStroke;
    context.stroke();
    // context.reset();

    // context.lineWidth = 7;
    // context.beginPath();
    // context.moveTo(
    //   this.canvas.width * deltaDir[1],
    //   this.canvas.height * deltaDir[0]
    // );
    // context.lineTo(this.canvas.width, this.canvas.height);
    // context.strokeStyle = "white";
    // context.stroke();
    // context.lineWidth = 5;
    // context.beginPath();
    // context.moveTo(
    //   this.canvas.width * deltaDir[1],
    //   this.canvas.height * deltaDir[0]
    // );
    // context.lineTo(this.canvas.width, this.canvas.height);
    // context.strokeStyle = "black";
    // context.stroke();

    const axisStart = this.direction === "horizontal" ? start[0] : start[1];
    const axisEnd = this.direction === "horizontal" ? end[0] : end[1];
    const mapStartScreen =
      this.direction === "horizontal"
        ? mapBoxPixelCoordinates.left
        : mapBoxPixelCoordinates.top;
    const ticks = this.buildVisibleRulerTicks({
      axisStart,
      axisEnd,
      mapStartScreen,
      fraction: fraction1,
      pixelMapSize,
      resolutionDescriptor,
    });
    for (const tick of ticks) {
      this.drawRulerTick(context, tick, start, deltaDir);
    }
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
    const details = this.resolveRulerHoverDetails(event.offsetX, event.offsetY);
    if (!details) {
      this.hideRulerTooltip();
      return;
    }
    const parent = this.canvas.parentElement;
    if (!parent) {
      return;
    }
    const left = Math.min(
      Math.max(6, event.offsetX + 12),
      Math.max(6, parent.clientWidth - 260)
    );
    const top = Math.min(
      Math.max(6, event.offsetY + 12),
      Math.max(6, parent.clientHeight - 86)
    );
    this.tooltip.innerHTML = details;
    this.tooltip.style.left = `${Math.round(left)}px`;
    this.tooltip.style.top = `${Math.round(top)}px`;
    this.tooltip.style.display = "block";
  }

  private hideRulerTooltip(): void {
    this.tooltip.style.display = "none";
  }

  private resolveRulerHoverDetails(offsetX: number, offsetY: number): string | null {
    const map = this.mapManager.getMap();
    const mapSize = map.getSize();
    if (!mapSize) {
      return null;
    }
    const mapView = map.getView();
    const resolutionDescriptor =
      this.viewAndLayersManager.currentViewState.resolutionDesciptor;
    const activeHiCLayer = this.viewAndLayersManager.getActiveHiCDataLayer();
    const targetProjection =
      activeHiCLayer.getSource()?.getProjection() ?? mapView.getProjection();
    const pixelResolution = mapView.getResolution() ?? 1;
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
    const mapBoxPixelCoordinates = {
      left: Math.round(-fixed[0]),
      top: Math.round(fixed[3]),
    };
    const visibleStart =
      this.direction === "horizontal"
        ? Math.round(Math.max(0, -fixed[0]))
        : Math.round(Math.max(0, fixed[3]));
    const axisOffset = this.direction === "horizontal" ? offsetX : offsetY;
    const unclampedPx =
      Math.round(
        axisOffset -
          visibleStart -
          Math.min(
            0,
            this.direction === "horizontal"
              ? mapBoxPixelCoordinates.left
              : mapBoxPixelCoordinates.top
          )
      ) * fraction;
    const px = Math.max(0, Math.min(pixelMapSize - 1, Math.round(unclampedPx)));
    const bp = this.contigDimensionHolder.getStartBpOfPx(
      px,
      resolutionDescriptor.bpResolution
    );
    const bin = this.contigDimensionHolder.pixelToBin(
      px,
      resolutionDescriptor.bpResolution
    );
    const contig = this.contigDimensionHolder.getContigLocusByBp(bp);
    const scaffold = this.mapManager.scaffoldHolder.getScaffoldLocusByBp(bp);
    const scaffoldLine = scaffold
      ? `Scaffold: ${this.escapeHtml(scaffold.scaffoldName)} +${this.formatInteger(scaffold.inScaffoldBp)} bp`
      : "Scaffold: n/a";
    const source = this.contigDimensionHolder.getSourceLocusByBp(bp);
    return [
      `<strong>${this.direction === "horizontal" ? "Horizontal" : "Vertical"} ruler</strong>`,
      `Assembly: ${this.formatInteger(bp)} bp, bin ${this.formatInteger(bin)}, px ${this.formatInteger(px)}`,
      `Contig: ${this.escapeHtml(contig.contigName)} +${this.formatInteger(contig.inContigBp)} bp`,
      scaffoldLine,
      `Source: ${this.escapeHtml(source.sourceContig)}:${this.formatInteger(source.sourceBp)} bp`,
    ].join("<br />");
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

  private buildVisibleRulerTicks(options: {
    axisStart: number;
    axisEnd: number;
    mapStartScreen: number;
    fraction: number;
    pixelMapSize: number;
    resolutionDescriptor: LayerResolutionDescriptor;
  }): RulerTick[] {
    const axisStart = Math.round(Math.min(options.axisStart, options.axisEnd));
    const axisEnd = Math.round(Math.max(options.axisStart, options.axisEnd));
    const axisSpan = axisEnd - axisStart;
    if (axisSpan <= 0) {
      return [];
    }

    const spacing = 100;
    const screens: number[] = [axisStart];
    for (let screen = axisStart + spacing; screen < axisEnd - 42; screen += spacing) {
      screens.push(Math.round(screen));
    }
    if (axisEnd - screens[screens.length - 1] >= 34) {
      screens.push(axisEnd);
    } else {
      screens[screens.length - 1] = axisEnd;
    }

    const mapPxValues = screens.map((screen) =>
      this.screenPositionToMapPx(
        screen,
        options.mapStartScreen,
        options.fraction,
        options.pixelMapSize
      )
    );
    const bpValues = mapPxValues.map((mapPx) =>
      this.contigDimensionHolder.getStartBpOfPx(
        mapPx,
        options.resolutionDescriptor.bpResolution
      )
    );
    const maxBp = Math.max(...bpValues, 0);
    const labelUnit = this.absoluteLabelUnit(maxBp);
    let currentAnchor = this.roundDownToUnit(bpValues[0] ?? 0, labelUnit);
    return screens.map((screen, index) => {
      const bp = bpValues[index] ?? 0;
      const mapPx = mapPxValues[index] ?? 0;
      const anchor = this.roundDownToUnit(bp, labelUnit);
      const boundary =
        index === 0 ? "start" : index === screens.length - 1 ? "end" : undefined;
      const major = boundary !== undefined || anchor !== currentAnchor;
      if (major) {
        currentAnchor = anchor;
      }
      const delta = Math.max(0, Math.round(bp - currentAnchor));
      return {
        screen,
        mapPx,
        bp,
        major,
        boundary,
        label:
          major || delta <= 0
            ? this.formatBpLabel(anchor, 0)
            : `+${this.formatBpLabel(delta, 0)}`,
      };
    });
  }

  private screenPositionToMapPx(
    screenPosition: number,
    mapStartScreen: number,
    fraction: number,
    pixelMapSize: number
  ): number {
    const raw = Math.round((screenPosition - mapStartScreen) * fraction);
    return Math.max(0, Math.min(Math.max(0, pixelMapSize - 1), raw));
  }

  private drawRulerTick(
    context: CanvasRenderingContext2D,
    tick: RulerTick,
    start: [number, number],
    deltaDir: [number, number]
  ): void {
    const majorTickLength = Math.max(
      8,
      Math.min(16, Math.min(this.canvas.width, this.canvas.height) * 0.24)
    );
    const minorTickLength = Math.max(5, majorTickLength * 0.62);
    const tickLength = tick.major ? majorTickLength : minorTickLength;
    const coord: [number, number] =
      this.direction === "horizontal"
        ? [tick.screen, start[1]]
        : [start[0], tick.screen];

    const { mainStroke, outlineStroke } = this.getRulerStrokeColors();
    context.strokeStyle = outlineStroke;
    context.lineWidth = tick.major ? 5 : 4;
    context.beginPath();
    context.moveTo(coord[0], coord[1]);
    context.lineTo(
      coord[0] - tickLength * deltaDir[1],
      coord[1] - tickLength * deltaDir[0]
    );
    context.stroke();
    context.strokeStyle = mainStroke;
    context.lineWidth = tick.major ? 2.5 : 1.8;
    context.beginPath();
    context.moveTo(coord[0], coord[1]);
    context.lineTo(
      coord[0] - tickLength * deltaDir[1],
      coord[1] - tickLength * deltaDir[0]
    );
    context.stroke();

    const fontSize = tick.major ? 11 : 9;
    const font = `${tick.major ? "bold" : "normal"} ${fontSize}px sans-serif`;
    if (this.direction === "horizontal") {
      const textX = this.clamp(
        tick.boundary === "start"
          ? tick.screen + 2
          : tick.boundary === "end"
            ? tick.screen - 2
            : tick.screen,
        4,
        this.canvas.width - 4
      );
      const textAlign: CanvasTextAlign =
        tick.boundary === "start"
          ? "left"
          : tick.boundary === "end"
            ? "right"
            : "center";
      this.drawRotatedText(
        tick.label,
        textX,
        Math.max(9, coord[1] - tickLength - 3),
        context,
        tick.boundary ? 0 : -35,
        font,
        textAlign,
        true,
        false
      );
      return;
    }

    const textY = this.clamp(tick.screen + fontSize / 2, fontSize + 1, this.canvas.height - 3);
    this.drawRotatedText(
      tick.label,
      Math.max(2, coord[0] - tickLength - 4),
      textY,
      context,
      0,
      font,
      "right",
      true,
      false
    );
  }

  private formatBpLabel(bp: number, precision: number): string {
    const value = Math.max(0, Math.round(bp));
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

  private absoluteLabelUnit(maxBp: number): number {
    if (maxBp >= 1_000_000_000) {
      return 1_000_000_000;
    }
    if (maxBp >= 1_000_000) {
      return 1_000_000;
    }
    if (maxBp >= 1_000) {
      return 1_000;
    }
    return 1;
  }

  private roundDownToUnit(bp: number, unit: number): number {
    const safeUnit = Math.max(1, Math.round(unit));
    return Math.floor(Math.max(0, Math.round(bp)) / safeUnit) * safeUnit;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  protected drawRotatedText(
    text: string,
    x: number,
    y: number,
    context: CanvasRenderingContext2D,
    angleDeg: number,
    font: string,
    textAlign: CanvasTextAlign,
    stroke?: boolean,
    fillBackground?: boolean
  ): void {
    context.save();
    context.translate(x, y);
    context.rotate(angleDeg * (Math.PI / 180));
    context.font = font;
    context.textAlign = textAlign;

    const mt = context.measureText(text);

    if (fillBackground) {
      const backgroundColor = this.mapBackgroundColor.value;
      context.fillStyle = backgroundColor.RGB;
      context.fillRect(
        -5,
        5,
        mt.width + 5 + 5,
        -(mt.fontBoundingBoxAscent + 5)
      );
    }

    this.setFillStrokeContrastColors(context);

    if (stroke) {
      const fontSizeMatch = font.match(/(\d+(?:\.\d+)?)px/);
      const fontSize = fontSizeMatch ? Number.parseFloat(fontSizeMatch[1]) : 10;
      context.lineWidth = Math.max(2, fontSize / 5);
      context.strokeText(text, 0, 0);
    }
    context.fillText(text, 0, 0);

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
