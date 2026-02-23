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
import { transform, transformExtent } from "ol/proj";
import { toSI } from "display-si";
import { storeToRefs } from "pinia";
import { useStyleStore } from "@/app/stores/styleStore";
import { useVisualizationOptionsStore } from "@/app/stores/visualizationOptionsStore";
import { Ref } from "vue";
import Colormap from "../visualization/colormap/Colormap";
import { ColorTranslator } from "colortranslator";
import SimpleLinearGradient from "../visualization/colormap/SimpleLinearGradient";

interface Options extends ControlOptions {
  // position: "top" | "bottom" | "left" | "right";
  direction: "vertical" | "horizontal";
  mapManager: ContactMapManager;
}

const DEFAULT_CANVAS_SIZE = 200;

class RulerControl extends Control {
  protected readonly canvas: HTMLCanvasElement;
  protected readonly mapManager: ContactMapManager;
  protected readonly viewAndLayersManager: HiCViewAndLayersManager;
  protected readonly contigDimensionHolder: ContigDimensionHolder;

  protected readonly mapBackgroundColor: Ref<ColorTranslator>;
  protected readonly colormap: Ref<Colormap>;

  public readonly canvasSize: number[];
  public readonly direction: "vertical" | "horizontal";

  public constructor(public readonly opt_options: Options) {
    const canvas = document.createElement("canvas");
    let canvasSize: number[];

    if (opt_options.target) {
      const parent =
        typeof opt_options.target === "string" ||
        opt_options.target instanceof String
          ? document.getElementById(opt_options.target as string)
          : (opt_options.target as HTMLElement);
      if (parent) {
        parent?.appendChild(canvas);
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

    console.log("RulerControl constructor finished", this);
  }

  render(mapEvent: MapEvent) {
    //this.updateCanvasSize();
    const map = mapEvent.map;
    // const size = this.canvasSize; //map.getSize() as [number, number];
    this.canvas.width = this.canvasSize[0];
    this.canvas.height = this.canvasSize[1];
    const context = this.canvas.getContext("2d");
    console.log("Got context: ", context, "RulerControl: ", this);
    if (!context) return;
    console.log("Context available");

    context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const mapView = map.getView();

    const resolutionDescriptor =
      this.viewAndLayersManager.currentViewState.resolutionDesciptor;

    const activeHiCLayer = this.viewAndLayersManager.getActiveHiCDataLayer();
    const extent = mapView.calculateExtent(map.getSize());
    const mapProjection = mapView.getProjection();

    const targetProjection = activeHiCLayer.getSource()?.getProjection();

    if (!targetProjection) {
      console.log(
        "Active Hi-C layer",
        activeHiCLayer,
        "does not have a target projection set"
      );
      return;
    }

    const ps = this.contigDimensionHolder.prefix_sum_px.get(
      resolutionDescriptor.bpResolution
    );
    if (!ps) {
      console.log(
        "No prefix sum for current bpResolution??",
        resolutionDescriptor
      );
      return;
    }
    const pixelMapSize = ps[ps.length - 1];

    const extentInTargetProjection = transformExtent(
      extent,
      mapProjection,
      targetProjection
    );

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
          this.canvasSize[0]
        )
      ),
      top: Math.round(Math.max(0, topmostMapPx)),
      bottom: Math.round(
        Math.min(
          mapBoxPixelCoordinates.top + pixelMapSize / fraction1,
          this.canvasSize[1]
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
    this.setFillStrokeContrastColors(context);
    const strokeStyle = context.strokeStyle;
    context.strokeStyle = context.fillStyle;
    context.lineWidth = 10;
    context.beginPath();
    context.moveTo(start[0], start[1]);
    context.lineTo(end[0], end[1]);
    // context.moveTo(start[0] - 5 * deltaDir[0], start[1] - 5 * deltaDir[1]);
    // context.lineTo(end[0] - 5 * deltaDir[0], end[1] - 5 * deltaDir[1]);
    // context.moveTo(start[0] + 5 * deltaDir[0], start[1] + 5 * deltaDir[1]);
    // context.lineTo(end[0] + 5 * deltaDir[0], end[1] + 5 * deltaDir[1]);
    context.strokeStyle = "white";
    context.stroke();
    // context.strokeStyle = strokeStyle;
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(start[0], start[1]);
    context.lineTo(end[0], end[1]);
    context.strokeStyle = "black";
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

    console.log("start", start, "end", end, "deltaDir", deltaDir);

    const tickInterval = 50;

    {
      const TICK_SEMI_HEIGHT =
        Math.min(this.canvas.width, this.canvas.height) / 5;
      const FONT_SIZE_PX = Math.floor(
        Math.min(this.canvas.width, this.canvas.height) / 5
      );
      const FONT_STRING = `bold ${FONT_SIZE_PX}px serif`;
      const LAST_TICK_MARGIN = Math.round(tickInterval / 2);
      for (
        let coord: [number, number] = [start[0], start[1]];
        coord[0] < end[0] - LAST_TICK_MARGIN ||
        coord[1] < end[1] - LAST_TICK_MARGIN;
        coord[0] += deltaDir[0] * tickInterval,
          coord[1] += deltaDir[1] * tickInterval
      ) {
        // console.log(
        //   "start",
        //   start,
        //   "end",
        //   end,
        //   "deltaDir",
        //   deltaDir,
        //   "coord",
        //   coord
        // );
        this.drawTickAtPxOffset(
          context,
          resolutionDescriptor,
          coord,
          start,
          end,
          deltaDir,
          tickInterval,
          mapBoxPixelCoordinates,
          visibleMapBoxExtentPixel,
          fraction1,
          TICK_SEMI_HEIGHT,
          FONT_SIZE_PX,
          FONT_STRING
        );
      }
      this.drawTickAtPxOffset(
        context,
        resolutionDescriptor,
        end,
        start,
        end,
        deltaDir,
        tickInterval,
        mapBoxPixelCoordinates,
        visibleMapBoxExtentPixel,
        fraction1,
        TICK_SEMI_HEIGHT,
        FONT_SIZE_PX,
        FONT_STRING
      );
    }
    // Actually, if false, allows drawing smaller grid, currently disabled
    if (tickInterval < 0) {
      const TICK_SEMI_HEIGHT =
        Math.min(this.canvas.width, this.canvas.height) / 10;
      const FONT_SIZE_PX = Math.floor(
        Math.min(this.canvas.width, this.canvas.height) / 10
      );
      const FONT_STRING = `bold ${FONT_SIZE_PX}px serif`;

      const LAST_TICK_MARGIN = Math.round(tickInterval / 2);
      for (
        let coord: [number, number] = [
          start[0] + (tickInterval / 2) * deltaDir[0],
          start[1] + (tickInterval / 2) * deltaDir[1],
        ];
        coord[0] < end[0] - LAST_TICK_MARGIN ||
        coord[1] < end[1] - LAST_TICK_MARGIN;
        coord[0] += deltaDir[0] * tickInterval,
          coord[1] += deltaDir[1] * tickInterval
      ) {
        // console.log(
        //   "start",
        //   start,
        //   "end",
        //   end,
        //   "deltaDir",
        //   deltaDir,
        //   "coord",
        //   coord
        // );
        this.drawTickAtPxOffset(
          context,
          resolutionDescriptor,
          coord,
          start,
          end,
          deltaDir,
          tickInterval,
          mapBoxPixelCoordinates,
          visibleMapBoxExtentPixel,
          fraction1,
          TICK_SEMI_HEIGHT,
          FONT_SIZE_PX,
          FONT_STRING
        );
      }
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

  protected drawTickAtPxOffset(
    context: CanvasRenderingContext2D,
    resolutionDescriptor: LayerResolutionDescriptor,
    coord: [number, number],
    start: [number, number],
    end: [number, number],
    deltaDir: [number, number],
    tickInterval: number,
    mapBoxPixelCoordinates: {
      left: number;
      right: number;
      top: number;
      bottom: number;
    },
    visibleMapBoxExtentPixel: {
      left: number;
      right: number;
      top: number;
      bottom: number;
    },
    fraction1: number,
    TICK_SEMI_HEIGHT: number,
    FONT_SIZE_PX: number,
    FONT_STRING: string
  ): void {
    coord = coord.map(Math.round) as [number, number];

    const dPx = (() => {
      switch (this.opt_options.direction) {
        case "vertical":
          return (
            Math.round(
              coord[1] - start[1] - Math.min(0, mapBoxPixelCoordinates.top)
            ) * fraction1
          );
        case "horizontal":
          return (
            Math.round(
              coord[0] - start[0] - Math.min(0, mapBoxPixelCoordinates.left)
            ) * fraction1
          );
      }
    })();

    const dBp =
      dPx == 0
        ? 0
        : this.contigDimensionHolder.getStartBpOfPx(
            dPx,
            resolutionDescriptor.bpResolution
          ) -
          this.contigDimensionHolder.getStartBpOfPx(
            Math.max(
              0,
              Math.round(-Math.min(0, mapBoxPixelCoordinates.left)) * fraction1
            ),
            resolutionDescriptor.bpResolution
          );

    const [preBP, postBP] = (() => {
      if (dPx == 0) {
        return [
          0,
          this.contigDimensionHolder.getStartBpOfPx(
            0,
            resolutionDescriptor.bpResolution
          ),
        ];
      } else if (coord == end) {
        return [
          this.contigDimensionHolder.getStartBpOfPx(
            dPx - 1,
            resolutionDescriptor.bpResolution
          ),

          this.contigDimensionHolder.getStartBpOfPx(
            dPx + 100,
            resolutionDescriptor.bpResolution
          ),
        ];
      } else {
        return [
          this.contigDimensionHolder.getStartBpOfPx(
            dPx,
            resolutionDescriptor.bpResolution
          ),

          this.contigDimensionHolder.getStartBpOfPx(
            dPx,
            resolutionDescriptor.bpResolution
          ),
        ];
      }
    })();

    // console.log(
    //   this.opt_options.direction,
    //   "coord",
    //   coord,
    //   "dPx",
    //   dPx,
    //   "dBp",
    //   dBp,
    //   "pre",
    //   preBP,
    //   "post",
    //   postBP
    // );

    // this.setFillStrokeContrastColors(context);
    context.strokeStyle = "white";
    context.lineWidth = 6;
    context.beginPath();
    context.moveTo(
      coord[0] - TICK_SEMI_HEIGHT * deltaDir[1],
      coord[1] - TICK_SEMI_HEIGHT * deltaDir[0]
    );
    context.lineTo(
      coord[0] + TICK_SEMI_HEIGHT * deltaDir[1],
      coord[1] + TICK_SEMI_HEIGHT * deltaDir[0]
    );
    context.stroke();
    context.strokeStyle = "black";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(
      coord[0] - TICK_SEMI_HEIGHT * deltaDir[1],
      coord[1] - TICK_SEMI_HEIGHT * deltaDir[0]
    );
    context.lineTo(
      coord[0] + TICK_SEMI_HEIGHT * deltaDir[1],
      coord[1] + TICK_SEMI_HEIGHT * deltaDir[0]
    );
    context.stroke();

    const angleDeg = (() => {
      switch (this.opt_options.direction) {
        case "vertical":
          return 0;
        case "horizontal":
          return -45;
      }
    })();

    const textAlign = (() => {
      switch (this.opt_options.direction) {
        case "vertical":
          return "right";
        case "horizontal":
          return "left";
      }
    })();

    const fillBackground = this.opt_options.direction === "horizontal";

    if (postBP - preBP > resolutionDescriptor.bpResolution) {
      const SIStringPre = toSI(preBP); // + "bp";
      const SIStringPost = toSI(postBP); // + "bp";
      const mtPre = context.measureText(SIStringPre);
      //   const mtPost = context.measureText(SIStringPost);
      this.drawRotatedText(
        SIStringPre,
        Math.round(
          coord[0] -
            TICK_SEMI_HEIGHT * deltaDir[0] -
            (FONT_SIZE_PX + 5) * deltaDir[1]
        ),
        Math.round(
          coord[1] -
            TICK_SEMI_HEIGHT * deltaDir[1] -
            (FONT_SIZE_PX + 5) * deltaDir[0]
        ),
        context,
        angleDeg,
        FONT_STRING,
        textAlign,
        false,
        fillBackground
      );
      this.drawRotatedText(
        SIStringPost,
        Math.round(
          coord[0] +
            TICK_SEMI_HEIGHT * deltaDir[0] -
            (FONT_SIZE_PX + 5) * deltaDir[1]
        ),
        Math.round(
          coord[1] +
            TICK_SEMI_HEIGHT * deltaDir[1] -
            (FONT_SIZE_PX + 5) * deltaDir[0]
        ),
        context,
        angleDeg,
        FONT_STRING,
        textAlign,
        false,
        fillBackground
      );
    } else {
      const SIString = toSI(preBP); // + "bp";
      const mt = context.measureText(SIString);
      this.drawRotatedText(
        SIString,
        Math.round(
          coord[0] +
            (FONT_SIZE_PX / 3) * deltaDir[0] -
            (TICK_SEMI_HEIGHT + 5) * deltaDir[1]
        ),
        Math.round(
          coord[1] +
          (FONT_SIZE_PX / 3) * deltaDir[1] -
            (TICK_SEMI_HEIGHT + 5) * deltaDir[0]
        ),
        context,
        angleDeg,
        FONT_STRING,
        textAlign,
        false,
        fillBackground
      );
    }

    this.drawRotatedText(
      "+" + toSI(dBp), // + "bp",
      Math.round(coord[0] + (TICK_SEMI_HEIGHT + 5) * deltaDir[1]),
      Math.round(
        coord[1] + (TICK_SEMI_HEIGHT + FONT_SIZE_PX + 5) * deltaDir[0]
      ),
      context,
      0,
      FONT_STRING,
      "left",
      false,
      fillBackground
    );

    context.restore();
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

    context.fillText(text, 0, 0);
    if (stroke) {
      context.strokeText(text, 0, 0);
    }

    context.restore();
  }

  protected setFillStrokeContrastColors(
    context: CanvasRenderingContext2D
  ): void {
    const backgroundColor = this.mapBackgroundColor.value;

    const fillColor = new ColorTranslator(
      {
        H: (180 + backgroundColor.H) % 360.0,
        S: backgroundColor.S, // > 50 ? 30 : 70,
        L: backgroundColor.L > 50 ? 30 : 70,
        A: 1.0,
      },
      { legacyCSS: true }
    ).RGB;
    context.fillStyle = fillColor;

    const cmap = this.colormap.value;

    if (!(cmap instanceof SimpleLinearGradient)) {
      context.fillStyle = "black";
    } else {
      const cmapEndColor = cmap.endColorRGBA;
      const strokeColor = new ColorTranslator(
        {
          H: (180 + cmapEndColor.H) % 360.0,
          S: cmapEndColor.S, // > 50 ? 30 : 70,
          L: cmapEndColor.L > 50 ? 30 : 70,
          A: 1.0,
        },
        { legacyCSS: true }
      ).RGB;
      context.strokeStyle = strokeColor;
    }
  }
}

export { RulerControl, type Options };
