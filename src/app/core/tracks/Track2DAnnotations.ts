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

import Feature from "ol/Feature";
import { LineString, Point, Polygon, type Geometry } from "ol/geom";
import Stroke from "ol/style/Stroke";
import Style from "ol/style/Style";
import Fill from "ol/style/Fill";
import CircleStyle from "ol/style/Circle";
import type { ContactMapManager } from "../mapmanagers/ContactMapManager";
import { Track2DSymmetric } from "./Track2DSymmetric";
import { ContigDirection } from "../domain/common";

interface MarkerAnchor {
  id: string;
  name: string;
  color: string;
  sourceXContig: string;
  sourceXBp: number;
  sourceYContig: string;
  sourceYBp: number;
}

interface RectangleAnchor {
  id: string;
  name: string;
  color: string;
  sourceXContig: string;
  sourceXStartBp: number;
  sourceXEndBp: number;
  sourceYContig: string;
  sourceYStartBp: number;
  sourceYEndBp: number;
}

const makeId = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

const withAlpha = (hexColor: string, alpha: number): string => {
  const clean = hexColor.replace("#", "");
  if (clean.length !== 6) {
    return `rgba(255,0,0,${alpha})`;
  }
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

class AnnotationTrack2D extends Track2DSymmetric {
  private readonly markers: MarkerAnchor[] = [];
  private readonly rectangles: RectangleAnchor[] = [];

  public constructor(private readonly mapManager: ContactMapManager) {
    super(
      {
        name: "Annotations",
        features: new Map<number, Feature<Geometry>[]>(),
      },
      mapManager.getContigDimensionHolder(),
      {
        borderColor: "#1f77b4",
        fillColor: "rgba(31,119,180,0.15)",
        width: 2,
        zIndex: 20,
      }
    );
  }

  public addMarkerFromAssemblyBp(
    xBp: number,
    yBp: number,
    name: string,
    color = "#1f77b4"
  ): void {
    const xLocus = this.contigDimensionHolder.getSourceLocusByBp(xBp);
    const yLocus = this.contigDimensionHolder.getSourceLocusByBp(yBp);
    this.markers.push({
      id: makeId("m"),
      name,
      color,
      sourceXContig: xLocus.sourceContig,
      sourceXBp: xLocus.sourceBp,
      sourceYContig: yLocus.sourceContig,
      sourceYBp: yLocus.sourceBp,
    });
  }

  public addRectangleFromAssemblyBp(
    xStartBp: number,
    xEndBp: number,
    yStartBp: number,
    yEndBp: number,
    name: string,
    color = "#d62728"
  ): void {
    const xMin = Math.min(xStartBp, xEndBp);
    const xMax = Math.max(xStartBp, xEndBp);
    const yMin = Math.min(yStartBp, yEndBp);
    const yMax = Math.max(yStartBp, yEndBp);
    if (xMax <= xMin || yMax <= yMin) {
      return;
    }
    const xSourceIntervals = this.toSourceIntervals(xMin, xMax);
    const ySourceIntervals = this.toSourceIntervals(yMin, yMax);
    for (const xInterval of xSourceIntervals) {
      for (const yInterval of ySourceIntervals) {
        this.rectangles.push({
          id: makeId("r"),
          name,
          color,
          sourceXContig: xInterval.sourceContig,
          sourceXStartBp: xInterval.startBp,
          sourceXEndBp: xInterval.endBp,
          sourceYContig: yInterval.sourceContig,
          sourceYStartBp: yInterval.startBp,
          sourceYEndBp: yInterval.endBp,
        });
      }
    }
  }

  public getMarkerCount(): number {
    return this.markers.length;
  }

  public getRectangleCount(): number {
    return this.rectangles.length;
  }

  public clearAll(): void {
    this.markers.length = 0;
    this.rectangles.length = 0;
  }

  public recalculateBorders(): void {
    this.features = new Map();
    for (const resolution of this.contigDimensionHolder.resolutions) {
      this.features.set(resolution, []);
    }
    const viewManager = this.mapManager.getLayersManager();
    for (const resolutionTuple of viewManager.resolutionTuples) {
      const bpResolution = resolutionTuple.bpResolution;
      const pixelResolution = resolutionTuple.pixelResolution;
      const targetFeatures = this.features.get(bpResolution);
      if (!targetFeatures) {
        continue;
      }

      for (const marker of this.markers) {
        const xProjected = this.contigDimensionHolder.projectSourceIntervalToAssembly(
          marker.sourceXContig,
          marker.sourceXBp,
          marker.sourceXBp + 1
        );
        const yProjected = this.contigDimensionHolder.projectSourceIntervalToAssembly(
          marker.sourceYContig,
          marker.sourceYBp,
          marker.sourceYBp + 1
        );
        for (const xInt of xProjected) {
          for (const yInt of yProjected) {
            const xPx = this.contigDimensionHolder.getPxContainingBp(
              xInt.startBp,
              bpResolution
            );
            const yPx = this.contigDimensionHolder.getPxContainingBp(
              yInt.startBp,
              bpResolution
            );
            const point = new Point([
              xPx * pixelResolution,
              -yPx * pixelResolution,
            ]);
            const pointFeature = new Feature({
              name: marker.name,
              geometry: point,
            });
            pointFeature.setStyle(
              new Style({
                image: new CircleStyle({
                  radius: 5,
                  fill: new Fill({ color: marker.color }),
                  stroke: new Stroke({ color: "#111", width: 1 }),
                }),
                text: undefined,
              })
            );
            targetFeatures.push(pointFeature);

            const cross = new LineString([
              [(xPx - 4) * pixelResolution, -(yPx - 4) * pixelResolution],
              [(xPx + 4) * pixelResolution, -(yPx + 4) * pixelResolution],
            ]);
            const crossFeature = new Feature({
              name: marker.name,
              geometry: cross,
            });
            crossFeature.setStyle(
              new Style({
                stroke: new Stroke({ color: marker.color, width: 2 }),
              })
            );
            targetFeatures.push(crossFeature);
          }
        }
      }

      for (const rect of this.rectangles) {
        const xProjected = this.contigDimensionHolder.projectSourceIntervalToAssembly(
          rect.sourceXContig,
          rect.sourceXStartBp,
          rect.sourceXEndBp
        );
        const yProjected = this.contigDimensionHolder.projectSourceIntervalToAssembly(
          rect.sourceYContig,
          rect.sourceYStartBp,
          rect.sourceYEndBp
        );
        for (const xInt of xProjected) {
          for (const yInt of yProjected) {
            const xFrom = this.contigDimensionHolder.getPxContainingBp(
              xInt.startBp,
              bpResolution
            );
            const xTo =
              this.contigDimensionHolder.getPxContainingBp(
                Math.max(xInt.startBp, xInt.endBp - 1),
                bpResolution
              ) + 1;
            const yFrom = this.contigDimensionHolder.getPxContainingBp(
              yInt.startBp,
              bpResolution
            );
            const yTo =
              this.contigDimensionHolder.getPxContainingBp(
                Math.max(yInt.startBp, yInt.endBp - 1),
                bpResolution
              ) + 1;
            const polygon = new Polygon([
              [
                [xFrom * pixelResolution, -yFrom * pixelResolution],
                [xFrom * pixelResolution, -yTo * pixelResolution],
                [xTo * pixelResolution, -yTo * pixelResolution],
                [xTo * pixelResolution, -yFrom * pixelResolution],
                [xFrom * pixelResolution, -yFrom * pixelResolution],
              ],
            ]);
            const polygonFeature = new Feature({
              name: rect.name,
              geometry: polygon,
            });
            polygonFeature.setStyle(
              new Style({
                stroke: new Stroke({ color: rect.color, width: 2 }),
                fill: new Fill({ color: withAlpha(rect.color, 0.12) }),
              })
            );
            targetFeatures.push(polygonFeature);
          }
        }
      }
    }
  }

  private toSourceIntervals(
    startBp: number,
    endBp: number
  ): Array<{ sourceContig: string; startBp: number; endBp: number }> {
    const result: Array<{ sourceContig: string; startBp: number; endBp: number }> =
      [];
    for (let i = 0; i < this.contigDimensionHolder.contigDescriptors.length; i++) {
      const descriptor = this.contigDimensionHolder.contigDescriptors[i];
      const assemblyStart = this.contigDimensionHolder.prefix_sum_bp[i];
      const assemblyEnd = this.contigDimensionHolder.prefix_sum_bp[i + 1];
      const overlapStart = Math.max(startBp, assemblyStart);
      const overlapEnd = Math.min(endBp, assemblyEnd);
      if (overlapEnd <= overlapStart) {
        continue;
      }
      const localStart = overlapStart - assemblyStart;
      const localEnd = overlapEnd - assemblyStart;
      if (descriptor.direction === ContigDirection.FORWARD) {
        result.push({
          sourceContig: descriptor.contigSourceName,
          startBp: descriptor.contigOffsetInSource + localStart,
          endBp: descriptor.contigOffsetInSource + localEnd,
        });
      } else {
        const len = descriptor.contigLengthBp;
        result.push({
          sourceContig: descriptor.contigSourceName,
          startBp: descriptor.contigOffsetInSource + (len - localEnd),
          endBp: descriptor.contigOffsetInSource + (len - localStart),
        });
      }
    }
    return result;
  }
}

export { AnnotationTrack2D };
