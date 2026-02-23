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

import type ContigDimensionHolder from "@/app/core/mapmanagers/ContigDimensionHolder";
import type { Color } from "ol/color";
import type { ColorLike } from "ol/colorlike";
import Feature from "ol/Feature";
import {
  MultiPolygon,
  Polygon,
  type Geometry,
  LineString,
  SimpleGeometry,
} from "ol/geom";
import Fill from "ol/style/Fill";
import Stroke from "ol/style/Stroke";
import Style from "ol/style/Style";
import Text from "ol/style/Text";
import Point from "ol/geom/Point";
import { ContigHideType } from "../domain/common";
import type { ContigDescriptor } from "../domain/ContigDescriptor";
import type { ContactMapManager } from "../mapmanagers/ContactMapManager";
import type { HiCViewAndLayersManager } from "../mapmanagers/HiCViewAndLayersManager";
import { Track2D } from "./Track2D";

type track2DSymmetricBorders = [startIncl: number, endExcl: number];

interface Track2DSymmetricDescriptor {
  name: string;
  features: Map<[resolution: number], Feature<Geometry>[]>;
}

interface BasePairsTrack2DSymmetricDescriptor {
  name: string;
  bordersBp: track2DSymmetricBorders[];
}

interface Track2DSymmetricOptions {
  borderColor: Color | ColorLike;
  fillColor: Color | ColorLike;
  width: number;
  zIndex: number;
  labelSize: number;
  labelOffsetMultiplier: number;
  labelBold: boolean;
  labelOutline: boolean;
  labelOutlineWidth: number;
}

export enum NamePlacement {
  CENTER = -1,
  TOP = 0,
  BOTTOM = 1,
  HIDDEN = 2,
}

abstract class Track2DSymmetric extends Track2D {
  public features: Map<number, Feature<Geometry>[]> = new Map();
  public options: Track2DSymmetricOptions;
  public style: Style;
  protected namePlacement: NamePlacement = NamePlacement.TOP;
  private static measureCanvas?: HTMLCanvasElement;

  public constructor(
    public readonly trackDescriptor: Track2DSymmetricDescriptor,
    public readonly contigDimensionHolder: ContigDimensionHolder,
    opt_options?: {
      borderColor?: Color | ColorLike;
      fillColor?: Color | ColorLike;
      width?: number | undefined;
      zIndex?: number | undefined;
      labelSize?: number | undefined;
      labelOffsetMultiplier?: number | undefined;
      labelBold?: boolean | undefined;
      labelOutline?: boolean | undefined;
      labelOutlineWidth?: number | undefined;
    }
  ) {
    super();
    this.options = {
      borderColor: opt_options?.borderColor ?? [0xff, 0xaa, 0xcc, 1.0],
      fillColor: opt_options?.fillColor ?? [0x77, 0x77, 0x77, 0.1],
      width: opt_options?.width ?? 2,
      zIndex: opt_options?.zIndex ?? 0,
      labelSize: opt_options?.labelSize ?? 12,
      labelOffsetMultiplier: opt_options?.labelOffsetMultiplier ?? 1.25,
      labelBold: opt_options?.labelBold ?? true,
      labelOutline: opt_options?.labelOutline ?? true,
      labelOutlineWidth: opt_options?.labelOutlineWidth ?? 2,
    };
    this.style = this.generateStyleFunction()();
  }

  public getStyle(): Style {
    return this.style;
  }

  public getStyleType(): BorderStyle {
    return BorderStyle.FULL;
  }

  public setStyleType(_style: BorderStyle): void {
    // Default: non-ring tracks ignore border style changes.
  }

  public generateStyleFunction(): () => Style {
    const style = new Style({
      stroke: new Stroke({
        color: this.options.borderColor,
        width: this.options.width,
      }),
      fill: new Fill({
        color: this.options.fillColor,
      }),
    });
    // console.log("Generate style function called and produced ", style);
    return () => style;
  }

  public setLabelSize(size: number): void {
    this.options.labelSize = Math.max(6, size);
  }

  public getLabelSize(): number {
    return this.options.labelSize;
  }

  public setLabelOffsetMultiplier(multiplier: number): void {
    this.options.labelOffsetMultiplier = Math.max(0, multiplier);
  }

  public getLabelOffsetMultiplier(): number {
    return this.options.labelOffsetMultiplier;
  }

  public setLabelBold(enabled: boolean): void {
    this.options.labelBold = enabled;
  }

  public getLabelBold(): boolean {
    return this.options.labelBold;
  }

  public setLabelOutline(enabled: boolean): void {
    this.options.labelOutline = enabled;
  }

  public getLabelOutline(): boolean {
    return this.options.labelOutline;
  }

  public setLabelOutlineWidth(width: number): void {
    this.options.labelOutlineWidth = Math.max(0, width);
  }

  public getLabelOutlineWidth(): number {
    return this.options.labelOutlineWidth;
  }

  public setNamePlacement(placement: NamePlacement): void {
    this.namePlacement = placement;
  }

  public getNamePlacement(): NamePlacement {
    return this.namePlacement;
  }

  protected createLabelStyle(label: string): Style {
    return new Style({
      text: new Text({
        text: label,
        font: `${this.options.labelBold ? "bold " : ""}${
          this.options.labelSize
        }px sans-serif`,
        fill: new Fill({
          color: this.options.borderColor,
        }),
        stroke: this.options.labelOutline
          ? new Stroke({
              color: "rgba(0,0,0,0.9)",
              width: this.options.labelOutlineWidth,
            })
          : undefined,
        overflow: true,
        textAlign: "center",
      }),
    });
  }

  protected measureLabelWidthPx(label: string): number {
    if (!Track2DSymmetric.measureCanvas) {
      Track2DSymmetric.measureCanvas = document.createElement("canvas");
    }
    const ctx = Track2DSymmetric.measureCanvas.getContext("2d");
    if (!ctx) {
      return label.length * this.options.labelSize * 0.6;
    }
    ctx.font = `${this.options.labelSize}px sans-serif`;
    return ctx.measureText(label).width;
  }
}

class BasePairsTrack2DSymmetric extends Track2DSymmetric {
  public constructor(
    public readonly descriptor: BasePairsTrack2DSymmetricDescriptor,
    public readonly contigDimensionHolder: ContigDimensionHolder,
    public readonly viewAndLayersManager: HiCViewAndLayersManager,
    opt_options?: {
      borderColor?: Color | ColorLike;
      fillColor?: Color | ColorLike;
      width?: number | undefined;
      zIndex?: number | undefined;
    }
  ) {
    super(
      {
        name: descriptor.name,
        features: new Map(),
      },
      contigDimensionHolder,
      opt_options
    );
  }

  public recalculateBorders(): void {
    this.features = new Map();
    for (const resolution of this.contigDimensionHolder.resolutions) {
      this.features.set(resolution, []);
    }
    this.descriptor.bordersBp.forEach((bordersBp) => {
      for (const resolutionTuple of this.viewAndLayersManager
        .resolutionTuples) {
        const [fromPx, toPx] = bordersBp.map((bp) =>
          this.contigDimensionHolder.getPxContainingBp(
            bp,
            resolutionTuple.bpResolution
          )
        );

        const ring = [
          [fromPx, -fromPx],
          [fromPx, -toPx],
          [toPx, -toPx],
          [toPx, -fromPx],
          [fromPx, -fromPx],
        ];

        for (const c of ring) {
          c[0] *= resolutionTuple.pixelResolution;
          c[1] *= resolutionTuple.pixelResolution;
        }
      }
    });
  }
}

abstract class WithRing extends Track2DSymmetric {
  protected borderStyle: BorderStyle = BorderStyle.FULL;
  public override setStyleType(style: BorderStyle): void {
    this.borderStyle = style;
  }
  public override getStyleType(): BorderStyle {
    return this.borderStyle;
  }
  protected drawPolygon(
    topLeft: Array<number>,
    topRight: Array<number>,
    botRight: Array<number>,
    botLeft: Array<number>,
    pixelResolution: number
  ): SimpleGeometry {
    const ring: Array<Array<number>> = (() => {
      switch (this.borderStyle) {
        case BorderStyle.FULL:
          return [topLeft, topRight, botRight, botLeft];
        case BorderStyle.TOP:
          return [botRight, botLeft, topLeft];
        case BorderStyle.BOTTOM:
          return [topLeft, topRight, botRight];
        case BorderStyle.NONE:
          return [];
      }
    })();

    for (const c of ring) {
      c[0] *= pixelResolution;
      c[1] *= pixelResolution;
    }
    switch (this.borderStyle) {
      case BorderStyle.FULL:
      case BorderStyle.NONE:
        return new Polygon([ring]);
      case BorderStyle.BOTTOM:
      case BorderStyle.TOP:
        return new LineString(ring);
    }
  }
}

class ContigBordersTrack2D extends WithRing {
  public constructor(public readonly mapManager: ContactMapManager) {
    super(
      {
        name: "Contigs",
        features: new Map(),
      },
      mapManager.getContigDimensionHolder(),
      {
        borderColor: "rgba(255, 64, 64, 1.0)",
        fillColor: "rgba(0, 127, 127, 0.0)",
        width: 2,
        zIndex: 11,
      }
    );
  }

  public recalculateBorders(): void {
    this.features.clear();
    for (const resolution of this.contigDimensionHolder.resolutions) {
      this.features.set(resolution, []);
    }
    const viewAndLayersManager: HiCViewAndLayersManager =
      this.mapManager.getLayersManager();
    this.contigDimensionHolder.contigDescriptors.forEach((cd, contigOrder) => {
      cd.presenceAtResolution.forEach((hideType, resolution) => {
        switch (hideType) {
          case ContigHideType.AUTO_HIDDEN:
          case ContigHideType.FORCED_HIDDEN:
            break;
          case ContigHideType.AUTO_SHOWN:
          case ContigHideType.FORCED_SHOWN: {
            const prefixSum =
              this.contigDimensionHolder.prefix_sum_px.get(resolution);
            if (!prefixSum) {
              throw new Error(
                `Can't get prefix sum for resolution ${resolution}`
              );
            }

            const [fromPx, toPx] = [
              prefixSum[contigOrder],
              prefixSum[1 + contigOrder],
            ];

            const pixelResolution =
              viewAndLayersManager.resolutionToPixelResolution.get(resolution);
            if (!pixelResolution) {
              throw new Error(
                `Cannot get pixel resolution for bp resolution = ${resolution}`
              );
            }

            // const ring = [
            //   [fromPx, -fromPx],
            //   [fromPx, -toPx],
            //   [toPx, -toPx],
            //   [toPx, -fromPx],
            //   [fromPx, -fromPx],
            // ];

            // const ring = this.updateRing(
            //   [fromPx, -fromPx],
            //   [fromPx, -toPx],
            //   [toPx, -toPx],
            //   [toPx, -fromPx]
            // );
            //
            // for (const c of ring) {
            //   c[0] *= pixelResolution;
            //   c[1] *= pixelResolution;
            // }

            const contig_bounding_box = this.drawPolygon(
              [fromPx, -fromPx],
              [fromPx, -toPx],
              [toPx, -toPx],
              [toPx, -fromPx],
              pixelResolution
            );

            const polygonFeature = new Feature({
              name: `ContigBorder-${cd.contigName}-bp${resolution}`,
              geometry: contig_bounding_box,
            });
            polygonFeature.setStyle(this.style);
            polygonFeature.set("trackType", "contigBorders");
            polygonFeature.set("bpResolution", resolution);
            polygonFeature.set("pixelResolution", pixelResolution);
            polygonFeature.set("contigDescriptor", cd);

            this.features.get(resolution)?.push(polygonFeature);

            if (this.namePlacement !== NamePlacement.HIDDEN) {
              const rectWidthPx = toPx - fromPx;
              const labelWidthPx = this.measureLabelWidthPx(cd.contigName);
              if (rectWidthPx > 0 && labelWidthPx < rectWidthPx * 0.9) {
                const labelOffset =
                  this.options.labelSize * this.options.labelOffsetMultiplier;
                const labelY =
                  this.namePlacement === NamePlacement.CENTER
                    ? -(fromPx + toPx) / 2
                    : this.namePlacement === NamePlacement.TOP
                    ? -fromPx + labelOffset
                    : -toPx - labelOffset;
                const midPx = (fromPx + toPx) / 2;
                const labelPoint = new Point([
                  midPx * pixelResolution,
                  labelY * pixelResolution,
                ]);
                const labelFeature = new Feature({
                  name: `ContigName-${cd.contigName}-bp${resolution}`,
                  geometry: labelPoint,
                });
                labelFeature.setStyle(this.createLabelStyle(cd.contigName));
                labelFeature.set("trackType", "contigNames");
                labelFeature.set("bpResolution", resolution);
                labelFeature.set("pixelResolution", pixelResolution);
                labelFeature.set("contigDescriptor", cd);
                this.features.get(resolution)?.push(labelFeature);
              }
            }

            break;
          }
          default:
            throw new Error(`Unrecognized contig hide type: ${hideType}`);
        }
      });
    });
  }
}

class ScaffoldBordersTrack2D extends WithRing {
  public constructor(public readonly mapManager: ContactMapManager) {
    super(
      {
        name: "Scaffolds",
        features: new Map(),
      },
      mapManager.getContigDimensionHolder(),
      {
        fillColor: "rgba(64, 64, 255, 0.0)",
        borderColor: "rgba(255, 255, 0, 1)",
        width: 4,
        zIndex: 12,
      }
    );
  }

  public recalculateBorders(): void {
    this.features.clear();
    for (const resolution of this.contigDimensionHolder.resolutions) {
      this.features.set(resolution, []);
    }
    const viewAndLayersManager: HiCViewAndLayersManager =
      this.mapManager.getLayersManager();
    this.mapManager.scaffoldHolder.scaffoldTable.forEach(
      (scaffoldDescriptor) => {
        const borders = scaffoldDescriptor.scaffoldBordersBP;
        if (!borders) {
          return;
        }
        this.contigDimensionHolder.prefix_sum_px.forEach(
          (prefix_sum_px, bpResolution) => {
            const [startBP, endBP] = [borders.startBP, borders.endBP];

            const [fromPx, toPx] = [startBP, endBP].map((bp) =>
              this.contigDimensionHolder.getPxContainingBp(bp, bpResolution)
            );

            if (toPx <= fromPx) {
              return;
            }

            const pixelResolution =
              viewAndLayersManager.resolutionToPixelResolution.get(
                bpResolution
              );
            if (!pixelResolution) {
              throw new Error(
                `Cannot get pixel resolution for bp resolution = ${bpResolution}`
              );
            }

            // const ring = [
            //   [fromPx, -fromPx],
            //   [fromPx, -toPx],
            //   [toPx, -toPx],
            //   [toPx, -fromPx],
            //   [fromPx, -fromPx],
            // ];

            // const ring = this.updateRing(
            //   [fromPx, -fromPx],
            //   [fromPx, -toPx],
            //   [toPx, -toPx],
            //   [toPx, -fromPx]
            // );
            //
            // for (const c of ring) {
            //   c[0] *= pixelResolution;
            //   c[1] *= pixelResolution;
            // }

            const scaffold_bounding_box = this.drawPolygon(
              [fromPx, -fromPx],
              [fromPx, -toPx],
              [toPx, -toPx],
              [toPx, -fromPx],
              pixelResolution
            );

            const polygonFeature = new Feature({
              name: `ScaffoldBorder-${scaffoldDescriptor.scaffoldName}-bp${bpResolution}`,
              geometry: scaffold_bounding_box,
            });
            polygonFeature.setStyle(this.style);
            polygonFeature.set("trackType", "scaffoldBorders");
            polygonFeature.set("bpResolution", bpResolution);
            polygonFeature.set("pixelResolution", pixelResolution);
            polygonFeature.set("scaffolDescriptor", scaffoldDescriptor);

            this.features.get(bpResolution)?.push(polygonFeature);

            if (this.namePlacement !== NamePlacement.HIDDEN) {
              const rectWidthPx = toPx - fromPx;
              const labelWidthPx = this.measureLabelWidthPx(
                scaffoldDescriptor.scaffoldName
              );
              if (rectWidthPx > 0 && labelWidthPx < rectWidthPx * 0.9) {
                const labelOffset =
                  this.options.labelSize * this.options.labelOffsetMultiplier;
                const labelY =
                  this.namePlacement === NamePlacement.CENTER
                    ? -(fromPx + toPx) / 2
                    : this.namePlacement === NamePlacement.TOP
                    ? -fromPx + labelOffset
                    : -toPx - labelOffset;
                const midPx = (fromPx + toPx) / 2;
                const labelPoint = new Point([
                  midPx * pixelResolution,
                  labelY * pixelResolution,
                ]);
                const labelFeature = new Feature({
                  name: `ScaffoldName-${scaffoldDescriptor.scaffoldName}-bp${bpResolution}`,
                  geometry: labelPoint,
                });
                labelFeature.setStyle(
                  this.createLabelStyle(scaffoldDescriptor.scaffoldName)
                );
                labelFeature.set("trackType", "scaffoldNames");
                labelFeature.set("bpResolution", bpResolution);
                labelFeature.set("pixelResolution", pixelResolution);
                labelFeature.set("scaffolDescriptor", scaffoldDescriptor);
                this.features.get(bpResolution)?.push(labelFeature);
              }
            }
          }
        );
      }
    );
  }
}

class TranslocationArrowsTrack2D extends Track2DSymmetric {
  public constructor(public readonly mapManager: ContactMapManager) {
    super(
      {
        name: "TranslocationArrows",
        features: new Map(),
      },
      mapManager.getContigDimensionHolder(),
      {
        borderColor: "rgba(0, 0, 0, 0.0)",
        fillColor: "rgba(0, 0, 0, 0.0)",
        width: 2,
        zIndex: 12,
      }
    );
  }

  public recalculateBorders(): void {
    for (const resolution of this.contigDimensionHolder.resolutions) {
      this.features.set(resolution, []);
    }
    const viewAndLayersManager: HiCViewAndLayersManager =
      this.mapManager.getLayersManager();
    let previousShown:
      | { contigDescriptor: ContigDescriptor; contigOrder: number }
      | undefined = undefined;
    this.contigDimensionHolder.resolutions.forEach((resolution) => {
      this.contigDimensionHolder.contigDescriptors.forEach(
        (cd, contigOrder) => {
          switch (cd.presenceAtResolution.get(resolution)) {
            case ContigHideType.AUTO_HIDDEN:
            case ContigHideType.FORCED_HIDDEN:
              break;
            case ContigHideType.AUTO_SHOWN:
            case ContigHideType.FORCED_SHOWN: {
              const prefixSum =
                this.contigDimensionHolder.prefix_sum_px.get(resolution);
              if (!prefixSum) {
                throw new Error(
                  `Can't get prefix sum for resolution ${resolution}`
                );
              }

              const multiPolygonRings = [];

              const pixelResolution =
                viewAndLayersManager.resolutionToPixelResolution.get(
                  resolution
                );
              if (!pixelResolution) {
                throw new Error(
                  `Cannot get pixel resolution for bp resolution = ${resolution}`
                );
              }

              if (previousShown) {
                const [fromPxL, toPxL] = [
                  prefixSum[previousShown.contigOrder],
                  prefixSum[1 + previousShown.contigOrder],
                ];

                const ringL = [
                  [toPxL, -toPxL],
                  [toPxL, -fromPxL],
                  [fromPxL, -toPxL],
                  [toPxL, -toPxL],
                ];

                for (const c of ringL) {
                  c[0] *= pixelResolution;
                  c[1] *= pixelResolution;
                }

                multiPolygonRings.push([ringL]);
              } else {
                previousShown = {
                  contigDescriptor: cd,
                  contigOrder: contigOrder,
                };
              }

              const [fromPxR, toPxR] = [
                prefixSum[contigOrder],
                prefixSum[1 + contigOrder],
              ];

              const ringR = [
                [fromPxR, -fromPxR],
                [fromPxR, -toPxR],
                [toPxR, -fromPxR],
                [fromPxR, -fromPxR],
              ];

              for (const c of ringR) {
                c[0] *= pixelResolution;
                c[1] *= pixelResolution;
              }

              multiPolygonRings.push([ringR]);

              const lrArrow = new MultiPolygon(multiPolygonRings);

              const multiPolygonFeature = new Feature({
                name: `Arrow-between-${
                  previousShown.contigDescriptor === cd
                    ? "left-border-"
                    : previousShown.contigDescriptor.contigName
                }-and-${cd.contigName}-at-bp${resolution}`,
                geometry: lrArrow,
              });
              multiPolygonFeature.setStyle(this.style);
              multiPolygonFeature.set("trackType", "translocationArrows");
              multiPolygonFeature.set("bpResolution", resolution);
              multiPolygonFeature.set("pixelResolution", pixelResolution);
              multiPolygonFeature.set(
                "leftContigDescriptor",
                previousShown.contigDescriptor === cd
                  ? undefined
                  : previousShown.contigDescriptor
              );
              multiPolygonFeature.set("rightContigDescriptor", cd);

              this.features.get(resolution)?.push(multiPolygonFeature);
              previousShown = {
                contigDescriptor: cd,
                contigOrder: contigOrder,
              };

              break;
            }
            default:
              throw new Error(
                `Unrecognized contig hide type: ${cd.presenceAtResolution.get(
                  resolution
                )}`
              );
          }
        }
      );
      // Add right corner:
      if (previousShown) {
        const prefixSum =
          this.contigDimensionHolder.prefix_sum_px.get(resolution);
        if (!prefixSum) {
          throw new Error(`Can't get prefix sum for resolution ${resolution}`);
        }

        const multiPolygonRings = [];

        const pixelResolution =
          viewAndLayersManager.resolutionToPixelResolution.get(resolution);
        if (!pixelResolution) {
          throw new Error(
            `Cannot get pixel resolution for bp resolution = ${resolution}`
          );
        }

        const [fromPxR, toPxR] = [
          prefixSum[previousShown.contigOrder],
          prefixSum[1 + previousShown.contigOrder],
        ];

        const ringR = [
          [toPxR, -toPxR],
          [toPxR, -fromPxR],
          [fromPxR, -toPxR],
          [toPxR, -toPxR],
        ];

        for (const c of ringR) {
          c[0] *= pixelResolution;
          c[1] *= pixelResolution;
        }

        multiPolygonRings.push([ringR]);
        const rightArrow = new MultiPolygon(multiPolygonRings);

        const multiPolygonFeature = new Feature({
          name: `Arrow-between-${previousShown.contigDescriptor.contigName}-and-right-border-at-bp${resolution}`,
          geometry: rightArrow,
        });
        multiPolygonFeature.setStyle(this.style);
        multiPolygonFeature.set("trackType", "translocationArrows");
        multiPolygonFeature.set("bpResolution", resolution);
        multiPolygonFeature.set("pixelResolution", pixelResolution);
        multiPolygonFeature.set(
          "leftContigDescriptor",
          previousShown.contigDescriptor
        );
        multiPolygonFeature.set("rightContigDescriptor", undefined);

        this.features.get(resolution)?.push(multiPolygonFeature);
      }

      previousShown = undefined;
    });
  }
}

enum BorderStyle {
  FULL,
  BOTTOM,
  TOP,
  NONE,
}

export {
  Track2DSymmetric,
  ContigBordersTrack2D,
  type Track2DSymmetricDescriptor,
  type track2DSymmetricBorders,
  type BasePairsTrack2DSymmetricDescriptor,
  BasePairsTrack2DSymmetric,
  ScaffoldBordersTrack2D,
  TranslocationArrowsTrack2D,
  BorderStyle,
};
