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

import PointerInteraction from "ol/interaction/Pointer";
import { type Options as PIOpts } from "ol/interaction/Pointer";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { ContactMapManager } from "../mapmanagers/ContactMapManager";
import { Feature, MapBrowserEvent } from "ol";
import { Pixel } from "ol/pixel";
import { LineString } from "ol/geom";
import Style from "ol/style/Style";
import Stroke from "ol/style/Stroke";
import { Coordinate } from "ol/coordinate";
import MapBrowserEventType from "ol/MapBrowserEventType";
import CommonUtils from "@/CommonUtils";
import TileLayer from "ol/layer/Tile";
import type { LayerResolutionDescriptor } from "../mapmanagers/resolutionModel";
import type { VersionedXYZContactMapSource } from "../VersionedXYZSource";

interface Options extends PIOpts {
  mapManager: ContactMapManager;
  wrapX?: boolean;
  selectionCallback: (coordinate_px: Coordinate, bp_resolution: number) => void;
  zIndex: number;
  style?: Style;
}

class SplitRulesInteraction extends PointerInteraction {
  private readonly ruleOverlayLayer: VectorLayer<VectorSource>;
  private readonly mapManager: ContactMapManager;

  private ruleFeatures: [
    Feature<LineString> | undefined,
    Feature<LineString> | undefined
  ];

  protected readonly ruleStyle: Style = new Style({
    stroke: new Stroke({
      color: [255, 130, 30, 0.75],
      width: 2,
      lineDash: [2, 2],
    }),
  });

  protected readonly options: Options;

  constructor(options: Options) {
    options = options || {};
    super(options);
    this.options = options;
    this.mapManager = options.mapManager;
    this.ruleOverlayLayer = new VectorLayer({
      map: this.mapManager.getMap(),
      zIndex: options.zIndex,
      source: new VectorSource({
        useSpatialIndex: false,
        wrapX: options.wrapX ?? false,
      }),
      updateWhileAnimating: true,
      updateWhileInteracting: true,
    });
    this.ruleFeatures = [undefined, undefined];
  }

  private getHoveredDataLayer(
    pixel: Pixel
  ): TileLayer<VersionedXYZContactMapSource> | undefined {
    const layers =
      this.options.mapManager.viewAndLayersManager.layersHolder.hicDataLayers.filter(
        (layer) => layer.getData(pixel)
      );

    return layers
      .filter(
        (layer): layer is TileLayer<VersionedXYZContactMapSource> =>
          layer instanceof TileLayer
      )
      .sort(
        (left, right) => (right.getZIndex() ?? 0) - (left.getZIndex() ?? 0)
      )[0];
  }

  private getLayerResolutionDescriptor(
    layer: TileLayer<VersionedXYZContactMapSource> | undefined
  ): LayerResolutionDescriptor | undefined {
    if (!layer) {
      return undefined;
    }
    const bpResolution = Number(layer.get("bpResolution"));
    const pixelResolution = Number(layer.get("pixelResolution"));
    if (!Number.isFinite(bpResolution) || !Number.isFinite(pixelResolution)) {
      return undefined;
    }
    return {
      sourceName:
        layer.get("sourceName") === "SECONDARY" ? "SECONDARY" : "PRIMARY",
      bpResolution,
      pixelResolution,
      layerResolutionBorders: {
        minResolutionInclusive: Number.NEGATIVE_INFINITY,
        maxResolutionExclusive: Number.POSITIVE_INFINITY,
      },
      imageSizeIndex: 0,
    };
  }

  private getGuidanceResolutionDescriptor(
    fallback?: LayerResolutionDescriptor
  ): LayerResolutionDescriptor {
    const layersManager = this.mapManager.viewAndLayersManager;
    const viewResolution = this.getMap()?.getView().getResolution();
    if (Number.isFinite(viewResolution)) {
      return layersManager.getGuidanceResolutionDescriptorForViewResolution(
        viewResolution as number
      );
    }
    return layersManager.ensureGuidanceResolutionDescriptor(fallback);
  }

  private getDimensionHolderForDescriptor(
    descriptor: LayerResolutionDescriptor
  ) {
    return this.mapManager.viewAndLayersManager.getDimensionHolderForSource(
      descriptor.sourceName
    );
  }

  private coordinateToPxAtResolution(
    coordinate: Coordinate,
    descriptor: LayerResolutionDescriptor
  ): Coordinate {
    const fixedCoordinates = coordinate.map((value) =>
      Math.ceil(value / descriptor.pixelResolution)
    );
    return this.getDimensionHolderForDescriptor(
      descriptor
    ).clampPxCoordinatesAtResolution(
      [Math.floor(fixedCoordinates[0]), -Math.floor(fixedCoordinates[1])],
      descriptor.bpResolution
    ) as Coordinate;
  }

  protected handlePointerMove(mapBrowserEvent: MapBrowserEvent<UIEvent>): void {
    const pixel = mapBrowserEvent.pixel;

    const map = this.getMap();
    if (!map) {
      return;
    }
    const coordinate = map.getCoordinateFromPixelInternal(pixel);
    if (!coordinate) {
      return;
    }
    if (!this.getHoveredDataLayer(pixel)) {
      return;
    }

    this.createOrUpdateRules(pixel);
  }

  protected createOrUpdateRules(pixel: Pixel): void {
    /*
     * pixel[0] is X in map window coordinates (grows from the left to the right)
     * pixel[1] is Y in map window coordinates (grows from the top to the bottom)
     */
    const coordinate = this.getMap()?.getCoordinateFromPixelInternal(pixel) ?? [
      0, 0,
    ];
    // console.log("SplitRulesInteraction: createOrUpdateRules pixel=", pixel);
    let [verticalRuleFeature, horizontalRuleFeature] = this.ruleFeatures;

    const guidanceDescriptor = this.getGuidanceResolutionDescriptor();
    const dimensionHolder =
      this.getDimensionHolderForDescriptor(guidanceDescriptor);
    const pixelResolution = guidanceDescriptor.pixelResolution;
    const contigCount = dimensionHolder.contig_count;
    const prefixSumPx = dimensionHolder.prefix_sum_px.get(
      guidanceDescriptor.bpResolution
    );
    const mapSizePx = prefixSumPx ? prefixSumPx[contigCount] : 1000;
    const mapSizeProj = mapSizePx * pixelResolution;

    const fixedCoordinate = coordinate.map((x) =>
      CommonUtils.clamp(x, 0, mapSizePx * pixelResolution)
    );

    const verticalRuleCoordinates = [
      [fixedCoordinate[0], 0],
      [fixedCoordinate[0], -mapSizeProj],
    ];

    const x = fixedCoordinate[0];

    const horizontalRuleCoordinates =
      x > mapSizeProj / 2
        ? [
            [mapSizeProj, -(2 * x - mapSizeProj)],
            [2 * x - mapSizeProj, -mapSizeProj],
          ]
        : [
            [2 * x, 0],
            [0, -2 * x],
          ];

    if (!verticalRuleFeature) {
      verticalRuleFeature = new Feature(
        new LineString(verticalRuleCoordinates)
      );
      verticalRuleFeature.setStyle(this.options.style ?? this.ruleStyle);
      this.ruleFeatures[0] = verticalRuleFeature;
      this.ruleOverlayLayer.getSource()?.addFeature(verticalRuleFeature);
    } else {
      const geometry = verticalRuleFeature.getGeometry();
      if (geometry) {
        geometry.setCoordinates(verticalRuleCoordinates);
      }
    }

    if (!horizontalRuleFeature) {
      horizontalRuleFeature = new Feature(
        new LineString(horizontalRuleCoordinates)
      );
      horizontalRuleFeature.setStyle(this.options.style ?? this.ruleStyle);
      this.ruleFeatures[1] = horizontalRuleFeature;
      this.ruleOverlayLayer.getSource()?.addFeature(horizontalRuleFeature);
    } else {
      const geometry = horizontalRuleFeature.getGeometry();
      if (geometry) {
        geometry.setCoordinates(horizontalRuleCoordinates);
      }
    }
  }

  public handleEvent(mapBrowserEvent: MapBrowserEvent<UIEvent>): boolean {
    switch (mapBrowserEvent.type) {
      case MapBrowserEventType.DBLCLICK:
        {
          mapBrowserEvent.preventDefault();

          const pixel = mapBrowserEvent.pixel;

          const map = this.getMap();
          if (!map) {
            return true;
          }
          const coordinate = map.getCoordinateFromPixelInternal(pixel);
          if (!coordinate) {
            return true;
          }

          const hoveredLayer = this.getHoveredDataLayer(pixel);
          if (!hoveredLayer) {
            return true;
          }
          const fallbackDescriptor =
            this.getLayerResolutionDescriptor(hoveredLayer);
          const guidanceDescriptor =
            this.getGuidanceResolutionDescriptor(fallbackDescriptor);
          const int_coordinates_px = this.coordinateToPxAtResolution(
            coordinate,
            guidanceDescriptor
          );

          this.setActive(false);
          this.ruleFeatures.forEach((f) => {
            if (f) {
              this.ruleOverlayLayer.getSource()?.removeFeature(f);
            }
          });
          this.ruleFeatures = [undefined, undefined];
          this.options.selectionCallback(
            int_coordinates_px,
            guidanceDescriptor.bpResolution
          );
          return false;
        }
        break;
      case MapBrowserEventType.POINTERMOVE:
        this.handlePointerMove(mapBrowserEvent);
        return false;
        break;
      default:
        return false;
    }
  }
}

export { SplitRulesInteraction, Options };
