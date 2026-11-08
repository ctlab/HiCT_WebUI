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
import { markRaw, toRaw } from "vue";
import type { Color } from "ol/color";
import { boundingExtent, intersects } from "ol/extent";
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
import Style, { type StyleLike } from "ol/style/Style";
import Text from "ol/style/Text";
import Point from "ol/geom/Point";
import { ContigHideType } from "../domain/common";
import type { ContigDescriptor } from "../domain/ContigDescriptor";
import type { ContactMapManager } from "../mapmanagers/ContactMapManager";
import type { HiCViewAndLayersManager } from "../mapmanagers/HiCViewAndLayersManager";
import { Track2D } from "./Track2D";

export interface TrackViewport {
  /** Map coordinates, padded by the renderer's buffer and maximum stroke. */
  extent: number[];
  resolution: number;
}

/** A placed label with its screen-pixel box, used to drop labels that would overlap a larger one. */
interface LabelCandidate {
  feature: Feature<Geometry>;
  /** minX, minY, maxX, maxY in screen pixels. */
  box: [number, number, number, number];
  /** Width on screen of the entity the label names; wider entities win a collision. */
  spanPx: number;
}

/** Screen pixels a label can reach beyond its anchor; used to widen visible-range searches. */
const LABEL_REACH_SCREEN_PX = 600;
const LABEL_COLLISION_PADDING_PX = 2;

/** First index in [0, length) for which `predicate(index)` is true, assuming it is monotone; `length` if none. */
function lowerBoundIndex(length: number, predicate: (index: number) => boolean): number {
  let low = 0;
  let high = length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (predicate(middle)) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
}

type track2DSymmetricBorders = [startIncl: number, endExcl: number];

interface Track2DSymmetricDescriptor {
  name: string;
  features: Map<number, Feature<Geometry>[]>;
}

interface BasePairsTrack2DSymmetricDescriptor {
  name: string;
  bordersBp: track2DSymmetricBorders[];
}

interface Track2DSymmetricOptions {
  borderColor: Color | ColorLike;
  fillColor: Color | ColorLike;
  width: number;
  borderOutline: boolean;
  zIndex: number;
  labelSize: number;
  labelOffsetMultiplier: number;
  labelBold: boolean;
  labelOutline: boolean;
  labelOutlineWidth: number;
  labelColor: Color | ColorLike;
}

export enum NamePlacement {
  CENTER = -1,
  TOP = 0,
  BOTTOM = 1,
  HIDDEN = 2,
  LEFT = 3,
  RIGHT = 4,
}

abstract class Track2DSymmetric extends Track2D {
  public features: Map<number, Feature<Geometry>[]> = markRaw(new Map());
  public options: Track2DSymmetricOptions;
  public style: StyleLike;
  protected namePlacement: NamePlacement = NamePlacement.TOP;
  private static measureCanvas?: HTMLCanvasElement;
  private static readonly labelWidthCacheLimit = 32768;
  private static readonly labelWidthCache = new Map<string, number>();

  public constructor(
    public readonly trackDescriptor: Track2DSymmetricDescriptor,
    public readonly contigDimensionHolder: ContigDimensionHolder,
    opt_options?: {
      borderColor?: Color | ColorLike;
      fillColor?: Color | ColorLike;
      width?: number | undefined;
      borderOutline?: boolean;
      zIndex?: number | undefined;
      labelSize?: number | undefined;
      labelOffsetMultiplier?: number | undefined;
      labelBold?: boolean | undefined;
      labelOutline?: boolean | undefined;
      labelOutlineWidth?: number | undefined;
      labelColor?: Color | ColorLike;
    }
  ) {
    super();
    this.options = {
      borderColor: opt_options?.borderColor ?? [0xff, 0xaa, 0xcc, 1.0],
      fillColor: opt_options?.fillColor ?? [0x77, 0x77, 0x77, 0.1],
      width: opt_options?.width ?? 2,
      borderOutline: opt_options?.borderOutline ?? false,
      zIndex: opt_options?.zIndex ?? 0,
      labelSize: opt_options?.labelSize ?? 12,
      labelOffsetMultiplier: opt_options?.labelOffsetMultiplier ?? 1.25,
      labelBold: opt_options?.labelBold ?? true,
      labelOutline: opt_options?.labelOutline ?? true,
      labelOutlineWidth: opt_options?.labelOutlineWidth ?? 2,
      labelColor:
        opt_options?.labelColor ??
        opt_options?.borderColor ??
        [0xff, 0xaa, 0xcc, 1.0],
    };
    this.style = this.generateStyleFunction()();
  }

  public getStyle(): Style {
    if (Array.isArray(this.style)) {
      for (let i = this.style.length - 1; i >= 0; i -= 1) {
        const candidate = this.style[i];
        if (candidate instanceof Style) {
          return candidate;
        }
      }
      return new Style();
    }
    return this.style instanceof Style ? this.style : new Style();
  }

  public getStyleType(): BorderStyle {
    return BorderStyle.FULL;
  }

  public setStyleType(_style: BorderStyle): void {
    // Default: non-ring tracks ignore border style changes.
  }

  public generateStyleFunction(): () => StyleLike {
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

  public setLabelColor(color: Color | ColorLike): void {
    this.options.labelColor = color;
  }

  public getLabelColor(): Color | ColorLike {
    return this.options.labelColor;
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
        }px HiCT Sans`,
        fill: new Fill({
          color: this.options.labelColor ?? this.options.borderColor,
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

  /**
   * Extra distance, in CSS pixels, that pushes this track's labels away from the border.
   * Used so a track does not draw its names on top of another track's names.
   */
  protected extraLabelOffsetPx(): number {
    return 0;
  }

  /** Text offsets stay in CSS pixels at every zoom and matrix resolution. */
  protected labelLayout(label: string, from: number, to: number, scale: number,
    viewport?: TrackViewport): { point: number[]; style: Style; box: LabelCandidate["box"]; spanPx: number } | undefined {
    const resolution = viewport?.resolution ?? scale;
    const width = this.measureLabelWidthPx(label,
      `${this.options.labelBold ? "bold " : ""}${this.options.labelSize}px HiCT Sans`);
    const span = (to - from) * scale / resolution;
    if (this.namePlacement === NamePlacement.HIDDEN || span < this.options.labelSize * 2) return;
    if (this.namePlacement === NamePlacement.CENTER && width > span * 0.9) return;
    const mid = (from + to) / 2 * scale;
    const offset = this.options.labelSize * this.options.labelOffsetMultiplier + this.extraLabelOffsetPx();
    const point = [mid, -mid];
    const style = this.createLabelStyle(label), text = style.getText()!;
    let offsetX = 0;
    let offsetY = 0;
    let align: "center" | "left" | "right" = "center";
    switch (this.namePlacement) {
      case NamePlacement.CENTER: offsetY = -this.extraLabelOffsetPx(); text.setOffsetY(offsetY); break;
      case NamePlacement.TOP: point[1] = -from * scale; offsetY = -offset; text.setOffsetY(offsetY); break;
      case NamePlacement.BOTTOM: point[1] = -to * scale; offsetY = offset; text.setOffsetY(offsetY); break;
      case NamePlacement.LEFT: point[0] = from * scale; align = "right"; offsetX = -offset; text.setTextAlign("right"); text.setOffsetX(offsetX); break;
      case NamePlacement.RIGHT: point[0] = to * scale; align = "left"; offsetX = offset; text.setTextAlign("left"); text.setOffsetX(offsetX); break;
    }
    // Offset text may remain visible when its anchor has moved outside the view.
    const radius = (width + offset + this.options.labelSize) * resolution;
    if (viewport && !intersects(viewport.extent,
      [point[0]-radius, point[1]-radius, point[0]+radius, point[1]+radius])) return;
    // Screen box (y grows downward on screen, upward in map units).
    const screenX = point[0] / resolution + offsetX;
    const screenY = -point[1] / resolution + offsetY;
    const halfHeight = this.options.labelSize * 0.6 + this.options.labelOutlineWidth / 2;
    const minX = align === "center" ? screenX - width / 2 : align === "left" ? screenX : screenX - width;
    const box: LabelCandidate["box"] = [minX, screenY - halfHeight, minX + width, screenY + halfHeight];
    return { point, style, box, spanPx: span };
  }

  /** Keeps the widest labels and drops any label whose box overlaps one already kept. */
  protected selectNonOverlappingLabels(candidates: LabelCandidate[]): Feature<Geometry>[] {
    const accepted: LabelCandidate[] = [];
    const pad = LABEL_COLLISION_PADDING_PX;
    for (const candidate of candidates.slice().sort((a, b) => b.spanPx - a.spanPx)) {
      const [minX, minY, maxX, maxY] = candidate.box;
      const collides = accepted.some(({ box }) =>
        minX < box[2] + pad && maxX > box[0] - pad && minY < box[3] + pad && maxY > box[1] - pad);
      if (!collides) accepted.push(candidate);
    }
    return accepted.map(({ feature }) => feature);
  }

  /**
   * Half-open range of contig orders whose squares can reach the viewport, found by binary search on
   * the pixel prefix sums. `extraMapPx` widens the range for geometry that sticks out of a contig.
   */
  protected visibleContigOrderRange(
    prefixSum: number[],
    pixelResolution: number,
    viewport: TrackViewport,
    extraMapPx = 0
  ): [number, number] {
    const count = prefixSum.length - 1;
    if (count <= 0 || !(pixelResolution > 0)) return [0, 0];
    const [xMin, yMin, xMax, yMax] = viewport.extent;
    const reach = (LABEL_REACH_SCREEN_PX * viewport.resolution) / pixelResolution + extraMapPx;
    const low = Math.max(xMin, -yMax) / pixelResolution - reach;
    const high = Math.min(xMax, -yMin) / pixelResolution + reach;
    if (!(low <= high)) return [0, 0];
    const first = lowerBoundIndex(count, (order) => prefixSum[order + 1] > low);
    const end = lowerBoundIndex(count, (order) => prefixSum[order] >= high);
    return [first, Math.max(first, end)];
  }

  /** Conservative export padding; measured only when an export is requested. */
  public labelExportPadding(labels: string[]): number {
    if (this.namePlacement === NamePlacement.HIDDEN || this.namePlacement === NamePlacement.CENTER) return 0;
    const offset = this.options.labelSize * this.options.labelOffsetMultiplier + this.options.labelOutlineWidth + 4;
    return labels.reduce((max, label) => Math.max(max, this.measureLabelWidthPx(label,
      `${this.options.labelBold ? "bold " : ""}${this.options.labelSize}px HiCT Sans`) + offset), offset);
  }

  protected measureLabelWidthPx(
    label: string,
    font = `${this.options.labelSize}px HiCT Sans`
  ): number {
    if (!Track2DSymmetric.measureCanvas) {
      Track2DSymmetric.measureCanvas = document.createElement("canvas");
      const clearWidths = () => Track2DSymmetric.labelWidthCache.clear();
      document.fonts?.addEventListener("loadingdone", clearWidths);
      document.fonts?.addEventListener("loadingerror", clearWidths);
    }
    // Reordering contigs does not change their label widths. Share measurements
    // across tracks/resolutions, but preserve the existing font/placement rules.
    const key = `${font}\0${label}`;
    const cacheable = document.fonts?.status === "loaded";
    const cached = cacheable ? Track2DSymmetric.labelWidthCache.get(key) : undefined;
    if (cached !== undefined) {
      return cached;
    }
    const ctx = Track2DSymmetric.measureCanvas.getContext("2d");
    if (!ctx) {
      return label.length * this.options.labelSize * 0.6;
    }
    ctx.font = font;
    const width = ctx.measureText(label).width;
    if (cacheable) {
      if (Track2DSymmetric.labelWidthCache.size >= Track2DSymmetric.labelWidthCacheLimit) {
        const oldest = Track2DSymmetric.labelWidthCache.keys().next().value;
        if (oldest !== undefined) {
          Track2DSymmetric.labelWidthCache.delete(oldest);
        }
      }
      Track2DSymmetric.labelWidthCache.set(key, width);
    }
    return width;
  }
  protected spanIntersectsViewport(
    fromPx: number, toPx: number, pixelResolution: number, viewport?: TrackViewport
  ): boolean {
    return !viewport || intersects(viewport.extent, [
      fromPx * pixelResolution, -toPx * pixelResolution,
      toPx * pixelResolution, -fromPx * pixelResolution,
    ]);
  }

  protected labelIntersectsViewport(
    label: string, x: number, y: number, viewport?: TrackViewport
  ): boolean {
    if (!viewport) return true;
    // Text is drawn in screen pixels, independently of the matrix bin scale.
    // Test the actual bold/non-bold font, including labels outside their boxes.
    const width = this.measureLabelWidthPx(label,
      `${this.options.labelBold ? "bold " : ""}${this.options.labelSize}px HiCT Sans`);
    // A circumscribed radius remains conservative when the map is rotated.
    const radius = (width / 2 + 2 * this.options.labelSize + this.options.labelOutlineWidth)
      * viewport.resolution;
    return intersects(viewport.extent, [x - radius, y - radius, x + radius, y + radius]);
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

  public recalculateBorders(targetBpResolution?: number): void {
    if (targetBpResolution === undefined) {
      this.features = new Map();
      for (const resolution of this.contigDimensionHolder.resolutions) {
        this.features.set(resolution, []);
      }
    } else {
      this.features.set(targetBpResolution, []);
    }
    this.descriptor.bordersBp.forEach((bordersBp) => {
      for (const resolutionTuple of this.viewAndLayersManager
        .getVectorResolutionTuples()
        .filter(
          (tuple) =>
            targetBpResolution === undefined ||
            tuple.bpResolution === targetBpResolution
        )) {
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
  public override generateStyleFunction(): () => StyleLike {
    const outlineStyle = new Style({
      stroke: new Stroke({
        color: "rgba(0,0,0,0.9)",
        width: Math.max(1, this.options.width + 3),
      }),
      fill: new Fill({
        color: "rgba(0,0,0,0)",
      }),
      zIndex: this.options.zIndex,
    });
    const innerStyle = new Style({
      stroke: new Stroke({
        color: this.options.borderColor,
        width: this.options.width,
      }),
      fill: new Fill({
        color: this.options.fillColor,
      }),
      zIndex: this.options.zIndex + 1,
    });
    return () => this.options.borderOutline ? [outlineStyle, innerStyle] : [innerStyle];
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
        case BorderStyle.LEFT:
        case BorderStyle.RIGHT:
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
      case BorderStyle.LEFT:
      case BorderStyle.RIGHT:
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
        width: 1,
        zIndex: 11,
      }
    );
  }

  public recalculateBorders(targetBpResolution?: number, viewport?: TrackViewport): void {
    // Snapshot reads do not need a Vue proxy lookup for every contig/bin.
    const holder = toRaw(this.contigDimensionHolder);
    if (targetBpResolution === undefined) {
      this.features.clear();
      for (const resolution of holder.resolutions) {
        this.features.set(resolution, []);
      }
    } else {
      this.features.set(targetBpResolution, []);
    }
    const viewAndLayersManager: HiCViewAndLayersManager =
      toRaw(this.mapManager.getLayersManager());
    const resolutions = targetBpResolution === undefined
      ? holder.resolutions : [targetBpResolution];
    for (const resolution of resolutions) {
      const prefixSum = holder.prefix_sum_px.get(resolution);
      if (!prefixSum) {
        throw new Error(`Can't get prefix sum for resolution ${resolution}`);
      }
      const pixelResolution =
        viewAndLayersManager.getPixelResolutionForBpResolution(resolution);
      if (!pixelResolution) {
        throw new Error(
          `Cannot get pixel resolution for bp resolution = ${resolution}`
        );
      }
      // With a viewport only the contigs near it are visited; without one every contig is built.
      const [firstOrder, endOrder] = viewport
        ? this.visibleContigOrderRange(prefixSum, pixelResolution, viewport)
        : [0, holder.contigDescriptors.length];
      const labelCandidates: LabelCandidate[] = [];
      for (let contigOrder = firstOrder; contigOrder < endOrder; contigOrder += 1) {
        const cd = holder.contigDescriptors[contigOrder];
        const hideType = holder.getPresenceAtResolution(contigOrder, resolution);
        switch (hideType) {
          case ContigHideType.AUTO_HIDDEN:
          case ContigHideType.FORCED_HIDDEN:
            break;
          case ContigHideType.AUTO_SHOWN:
          case ContigHideType.FORCED_SHOWN: {
            const [fromPx, toPx] = [
              prefixSum[contigOrder],
              prefixSum[1 + contigOrder],
            ];

            if (this.spanIntersectsViewport(fromPx, toPx, pixelResolution, viewport)) {
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
            }

            const layout = this.labelLayout(cd.contigName, fromPx, toPx, pixelResolution, viewport);
            if (layout) {
              const labelFeature = new Feature({
                name: `ContigName-${cd.contigName}-bp${resolution}`,
                geometry: new Point(layout.point),
              });
              labelFeature.setStyle(layout.style);
              labelFeature.set("trackType", "contigNames");
              labelFeature.set("bpResolution", resolution);
              labelFeature.set("pixelResolution", pixelResolution);
              labelFeature.set("contigDescriptor", cd);

              if (viewport) {
                labelCandidates.push({ feature: labelFeature, box: layout.box, spanPx: layout.spanPx });
              } else {
                this.features.get(resolution)?.push(labelFeature);
              }
            }

            break;
          }
          default:
            throw new Error(`Unrecognized contig hide type: ${hideType}`);
        }
      }
      // Exports (no viewport) keep every label; the live view drops overlapping ones.
      if (labelCandidates.length > 0) {
        this.features.get(resolution)?.push(...this.selectNonOverlappingLabels(labelCandidates));
      }
    }
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
        width: 1,
        zIndex: 12,
      }
    );
  }

  /** Names of one-contig scaffolds and neighbours must not share the contig names' line. */
  protected override extraLabelOffsetPx(): number {
    const contigTrack = toRaw(this.mapManager.getLayersManager()).track2DHolder.contigBordersTrack;
    const placement = contigTrack.getNamePlacement();
    if (placement === NamePlacement.HIDDEN || placement !== this.namePlacement) return 0;
    return contigTrack.options.labelSize * 1.25 + contigTrack.options.labelOutlineWidth;
  }

  public recalculateBorders(targetBpResolution?: number, viewport?: TrackViewport): void {
    // Snapshot reads do not need a Vue proxy lookup for every contig/bin.
    const holder = toRaw(this.contigDimensionHolder);
    if (targetBpResolution === undefined) {
      this.features.clear();
      for (const resolution of holder.resolutions) {
        this.features.set(resolution, []);
      }
    } else {
      this.features.set(targetBpResolution, []);
    }
    const viewAndLayersManager: HiCViewAndLayersManager =
      toRaw(this.mapManager.getLayersManager());
    const resolutions = targetBpResolution === undefined
      ? Array.from(holder.prefix_sum_px.keys()) : [targetBpResolution];
    const labelCandidates = new Map<number, LabelCandidate[]>();
    this.mapManager.scaffoldHolder.scaffoldTable.forEach(
      (scaffoldDescriptor) => {
        const borders = scaffoldDescriptor.scaffoldBordersBP;
        if (!borders) {
          return;
        }
        resolutions.forEach(
          (bpResolution) => {
            const [startBP, endBP] = [borders.startBP, borders.endBP];

            const [fromPx, toPx] = [startBP, endBP].map((bp) =>
              holder.getPxContainingBp(bp, bpResolution)
            );

            if (toPx <= fromPx) {
              return;
            }

            const pixelResolution =
              viewAndLayersManager.getPixelResolutionForBpResolution(
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

            if (this.spanIntersectsViewport(fromPx, toPx, pixelResolution, viewport)) {
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
            }

            const layout = this.labelLayout(scaffoldDescriptor.scaffoldName, fromPx, toPx, pixelResolution, viewport);
            if (layout) {
              const labelFeature = new Feature({
                name: `ScaffoldName-${scaffoldDescriptor.scaffoldName}-bp${bpResolution}`,
                geometry: new Point(layout.point),
              });
              labelFeature.setStyle(layout.style);
              labelFeature.set("trackType", "scaffoldNames");
              labelFeature.set("bpResolution", bpResolution);
              labelFeature.set("pixelResolution", pixelResolution);
              labelFeature.set("scaffolDescriptor", scaffoldDescriptor);

              if (viewport) {
                const list = labelCandidates.get(bpResolution) ?? [];
                list.push({ feature: labelFeature, box: layout.box, spanPx: layout.spanPx });
                labelCandidates.set(bpResolution, list);
              } else {
                this.features.get(bpResolution)?.push(labelFeature);
              }
            }
          }
        );
      }
    );
    // Exports (no viewport) keep every label; the live view drops overlapping ones.
    labelCandidates.forEach((candidates, bpResolution) => {
      this.features.get(bpResolution)?.push(...this.selectNonOverlappingLabels(candidates));
    });
  }
}

class TranslocationArrowsTrack2D extends Track2DSymmetric {
  private static readonly MAX_ARROW_SIZE_PX = 56;
  private static readonly MIN_ARROW_SIZE_PX = 12;

  public constructor(public readonly mapManager: ContactMapManager) {
    super(
      {
        name: "TranslocationArrows",
        features: new Map(),
      },
      mapManager.getContigDimensionHolder(),
      {
        borderColor: "rgba(48, 208, 132, 0.98)",
        fillColor: "rgba(160, 72, 255, 0.46)",
        width: 3,
        zIndex: 12,
      }
    );
  }

  private getArrowSizePx(fromPx: number, toPx: number): number {
    const spanPx = Math.max(0, toPx - fromPx);
    if (spanPx <= 0) {
      return 0;
    }
    return Math.min(
      TranslocationArrowsTrack2D.MAX_ARROW_SIZE_PX,
      Math.max(TranslocationArrowsTrack2D.MIN_ARROW_SIZE_PX, spanPx * 0.5)
    );
  }

  private scaleRing(
    ring: number[][],
    pixelResolution: number
  ): number[][] {
    return ring.map(([x, y]) => [x * pixelResolution, y * pixelResolution]);
  }

  private createLeftContigInsertionTriangle(
    fromPx: number,
    toPx: number,
    pixelResolution: number
  ): number[][] | undefined {
    const arrowSize = this.getArrowSizePx(fromPx, toPx);
    if (arrowSize <= 0) {
      return undefined;
    }
    return this.scaleRing(
      [
        [toPx, -toPx],
        [toPx, -toPx + arrowSize],
        [toPx - arrowSize, -toPx],
        [toPx, -toPx],
      ],
      pixelResolution
    );
  }

  private createRightContigInsertionTriangle(
    fromPx: number,
    toPx: number,
    pixelResolution: number
  ): number[][] | undefined {
    const arrowSize = this.getArrowSizePx(fromPx, toPx);
    if (arrowSize <= 0) {
      return undefined;
    }
    return this.scaleRing(
      [
        [fromPx, -fromPx],
        [fromPx + arrowSize, -fromPx],
        [fromPx, -fromPx - arrowSize],
        [fromPx, -fromPx],
      ],
      pixelResolution
    );
  }

  public recalculateBorders(targetBpResolution?: number, viewport?: TrackViewport): void {
    // Snapshot reads do not need a Vue proxy lookup for every contig/bin.
    const holder = toRaw(this.contigDimensionHolder);
    if (targetBpResolution === undefined) {
      this.features.clear();
      for (const resolution of holder.resolutions) {
        this.features.set(resolution, []);
      }
    } else {
      this.features.set(targetBpResolution, []);
    }
    const viewAndLayersManager: HiCViewAndLayersManager =
      toRaw(this.mapManager.getLayersManager());
    holder.resolutions.forEach((resolution) => {
      if (
        targetBpResolution !== undefined &&
        resolution !== targetBpResolution
      ) {
        return;
      }
      let previousShown:
        | { contigDescriptor: ContigDescriptor; contigOrder: number }
        | undefined = undefined;
      // Only the contigs near the viewport are visited; the last shown contig before them seeds the
      // "previous" neighbour so the arrow on the first border of the range is still drawn.
      let firstOrder = 0;
      let endOrder = holder.contigDescriptors.length;
      const rangePrefixSum = holder.prefix_sum_px.get(resolution);
      const rangePixelResolution =
        viewAndLayersManager.getPixelResolutionForBpResolution(resolution);
      if (viewport && rangePrefixSum && rangePixelResolution) {
        [firstOrder, endOrder] = this.visibleContigOrderRange(
          rangePrefixSum,
          rangePixelResolution,
          viewport,
          TranslocationArrowsTrack2D.MAX_ARROW_SIZE_PX
        );
        for (let order = firstOrder - 1; order >= 0; order -= 1) {
          const presence = holder.getPresenceAtResolution(order, resolution);
          if (
            presence === ContigHideType.AUTO_SHOWN ||
            presence === ContigHideType.FORCED_SHOWN
          ) {
            previousShown = {
              contigDescriptor: holder.contigDescriptors[order],
              contigOrder: order,
            };
            break;
          }
        }
      }
      for (let contigOrder = firstOrder; contigOrder < endOrder; contigOrder += 1) {
        const cd = holder.contigDescriptors[contigOrder];
        const hideType = holder.getPresenceAtResolution(
          contigOrder,
          resolution
        );
        switch (hideType) {
          case ContigHideType.AUTO_HIDDEN:
          case ContigHideType.FORCED_HIDDEN:
            break;
          case ContigHideType.AUTO_SHOWN:
          case ContigHideType.FORCED_SHOWN: {
            const prefixSum =
              holder.prefix_sum_px.get(resolution);
            if (!prefixSum) {
              throw new Error(
                `Can't get prefix sum for resolution ${resolution}`
              );
            }

            const multiPolygonRings = [];

            const pixelResolution =
              viewAndLayersManager.getPixelResolutionForBpResolution(
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

              const ringL = this.createLeftContigInsertionTriangle(
                fromPxL,
                toPxL,
                pixelResolution
              );
              if (ringL) {
                multiPolygonRings.push([ringL]);
              }
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

            const ringR = this.createRightContigInsertionTriangle(
              fromPxR,
              toPxR,
              pixelResolution
            );
            if (ringR) {
              multiPolygonRings.push([ringR]);
            }

            if (!viewport || multiPolygonRings.some(rings =>
              intersects(viewport.extent, boundingExtent(rings[0])))) {
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
            }
            previousShown = {
              contigDescriptor: cd,
              contigOrder: contigOrder,
            };

            break;
          }
          default:
            throw new Error(`Unrecognized contig hide type: ${hideType}`);
        }
      }
      // Add right corner (only when the last contig was part of the visited range):
      if (previousShown && endOrder === holder.contigDescriptors.length) {
        const prefixSum =
          holder.prefix_sum_px.get(resolution);
        if (!prefixSum) {
          throw new Error(`Can't get prefix sum for resolution ${resolution}`);
        }

        const multiPolygonRings = [];

        const pixelResolution =
          viewAndLayersManager.getPixelResolutionForBpResolution(resolution);
        if (!pixelResolution) {
          throw new Error(
            `Cannot get pixel resolution for bp resolution = ${resolution}`
          );
        }

        const [fromPxR, toPxR] = [
          prefixSum[previousShown.contigOrder],
          prefixSum[1 + previousShown.contigOrder],
        ];

        const ringR = this.createLeftContigInsertionTriangle(
          fromPxR,
          toPxR,
          pixelResolution
        );
        if (ringR) {
          multiPolygonRings.push([ringR]);
        }

        if (!viewport || multiPolygonRings.some(rings =>
          intersects(viewport.extent, boundingExtent(rings[0])))) {
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
      }

    });
  }
}

enum BorderStyle {
  FULL,
  BOTTOM,
  TOP,
  NONE,
  LEFT,
  RIGHT,
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
