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
import { transform } from "ol/proj";

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

    const layers =
      this.options.mapManager.viewAndLayersManager.layersHolder.hicDataLayers.filter(
        (l) => l.getData(pixel)
      );

    const hovered_layer =
      layers.length === 0
        ? null
        : layers
            .filter((l) => l instanceof TileLayer)
            .sort((l1, l2) => (l1.getZIndex() ?? 0) - (l2.getZIndex() ?? 0))[0];
    if (!hovered_layer) {
      return;
    }
    const layer_projection = hovered_layer.getSource()?.getProjection();
    if (!layer_projection) {
      return;
    }
    const pixelResolution = hovered_layer.get("pixelResolution");
    const fixed_coordinates = transform(
      coordinate,
      map.getView().getProjection(),
      layer_projection
    ).map((c) => Math.ceil(c / pixelResolution));
    const bpResolutionString = hovered_layer.get("bpResolution");
    const bpResolution = Number(bpResolutionString);
    const int_coordinates_px =
      this.mapManager.contigDimensionHolder.clampPxCoordinatesAtResolution(
        [Math.floor(fixed_coordinates[0]), -Math.floor(fixed_coordinates[1])],
        bpResolution
      );

    const coordinateFromPixel = this.getMap()?.getCoordinateFromPixelInternal(
      mapBrowserEvent.pixel
    ) ?? [0, 0];

    console.log(
      "pixel:",
      mapBrowserEvent.pixel,
      "coordinateFromPixel:",
      coordinateFromPixel,
      "fixed integer coordinates:",
      int_coordinates_px
    );

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

    const bpResolution =
      this.mapManager.viewAndLayersManager.currentViewState.resolutionDesciptor
        .bpResolution;
    const pixelResolution =
      this.mapManager.viewAndLayersManager.currentViewState.resolutionDesciptor
        .pixelResolution;
    const contigCount = this.mapManager.contigDimensionHolder.contig_count;
    const prefixSumPx =
      this.mapManager.contigDimensionHolder.prefix_sum_px.get(bpResolution);
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

          const layers =
            this.options.mapManager.viewAndLayersManager.layersHolder.hicDataLayers.filter(
              (l) => l.getData(pixel)
            );

          const hovered_layer =
            layers.length === 0
              ? null
              : layers
                  .filter((l) => l instanceof TileLayer)
                  .sort(
                    (l1, l2) => (l1.getZIndex() ?? 0) - (l2.getZIndex() ?? 0)
                  )[0];
          if (!hovered_layer) {
            return true;
          }
          const layer_projection = hovered_layer.getSource()?.getProjection();
          if (!layer_projection) {
            return true;
          }
          const pixelResolution = hovered_layer.get("pixelResolution");
          const fixed_coordinates = transform(
            coordinate,
            map.getView().getProjection(),
            layer_projection
          ).map((c) => Math.ceil(c / pixelResolution));
          const bpResolutionString = hovered_layer.get("bpResolution");
          const bpResolution = Number(bpResolutionString);
          const int_coordinates_px =
            this.mapManager.contigDimensionHolder.clampPxCoordinatesAtResolution(
              [
                Math.floor(fixed_coordinates[0]),
                -Math.floor(fixed_coordinates[1]),
              ],
              bpResolution
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
            this.mapManager.viewAndLayersManager.currentViewState
              .resolutionDesciptor.bpResolution
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
