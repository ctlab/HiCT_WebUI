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

import bounds from "binary-search-bounds";
import { Extent, Select } from "ol/interaction";
import { Projection } from "ol/proj";
import type Layer from "ol/layer/Layer";
import type { ContactMapManager } from "./ContactMapManager";
import { Collection, Feature, View } from "ol";
import type { Geometry } from "ol/geom";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Stroke from "ol/style/Stroke";
import Style from "ol/style/Style";
import TileGrid from "ol/tilegrid/TileGrid";
import { asString, type Color } from "ol/color";
import type { ColorLike } from "ol/colorlike";
import { type Ref, ref } from "vue";
import ContigMouseWheelZoom from "@/ContigMouseWheelZoom";
import BinMousePosition from "@/BinMousePosition";
import { VersionedXYZContactMapSource } from "../VersionedXYZSource";
import VectorImageLayer from "ol/layer/VectorImage";
import type { OpenFileResponse } from "../net/netcommon";
import { Track2D } from "@/app/core/tracks/Track2D";
import {
  ContigBordersTrack2D,
  TranslocationArrowsTrack2D,
  ScaffoldBordersTrack2D,
  Track2DSymmetric,
  NamePlacement,
  BorderStyle,
} from "../tracks/Track2DSymmetric";
import { AnnotationTrack2D } from "../tracks/Track2DAnnotations";
import type {
  TrackStylePreset,
  TrackStylePresetBundle,
} from "../tracks/TrackStylePreset";
import Fill from "ol/style/Fill";
import { pointerMove, shiftKeyOnly, singleClick } from "ol/events/condition";
import type { ContigDescriptor } from "../domain/ContigDescriptor";
import { CurrentSignalRangeResponse } from "../net/api/response";
import { SplitRulesInteraction } from "../interactions/SplitRulesInteraction";
import { OverviewMap } from "ol/control";
import { RulerControl } from "../controls/RulerControl";

interface LayerResolutionBorders {
  minResolutionInclusive: number;
  maxResolutionExclusive: number;
}

interface LayerResolutionDescriptor {
  bpResolution: number;
  pixelResolution: number;
  layerResolutionBorders: LayerResolutionBorders;
  imageSizeIndex: number;
}

interface SelectionBorders {
  leftContigOrderInclusive?: number;
  leftContigDescriptorInclusive?: ContigDescriptor;
  rightContigOrderInclusive?: number;
  rightContigDescriptorInclusive?: ContigDescriptor;
  leftPx?: [number, number];
  rightPx?: [number, number];
  leftBP?: [number, number];
  rightBP?: [number, number];
}

enum ActiveTool {
  TRANSLOCATION,
  SCISSORS,
}

interface CurrentHiCViewState {
  resolutionDesciptor: LayerResolutionDescriptor;
  selectionBorders: SelectionBorders;
  activeTool?: ActiveTool;
}

interface LayersHolder {
  readonly hicDataLayers: Layer[];
  readonly track2DLayers: Layer[];
  readonly annotationLayers: Layer[];
  readonly contigBordersLayers: Layer[];
  readonly contigTranslocationArrowsLayers: Layer[];
  readonly scaffoldBordersLayers: Layer[];
  readonly bpResolutionToHiCDataLayer: Map<number, Layer>;
  readonly bpResolutionToAnnotationLayer: Map<number, Layer>;
  readonly bpResolutionToContigBordersLayer: Map<number, Layer>;
  readonly bpResolutionToContigTranslocationArrowsLayer: Map<number, Layer>;
  readonly bpResolutionToScaffoldBordersLayer: Map<number, Layer>;
}

interface Track2DHolder {
  readonly tracks2D: Track2D[];
  readonly annotationTrack: AnnotationTrack2D;
  readonly contigBordersTrack: ContigBordersTrack2D;
  readonly contigTranslocationArrowsTrack: TranslocationArrowsTrack2D;
  readonly scaffoldBordersTrack: ScaffoldBordersTrack2D;
}

class HiCViewAndLayersManager {
  protected readonly contigBorderColor: Ref<string> = ref("ffccee");
  public readonly pixelResolutionSet: number[] = [];
  public readonly resolutions: number[] = [];
  public readonly resolutionToPixelResolution: Map<number, number> = new Map();
  public readonly pixelProjection: Projection;
  public readonly imageSizes: number[] = [];
  public readonly layerProjections: Array<Projection> = [];
  protected readonly imageSizeScaled: number[] = [];
  // protected readonly hicDataLayers: Layer[] = [];
  // protected readonly hicDataSources: Source[] = [];
  // protected readonly contigVectorLayers: Layer[] = [];
  public readonly layersHolder: LayersHolder = {
    hicDataLayers: [],
    track2DLayers: [],
    annotationLayers: [],
    contigBordersLayers: [],
    contigTranslocationArrowsLayers: [],
    scaffoldBordersLayers: [],
    bpResolutionToHiCDataLayer: new Map(),
    bpResolutionToAnnotationLayer: new Map(),
    bpResolutionToContigBordersLayer: new Map(),
    bpResolutionToContigTranslocationArrowsLayer: new Map(),
    bpResolutionToScaffoldBordersLayer: new Map(),
  };
  protected readonly view: View;
  public tileSize: number;

  public selectionCollections: {
    readonly selectedContigFeatures: Collection<Feature<Geometry>>;
    readonly selectedScaffoldFeatures: Collection<Feature<Geometry>>;
    readonly selectedTranslocationArrowsFeatures: Collection<Feature<Geometry>>;
  } = {
    selectedContigFeatures: new Collection(),
    selectedScaffoldFeatures: new Collection(),
    selectedTranslocationArrowsFeatures: new Collection(),
  };

  public currentViewState: CurrentHiCViewState;

  public readonly layersZIndices: {
    readonly HIC_MAP_LAYER_Z_INDEX: number;
    readonly TRACK_2D_LAYER_Z_INDEX: number;
  } = {
    HIC_MAP_LAYER_Z_INDEX: 4,
    TRACK_2D_LAYER_Z_INDEX: 100,
  };

  protected readonly layerResolutionBorders: Map<
    number,
    LayerResolutionBorders
  > = new Map();

  public readonly resolutionTuples: LayerResolutionDescriptor[] = [];

  public readonly resolutionChangedAsyncSubscribers: { (): Promise<void> }[] =
    [];

  public readonly track2DHolder: Track2DHolder;

  public readonly selectionInteractions: {
    readonly contigSelectionInteraction: Select;
    readonly translocationArrowHoverInteraction: Select;
    readonly translocationArrowSelectionInteraction: Select;
    readonly contigSelectExtent: Extent;
  };

  public readonly deferredInitializationInteractions: {
    scissorsGuideInteraction?: SplitRulesInteraction;
  };

  public readonly callbackFns: {
    readonly contrastSliderRangesCallbacks: ((
      ranges: CurrentSignalRangeResponse
    ) => void)[];
  } = {
    contrastSliderRangesCallbacks: [],
  };

  public readonly exportTrackFlags = {
    contigBorders: true,
    scaffoldBorders: true,
    contigNames: true,
    scaffoldNames: true,
    translocationArrows: true,
  };

  constructor(
    public readonly mapManager: ContactMapManager,
    response: OpenFileResponse,
    public readonly useVectorImageLayer: boolean = false
  ) {
    this.mapManager = mapManager;
    this.imageSizes = response.matrixSizesBins;
    this.pixelResolutionSet = response.pixelResolutions;
    this.resolutions = response.resolutions;
    this.tileSize = mapManager.getOptions().tileSize;

    for (let i = 0; i < this.resolutions.length; ++i) {
      this.resolutionToPixelResolution.set(
        this.resolutions[i],
        this.pixelResolutionSet[i]
      );

      this.imageSizeScaled.push(
        this.imageSizes[i] * this.pixelResolutionSet[i]
      );
      this.resolutionTuples.push({
        bpResolution: this.resolutions[i],
        pixelResolution: this.pixelResolutionSet[i],
        layerResolutionBorders: {
          minResolutionInclusive: Number.NaN,
          maxResolutionExclusive: Number.NaN,
        },
        imageSizeIndex: i,
      });
    }

    this.resolutionTuples.sort(
      (a, b) => a.pixelResolution - b.pixelResolution
    );
    for (let i = 0; i < this.resolutionTuples.length; ++i) {
      const layerResolutionBorders: LayerResolutionBorders = {
        minResolutionInclusive:
          i === 0
            ? Number.NEGATIVE_INFINITY
            : this.resolutionTuples[i].pixelResolution,
        maxResolutionExclusive:
          i === this.resolutionTuples.length - 1
            ? Number.POSITIVE_INFINITY
            : this.resolutionTuples[i + 1].pixelResolution,
      };
      this.resolutionTuples[i].layerResolutionBorders = layerResolutionBorders;
      this.layerResolutionBorders.set(
        this.resolutionTuples[i].bpResolution,
        layerResolutionBorders
      );
    }

    this.resolutionTuples.sort(
      (a, b) =>
        a.layerResolutionBorders.minResolutionInclusive -
        b.layerResolutionBorders.minResolutionInclusive
    );
    // Calculate extents for projection:
    const maximum_scaled_image_size = Math.max(...this.imageSizes);
    const maximum_global_extent = [
      0,
      -maximum_scaled_image_size,
      maximum_scaled_image_size,
      0,
    ];
    // Define projection:
    this.pixelProjection = new Projection({
      code: "pixelate",
      units: "pixels",
      metersPerUnit: undefined,
      extent: maximum_global_extent,
      axisOrientation: "esu", // OK, axis orientation is changed in layer projections
      global: false,
      getPointResolution: (resolution) => resolution,
    });
    const minPixelResolution = Math.min(...this.pixelResolutionSet);
    const maxPixelResolution = Math.max(...this.pixelResolutionSet);
    const overzoomFactor = 1024;
    const minResolution = minPixelResolution / overzoomFactor;
    const maxResolution = maxPixelResolution * overzoomFactor;
    // Define view:
    this.view = new View({
      center: [
        this.pixelProjection.getExtent()[0],
        this.pixelProjection.getExtent()[3],
      ],
      resolution: maxPixelResolution,
      minResolution: minResolution,
      maxResolution: maxResolution,
      constrainResolution: false,
      zoomFactor: 2,
      showFullExtent: true,
      constrainOnlyCenter: true,
      projection: this.pixelProjection,
      extent: maximum_global_extent,
    });

    this.currentViewState = {
      resolutionDesciptor: {
        bpResolution: Number.NaN,
        layerResolutionBorders: {
          maxResolutionExclusive: Number.NaN,
          minResolutionInclusive: Number.NaN,
        },
        pixelResolution: Number.NaN,
        imageSizeIndex: Number.NaN,
      },
      selectionBorders: {
        leftContigDescriptorInclusive: undefined,
        leftContigOrderInclusive: undefined,
        rightContigDescriptorInclusive: undefined,
        rightContigOrderInclusive: undefined,
      },
    };

    this.track2DHolder = {
      tracks2D: [],
      annotationTrack: new AnnotationTrack2D(this.mapManager),
      contigBordersTrack: new ContigBordersTrack2D(this.mapManager),
      contigTranslocationArrowsTrack: new TranslocationArrowsTrack2D(
        this.mapManager
      ),
      scaffoldBordersTrack: new ScaffoldBordersTrack2D(this.mapManager),
    };
    this.track2DHolder.tracks2D.push(this.track2DHolder.annotationTrack);

    this.track2DHolder.contigBordersTrack.setNamePlacement(
      NamePlacement.TOP
    );
    this.track2DHolder.scaffoldBordersTrack.setNamePlacement(
      NamePlacement.TOP
    );

    this.deferredInitializationInteractions = {
      scissorsGuideInteraction: undefined,
    };

    this.selectionInteractions = {
      contigSelectionInteraction: new Select({
        multi: false,
        layers: this.layersHolder.contigBordersLayers,
        style: new Style({
          fill: new Fill({
            color: "rgba(255, 36, 36, 0.7)",
          }),
          stroke: new Stroke({
            color: "rgba(64, 0, 255, 0.9)",
            width: 7,
          }),
        }),
        hitTolerance: 0,
        features: this.selectionCollections.selectedContigFeatures,
        condition: singleClick,
      }),
      translocationArrowHoverInteraction: new Select({
        multi: false,
        layers: this.layersHolder.contigTranslocationArrowsLayers,
        style: new Style({
          fill: new Fill({
            color: "rgba(255, 36, 64, 0.7)",
          }),
          stroke: new Stroke({
            color: "rgba(64, 0, 255, 0.1)",
            width: 2,
          }),
        }),
        hitTolerance: 0,
        condition: pointerMove,
        // filter: (feature, layer) => {
        //   console.log("Hover over", feature, layer);
        //   return true;
        // },
      }),
      translocationArrowSelectionInteraction: new Select({
        multi: false,
        layers: this.layersHolder.contigTranslocationArrowsLayers,
        style: new Style({
          fill: new Fill({
            color: "rgba(255, 36, 255, 0.7)",
          }),
          stroke: new Stroke({
            color: "rgba(64, 0, 255, 0.1)",
            width: 20,
          }),
        }),
        hitTolerance: 0,
        features: this.selectionCollections.selectedTranslocationArrowsFeatures,
        condition: singleClick,
      }),
      contigSelectExtent: new Extent({
        condition: shiftKeyOnly,
        pixelTolerance: 0,
      }),
    };

    this.view.on("change:resolution", async () => {
      await this.onViewResolutionChanged();
    });
    this.updateCurrentHiCViewState();
  }

  public async onViewResolutionChanged(): Promise<void> {
    this.updateCurrentHiCViewState();
    await Promise.all(this.resolutionChangedAsyncSubscribers.map((fn) => fn()));
  }

  public updateCurrentHiCViewState(): void {
    const viewResolution = this.view.getResolution() ?? 0;
    const resolutionDescriptor =
      this.viewResolutionToResolutionDescriptor(viewResolution);
    this.currentViewState.resolutionDesciptor = resolutionDescriptor;
    this.syncLayerVisibilityForCurrentResolution();
  }

  public onTileSizeChanged(tileSize: number): void {
    this.tileSize = tileSize;
    this.reloadTiles();
  }

  public addContrastSliderCallback(
    callbackfn: (ranges: CurrentSignalRangeResponse) => void
  ): void {
    this.callbackFns.contrastSliderRangesCallbacks.push(callbackfn);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public onContigBorderColorChanged(contigBorderColor: string): void {
    this.track2DHolder.contigBordersTrack.options.borderColor =
      contigBorderColor;

    this.track2DHolder.contigBordersTrack.style =
      this.track2DHolder.contigBordersTrack.generateStyleFunction()();

    this.reloadTracks();
  }

  public onScanffoldBorderColorChanged(scaffoldBorderColor: string): void {
    this.track2DHolder.scaffoldBordersTrack.options.borderColor =
      scaffoldBorderColor;

    this.track2DHolder.scaffoldBordersTrack.style =
      this.track2DHolder.scaffoldBordersTrack.generateStyleFunction()();

    this.reloadTracks();
  }

  public onContigBorderStyleChanged(style: BorderStyle): void {
    this.track2DHolder.contigBordersTrack.setStyleType(style);

    this.track2DHolder.contigBordersTrack.style =
      this.track2DHolder.contigBordersTrack.generateStyleFunction()();

    this.reloadTracks();
  }

  public onContigBorderWidthChanged(width: number): void {
    this.track2DHolder.contigBordersTrack.options.width = Math.max(1, width);
    this.track2DHolder.contigBordersTrack.style =
      this.track2DHolder.contigBordersTrack.generateStyleFunction()();
    this.reloadTracks();
  }

  public onContigFillColorChanged(fillColor: string): void {
    this.track2DHolder.contigBordersTrack.options.fillColor = fillColor;
    this.track2DHolder.contigBordersTrack.style =
      this.track2DHolder.contigBordersTrack.generateStyleFunction()();
    this.reloadTracks();
  }

  public onScanffoldBorderStyleChanged(style: BorderStyle): void {
    this.track2DHolder.scaffoldBordersTrack.setStyleType(style);

    this.track2DHolder.scaffoldBordersTrack.style =
      this.track2DHolder.scaffoldBordersTrack.generateStyleFunction()();

    this.reloadTracks();
  }

  public onScaffoldBorderWidthChanged(width: number): void {
    this.track2DHolder.scaffoldBordersTrack.options.width = Math.max(1, width);
    this.track2DHolder.scaffoldBordersTrack.style =
      this.track2DHolder.scaffoldBordersTrack.generateStyleFunction()();
    this.reloadTracks();
  }

  public onScaffoldFillColorChanged(fillColor: string): void {
    this.track2DHolder.scaffoldBordersTrack.options.fillColor = fillColor;
    this.track2DHolder.scaffoldBordersTrack.style =
      this.track2DHolder.scaffoldBordersTrack.generateStyleFunction()();
    this.reloadTracks();
  }

  public onContigLabelSizeChanged(size: number): void {
    this.track2DHolder.contigBordersTrack.setLabelSize(size);
    this.reloadTracks();
  }

  public onScaffoldLabelSizeChanged(size: number): void {
    this.track2DHolder.scaffoldBordersTrack.setLabelSize(size);
    this.reloadTracks();
  }

  public onContigLabelBoldChanged(enabled: boolean): void {
    this.track2DHolder.contigBordersTrack.setLabelBold(enabled);
    this.reloadTracks();
  }

  public onScaffoldLabelBoldChanged(enabled: boolean): void {
    this.track2DHolder.scaffoldBordersTrack.setLabelBold(enabled);
    this.reloadTracks();
  }

  public onContigLabelOutlineChanged(enabled: boolean): void {
    this.track2DHolder.contigBordersTrack.setLabelOutline(enabled);
    this.reloadTracks();
  }

  public onScaffoldLabelOutlineChanged(enabled: boolean): void {
    this.track2DHolder.scaffoldBordersTrack.setLabelOutline(enabled);
    this.reloadTracks();
  }

  public onContigLabelOutlineWidthChanged(width: number): void {
    this.track2DHolder.contigBordersTrack.setLabelOutlineWidth(width);
    this.reloadTracks();
  }

  public onScaffoldLabelOutlineWidthChanged(width: number): void {
    this.track2DHolder.scaffoldBordersTrack.setLabelOutlineWidth(width);
    this.reloadTracks();
  }

  public onContigExportEnabledChanged(enabled: boolean): void {
    this.exportTrackFlags.contigBorders = enabled;
  }

  public onScaffoldExportEnabledChanged(enabled: boolean): void {
    this.exportTrackFlags.scaffoldBorders = enabled;
  }

  public onContigNamesExportEnabledChanged(enabled: boolean): void {
    this.exportTrackFlags.contigNames = enabled;
  }

  public onScaffoldNamesExportEnabledChanged(enabled: boolean): void {
    this.exportTrackFlags.scaffoldNames = enabled;
  }

  public getExportTrackFlags() {
    return { ...this.exportTrackFlags };
  }

  public onContigLabelOffsetMultiplierChanged(multiplier: number): void {
    this.track2DHolder.contigBordersTrack.setLabelOffsetMultiplier(multiplier);
    this.reloadTracks();
  }

  public onScaffoldLabelOffsetMultiplierChanged(multiplier: number): void {
    this.track2DHolder.scaffoldBordersTrack.setLabelOffsetMultiplier(multiplier);
    this.reloadTracks();
  }

  public onContigNamePlacementChanged(placement: NamePlacement): void {
    this.track2DHolder.contigBordersTrack.setNamePlacement(placement);
    this.reloadTracks();
  }

  public onScaffoldNamePlacementChanged(placement: NamePlacement): void {
    this.track2DHolder.scaffoldBordersTrack.setNamePlacement(placement);
    this.reloadTracks();
  }

  public onNamePlacementChanged(placement: NamePlacement): void {
    this.track2DHolder.contigBordersTrack.setNamePlacement(placement);
    this.track2DHolder.scaffoldBordersTrack.setNamePlacement(placement);
    this.reloadTracks();
  }

  public getTrackStylePreset(): TrackStylePresetBundle {
    return {
      contigs: this.getSingleTrackStylePreset(
        this.track2DHolder.contigBordersTrack
      ),
      scaffolds: this.getSingleTrackStylePreset(
        this.track2DHolder.scaffoldBordersTrack
      ),
    };
  }

  public applyTrackStylePreset(preset: TrackStylePresetBundle): void {
    this.applySingleTrackStylePreset(
      this.track2DHolder.contigBordersTrack,
      preset.contigs
    );
    this.applySingleTrackStylePreset(
      this.track2DHolder.scaffoldBordersTrack,
      preset.scaffolds
    );
    this.reloadTracks();
  }

  private getSingleTrackStylePreset(track: Track2DSymmetric): TrackStylePreset {
    const borderColor = this.colorLikeToString(track.options.borderColor);
    const fillColor = this.colorLikeToString(track.options.fillColor);
    return {
      borderColor,
      fillColor,
      width: track.options.width,
      labelSize: track.getLabelSize(),
      labelOffsetMultiplier: track.getLabelOffsetMultiplier(),
      labelBold: track.getLabelBold(),
      labelOutline: track.getLabelOutline(),
      labelOutlineWidth: track.getLabelOutlineWidth(),
      labelColor: this.colorLikeToString(track.getLabelColor()),
      borderStyle: track.getStyleType(),
      namePlacement: track.getNamePlacement(),
    };
  }

  private applySingleTrackStylePreset(
    track: Track2DSymmetric,
    preset: TrackStylePreset
  ): void {
    track.options.borderColor = preset.borderColor;
    track.options.fillColor = preset.fillColor;
    track.options.width = Math.max(1, preset.width);
    track.setLabelSize(preset.labelSize ?? track.getLabelSize());
    if (preset.labelOffsetMultiplier !== undefined) {
      track.setLabelOffsetMultiplier(preset.labelOffsetMultiplier);
    }
    if (preset.labelBold !== undefined) {
      track.setLabelBold(preset.labelBold);
    }
    if (preset.labelOutline !== undefined) {
      track.setLabelOutline(preset.labelOutline);
    }
    if (preset.labelOutlineWidth !== undefined) {
      track.setLabelOutlineWidth(preset.labelOutlineWidth);
    }
    if (preset.labelColor !== undefined) {
      track.setLabelColor(preset.labelColor);
    }
    if (preset.namePlacement !== undefined) {
      if (typeof preset.namePlacement === "string") {
        const key = preset.namePlacement as keyof typeof NamePlacement;
        if (NamePlacement[key] !== undefined) {
          track.setNamePlacement(NamePlacement[key]);
        }
      } else {
        track.setNamePlacement(preset.namePlacement);
      }
    }
    track.setStyleType(preset.borderStyle);
    track.style = track.generateStyleFunction()();
  }

  private colorLikeToString(color: Color | ColorLike): string {
    if (typeof color === "string") {
      return color;
    }
    return asString(color as Color);
  }

  public getView(): View {
    return this.view;
  }

  public getMapManager(): ContactMapManager {
    return this.mapManager;
  }

  public addTrack(track: Track2DSymmetric | Track2D) {
    if (track instanceof Track2DSymmetric) {
      this.add2DTrackSymmetric(track);
    } else if (track instanceof Track2D) {
      this.add2DTrack(track);
    }
    this.reloadTiles();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected add2DTrack(track: Track2D) {
    throw new Error("Adding non-symmetric 2D Track is not yet implemented");
  }

  protected add2DTrackSymmetric(
    track: Track2DSymmetric,
    layersCollection: Layer[] = this.layersHolder.track2DLayers
  ) {
    console.log(
      "Adding track: ",
      track,
      " is it Track2DSymmetric: ",
      track instanceof Track2DSymmetric,
      " is it ContigBordersTrack2D: ",
      track instanceof ContigBordersTrack2D
    );
    this.resolutionTuples.forEach(
      ({ bpResolution, pixelResolution, layerResolutionBorders }) => {
        const boundingBoxPolygonFeatures = track.features.get(bpResolution);
        if (!boundingBoxPolygonFeatures) {
          throw new Error(
            `Track ${track.trackDescriptor.name} has no features at resolution ${bpResolution}`
          );
        }
        const vectorSource = new VectorSource();
        vectorSource.addFeatures(boundingBoxPolygonFeatures);
        const vectorLayer = new (
          this.useVectorImageLayer ? VectorImageLayer : VectorLayer
        )({
          source: vectorSource,
          zIndex:
            this.layersZIndices.TRACK_2D_LAYER_Z_INDEX + track.options.zIndex,
          minResolution: layerResolutionBorders.minResolutionInclusive,
          maxResolution: layerResolutionBorders.maxResolutionExclusive,
        });
        vectorLayer.set("bpResolution", bpResolution);
        vectorLayer.set(
          "pixelResolution",
          this.resolutionToPixelResolution.get(bpResolution)
        );
        layersCollection.push(vectorLayer);
        this.mapManager.getMap().addLayer(vectorLayer);
      }
    );
  }

  public initializeMapsDataLayers() {
    // Add layers to the view (create tile grid -> create source -> create layer -> map.addLayer):
    for (let i = 0; i < this.imageSizes.length; ++i) {
      // Prepare parameters:
      const layerResolution = this.resolutions[i];
      const layerPixelResolution = this.pixelResolutionSet[i];
      const layer_image_size = this.imageSizes[i] * layerPixelResolution;
      const scaled_layer_extent = [0, -layer_image_size, layer_image_size, 0];
      const layerTileGrid = new TileGrid({
        extent: scaled_layer_extent,
        resolutions: [layerPixelResolution],
        tileSize: [
          this.mapManager.getOptions().tileSize,
          this.mapManager.getOptions().tileSize,
        ],
      });
      const layerSource = new VersionedXYZContactMapSource(
        this,
        i,
        layerResolution,
        {
          projection: this.pixelProjection,
          tileGrid: layerTileGrid,
          interpolate: false,
          cacheSize: 0,
        }
      );
      layerSource.do_reload();
      // Define layer:
      const layer = new TileLayer({
        source: layerSource,
        // cacheSize: 0,
        minResolution: this.toFiniteResolutionBound(
          this.layerResolutionBorders.get(layerResolution)?.minResolutionInclusive
        ),
        maxResolution: this.toFiniteResolutionBound(
          this.layerResolutionBorders.get(layerResolution)?.maxResolutionExclusive
        ),
        zIndex: this.layersZIndices.HIC_MAP_LAYER_Z_INDEX,
      });
      layer.set("bpResolution", layerResolution);
      layer.set("pixelResolution", layerPixelResolution);
      this.mapManager.getMap().addLayer(layer);
      this.layersHolder.hicDataLayers.push(layer);
      this.layersHolder.bpResolutionToHiCDataLayer.set(layerResolution, layer);
    }
  }

  public bpCoordinatesToGlobalCoordinates(
    [x, y]: [number, number],
    bpResolution: number
  ): [number, number] {
    const [x_pix, y_pix] = [x, y].map((bp) =>
      this.mapManager.contigDimensionHolder.getPxContainingBp(bp, bpResolution)
    );
    const [x_glc, y_glc] = [x_pix, y_pix].map(
      (p) => p * (this.resolutionToPixelResolution.get(bpResolution) ?? 1.0)
    );
    return [x_glc, -y_glc];
  }

  public viewResolutionToBpResolution(viewResolution: number) {
    return this.viewResolutionToResolutionDescriptor(viewResolution)
      .bpResolution;
  }

  public viewResolutionToResolutionDescriptor(
    viewResolution: number
  ): LayerResolutionDescriptor {
    if (this.resolutionTuples.length === 0) {
      throw new Error("No resolutions available");
    }
    const testElement: LayerResolutionDescriptor = {
      bpResolution: Number.NaN,
      pixelResolution: Number.NaN,
      layerResolutionBorders: {
        minResolutionInclusive: viewResolution,
        maxResolutionExclusive: Number.NaN,
      },
      imageSizeIndex: Number.NaN,
    };
    const descriptorIndexRaw: number = bounds.le(
      this.resolutionTuples,
      testElement,
      (d1, d2) =>
        d1.layerResolutionBorders.minResolutionInclusive -
        d2.layerResolutionBorders.minResolutionInclusive
    );
    const descriptorIndex = Math.max(
      0,
      Math.min(descriptorIndexRaw, this.resolutionTuples.length - 1)
    );
    const descriptor = this.resolutionTuples[descriptorIndex];
    return descriptor;
  }

  public initializeTracks(): void {
    this.reloadTracks();
    this.add2DTrackSymmetric(
      this.track2DHolder.annotationTrack,
      this.layersHolder.annotationLayers
    );
    this.layersHolder.annotationLayers.forEach((layer) => {
      this.layersHolder.bpResolutionToAnnotationLayer.set(
        layer.get("bpResolution"),
        layer
      );
    });
    this.add2DTrackSymmetric(
      this.track2DHolder.contigBordersTrack,
      this.layersHolder.contigBordersLayers
    );
    this.layersHolder.contigBordersLayers.forEach((layer) => {
      this.layersHolder.bpResolutionToContigBordersLayer.set(
        layer.get("bpResolution"),
        layer
      );
    });
    this.add2DTrackSymmetric(
      this.track2DHolder.contigTranslocationArrowsTrack,
      this.layersHolder.contigTranslocationArrowsLayers
    );
    this.layersHolder.contigTranslocationArrowsLayers.forEach((layer) => {
      this.layersHolder.bpResolutionToContigTranslocationArrowsLayer.set(
        layer.get("bpResolution"),
        layer
      );
      layer.setVisible(
        this.currentViewState.activeTool === ActiveTool.TRANSLOCATION
      );
      layer.changed();
    });
    this.add2DTrackSymmetric(
      this.track2DHolder.scaffoldBordersTrack,
      this.layersHolder.scaffoldBordersLayers
    );
    this.layersHolder.scaffoldBordersLayers.forEach((layer) => {
      this.layersHolder.bpResolutionToScaffoldBordersLayer.set(
        layer.get("bpResolution"),
        layer
      );
    });
  }

  public initializeMapControls(): void {
    this.mapManager.getMap().addControl(
      new BinMousePosition({
        projection: this.pixelProjection,
        dimension_holder: this.mapManager.getContigDimensionHolder(),
        layers: this.layersHolder.hicDataLayers,
      })
    );
    const rulerH = new RulerControl({
      // position: "top",
      direction: "horizontal",
      mapManager: this.mapManager,
      target: "horizontal-ruler-div",
    });
    const rulerV = new RulerControl({
      // position: "top",
      direction: "vertical",
      mapManager: this.mapManager,
      target: "vertical-ruler-div",
    });
    try {
      const map = this.mapManager.getMap();
      map.on("moveend", (event) => {
        rulerH.render(event);
      });
      map.on("moveend", (event) => {
        rulerV.render(event);
      });
      map.once("postrender", () => {
        rulerH.render({ map } as never);
        rulerV.render({ map } as never);
      });
    } catch (e: unknown) {
      console.log("Error while adding rulers", e);
    }
  }

  public dispose(): void {
    if (!this.mapManager.getMap()) {
      return;
    }
    try {
      this.mapManager.getMap().getControls().clear();
      const hRuler = document.getElementById("horizontal-ruler-div");
      if (hRuler) {
        hRuler.replaceChildren();
      }
      const vRuler = document.getElementById("vertical-ruler-div");
      if (vRuler) {
        vRuler.replaceChildren();
      }
    } catch (e: unknown) {
      console.log("Error while disposing controls", e);
    }
  }

  public initializeMapInteractions(): void {
    this.mapManager.getMap().addInteraction(
      new ContigMouseWheelZoom({
        dimension_holder: this.mapManager.getContigDimensionHolder(),
        resolutions: this.resolutions,
        pixelResolutionSet: this.pixelResolutionSet,
        global_projection: this.pixelProjection,
        layers: this.layersHolder.hicDataLayers,
      })
    );
    this.mapManager
      .getMap()
      .addInteraction(this.selectionInteractions.contigSelectionInteraction);
    this.selectionInteractions.translocationArrowHoverInteraction.setActive(
      this.currentViewState.activeTool === ActiveTool.TRANSLOCATION
    );
    this.selectionInteractions.translocationArrowSelectionInteraction.setActive(
      this.currentViewState.activeTool === ActiveTool.TRANSLOCATION
    );
    this.mapManager
      .getMap()
      .addInteraction(
        this.selectionInteractions.translocationArrowHoverInteraction
      );
    this.mapManager
      .getMap()
      .addInteraction(
        this.selectionInteractions.translocationArrowSelectionInteraction
      );
    this.deferredInitializationInteractions.scissorsGuideInteraction =
      new SplitRulesInteraction({
        mapManager: this.mapManager,
        selectionCallback: this.mapManager.eventManager.onClickInScissorsMode,
        wrapX: false,
        zIndex: this.layersZIndices.TRACK_2D_LAYER_Z_INDEX * 2 + 1,
      });
    this.mapManager
      .getMap()
      .addInteraction(
        this.deferredInitializationInteractions.scissorsGuideInteraction
      );
    this.deferredInitializationInteractions.scissorsGuideInteraction.setActive(
      false
    );
    this.selectionInteractions.contigSelectionInteraction.on(
      "select",
      (evt) => {
        const c = evt.mapBrowserEvent.coordinate;
        this.selectionInteractions.contigSelectExtent.setExtent([
          c[0],
          c[1],
          c[0],
          c[1],
        ]);
        const selectedArray =
          this.selectionCollections.selectedContigFeatures.getArray();
        if (selectedArray && selectedArray.length > 0) {
          const selectedContigFeature = selectedArray[0];
          const contigDescriptor = selectedContigFeature.get(
            "contigDescriptor"
          ) as ContigDescriptor;
          const contigOrder =
            this.mapManager.contigDimensionHolder.contigIdToOrd[
              contigDescriptor.contigId
            ];

          this.currentViewState.selectionBorders = {
            leftContigOrderInclusive: contigOrder,
            leftContigDescriptorInclusive: contigDescriptor,
            rightContigOrderInclusive: contigOrder,
            rightContigDescriptorInclusive: contigDescriptor,
          };
        }
      }
    );

    this.selectionInteractions.translocationArrowSelectionInteraction
      .getFeatures()
      .on("add", () => {
        this.mapManager.eventManager.onClickInTranslocationMode();
        this.selectionInteractions.translocationArrowSelectionInteraction
          .getFeatures()
          .clear();
      });
    this.selectionInteractions.contigSelectExtent.on("extentchanged", () => {
      this.selectionCollections.selectedContigFeatures.clear();
      const extent = this.selectionInteractions.contigSelectExtent.getExtent();
      if (!extent) {
        this.currentViewState.selectionBorders = {
          leftContigOrderInclusive: undefined,
          leftContigDescriptorInclusive: undefined,
          rightContigOrderInclusive: undefined,
          rightContigDescriptorInclusive: undefined,
          leftPx: undefined,
          rightPx: undefined,
          leftBP: undefined,
          rightBP: undefined,
        };
        return;
      }

      const bpResolution =
        this.currentViewState.resolutionDesciptor.bpResolution;

      const [a, b, c, d] = extent;
      const [x0, y0, x1, y1] = [a, -d, c, -b];

      const [x0_px, y0_px, x1_px, y1_px] = [x0, y0, x1, y1].map((c) =>
        Math.floor(
          c / this.currentViewState.resolutionDesciptor.pixelResolution
        )
      );

      const [leftPxInclusive, rightPxInclusive] = [
        Math.max(x0_px, y0_px),
        Math.min(x1_px, y1_px),
      ];

      let [leftContigOrderInclusive, rightContigOrderInclusive] = [
        leftPxInclusive,
        rightPxInclusive,
      ].map((px) =>
        this.mapManager.contigDimensionHolder.getContigOrderByPx(
          px,
          bpResolution
        )
      );

      if (leftPxInclusive < 0) {
        leftContigOrderInclusive = 0;
      }
      if (
        rightPxInclusive >
        this.imageSizes[
          this.currentViewState.resolutionDesciptor.imageSizeIndex
        ]
      ) {
        rightContigOrderInclusive =
          this.mapManager.contigDimensionHolder.contig_count - 1;
      }

      const [leftContigDescriptorInclusive, rightContigDescriptorInclusive] = [
        leftContigOrderInclusive,
        rightContigOrderInclusive,
      ].map(
        (ctgOrder) =>
          this.mapManager.contigDimensionHolder.contigDescriptors[ctgOrder]
      );

      this.currentViewState.selectionBorders = {
        leftContigOrderInclusive: leftContigOrderInclusive,
        leftContigDescriptorInclusive: leftContigDescriptorInclusive,
        rightContigOrderInclusive: rightContigOrderInclusive,
        rightContigDescriptorInclusive: rightContigDescriptorInclusive,
        leftPx: [x0_px, y0_px],
        rightPx: [x1_px, y1_px],
        leftBP: [
          this.mapManager.contigDimensionHolder.getStartBpOfPx(
            x0_px,
            bpResolution
          ),
          this.mapManager.contigDimensionHolder.getStartBpOfPx(
            y0_px,
            bpResolution
          ),
        ],
        rightBP: [
          this.mapManager.contigDimensionHolder.getStartBpOfPx(
            x1_px,
            bpResolution
          ),
          this.mapManager.contigDimensionHolder.getStartBpOfPx(
            y1_px,
            bpResolution
          ),
        ],
      };

      const activeContigBordersLayer =
        this.layersHolder.bpResolutionToContigBordersLayer.get(bpResolution);
      if (!activeContigBordersLayer) {
        throw new Error(
          `Unknown bp resolution ${bpResolution} that does not correspond to any contig borders layer`
        );
      }
      const vectorSource = activeContigBordersLayer.getSource() as VectorSource;

      const boxFeatures = vectorSource
        .getFeaturesInExtent(extent)
        .filter((feature) => feature?.getGeometry()?.intersectsExtent(extent));
      this.selectionCollections.selectedContigFeatures.extend(boxFeatures);
    });
    this.mapManager.map.addInteraction(
      this.selectionInteractions.contigSelectExtent
    );
  }

  public getActiveHiCDataLayer(): Layer {
    const bpResolution = this.currentViewState.resolutionDesciptor.bpResolution;
    const layer =
      this.layersHolder.bpResolutionToHiCDataLayer.get(bpResolution);
    if (!layer) {
      throw new Error(
        `Unknown resolution ${bpResolution} for Hi-C data layers`
      );
    }
    return layer;
  }

  public getActiveContigBordersLayer(): Layer<VectorSource> {
    const bpResolution = this.currentViewState.resolutionDesciptor.bpResolution;
    const layer = !isNaN(bpResolution)
      ? this.layersHolder.bpResolutionToContigBordersLayer.get(bpResolution)
      : this.layersHolder.contigBordersLayers[0];
    if (!layer) {
      throw new Error(
        `Unknown resolution ${bpResolution} for contig borders layers`
      );
    }
    return layer as Layer<VectorSource>;
  }

  public getActiveScaffoldBordersLayer(): Layer<VectorSource> {
    const bpResolution = this.currentViewState.resolutionDesciptor.bpResolution;
    const layer =
      this.layersHolder.bpResolutionToScaffoldBordersLayer.get(bpResolution);
    if (!layer) {
      throw new Error(
        `Unknown resolution ${bpResolution} for scaffold borders layers`
      );
    }
    return layer as Layer<VectorSource>;
  }

  public reloadTiles(version?: number): void {
    for (const layer of this.layersHolder.hicDataLayers) {
      const source = layer.getSource();
      if (source instanceof VersionedXYZContactMapSource) {
        if (version !== undefined) {
          source.reloadWithVersion(version);
        } else {
          source.do_reload();
        }
      }
    }
  }

  public reloadTracks(): void {
    for (const track of this.track2DHolder.tracks2D) {
      track.recalculateBorders();
    }
    this.track2DHolder.contigBordersTrack.recalculateBorders();
    this.track2DHolder.scaffoldBordersTrack.recalculateBorders();
    this.track2DHolder.contigTranslocationArrowsTrack.recalculateBorders();
    for (const layer of this.layersHolder.track2DLayers) {
      //TODO:
      layer.getSource()?.changed();
      layer.changed();
    }
    for (const layer of this.layersHolder.annotationLayers) {
      const source = layer.getSource() as VectorSource | undefined;
      if (source) {
        source.clear();
        const features = this.track2DHolder.annotationTrack.features.get(
          layer.get("bpResolution")
        );
        if (features) {
          source.addFeatures(features);
        }
        source.changed();
      }
      layer.changed();
    }
    for (const layer of this.layersHolder.contigBordersLayers) {
      const source = layer.getSource() as VectorSource | undefined;
      if (source) {
        source.clear();
        const features = this.track2DHolder.contigBordersTrack.features.get(
          layer.get("bpResolution")
        );
        if (!features) {
          throw new Error(
            `Cannot refresh contig borders track at resolution ${layer.get(
              "bpResolution"
            )}`
          );
        }
        source.addFeatures(features);
        source.changed();
      }
      layer.changed();
    }
    for (const layer of this.layersHolder.contigTranslocationArrowsLayers) {
      console.log(
        "reloadTracks: active tool is",
        this.currentViewState.activeTool
      );
      layer.setVisible(
        this.currentViewState.activeTool === ActiveTool.TRANSLOCATION
      );
      const source = layer.getSource() as VectorSource | undefined;
      if (source) {
        source.clear();
        if (layer.getVisible()) {
          const features =
            this.track2DHolder.contigTranslocationArrowsTrack.features.get(
              layer.get("bpResolution")
            );
          if (!features) {
            throw new Error(
              `Cannot refresh contig translocation arrows track at resolution ${layer.get(
                "bpResolution"
              )}`
            );
          }
          source.addFeatures(features);
        }
        source.changed();
      }
      layer.changed();
    }
    for (const layer of this.layersHolder.scaffoldBordersLayers) {
      const source = layer.getSource() as VectorSource | undefined;
      if (source) {
        source.clear();
        const features = this.track2DHolder.scaffoldBordersTrack.features.get(
          layer.get("bpResolution")
        );
        if (!features) {
          throw new Error(
            `Cannot refresh scaffold borders track at resolution ${layer.get(
              "bpResolution"
            )}`
          );
        }
        source.addFeatures(features);
        source.changed();
      }
      layer.changed();
    }
    void this.mapManager.linearTrackManager.render();
  }

  public reloadVisuals(): void {
    this.reloadTiles();
    this.reloadTracks();
    this.mapManager.map.changed();
  }

  private toFiniteResolutionBound(bound: number | undefined): number | undefined {
    return Number.isFinite(bound) ? bound : undefined;
  }

  private syncLayerVisibilityForCurrentResolution(): void {
    const activeResolution = this.currentViewState.resolutionDesciptor.bpResolution;
    if (!Number.isFinite(activeResolution)) {
      return;
    }

    for (const layer of this.layersHolder.hicDataLayers) {
      const layerResolution = Number(layer.get("bpResolution"));
      layer.setVisible(layerResolution === activeResolution);
    }

    for (const layer of this.layersHolder.contigBordersLayers) {
      const layerResolution = Number(layer.get("bpResolution"));
      layer.setVisible(layerResolution === activeResolution);
    }

    for (const layer of this.layersHolder.scaffoldBordersLayers) {
      const layerResolution = Number(layer.get("bpResolution"));
      layer.setVisible(layerResolution === activeResolution);
    }

    for (const layer of this.layersHolder.contigTranslocationArrowsLayers) {
      const layerResolution = Number(layer.get("bpResolution"));
      layer.setVisible(
        layerResolution === activeResolution &&
          this.currentViewState.activeTool === ActiveTool.TRANSLOCATION
      );
    }

    for (const layer of this.layersHolder.annotationLayers) {
      const layerResolution = Number(layer.get("bpResolution"));
      layer.setVisible(layerResolution === activeResolution);
    }
  }

  public addAnnotationMarkerAtCenter(name?: string): void {
    const center = this.getView().getCenter();
    if (!center) {
      return;
    }
    const descriptor = this.currentViewState.resolutionDesciptor;
    const xPx = center[0] / descriptor.pixelResolution;
    const yPx = -center[1] / descriptor.pixelResolution;
    const xBp = this.mapManager
      .getContigDimensionHolder()
      .getStartBpOfPx(Math.floor(xPx), descriptor.bpResolution);
    const yBp = this.mapManager
      .getContigDimensionHolder()
      .getStartBpOfPx(Math.floor(yPx), descriptor.bpResolution);
    this.track2DHolder.annotationTrack.addMarkerFromAssemblyBp(
      xBp,
      yBp,
      name ?? `marker_${this.track2DHolder.annotationTrack.getMarkerCount() + 1}`
    );
    this.reloadTracks();
  }

  public addAnnotationRectangleFromSelection(name?: string): void {
    const left = this.currentViewState.selectionBorders.leftBP;
    const right = this.currentViewState.selectionBorders.rightBP;
    if (!left || !right) {
      return;
    }
    this.track2DHolder.annotationTrack.addRectangleFromAssemblyBp(
      Math.min(left[0], right[0]),
      Math.max(left[0], right[0]),
      Math.min(left[1], right[1]),
      Math.max(left[1], right[1]),
      name ??
        `rect_${this.track2DHolder.annotationTrack.getRectangleCount() + 1}`
    );
    this.reloadTracks();
  }

  public clearAnnotations(): void {
    this.track2DHolder.annotationTrack.clearAll();
    this.reloadTracks();
  }
}

export {
  HiCViewAndLayersManager,
  type LayerResolutionDescriptor,
  type LayerResolutionBorders,
  type LayersHolder,
  type CurrentHiCViewState,
  type SelectionBorders,
  type Track2DHolder,
  ActiveTool,
};
