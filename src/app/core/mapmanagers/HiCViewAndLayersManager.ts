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

import { Extent, Select } from "ol/interaction";
import { Projection } from "ol/proj";
import type Layer from "ol/layer/Layer";
import type { ContactMapManager } from "./ContactMapManager";
import { Collection, Feature, View } from "ol";
import type { ViewOptions } from "ol/View";
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
import type { SecondarySourceCompatibility } from "../net/api/RequestManager";
import {
  buildSourceResolutionDescriptorSet,
  calculateMaximumScaledImageSize as calculateMaximumScaledImageSizeForSets,
  getNavigationResolutionModel as getNavigationResolutionModelForSets,
  getFinestVisibleResolutionDescriptor,
  getResolutionDescriptorForViewResolution,
  getVectorResolutionTuples as getVectorResolutionTuplesForSets,
  type LayerResolutionBorders,
  type LayerResolutionDescriptor,
  type MatrixSourceName,
  type SourceResolutionDescriptorSet,
} from "./resolutionModel";

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

type AxisScopeKind = "all" | "contig" | "scaffold";

interface AxisScopeSelection {
  kind: AxisScopeKind;
  id?: number;
  label: string;
  startBp?: number;
  endBp?: number;
}

interface MapAxisScopes {
  readonly row: AxisScopeSelection;
  readonly column: AxisScopeSelection;
}

interface MapAxisScopePixelBounds {
  readonly colStartPx: number;
  readonly colEndPx: number;
  readonly rowStartPx: number;
  readonly rowEndPx: number;
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
  readonly primaryHiCDataLayers: Layer[];
  readonly secondaryHiCDataLayers: Layer[];
  readonly track2DLayers: Layer[];
  readonly annotationLayers: Layer[];
  readonly contigBordersLayers: Layer[];
  readonly contigTranslocationArrowsLayers: Layer[];
  readonly scaffoldBordersLayers: Layer[];
  readonly bpResolutionToHiCDataLayer: Map<number, Layer>;
  readonly primaryBpResolutionToHiCDataLayer: Map<number, Layer>;
  readonly secondaryBpResolutionToHiCDataLayer: Map<number, Layer>;
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
  private static readonly VECTOR_SOURCE_DIRTY_FLAG =
    "hictVectorSourceDirty";

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
    primaryHiCDataLayers: [],
    secondaryHiCDataLayers: [],
    track2DLayers: [],
    annotationLayers: [],
    contigBordersLayers: [],
    contigTranslocationArrowsLayers: [],
    scaffoldBordersLayers: [],
    bpResolutionToHiCDataLayer: new Map(),
    primaryBpResolutionToHiCDataLayer: new Map(),
    secondaryBpResolutionToHiCDataLayer: new Map(),
    bpResolutionToAnnotationLayer: new Map(),
    bpResolutionToContigBordersLayer: new Map(),
    bpResolutionToContigTranslocationArrowsLayer: new Map(),
    bpResolutionToScaffoldBordersLayer: new Map(),
  };
  protected readonly view: View;
  public tileSize: number;
  private primaryResolutionSet: SourceResolutionDescriptorSet;
  private secondaryResolutionSet?: SourceResolutionDescriptorSet;
  private wheelZoomInteraction?: ContigMouseWheelZoom;
  private coordinateBaseBp: number;
  private enabledBpResolutions?: Set<number>;
  private rulerRenderCallback: (() => void) | null = null;
  private readonly pendingFeatureStyleRefreshHandles = new Set<number>();
  public readonly axisScopeRevision: Ref<number> = ref(0);
  private fullGlobalExtent: [number, number, number, number] = [0, 0, 0, 0];
  private activeAxisScopes: MapAxisScopes = {
    row: { kind: "all", label: "All Rows" },
    column: { kind: "all", label: "All Columns" },
  };
  private activeAxisScopeExtent?: [number, number, number, number];

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
    this.tileSize = mapManager.getOptions().tileSize;
    const primaryResolutions = response.resolutions
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
    this.coordinateBaseBp =
      primaryResolutions.length > 0
        ? Math.max(1, Math.min(...primaryResolutions))
        : 1;
    this.primaryResolutionSet = this.buildResolutionDescriptorSet(
      "PRIMARY",
      response.resolutions,
      response.matrixSizesBins
    );
    this.applyPrimaryResolutionSet(this.primaryResolutionSet);
    // Calculate extents for projection:
    const maximum_scaled_image_size = this.calculateMaximumScaledImageSize(
      this.primaryResolutionSet
    );
    const maximum_global_extent = [
      0,
      -maximum_scaled_image_size,
      maximum_scaled_image_size,
      0,
    ] as [number, number, number, number];
    this.fullGlobalExtent = maximum_global_extent;
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
    // Define view:
    this.view = new View({
      ...this.createViewOptions(maximum_global_extent),
      center: [
        this.pixelProjection.getExtent()[0],
        this.pixelProjection.getExtent()[3],
      ],
      resolution:
        this.pixelResolutionSet.length > 0
          ? Math.max(...this.pixelResolutionSet)
          : 1,
    });

    this.currentViewState = {
      resolutionDesciptor: {
        sourceName: "PRIMARY",
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

    this.track2DHolder.contigBordersTrack.setNamePlacement(NamePlacement.TOP);
    this.track2DHolder.scaffoldBordersTrack.setNamePlacement(NamePlacement.TOP);

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
            color: "rgba(184, 96, 255, 0.68)",
          }),
          stroke: new Stroke({
            color: "rgba(48, 208, 132, 0.98)",
            width: 4,
          }),
        }),
        condition: pointerMove,
        hitTolerance: 8,
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
            color: "rgba(208, 120, 255, 0.76)",
          }),
          stroke: new Stroke({
            color: "rgba(48, 208, 132, 1)",
            width: 5,
          }),
        }),
        hitTolerance: 8,
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

  private buildResolutionDescriptorSet(
    sourceName: MatrixSourceName,
    resolutionsRaw: readonly number[],
    imageSizesRaw: readonly number[]
  ): SourceResolutionDescriptorSet {
    resolutionsRaw
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .forEach((resolution) =>
        this.mapManager.contigDimensionHolder.ensureResolution(resolution)
      );
    return buildSourceResolutionDescriptorSet(
      sourceName,
      resolutionsRaw,
      imageSizesRaw,
      this.coordinateBaseBp
    );
  }

  private applyPrimaryResolutionSet(set: SourceResolutionDescriptorSet): void {
    this.imageSizes.length = 0;
    this.imageSizes.push(...set.imageSizes);
    this.pixelResolutionSet.length = 0;
    this.pixelResolutionSet.push(...set.pixelResolutionSet);
    this.resolutions.length = 0;
    this.resolutions.push(...set.resolutions);
    this.resolutionToPixelResolution.clear();
    set.resolutionToPixelResolution.forEach((value, key) =>
      this.resolutionToPixelResolution.set(key, value)
    );
    this.layerResolutionBorders.clear();
    set.layerResolutionBorders.forEach((value, key) =>
      this.layerResolutionBorders.set(key, value)
    );
    this.resolutionTuples.length = 0;
    this.resolutionTuples.push(...set.resolutionTuples);
    this.imageSizeScaled.length = 0;
    set.imageSizes.forEach((imageSize, i) =>
      this.imageSizeScaled.push(imageSize * set.pixelResolutionSet[i])
    );
  }

  private calculateMaximumScaledImageSize(
    primarySet: SourceResolutionDescriptorSet,
    secondarySet?: SourceResolutionDescriptorSet
  ): number {
    return calculateMaximumScaledImageSizeForSets(primarySet, secondarySet);
  }

  public getNavigationResolutionModel(): {
    resolutions: number[];
    pixelResolutionSet: number[];
  } {
    const descriptors = [
      ...this.getEnabledResolutionTuples(this.primaryResolutionSet),
      ...(this.secondaryResolutionSet
        ? this.getEnabledResolutionTuples(this.secondaryResolutionSet)
        : []),
    ].sort((a, b) => a.pixelResolution - b.pixelResolution);
    const byPixelResolution = new Map<number, LayerResolutionDescriptor>();
    for (const descriptor of descriptors) {
      if (!byPixelResolution.has(descriptor.pixelResolution)) {
        byPixelResolution.set(descriptor.pixelResolution, descriptor);
      }
    }
    const uniqueDescriptors = [...byPixelResolution.values()].sort(
      (a, b) => a.pixelResolution - b.pixelResolution
    );
    if (uniqueDescriptors.length === 0) {
      return getNavigationResolutionModelForSets(
        this.primaryResolutionSet,
        this.secondaryResolutionSet
      );
    }
    return {
      resolutions: uniqueDescriptors.map((descriptor) => descriptor.bpResolution),
      pixelResolutionSet: uniqueDescriptors.map(
        (descriptor) => descriptor.pixelResolution
      ),
    };
  }

  public getAllNavigationBpResolutions(): number[] {
    return Array.from(
      new Set([
        ...this.primaryResolutionSet.resolutions,
        ...(this.secondaryResolutionSet?.resolutions ?? []),
      ])
    ).sort((a, b) => a - b);
  }

  public getEnabledBpResolutions(): number[] {
    const all = this.getAllNavigationBpResolutions();
    if (!this.enabledBpResolutions || this.enabledBpResolutions.size === 0) {
      return all;
    }
    return all.filter((resolution) => this.enabledBpResolutions?.has(resolution));
  }

  public setEnabledBpResolutions(resolutions: number[]): void {
    const valid = new Set(this.getAllNavigationBpResolutions());
    const next = resolutions
      .map((resolution) => Number(resolution))
      .filter((resolution) => Number.isFinite(resolution) && valid.has(resolution));
    this.enabledBpResolutions = next.length > 0 ? new Set(next) : undefined;
    this.updateWheelZoomResolutionModel();
    this.updateProjectionAndViewExtent(1);
    this.updateCurrentHiCViewState();
    this.mapManager.getMap().changed();
  }

  private getEnabledResolutionTuples(
    set: SourceResolutionDescriptorSet
  ): LayerResolutionDescriptor[] {
    if (!this.enabledBpResolutions || this.enabledBpResolutions.size === 0) {
      return set.resolutionTuples;
    }
    const filtered = set.resolutionTuples.filter((tuple) =>
      this.enabledBpResolutions?.has(tuple.bpResolution)
    );
    return filtered.length > 0 ? filtered : set.resolutionTuples;
  }

  public getVectorResolutionTuples(): LayerResolutionDescriptor[] {
    return getVectorResolutionTuplesForSets(
      this.primaryResolutionSet,
      this.secondaryResolutionSet
    );
  }

  private updateWheelZoomResolutionModel(): void {
    const navigationModel = this.getNavigationResolutionModel();
    this.wheelZoomInteraction?.setResolutionModel(
      navigationModel.resolutions,
      navigationModel.pixelResolutionSet,
      this.layersHolder.hicDataLayers
    );
  }

  public getPixelResolutionForBpResolution(
    bpResolution: number
  ): number | undefined {
    return (
      this.primaryResolutionSet.resolutionToPixelResolution.get(bpResolution) ??
      this.secondaryResolutionSet?.resolutionToPixelResolution.get(
        bpResolution
      ) ??
      this.resolutionToPixelResolution.get(bpResolution) ??
      (Number.isFinite(bpResolution) && bpResolution > 0
        ? bpResolution / this.coordinateBaseBp
        : undefined)
    );
  }

  private createViewOptions(extent: number[]): ViewOptions {
    const navigationModel = this.getNavigationResolutionModel();
    const minPixelResolution =
      navigationModel.pixelResolutionSet.length > 0
        ? Math.min(...navigationModel.pixelResolutionSet)
        : 1;
    const maxPixelResolution =
      navigationModel.pixelResolutionSet.length > 0
        ? Math.max(...navigationModel.pixelResolutionSet)
        : 1;
    const maximumScaledImageSize = this.calculateMaximumScaledImageSize(
      this.primaryResolutionSet,
      this.secondaryResolutionSet
    );
    const overzoomFactor = 1024;
    const minResolution = Math.max(
      1 / overzoomFactor,
      minPixelResolution / overzoomFactor
    );
    const maxResolution = Math.max(
      maxPixelResolution * overzoomFactor,
      maximumScaledImageSize
    );
    return {
      minResolution,
      maxResolution,
      constrainResolution: false,
      zoomFactor: 2,
      showFullExtent: true,
      constrainOnlyCenter: true,
      projection: this.pixelProjection,
      extent,
    };
  }

  public getAxisScopes(): MapAxisScopes {
    return {
      row: { ...this.activeAxisScopes.row },
      column: { ...this.activeAxisScopes.column },
    };
  }

  public getActiveMapExtent(): [number, number, number, number] {
    return this.activeAxisScopeExtent ?? this.fullGlobalExtent;
  }

  public setAxisScopes(
    row: AxisScopeSelection,
    column: AxisScopeSelection
  ): void {
    this.activeAxisScopes = {
      row: this.normalizeAxisScope(row, "row"),
      column: this.normalizeAxisScope(column, "column"),
    };
    this.reapplyAxisScopes({ fit: true });
    this.axisScopeRevision.value++;
  }

  public reapplyAxisScopes(options?: {
    fit?: boolean;
    renderLinearTracks?: boolean;
    refreshViewOptions?: boolean;
  }): void {
    const previousExtent = this.activeAxisScopeExtent;
    const resolvedRow = this.resolveAxisScope(this.activeAxisScopes.row, "row");
    const resolvedColumn = this.resolveAxisScope(
      this.activeAxisScopes.column,
      "column"
    );
    const scopesChanged =
      resolvedRow.kind !== this.activeAxisScopes.row.kind ||
      resolvedRow.id !== this.activeAxisScopes.row.id ||
      resolvedColumn.kind !== this.activeAxisScopes.column.kind ||
      resolvedColumn.id !== this.activeAxisScopes.column.id;
    this.activeAxisScopes = {
      row: resolvedRow,
      column: resolvedColumn,
    };

    const nextExtent = this.computeAxisScopeExtent(resolvedRow, resolvedColumn);
    this.activeAxisScopeExtent = nextExtent ?? undefined;
    const appliedExtent = this.getActiveMapExtent();
    if (options?.refreshViewOptions !== false) {
      this.view.applyOptions_(this.createViewOptions(appliedExtent));
    }
    this.applyLayerScopeExtent(nextExtent ?? undefined);

    if (options?.fit) {
      this.fitViewToExtent(appliedExtent);
    } else if (
      previousExtent &&
      nextExtent &&
      !this.areExtentsClose(previousExtent, nextExtent)
    ) {
      const center = this.view.getCenter();
      if (center) {
        this.view.setCenter(this.clampPointToExtent(center, appliedExtent));
      }
    }

    if (
      options?.renderLinearTracks !== false &&
      this.mapManager.linearTrackManager
    ) {
      void this.mapManager.linearTrackManager.render({ allowFetch: true });
    }
    this.scheduleRulerRender();
    this.mapManager.getMap().changed();
    if (scopesChanged) {
      this.axisScopeRevision.value++;
    }
  }

  private normalizeAxisScope(
    scope: AxisScopeSelection | undefined,
    axis: "row" | "column"
  ): AxisScopeSelection {
    if (!scope || scope.kind === "all" || scope.id === undefined) {
      return { kind: "all", label: axis === "row" ? "All Rows" : "All Columns" };
    }
    const id = Number(scope.id);
    return {
      kind: scope.kind,
      id,
      label: scope.label || String(id),
      startBp: Number.isFinite(scope.startBp) ? scope.startBp : undefined,
      endBp: Number.isFinite(scope.endBp) ? scope.endBp : undefined,
    };
  }

  private resolveAxisScope(
    scope: AxisScopeSelection,
    axis: "row" | "column"
  ): AxisScopeSelection {
    if (scope.kind === "all" || scope.id === undefined) {
      return { kind: "all", label: axis === "row" ? "All Rows" : "All Columns" };
    }
    if (scope.kind === "contig") {
      const order =
        this.mapManager.contigDimensionHolder.contigIdToOrd[scope.id];
      const descriptor =
        order !== undefined
          ? this.mapManager.contigDimensionHolder.contigDescriptors[order]
          : undefined;
      if (!descriptor) {
        return { kind: "all", label: axis === "row" ? "All Rows" : "All Columns" };
      }
      const startBp =
        this.mapManager.contigDimensionHolder.prefix_sum_bp[order] ?? 0;
      return {
        kind: "contig",
        id: descriptor.contigId,
        label: descriptor.contigName,
        startBp,
        endBp: startBp + descriptor.contigLengthBp,
      };
    }

    const scaffold = this.mapManager.scaffoldHolder.scaffoldTable.get(scope.id);
    const borders =
      scaffold?.scaffoldBordersBP ??
      this.mapManager.scaffoldHolder.scaffoldBordersBp.get(scope.id);
    if (!scaffold || !borders) {
      return { kind: "all", label: axis === "row" ? "All Rows" : "All Columns" };
    }
    return {
      kind: "scaffold",
      id: scaffold.scaffoldId,
      label: scaffold.scaffoldName,
      startBp: borders.startBP,
      endBp: borders.endBP,
    };
  }

  private computeAxisScopeExtent(
    row: AxisScopeSelection,
    column: AxisScopeSelection
  ): [number, number, number, number] | null {
    if (row.kind === "all" && column.kind === "all") {
      return null;
    }
    const descriptor = this.chooseScopeResolutionDescriptor(row, column);
    if (!descriptor) {
      return null;
    }
    const full = this.fullGlobalExtent;
    const xRange =
      column.kind === "all"
        ? ([full[0], full[2]] as [number, number])
        : this.bpIntervalToCoordinateRange(
            column.startBp ?? 0,
            column.endBp ?? 0,
            descriptor
          );
    const yRange =
      row.kind === "all"
        ? ([0, -full[1]] as [number, number])
        : this.bpIntervalToCoordinateRange(
            row.startBp ?? 0,
            row.endBp ?? 0,
            descriptor
          );
    if (!xRange || !yRange) {
      return null;
    }
    return [xRange[0], -yRange[1], xRange[1], -yRange[0]];
  }

  public getActiveMapPixelBounds(bpResolution: number): MapAxisScopePixelBounds {
    const holder = this.mapManager.contigDimensionHolder;
    holder.ensureResolution(bpResolution);
    const mapSizePx =
      holder.prefix_sum_px.get(bpResolution)?.[holder.contig_count] ??
      Math.max(1, Math.round(this.imageSizes[0] ?? 1));
    const row = this.resolveAxisScope(this.activeAxisScopes.row, "row");
    const column = this.resolveAxisScope(this.activeAxisScopes.column, "column");
    const columnRange =
      column.kind === "all"
        ? ([0, mapSizePx] as [number, number])
        : this.bpIntervalToPixelRange(
            column.startBp ?? 0,
            column.endBp ?? 0,
            bpResolution
          );
    const rowRange =
      row.kind === "all"
        ? ([0, mapSizePx] as [number, number])
        : this.bpIntervalToPixelRange(
            row.startBp ?? 0,
            row.endBp ?? 0,
            bpResolution
          );
    const normalizeRange = (range: [number, number]): [number, number] => {
      const start = Math.max(0, Math.min(mapSizePx - 1, Math.floor(range[0])));
      const end = Math.max(
        start + 1,
        Math.min(mapSizePx, Math.ceil(range[1]))
      );
      return [start, end];
    };
    const [colStartPx, colEndPx] = normalizeRange(columnRange);
    const [rowStartPx, rowEndPx] = normalizeRange(rowRange);
    return { colStartPx, colEndPx, rowStartPx, rowEndPx };
  }

  private chooseScopeResolutionDescriptor(
    row: AxisScopeSelection,
    column: AxisScopeSelection
  ): LayerResolutionDescriptor | null {
    const current = this.currentViewState?.resolutionDesciptor;
    if (
      current &&
      this.scopeHasVisibleWidth(row, current) &&
      this.scopeHasVisibleWidth(column, current)
    ) {
      return current;
    }
    const candidates = this.getVectorResolutionTuples().slice().sort(
      (a, b) => a.bpResolution - b.bpResolution
    );
    return (
      candidates.find(
        (descriptor) =>
          this.scopeHasVisibleWidth(row, descriptor) &&
          this.scopeHasVisibleWidth(column, descriptor)
      ) ??
      current ??
      candidates[0] ??
      null
    );
  }

  private scopeHasVisibleWidth(
    scope: AxisScopeSelection,
    descriptor: LayerResolutionDescriptor
  ): boolean {
    if (scope.kind === "all") {
      return true;
    }
    const range = this.bpIntervalToCoordinateRange(
      scope.startBp ?? 0,
      scope.endBp ?? 0,
      descriptor
    );
    return !!range && range[1] > range[0];
  }

  private bpIntervalToCoordinateRange(
    startBpRaw: number,
    endBpRaw: number,
    descriptor: LayerResolutionDescriptor
  ): [number, number] | null {
    const holder = this.mapManager.contigDimensionHolder;
    const totalBp = holder.prefix_sum_bp[holder.contig_count] ?? 0;
    if (totalBp <= 0) {
      return null;
    }
    const startBp = Math.max(0, Math.min(totalBp - 1, Math.floor(startBpRaw)));
    const endBpExclusive = Math.max(
      startBp + 1,
      Math.min(totalBp, Math.ceil(endBpRaw))
    );
    holder.ensureResolution(descriptor.bpResolution);
    const [startPx, endPx] = this.bpIntervalToPixelRange(
      startBp,
      endBpExclusive,
      descriptor.bpResolution
    );
    const minPx = Math.min(startPx, endPx);
    const maxPx = Math.max(startPx + 1, endPx);
    const scale = descriptor.pixelResolution;
    return [minPx * scale, maxPx * scale];
  }

  private bpIntervalToPixelRange(
    startBpRaw: number,
    endBpRaw: number,
    bpResolution: number
  ): [number, number] {
    const holder = this.mapManager.contigDimensionHolder;
    const totalBp = holder.prefix_sum_bp[holder.contig_count] ?? 0;
    if (totalBp <= 0) {
      return [0, 1];
    }
    const startBp = Math.max(0, Math.min(totalBp - 1, Math.floor(startBpRaw)));
    const endBpExclusive = Math.max(
      startBp + 1,
      Math.min(totalBp, Math.ceil(endBpRaw))
    );
    holder.ensureResolution(bpResolution);
    const startPx = holder.getPxContainingBp(startBp, bpResolution);
    const endPx = holder.getPxContainingBp(endBpExclusive - 1, bpResolution) + 1;
    return [startPx, endPx];
  }

  private fitViewToExtent(extent: [number, number, number, number]): void {
    const size = this.mapManager.getMap().getSize();
    if (size && size[0] > 0 && size[1] > 0) {
      this.view.fit(extent, {
        size,
        nearest: false,
        padding: [12, 12, 12, 12],
      });
      return;
    }
    this.view.setCenter([
      (extent[0] + extent[2]) / 2,
      (extent[1] + extent[3]) / 2,
    ]);
  }

  private clampPointToExtent(
    point: readonly number[],
    extent: [number, number, number, number]
  ): [number, number] {
    return [
      Math.max(extent[0], Math.min(extent[2], point[0])),
      Math.max(extent[1], Math.min(extent[3], point[1])),
    ];
  }

  private areExtentsClose(
    a: [number, number, number, number],
    b: [number, number, number, number]
  ): boolean {
    return a.every((value, index) => Math.abs(value - b[index]) < 1e-6);
  }

  private applyLayerScopeExtent(
    extent?: [number, number, number, number]
  ): void {
    const allLayers = [
      ...this.layersHolder.hicDataLayers,
      ...this.layersHolder.track2DLayers,
      ...this.layersHolder.annotationLayers,
      ...this.layersHolder.contigBordersLayers,
      ...this.layersHolder.contigTranslocationArrowsLayers,
      ...this.layersHolder.scaffoldBordersLayers,
    ];
    for (const layer of allLayers) {
      layer.setExtent(extent);
    }
  }

  private updateProjectionAndViewExtent(scalePreservedView = 1): void {
    const previousCenter = this.view.getCenter();
    const previousResolution = this.view.getResolution();
    const maximumScaledImageSize = this.calculateMaximumScaledImageSize(
      this.primaryResolutionSet,
      this.secondaryResolutionSet
    );
    const extent = [
      0,
      -maximumScaledImageSize,
      maximumScaledImageSize,
      0,
    ] as [number, number, number, number];
    this.fullGlobalExtent = extent;
    this.pixelProjection.setExtent(extent);
    this.activeAxisScopeExtent =
      this.computeAxisScopeExtent(
        this.activeAxisScopes.row,
        this.activeAxisScopes.column
      ) ?? undefined;
    const activeExtent = this.getActiveMapExtent();
    this.view.applyOptions_(this.createViewOptions(activeExtent));
    this.applyLayerScopeExtent(this.activeAxisScopeExtent);

    const nextCenter =
      previousCenter &&
      previousCenter.length >= 2 &&
      previousCenter.every((value) => Number.isFinite(value))
        ? ([
            previousCenter[0] * scalePreservedView,
            previousCenter[1] * scalePreservedView,
          ] as [number, number])
        : ([activeExtent[0], activeExtent[3]] as [number, number]);
    const nextResolution =
      previousResolution !== undefined && Number.isFinite(previousResolution)
        ? previousResolution * scalePreservedView
        : Math.max(
            ...this.getNavigationResolutionModel().pixelResolutionSet,
            1
          );

    this.view.setCenter(this.clampPointToExtent(nextCenter, activeExtent));
    if (Number.isFinite(nextResolution) && nextResolution > 0) {
      this.view.setResolution(nextResolution);
    }
  }

  public async onViewResolutionChanged(): Promise<void> {
    this.updateCurrentHiCViewState();
    this.reapplyAxisScopes({
      renderLinearTracks: false,
      refreshViewOptions: false,
    });
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

    this.refreshGeneratedFeatureStyles(
      this.track2DHolder.contigBordersTrack,
      this.layersHolder.contigBordersLayers,
      new Set(["contigBorders"])
    );
  }

  public onScanffoldBorderColorChanged(scaffoldBorderColor: string): void {
    this.track2DHolder.scaffoldBordersTrack.options.borderColor =
      scaffoldBorderColor;

    this.track2DHolder.scaffoldBordersTrack.style =
      this.track2DHolder.scaffoldBordersTrack.generateStyleFunction()();

    this.refreshGeneratedFeatureStyles(
      this.track2DHolder.scaffoldBordersTrack,
      this.layersHolder.scaffoldBordersLayers,
      new Set(["scaffoldBorders"])
    );
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
    this.refreshGeneratedFeatureStyles(
      this.track2DHolder.contigBordersTrack,
      this.layersHolder.contigBordersLayers,
      new Set(["contigBorders"])
    );
  }

  public onContigFillColorChanged(fillColor: string): void {
    this.track2DHolder.contigBordersTrack.options.fillColor = fillColor;
    this.track2DHolder.contigBordersTrack.style =
      this.track2DHolder.contigBordersTrack.generateStyleFunction()();
    this.refreshGeneratedFeatureStyles(
      this.track2DHolder.contigBordersTrack,
      this.layersHolder.contigBordersLayers,
      new Set(["contigBorders"])
    );
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
    this.refreshGeneratedFeatureStyles(
      this.track2DHolder.scaffoldBordersTrack,
      this.layersHolder.scaffoldBordersLayers,
      new Set(["scaffoldBorders"])
    );
  }

  public onScaffoldFillColorChanged(fillColor: string): void {
    this.track2DHolder.scaffoldBordersTrack.options.fillColor = fillColor;
    this.track2DHolder.scaffoldBordersTrack.style =
      this.track2DHolder.scaffoldBordersTrack.generateStyleFunction()();
    this.refreshGeneratedFeatureStyles(
      this.track2DHolder.scaffoldBordersTrack,
      this.layersHolder.scaffoldBordersLayers,
      new Set(["scaffoldBorders"])
    );
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
    this.track2DHolder.scaffoldBordersTrack.setLabelOffsetMultiplier(
      multiplier
    );
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
    this.getVectorResolutionTuples().forEach(
      ({ bpResolution, pixelResolution }) => {
        const vectorSource = new VectorSource();
        vectorSource.addFeatures(track.features.get(bpResolution) ?? []);
        const vectorLayer = new (
          this.useVectorImageLayer ? VectorImageLayer : VectorLayer
        )({
          source: vectorSource,
          zIndex:
            this.layersZIndices.TRACK_2D_LAYER_Z_INDEX + track.options.zIndex,
        });
        vectorLayer.setVisible(false);
        vectorLayer.set("bpResolution", bpResolution);
        vectorLayer.set(
          "pixelResolution",
          this.getPixelResolutionForBpResolution(bpResolution)
        );
        vectorLayer.set(HiCViewAndLayersManager.VECTOR_SOURCE_DIRTY_FLAG, true);
        vectorLayer.setExtent(this.activeAxisScopeExtent);
        layersCollection.push(vectorLayer);
        this.mapManager.getMap().addLayer(vectorLayer);
      }
    );
  }

  public initializeMapsDataLayers() {
    this.addSourceHiCDataLayers(this.primaryResolutionSet);
    this.syncLayerVisibilityForCurrentResolution();
  }

  private addSourceHiCDataLayers(set: SourceResolutionDescriptorSet): void {
    const layersCollection =
      set.sourceName === "PRIMARY"
        ? this.layersHolder.primaryHiCDataLayers
        : this.layersHolder.secondaryHiCDataLayers;
    const resolutionMap =
      set.sourceName === "PRIMARY"
        ? this.layersHolder.primaryBpResolutionToHiCDataLayer
        : this.layersHolder.secondaryBpResolutionToHiCDataLayer;
    const zIndex =
      this.layersZIndices.HIC_MAP_LAYER_Z_INDEX +
      (set.sourceName === "SECONDARY" ? 1 : 0);

    for (let i = 0; i < set.imageSizes.length; ++i) {
      const layerResolution = set.resolutions[i];
      const layerPixelResolution = set.pixelResolutionSet[i];
      const layerImageSize = set.imageSizes[i] * layerPixelResolution;
      const scaledLayerExtent = [0, -layerImageSize, layerImageSize, 0];
      const layerTileGrid = new TileGrid({
        extent: scaledLayerExtent,
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
        set.sourceName,
        {
          projection: this.pixelProjection,
          tileGrid: layerTileGrid,
          interpolate: false,
          cacheSize: 0,
        }
      );
      layerSource.do_reload();
      const borders = set.layerResolutionBorders.get(layerResolution);
      const layer = new TileLayer({
        source: layerSource,
        minResolution: this.toFiniteResolutionBound(
          borders?.minResolutionInclusive
        ),
        maxResolution: this.toFiniteResolutionBound(
          borders?.maxResolutionExclusive
        ),
        zIndex,
      });
      layer.set("sourceName", set.sourceName);
      layer.set("bpResolution", layerResolution);
      layer.set("pixelResolution", layerPixelResolution);
      layer.setExtent(this.activeAxisScopeExtent);
      this.mapManager.getMap().addLayer(layer);
      layersCollection.push(layer);
      this.layersHolder.hicDataLayers.push(layer);
      resolutionMap.set(layerResolution, layer);
      if (set.sourceName === "PRIMARY") {
        this.layersHolder.bpResolutionToHiCDataLayer.set(
          layerResolution,
          layer
        );
      }
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
      (p) => p * (this.getPixelResolutionForBpResolution(bpResolution) ?? 1.0)
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
    return this.viewResolutionToSourceResolutionDescriptor(
      "PRIMARY",
      viewResolution
    );
  }

  public viewResolutionToSourceResolutionDescriptor(
    sourceName: MatrixSourceName,
    viewResolution: number
  ): LayerResolutionDescriptor {
    const set =
      sourceName === "SECONDARY"
        ? this.secondaryResolutionSet
        : this.primaryResolutionSet;
    if (!set) {
      throw new Error(`No resolutions available for ${sourceName}`);
    }
    const tuples = this.getEnabledResolutionTuples(set);
    if (tuples.length === set.resolutionTuples.length) {
      return getResolutionDescriptorForViewResolution(set, viewResolution);
    }
    let descriptor = tuples[0];
    const sorted = [...tuples].sort(
      (a, b) =>
        a.layerResolutionBorders.minResolutionInclusive -
        b.layerResolutionBorders.minResolutionInclusive
    );
    for (const tuple of sorted) {
      if (tuple.layerResolutionBorders.minResolutionInclusive <= viewResolution) {
        descriptor = tuple;
      } else {
        break;
      }
    }
    return descriptor;
  }

  public getVisibleSourceResolutionDescriptors(): {
    primary: LayerResolutionDescriptor;
    secondary?: LayerResolutionDescriptor;
  } {
    const viewResolution = this.view.getResolution() ?? 0;
    return {
      primary: this.viewResolutionToSourceResolutionDescriptor(
        "PRIMARY",
        viewResolution
      ),
      secondary: this.secondaryResolutionSet
        ? this.viewResolutionToSourceResolutionDescriptor(
            "SECONDARY",
            viewResolution
          )
        : undefined,
    };
  }

  public getFinestVisibleSourceResolutionDescriptor(
    viewResolution: number = this.view.getResolution() ?? 0
  ): LayerResolutionDescriptor {
    return getFinestVisibleResolutionDescriptor(
      this.primaryResolutionSet,
      this.secondaryResolutionSet,
      viewResolution
    );
  }

  public getDimensionHolderForSource(
    // Secondary maps are currently kept in the same synchronized assembly
    // coordinate system as primary maps. Keeping source in this API makes the
    // guidance path explicit and leaves the call site ready for separate
    // source-specific holders.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sourceName: MatrixSourceName = "PRIMARY"
  ) {
    return this.mapManager.contigDimensionHolder;
  }

  public ensureGuidanceResolutionDescriptor(
    preferred?: LayerResolutionDescriptor
  ): LayerResolutionDescriptor {
    const descriptor =
      preferred ?? this.getFinestVisibleSourceResolutionDescriptor();
    const holder = this.getDimensionHolderForSource(descriptor.sourceName);
    if (
      Number.isFinite(descriptor.bpResolution) &&
      !holder.prefix_sum_px.has(descriptor.bpResolution)
    ) {
      holder.ensureResolution(descriptor.bpResolution);
    }
    if (holder.prefix_sum_px.has(descriptor.bpResolution)) {
      return descriptor;
    }
    return this.getActiveVectorResolutionDescriptor();
  }

  public getGuidanceResolutionDescriptorForViewResolution(
    viewResolution: number
  ): LayerResolutionDescriptor {
    return this.ensureGuidanceResolutionDescriptor(
      this.getFinestVisibleSourceResolutionDescriptor(viewResolution)
    );
  }

  public setSecondaryResolutionModel(
    compatibility?: SecondarySourceCompatibility
  ): void {
    const previousBaseBp = this.coordinateBaseBp;
    const nextBaseBp =
      compatibility &&
      compatibility.secondaryResolutions.length > 0 &&
      compatibility.secondaryBinsByResolution.length > 0
        ? Math.max(
            1,
            Math.min(
              ...this.primaryResolutionSet.resolutions,
              ...compatibility.secondaryResolutions
            )
          )
        : this.primaryResolutionSet.resolutions.length > 0
        ? Math.max(1, Math.min(...this.primaryResolutionSet.resolutions))
        : 1;
    const baseChanged = nextBaseBp !== this.coordinateBaseBp;

    this.removeSourceHiCDataLayers("SECONDARY");
    this.secondaryResolutionSet = undefined;
    if (baseChanged) {
      this.removeSourceHiCDataLayers("PRIMARY");
      this.coordinateBaseBp = nextBaseBp;
      this.primaryResolutionSet = this.buildResolutionDescriptorSet(
        "PRIMARY",
        this.primaryResolutionSet.resolutions,
        this.primaryResolutionSet.imageSizes
      );
      this.applyPrimaryResolutionSet(this.primaryResolutionSet);
      this.addSourceHiCDataLayers(this.primaryResolutionSet);
    }
    if (
      compatibility &&
      compatibility.secondaryResolutions.length > 0 &&
      compatibility.secondaryBinsByResolution.length > 0
    ) {
      this.secondaryResolutionSet = this.buildResolutionDescriptorSet(
        "SECONDARY",
        compatibility.secondaryResolutions,
        compatibility.secondaryBinsByResolution
      );
      this.addSourceHiCDataLayers(this.secondaryResolutionSet);
    }
    this.updateProjectionAndViewExtent(previousBaseBp / this.coordinateBaseBp);
    this.updateWheelZoomResolutionModel();
    this.updateCurrentHiCViewState();
    this.rebuildBuiltinVectorLayers();
    this.reloadTiles();
  }

  public hasSecondarySource(): boolean {
    return this.secondaryResolutionSet !== undefined;
  }

  private removeSourceHiCDataLayers(sourceName: MatrixSourceName): void {
    const layers =
      sourceName === "PRIMARY"
        ? this.layersHolder.primaryHiCDataLayers
        : this.layersHolder.secondaryHiCDataLayers;
    for (const layer of layers) {
      this.mapManager.getMap().removeLayer(layer);
      const idx = this.layersHolder.hicDataLayers.indexOf(layer);
      if (idx >= 0) {
        this.layersHolder.hicDataLayers.splice(idx, 1);
      }
    }
    layers.length = 0;
    if (sourceName === "PRIMARY") {
      this.layersHolder.primaryBpResolutionToHiCDataLayer.clear();
      this.layersHolder.bpResolutionToHiCDataLayer.clear();
    } else {
      this.layersHolder.secondaryBpResolutionToHiCDataLayer.clear();
    }
  }

  public initializeTracks(): void {
    this.addBuiltinVectorLayers();
    this.reloadTracks();
  }

  private addBuiltinVectorLayers(): void {
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
    this.syncLayerVisibilityForCurrentResolution();
  }

  private removeLayerCollection(layers: Layer[]): void {
    for (const layer of layers) {
      this.mapManager.getMap().removeLayer(layer);
    }
    layers.length = 0;
  }

  private clearBuiltinVectorLayerMaps(): void {
    this.layersHolder.bpResolutionToAnnotationLayer.clear();
    this.layersHolder.bpResolutionToContigBordersLayer.clear();
    this.layersHolder.bpResolutionToContigTranslocationArrowsLayer.clear();
    this.layersHolder.bpResolutionToScaffoldBordersLayer.clear();
  }

  private rebuildBuiltinVectorLayers(): void {
    this.removeLayerCollection(this.layersHolder.annotationLayers);
    this.removeLayerCollection(this.layersHolder.contigBordersLayers);
    this.removeLayerCollection(
      this.layersHolder.contigTranslocationArrowsLayers
    );
    this.removeLayerCollection(this.layersHolder.scaffoldBordersLayers);
    this.clearBuiltinVectorLayerMaps();
    this.addBuiltinVectorLayers();
    this.reloadTracks();
  }

  public initializeMapControls(): void {
    this.mapManager.getMap().addControl(
      new BinMousePosition({
        projection: this.pixelProjection,
        dimension_holder: this.mapManager.getContigDimensionHolder(),
        scaffold_holder: this.mapManager.scaffoldHolder,
        layers: this.layersHolder.hicDataLayers,
        layersManager: this,
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
      const view = map.getView();
      let framePending = false;
      const scheduleRulerRender = () => {
        if (framePending) {
          return;
        }
        framePending = true;
        window.requestAnimationFrame(() => {
          framePending = false;
          rulerH.render({ map } as never);
          rulerV.render({ map } as never);
        });
      };
      this.rulerRenderCallback = scheduleRulerRender;
      map.on("moveend", scheduleRulerRender);
      view.on("change:center", scheduleRulerRender);
      view.on("change:resolution", scheduleRulerRender);
      map.once("postrender", () => {
        scheduleRulerRender();
      });
    } catch (e: unknown) {
      console.log("Error while adding rulers", e);
    }
  }

  public scheduleRulerRender(): void {
    this.rulerRenderCallback?.();
  }

  public dispose(): void {
    if (!this.mapManager.getMap()) {
      return;
    }
    try {
      for (const handle of this.pendingFeatureStyleRefreshHandles) {
        window.clearTimeout(handle);
      }
      this.pendingFeatureStyleRefreshHandles.clear();
      this.rulerRenderCallback = null;
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
    const navigationModel = this.getNavigationResolutionModel();
    this.wheelZoomInteraction = new ContigMouseWheelZoom({
      dimension_holder: this.mapManager.getContigDimensionHolder(),
      resolutions: navigationModel.resolutions,
      pixelResolutionSet: navigationModel.pixelResolutionSet,
      global_projection: this.pixelProjection,
      layers: this.layersHolder.hicDataLayers,
      layersManager: this,
    });
    this.mapManager.getMap().addInteraction(this.wheelZoomInteraction);
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
        selectionCallback: (coordinatePx, bpResolution) =>
          this.mapManager.eventManager.onClickInScissorsMode(
            coordinatePx,
            bpResolution
          ),
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

      const vectorResolutionDescriptor =
        this.getActiveVectorResolutionDescriptor();
      const bpResolution = vectorResolutionDescriptor.bpResolution;

      const [a, b, c, d] = extent;
      const [x0, y0, x1, y1] = [a, -d, c, -b];

      const [x0_px, y0_px, x1_px, y1_px] = [x0, y0, x1, y1].map((c) =>
        Math.floor(c / vectorResolutionDescriptor.pixelResolution)
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
      const activePrefixSum =
        this.mapManager.contigDimensionHolder.prefix_sum_px.get(bpResolution);
      const activeImageSize =
        activePrefixSum && activePrefixSum.length > 0
          ? activePrefixSum[activePrefixSum.length - 1]
          : Number.POSITIVE_INFINITY;
      if (rightPxInclusive > activeImageSize) {
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
      this.layersHolder.primaryBpResolutionToHiCDataLayer.get(bpResolution);
    if (!layer) {
      throw new Error(
        `Unknown resolution ${bpResolution} for Hi-C data layers`
      );
    }
    return layer;
  }

  public getActiveContigBordersLayer(): Layer<VectorSource> {
    const bpResolution =
      this.getActiveVectorResolutionDescriptor().bpResolution;
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
    const bpResolution =
      this.getActiveVectorResolutionDescriptor().bpResolution;
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

  private markBuiltinVectorLayersDirty(): void {
    [
      this.layersHolder.annotationLayers,
      this.layersHolder.contigBordersLayers,
      this.layersHolder.contigTranslocationArrowsLayers,
      this.layersHolder.scaffoldBordersLayers,
    ].forEach((layers) => {
      layers.forEach((layer) => {
        layer.set(HiCViewAndLayersManager.VECTOR_SOURCE_DIRTY_FLAG, true);
      });
    });
  }

  private refreshVectorLayerFromFeatures(
    layer: Layer,
    featuresByResolution: Map<number, Feature<Geometry>[]>,
    options?: { force?: boolean; clearWhenHidden?: boolean }
  ): void {
    const source = layer.getSource() as VectorSource | undefined;
    if (!source) {
      return;
    }

    const force = options?.force ?? false;
    const clearWhenHidden = options?.clearWhenHidden ?? false;
    const visible = layer.getVisible();
    const dirty = Boolean(
      layer.get(HiCViewAndLayersManager.VECTOR_SOURCE_DIRTY_FLAG)
    );
    if (!force && !dirty) {
      return;
    }
    if (!visible && !clearWhenHidden) {
      return;
    }

    source.clear(true);
    if (visible) {
      const bpResolution = Number(layer.get("bpResolution"));
      const features = featuresByResolution.get(bpResolution);
      if (!features) {
        throw new Error(
          `Cannot refresh vector track at resolution ${bpResolution}`
        );
      }
      source.addFeatures(features);
    }
    source.changed();
    layer.set(HiCViewAndLayersManager.VECTOR_SOURCE_DIRTY_FLAG, false);
    layer.changed();
  }

  private refreshGeneratedFeatureStyles(
    track: Track2DSymmetric,
    layers: Layer[],
    trackTypes: Set<string>
  ): void {
    for (const layer of layers) {
      const source = layer.getSource() as VectorSource | undefined;
      if (!source) {
        continue;
      }
      if (layer.getVisible()) {
        for (const feature of source.getFeatures()) {
          if (trackTypes.has(String(feature.get("trackType")))) {
            feature.setStyle(track.style);
          }
        }
        source.changed();
        layer.changed();
      } else {
        layer.set(HiCViewAndLayersManager.VECTOR_SOURCE_DIRTY_FLAG, true);
      }
    }
    this.mapManager.getMap().changed();
    this.scheduleBackgroundGeneratedFeatureStyleRefresh(track, trackTypes);
  }

  private scheduleBackgroundGeneratedFeatureStyleRefresh(
    track: Track2DSymmetric,
    trackTypes: Set<string>
  ): void {
    const resolutionFeatureGroups = Array.from(track.features.values());
    let groupIndex = 0;
    let featureIndex = 0;
    let handle: number | undefined;
    const processChunk = () => {
      if (handle !== undefined) {
        this.pendingFeatureStyleRefreshHandles.delete(handle);
        handle = undefined;
      }
      const deadline = performance.now() + 8;
      while (groupIndex < resolutionFeatureGroups.length && performance.now() < deadline) {
        const features = resolutionFeatureGroups[groupIndex];
        while (featureIndex < features.length && performance.now() < deadline) {
          const feature = features[featureIndex];
          if (trackTypes.has(String(feature.get("trackType")))) {
            feature.setStyle(track.style);
          }
          featureIndex += 1;
        }
        if (featureIndex >= features.length) {
          groupIndex += 1;
          featureIndex = 0;
        }
      }
      if (groupIndex < resolutionFeatureGroups.length) {
        handle = window.setTimeout(processChunk, 0);
        this.pendingFeatureStyleRefreshHandles.add(handle);
      }
    };

    handle = window.setTimeout(processChunk, 0);
    this.pendingFeatureStyleRefreshHandles.add(handle);
  }

  private isVectorLayerDirty(layer: Layer | undefined): boolean {
    return Boolean(
      layer?.get(HiCViewAndLayersManager.VECTOR_SOURCE_DIRTY_FLAG)
    );
  }

  private recalculateDirtyVisibleBuiltinVectorTracks(): void {
    const activeResolution =
      this.getActiveVectorResolutionDescriptor().bpResolution;
    const annotationLayer =
      this.layersHolder.bpResolutionToAnnotationLayer.get(activeResolution);
    const contigLayer =
      this.layersHolder.bpResolutionToContigBordersLayer.get(activeResolution);
    const scaffoldLayer =
      this.layersHolder.bpResolutionToScaffoldBordersLayer.get(
        activeResolution
      );
    const translocationLayer =
      this.layersHolder.bpResolutionToContigTranslocationArrowsLayer.get(
        activeResolution
      );

    if (annotationLayer?.getVisible() && this.isVectorLayerDirty(annotationLayer)) {
      this.track2DHolder.annotationTrack.recalculateBorders(activeResolution);
    }
    if (contigLayer?.getVisible() && this.isVectorLayerDirty(contigLayer)) {
      this.track2DHolder.contigBordersTrack.recalculateBorders(
        activeResolution
      );
    }
    if (
      scaffoldLayer?.getVisible() &&
      this.isVectorLayerDirty(scaffoldLayer)
    ) {
      this.track2DHolder.scaffoldBordersTrack.recalculateBorders(
        activeResolution
      );
    }
    if (
      translocationLayer?.getVisible() &&
      this.isVectorLayerDirty(translocationLayer)
    ) {
      this.track2DHolder.contigTranslocationArrowsTrack.recalculateBorders(
        activeResolution
      );
    }
  }

  private refreshVisibleBuiltinVectorSources(): void {
    this.recalculateDirtyVisibleBuiltinVectorTracks();
    for (const layer of this.layersHolder.annotationLayers) {
      this.refreshVectorLayerFromFeatures(
        layer,
        this.track2DHolder.annotationTrack.features
      );
    }
    for (const layer of this.layersHolder.contigBordersLayers) {
      this.refreshVectorLayerFromFeatures(
        layer,
        this.track2DHolder.contigBordersTrack.features
      );
    }
    for (const layer of this.layersHolder.contigTranslocationArrowsLayers) {
      this.refreshVectorLayerFromFeatures(
        layer,
        this.track2DHolder.contigTranslocationArrowsTrack.features,
        { clearWhenHidden: true }
      );
    }
    for (const layer of this.layersHolder.scaffoldBordersLayers) {
      this.refreshVectorLayerFromFeatures(
        layer,
        this.track2DHolder.scaffoldBordersTrack.features
      );
    }
  }

  public reloadTracks(options?: { renderLinearTracks?: boolean }): void {
    const translocationMode =
      this.currentViewState.activeTool === ActiveTool.TRANSLOCATION;
    this.markBuiltinVectorLayersDirty();
    for (const layer of this.layersHolder.track2DLayers) {
      //TODO:
      layer.getSource()?.changed();
      layer.changed();
    }
    for (const layer of this.layersHolder.contigTranslocationArrowsLayers) {
      layer.setVisible(
        translocationMode &&
          Number(layer.get("bpResolution")) ===
            this.getActiveVectorResolutionDescriptor().bpResolution
      );
    }
    this.refreshVisibleBuiltinVectorSources();
    if (options?.renderLinearTracks !== false) {
      void this.mapManager.linearTrackManager.render();
    }
  }

  public reloadVisuals(): void {
    this.reloadTiles();
    this.reloadTracks();
    this.mapManager.map.changed();
  }

  private toFiniteResolutionBound(
    bound: number | undefined
  ): number | undefined {
    return Number.isFinite(bound) ? bound : undefined;
  }

  public getActiveVectorResolutionDescriptor(): LayerResolutionDescriptor {
    return this.getVisibleSourceResolutionDescriptors().primary;
  }

  private syncLayerVisibilityForCurrentResolution(): void {
    const visibleDescriptors = this.getVisibleSourceResolutionDescriptors();
    const activeResolution = visibleDescriptors.primary.bpResolution;
    if (!Number.isFinite(activeResolution)) {
      return;
    }
    const activeVectorResolution =
      this.getActiveVectorResolutionDescriptor().bpResolution;

    for (const layer of this.layersHolder.primaryHiCDataLayers) {
      const layerResolution = Number(layer.get("bpResolution"));
      layer.setVisible(layerResolution === activeResolution);
    }
    for (const layer of this.layersHolder.secondaryHiCDataLayers) {
      const layerResolution = Number(layer.get("bpResolution"));
      layer.setVisible(
        visibleDescriptors.secondary !== undefined &&
          layerResolution === visibleDescriptors.secondary.bpResolution
      );
    }

    for (const layer of this.layersHolder.contigBordersLayers) {
      const layerResolution = Number(layer.get("bpResolution"));
      layer.setVisible(layerResolution === activeVectorResolution);
    }

    for (const layer of this.layersHolder.scaffoldBordersLayers) {
      const layerResolution = Number(layer.get("bpResolution"));
      layer.setVisible(layerResolution === activeVectorResolution);
    }

    for (const layer of this.layersHolder.contigTranslocationArrowsLayers) {
      const layerResolution = Number(layer.get("bpResolution"));
      layer.setVisible(
        layerResolution === activeVectorResolution &&
          this.currentViewState.activeTool === ActiveTool.TRANSLOCATION
      );
    }

    for (const layer of this.layersHolder.annotationLayers) {
      const layerResolution = Number(layer.get("bpResolution"));
      layer.setVisible(layerResolution === activeVectorResolution);
    }
    this.applyLayerScopeExtent(this.activeAxisScopeExtent);
    this.refreshVisibleBuiltinVectorSources();
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
      name ??
        `marker_${this.track2DHolder.annotationTrack.getMarkerCount() + 1}`
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
  type MatrixSourceName,
  type LayersHolder,
  type CurrentHiCViewState,
  type SelectionBorders,
  type Track2DHolder,
  ActiveTool,
  type AxisScopeSelection,
  type AxisScopeKind,
  type MapAxisScopes,
  type MapAxisScopePixelBounds,
};
