import { sequenceZoomResolution } from "../visualization/sequenceZoom";
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

import { unByKey } from "ol/Observable";
import { aggregateTileSignals } from "../visualization/tileSignalRange";
import { Extent, Select, DragBox } from "ol/interaction";
import { fromExtent } from "ol/geom/Polygon";
import type { SequenceMeasurement } from "../sequence/sequenceMeasurement";
import type { EventsKey } from "ol/events";
import {
  validateRegion,
  snapRegionBoundary,
  type RegionBounds,
} from "./regionSelection";
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
import { type Ref, ref, markRaw, shallowRef, shallowReactive } from "vue";
import { installTopLeftAnchor } from "./mapAnchor";
import {
  selectionAreaStyle,
  selectionPointerStyle,
  selectionBorderStyle,
} from "./selectionStyles";
import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import ContigMouseWheelZoom from "@/ContigMouseWheelZoom";
import BinMousePosition from "@/BinMousePosition";
import { VersionedXYZContactMapSource } from "../VersionedXYZSource";
import VectorImageLayer from "ol/layer/VectorImage";
import { containsExtent } from "ol/extent";
import type { OpenFileResponse } from "../net/netcommon";
import { Track2D } from "@/app/core/tracks/Track2D";
import {
  ContigBordersTrack2D,
  TranslocationArrowsTrack2D,
  ScaffoldBordersTrack2D,
  Track2DSymmetric,
  NamePlacement,
  BorderStyle,
  type TrackViewport,
} from "../tracks/Track2DSymmetric";
import { AnnotationTrack2D } from "../tracks/Track2DAnnotations";
import type {
  TrackStylePreset,
  TrackStylePresetBundle,
} from "../tracks/TrackStylePreset";
import Fill from "ol/style/Fill";
import {
  pointerMove,
  shiftKeyOnly,
  platformModifierKeyOnly,
  singleClick,
  never,
} from "ol/events/condition";
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
  selectNearestResolution,
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
  entitySelectionKind: "contig" | "scaffold";
  selectedContigIds: number[];
  selectedScaffoldIds: number[];
  hideScopedBorders: boolean;
  scopedAxes: boolean;
  sequenceMeasurement?: SequenceMeasurement;
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
  /** Server-owned immutable rendering inputs for the current figure only. */
  public figureRenderCaptureId: string | undefined;
  public figureRenderCaptureError: Error | undefined;
  public figureRenderCaptureFailed: ((error: Error) => void) | undefined;
  private static styleLoadSerial = 0;
  /**
   * `revision` changes on every style edit. `loaded` changes only when a manager is created or a whole
   * preset is applied, which is when controls that read colors once at mount must read them again.
   */
  public readonly trackStyleState = markRaw({
    revision: ref(0),
    loaded: ref(++HiCViewAndLayersManager.styleLoadSerial),
  });

  private static readonly VECTOR_SOURCE_DIRTY_FLAG = "hictVectorSourceDirty";

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
  // Native layers, sources and collections notify through OpenLayers events.
  // Keep Vue reactivity for UI state, not for renderer implementation details.
  public readonly layersHolder: LayersHolder = markRaw({
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
  });
  protected readonly view: View;
  public tileSize: number;
  private primaryResolutionSet: SourceResolutionDescriptorSet;
  private secondaryResolutionSet?: SourceResolutionDescriptorSet;
  private secondaryUsesPrimaryGrid = false;
  private currentLevels: Partial<Record<MatrixSourceName, number>> = {};
  private activeOverlay?: Layer;
  private outgoingOverlay?: Layer;
  private cancelOverlayTransition?: () => void;
  public readonly overlayStatus = markRaw({
    loading: ref(false),
    zoomRequired: ref(false),
  });
  private wheelZoomInteraction?: ContigMouseWheelZoom;
  private coordinateBaseBp: number;
  private readonly sequenceScaleSupported: boolean;
  private sequenceCoordinates = false;
  private changingDisplayGrid = false;
  private readonly sequenceLayers = markRaw(new Map<MatrixSourceName, Layer>());
  private selectionEventKeys: EventsKey[] = [];
  private projectingRegion = false;
  private regionGestureActive = false;
  private entityHighlightLayer?: VectorLayer<VectorSource>;
  private selectedContigIds = new Set<number>();
  private selectedScaffoldIds = new Set<number>();

  private canSelect(): boolean {
    return (
      this.currentViewState.activeTool === undefined &&
      !this.mapManager.isExporting
    );
  }

  public getRegionDomain(): RegionBounds {
    const total =
      this.mapManager.contigDimensionHolder.prefix_sum_bp[
        this.mapManager.contigDimensionHolder.contig_count
      ] ?? 0;
    const { row, column } = this.getAxisScopes();
    return {
      rowStart: row.startBp ?? 0,
      rowEnd: row.endBp ?? total,
      columnStart: column.startBp ?? 0,
      columnEnd: column.endBp ?? total,
    };
  }

  public getRegionBounds(): RegionBounds | undefined {
    const { leftBP, rightBP } = this.currentViewState.selectionBorders;
    return leftBP && rightBP
      ? {
          rowStart: leftBP[1],
          rowEnd: rightBP[1],
          columnStart: leftBP[0],
          columnEnd: rightBP[0],
        }
      : undefined;
  }

  public regionFromExtent(extent: number[]): RegionBounds | undefined {
    const d = this.currentViewState.resolutionDesciptor,
      holder = this.mapManager.contigDimensionHolder;
    const values = [extent[0], -extent[3], extent[2], -extent[1]].map((value) =>
      holder.getFractionalBpOfPx(value / d.pixelResolution, d.bpResolution)
    );
    const domain = this.getRegionDomain();
    const region = {
      columnStart: Math.max(
        domain.columnStart,
        snapRegionBoundary(values[0], false)
      ),
      rowStart: Math.max(domain.rowStart, snapRegionBoundary(values[1], false)),
      columnEnd: Math.min(
        domain.columnEnd,
        snapRegionBoundary(values[2], true)
      ),
      rowEnd: Math.min(domain.rowEnd, snapRegionBoundary(values[3], true)),
    };
    return region.rowEnd > region.rowStart &&
      region.columnEnd > region.columnStart
      ? region
      : undefined;
  }

  /** BP bounds are authoritative; reprojecting a rectangle must never round them to a native bin. */
  public setRegionBounds(region: RegionBounds): void {
    const valid = validateRegion(region, this.getRegionDomain());
    this.clearEntitySelection();
    let d = this.currentViewState.resolutionDesciptor;
    const holder = this.mapManager.contigDimensionHolder;
    let p = [
      valid.columnStart,
      valid.rowStart,
      valid.columnEnd,
      valid.rowEnd,
    ].map((value) => holder.getFractionalPxOfBp(value, d.bpResolution));
    if (
      (p[2] <= p[0] || p[3] <= p[1]) &&
      this.sequenceScaleSupported &&
      !this.isSequenceScale
    ) {
      this.restoreViewPosition({
        centerBp: [
          (valid.columnStart + valid.columnEnd) / 2,
          (valid.rowStart + valid.rowEnd) / 2,
        ],
        resolution: 1 / this.coordinateBaseBp / 20,
      });
      d = this.currentViewState.resolutionDesciptor;
      p = [
        valid.columnStart,
        valid.rowStart,
        valid.columnEnd,
        valid.rowEnd,
      ].map((value) => holder.getFractionalPxOfBp(value, d.bpResolution));
    }
    this.currentViewState.selectionBorders = {
      leftBP: [valid.columnStart, valid.rowStart],
      rightBP: [valid.columnEnd, valid.rowEnd],
      leftPx: [p[0], p[1]],
      rightPx: [p[2], p[3]],
    };
    this.projectingRegion = true;
    try {
      this.selectionInteractions.contigSelectExtent.setExtent([
        p[0] * d.pixelResolution,
        -p[3] * d.pixelResolution,
        p[2] * d.pixelResolution,
        -p[1] * d.pixelResolution,
      ]);
    } finally {
      this.projectingRegion = false;
    }
    this.setSelectionPresentationVisible(!this.mapManager.isExporting);
  }

  public clearRegionSelection(): void {
    this.regionGestureActive = false;
    (
      this.selectionInteractions.contigSelectExtent as unknown as {
        handlingDownUpSequence: boolean;
      }
    ).handlingDownUpSequence = false;
    this.currentViewState.selectionBorders = {};
    this.projectingRegion = true;
    try {
      this.selectionInteractions.contigSelectExtent.setExtent(undefined!);
    } finally {
      this.projectingRegion = false;
    }
    const extent = this.selectionInteractions.contigSelectExtent as unknown as {
      vertexOverlay_?: Layer;
    };
    extent.vertexOverlay_?.setVisible(false);
  }

  public clearEntitySelection(): void {
    this.selectedContigIds.clear();
    this.selectedScaffoldIds.clear();
    this.currentViewState.selectedContigIds = [];
    this.currentViewState.selectedScaffoldIds = [];
    this.selectionCollections.selectedContigFeatures.clear();
    this.selectionCollections.selectedScaffoldFeatures.clear();
    this.entityHighlightLayer?.getSource()?.clear(true);
  }

  public setSequenceMeasurement(measurement?: SequenceMeasurement): void {
    this.currentViewState.sequenceMeasurement = measurement;
  }

  public clearSelections(): void {
    this.setSequenceMeasurement();
    this.clearRegionSelection();
    this.clearEntitySelection();
  }

  public selectEntityRangeByBp(
    start: number,
    end: number,
    kind = this.currentViewState.entitySelectionKind
  ): void {
    this.clearRegionSelection();
    this.clearEntitySelection();
    if (!(end > start)) return;
    const holder = this.mapManager.contigDimensionHolder;
    let scaffoldIds: number[] = [];
    if (kind === "scaffold") {
      const selected =
        this.mapManager.scaffoldHolder.scaffoldBordersSorted.filter(
          ([bounds]) => bounds.startBP < end && bounds.endBP > start
        );
      if (!selected.length) return;
      start = selected[0][0].startBP;
      end = selected[selected.length - 1][0].endBP;
      scaffoldIds = selected.map(([, id]) => id);
    }
    const ids = holder.contigDescriptors
      .filter(
        (_, i) =>
          holder.prefix_sum_bp[i] < end && holder.prefix_sum_bp[i + 1] > start
      )
      .map((d) => d.contigId);
    this.currentViewState.selectedContigIds = ids;
    this.currentViewState.selectedScaffoldIds = scaffoldIds;
    this.selectedContigIds = new Set(ids);
    this.selectedScaffoldIds = new Set(scaffoldIds);
    this.refreshEntityHighlights();
  }

  public getSelectedEntityRange(): { startBP: number; endBP: number } | null {
    const holder = this.mapManager.contigDimensionHolder;
    const ids = this.currentViewState.selectedContigIds ?? [];
    const orders = ids
      .map((id) => holder.contigIdToOrd[id])
      .filter((order) => order !== undefined);
    if (!orders.length) return null;
    let first = orders[0],
      last = orders[0];
    for (const order of orders) {
      first = Math.min(first, order);
      last = Math.max(last, order);
    }
    return {
      startBP: holder.prefix_sum_bp[first],
      endBP: holder.prefix_sum_bp[last + 1],
    };
  }

  public setEntitySelectionKind(kind: "contig" | "scaffold"): void {
    this.clearEntitySelection();
    this.currentViewState.entitySelectionKind = kind;
  }

  /** OL 9.1 Extent has two private presentation layers; isolate this pinned API access here. */
  public setSelectionPresentationVisible(visible: boolean): void {
    const extent = this.selectionInteractions.contigSelectExtent as unknown as {
      extentOverlay_?: Layer;
      vertexOverlay_?: Layer;
    };
    extent.extentOverlay_?.setVisible(visible);
    extent.vertexOverlay_?.setVisible(visible && !!this.getRegionBounds());
    this.entityHighlightLayer?.setVisible(visible);
  }

  private refreshEntityHighlights(): void {
    if (!this.entityHighlightLayer) return;
    const d = this.currentViewState.resolutionDesciptor,
      holder = this.mapManager.contigDimensionHolder;
    const features: Feature<Geometry>[] = [];
    const contigs: Feature<Geometry>[] = [],
      scaffolds: Feature<Geometry>[] = [];
    const append = (start: number, end: number) => {
      const a =
          holder.getFractionalPxOfBp(start, d.bpResolution) * d.pixelResolution,
        b = holder.getFractionalPxOfBp(end, d.bpResolution) * d.pixelResolution;
      if (b > a)
        features.push(new Feature({ geometry: fromExtent([a, -b, b, -a]) }));
    };
    for (const feature of this.track2DHolder.contigBordersTrack.features.get(
      d.bpResolution
    ) ?? []) {
      const cd = feature.get("contigDescriptor") as
        | ContigDescriptor
        | undefined;
      if (
        feature.get("trackType") !== "contigBorders" ||
        !cd ||
        !this.selectedContigIds.has(cd.contigId)
      )
        continue;
      contigs.push(feature);
      if (!this.selectedScaffoldIds.size) {
        const i = holder.contigIdToOrd[cd.contigId];
        append(holder.prefix_sum_bp[i], holder.prefix_sum_bp[i + 1]);
      }
    }
    for (const feature of this.track2DHolder.scaffoldBordersTrack.features.get(
      d.bpResolution
    ) ?? []) {
      const sd = (feature.get("scaffoldDescriptor") ??
        feature.get("scaffolDescriptor")) as { scaffoldId: number } | undefined;
      if (
        feature.get("trackType") !== "scaffoldBorders" ||
        !sd ||
        !this.selectedScaffoldIds.has(sd.scaffoldId)
      )
        continue;
      const bounds = this.mapManager.scaffoldHolder.scaffoldBordersBp.get(
        sd.scaffoldId
      );
      if (!bounds) continue;
      scaffolds.push(feature);
      append(bounds.startBP, bounds.endBP);
    }
    const source = this.entityHighlightLayer.getSource()!;
    source.clear(true);
    source.addFeatures(features);
    this.entityHighlightLayer.setExtent(this.activeAxisScopeExtent);
    this.selectionCollections.selectedContigFeatures.clear();
    this.selectionCollections.selectedContigFeatures.extend(contigs);
    this.selectionCollections.selectedScaffoldFeatures.clear();
    this.selectionCollections.selectedScaffoldFeatures.extend(scaffolds);
  }
  private viewRestoreGeneration = 0;

  public get isSequenceScale(): boolean {
    return (
      this.currentViewState?.resolutionDesciptor.displayGrid === "SEQUENCE_BP"
    );
  }

  private wantsSequenceCoordinates(viewResolution: number): boolean {
    return (
      this.sequenceScaleSupported &&
      Number.isFinite(viewResolution) &&
      viewResolution > 0 &&
      viewResolution <=
        1 / this.coordinateBaseBp / (this.sequenceCoordinates ? 2 : 4)
    );
  }

  public getDimensionHolderForDescriptor(
    descriptor: LayerResolutionDescriptor
  ) {
    const holder = this.mapManager.contigDimensionHolder;
    return descriptor.displayGrid === "SEQUENCE_BP"
      ? holder.getSequenceCoordinates()
      : holder.getNativeCoordinates();
  }

  public captureViewPosition() {
    const descriptor = this.currentViewState.resolutionDesciptor,
      holder = this.mapManager.contigDimensionHolder;
    const center = this.view.getCenter();
    const centerBp = center?.map((value, index) =>
      holder.getFractionalBpOfPx(
        (index === 0 ? value : -value) / descriptor.pixelResolution,
        descriptor.bpResolution
      )
    ) as [number, number] | undefined;
    return {
      center: center ? [...center] : undefined,
      centerBp,
      resolution: this.view.getResolution(),
      rotation: this.view.getRotation(),
      displayGrid: descriptor.displayGrid ?? "NATIVE",
      bpResolution: descriptor.bpResolution,
    };
  }

  public restoreViewPosition(position: {
    center?: number[];
    centerBp?: number[];
    resolution?: number;
    rotation?: number;
    displayGrid?: string;
    bpResolution?: number;
  }): void {
    this.view.cancelAnimations();
    if (Number.isFinite(position.resolution) && position.resolution! > 0) {
      this.transitionDisplayGrid(position.resolution!);
      this.view.setResolution(position.resolution);
    }
    this.updateCurrentHiCViewState();
    const descriptor = this.currentViewState.resolutionDesciptor;
    if (
      position.centerBp?.length === 2 &&
      position.centerBp.every(Number.isFinite)
    ) {
      const holder = this.mapManager.contigDimensionHolder;
      const center = position.centerBp.map(
        (bp) =>
          holder.getFractionalPxOfBp(bp, descriptor.bpResolution) *
          descriptor.pixelResolution
      );
      this.view.setCenter([center[0], -center[1]]);
    } else if (
      position.center?.length === 2 &&
      position.center.every(Number.isFinite)
    ) {
      const native = this.getNativeResolutionDescriptor();
      const stored =
        position.displayGrid === "SEQUENCE_BP"
          ? this.sequenceDescriptor(native)
          : native;
      this.view.setCenter(
        this.reprojectPoint(position.center, stored, descriptor)
      );
    }
    if (Number.isFinite(position.rotation))
      this.view.setRotation(position.rotation!);
    this.scheduleRulerRender();
    // Entering letter scale changes the ruler strip size on the next Vue frame.
    // Reapply the requested BP center after that layout, so an assembly-edge
    // bookmark is not permanently clamped using the previous viewport size.
    // Any intervening user input or another restore owns the view instead.
    const generation = ++this.viewRestoreGeneration;
    if (
      position.centerBp?.length === 2 &&
      position.centerBp.every(Number.isFinite)
    ) {
      const centerBp = [...position.centerBp];
      const resolution = this.view.getResolution();
      let interrupted = false;
      const cancel = () => {
        interrupted = true;
      };
      const events = ["pointerdown", "wheel", "keydown"] as const;
      events.forEach((event) =>
        window.addEventListener(event, cancel, { capture: true, once: true })
      );
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => {
          events.forEach((event) =>
            window.removeEventListener(event, cancel, true)
          );
          if (
            interrupted ||
            this.mapManager.isDisposed ||
            generation !== this.viewRestoreGeneration ||
            resolution !== this.view.getResolution()
          )
            return;
          this.mapManager.getMap().updateSize();
          const current = this.currentViewState.resolutionDesciptor;
          const holder = this.mapManager.contigDimensionHolder;
          const center = centerBp.map(
            (bp) =>
              holder.getFractionalPxOfBp(bp, current.bpResolution) *
              current.pixelResolution
          );
          this.view.setCenter([center[0], -center[1]]);
          this.scheduleRulerRender();
        })
      );
    }
  }

  public reprojectPoint(
    point: number[],
    from: LayerResolutionDescriptor,
    to: LayerResolutionDescriptor
  ): [number, number] {
    const source = this.getDimensionHolderForDescriptor(from),
      target = this.getDimensionHolderForDescriptor(to);
    const sourceSize =
      source.prefix_sum_px.get(from.bpResolution)?.[source.contig_count] ?? 0;
    const targetSize =
      target.prefix_sum_px.get(to.bpResolution)?.[target.contig_count] ?? 0;
    const length = source.prefix_sum_bp[source.contig_count] ?? 0;
    const values = [point[0], -point[1]].map((value) => {
      const pixel = value / from.pixelResolution;
      const bp =
        pixel < 0
          ? pixel * from.bpResolution
          : pixel > sourceSize
          ? length + (pixel - sourceSize) * from.bpResolution
          : source.getFractionalBpOfPx(pixel, from.bpResolution);
      const coordinate =
        bp < 0
          ? bp / to.bpResolution
          : bp > length
          ? targetSize + (bp - length) / to.bpResolution
          : target.getFractionalPxOfBp(bp, to.bpResolution);
      return coordinate * to.pixelResolution;
    });
    return [values[0], -values[1]];
  }

  private refreshNativeGeometry(): void {
    const holder = this.mapManager.contigDimensionHolder.getNativeCoordinates();
    const sizes = this.primaryResolutionSet.resolutions.map(
      (res, index) =>
        holder.prefix_sum_px.get(res)?.[holder.contig_count] ??
        this.primaryResolutionSet.imageSizes[index]
    );
    if (
      sizes.every(
        (size, index) => size === this.primaryResolutionSet.imageSizes[index]
      )
    )
      return;
    this.removeSourceHiCDataLayers("PRIMARY");
    this.primaryResolutionSet = this.buildResolutionDescriptorSet(
      "PRIMARY",
      this.primaryResolutionSet.resolutions,
      sizes
    );
    this.applyPrimaryResolutionSet(this.primaryResolutionSet);
    this.addSourceHiCDataLayers(this.primaryResolutionSet);
    if (this.secondaryUsesPrimaryGrid) {
      this.cancelOverlayTransition?.();
      if (this.outgoingOverlay)
        this.removeProjectedOverlay(this.outgoingOverlay);
      if (this.activeOverlay) this.removeProjectedOverlay(this.activeOverlay);
      this.outgoingOverlay = undefined;
      this.activeOverlay = undefined;
    }
    this.updateProjectionAndViewExtent();
    this.syncLayerVisibilityForCurrentResolution();
    this.mapManager.rebuildOverviewMinimap();
  }

  public getNativeMatrixBounds(
    extent: number[],
    source: MatrixSourceName = "PRIMARY"
  ) {
    const display = this.currentViewState.resolutionDesciptor;
    const native = this.getNativeResolutionDescriptor(source);
    const holder = this.mapManager.contigDimensionHolder.getNativeCoordinates();
    const totalBp = holder.prefix_sum_bp[holder.contig_count] ?? 0;
    const bp = [extent[0], -extent[3], extent[2], -extent[1]].map((value) =>
      Math.max(
        0,
        Math.min(
          totalBp,
          this.mapManager.contigDimensionHolder.getFractionalBpOfPx(
            value / display.pixelResolution,
            display.bpResolution
          )
        )
      )
    );
    const start = (value: number) =>
      holder.getBinContainingBp(
        Math.floor(Math.min(value, Math.max(0, totalBp - 1))),
        native.bpResolution
      );
    const end = (value: number) =>
      value <= 0
        ? 0
        : holder.getBinContainingBp(
            Math.ceil(Math.min(value, totalBp)) - 1,
            native.bpResolution
          ) + 1;
    return {
      bpResolution: native.bpResolution,
      unit: "BINS" as const,
      startRowPx: start(bp[1]),
      endRowPx: end(bp[3]),
      startColPx: start(bp[0]),
      endColPx: end(bp[2]),
    };
  }

  private sequenceDescriptor(
    native: LayerResolutionDescriptor
  ): LayerResolutionDescriptor {
    return {
      ...native,
      bpResolution: 1,
      pixelResolution: 1 / this.coordinateBaseBp,
      displayGrid: "SEQUENCE_BP",
      sourceBpResolution: native.bpResolution,
    };
  }

  public normalizeSequenceZoomResolution(requested: number): number {
    if (
      !this.sequenceScaleSupported &&
      !this.mapManager.networkManager.requestManager.hasLinkedFasta
    )
      return requested;
    const model = this.getNavigationResolutionModel();
    const index = model.resolutions.indexOf(Math.min(...model.resolutions));
    return sequenceZoomResolution(
      this.view.getResolution(),
      requested,
      model.pixelResolutionSet[index],
      model.resolutions[index],
      this.mapManager.getMap().getSize() ?? [1, 1]
    );
  }

  /** Change coordinate bases atomically. Wheel/trackpad callers can preserve their exact pointer anchor. */
  public transitionDisplayGrid(
    resolution: number,
    anchorBp?: number[],
    anchorPixel?: number[]
  ): boolean {
    const next = this.wantsSequenceCoordinates(resolution);
    if (next === this.sequenceCoordinates || this.changingDisplayGrid)
      return false;
    const previous = this.currentViewState.resolutionDesciptor;
    const previousHolder = this.getDimensionHolderForDescriptor(previous);
    const center = this.view.getCenter() ?? [0, 0];
    const bp =
      anchorBp ??
      [center[0], -center[1]].map((value) =>
        previousHolder.getFractionalBpOfPx(
          value / previous.pixelResolution,
          previous.bpResolution
        )
      );
    const target = this.getNativeResolutionDescriptor("PRIMARY", resolution);
    const descriptor = next ? this.sequenceDescriptor(target) : target;
    const holder = this.getDimensionHolderForDescriptor(descriptor);
    const point = bp.map(
      (value) =>
        holder.getFractionalPxOfBp(value, descriptor.bpResolution) *
        descriptor.pixelResolution
    );
    const size = this.mapManager.getMap().getSize() ?? [0, 0];
    const pixel = anchorPixel ?? [size[0] / 2, size[1] / 2];
    const nextCenter: [number, number] = [
      point[0] + (size[0] / 2 - pixel[0]) * resolution,
      -point[1] - (size[1] / 2 - pixel[1]) * resolution,
    ];
    const selection = this.currentViewState.selectionBorders;
    this.changingDisplayGrid = true;
    try {
      this.sequenceCoordinates = next;
      this.mapManager.contigDimensionHolder.setSequenceCoordinates(next);
      this.currentViewState.resolutionDesciptor = descriptor;
      this.ensureSequenceLayers();
      this.updateProjectionAndViewExtent(1, { center: nextCenter, resolution });
      this.markBuiltinVectorLayersDirty();
      this.vectorBuilt = undefined;
      this.vectorExactKey = "";
      if (selection.leftBP && selection.rightBP)
        this.setRegionBounds({
          columnStart: selection.leftBP[0],
          rowStart: selection.leftBP[1],
          columnEnd: selection.rightBP[0],
          rowEnd: selection.rightBP[1],
        });
    } finally {
      this.changingDisplayGrid = false;
    }
    this.updateCurrentHiCViewState();
    void this.mapManager.linearTrackManager?.clearCachesAndRender();
    this.scheduleRulerRender();
    return true;
  }

  private enabledBpResolutions?: Set<number>;
  /** Extent, zoom bucket and matrix resolution the border/label features were last built for. */
  private vectorBuilt?: {
    extent: number[];
    bucket: number;
    bpResolution: number;
  };
  private vectorExactKey = "";
  private vectorViewportListener?: () => void;
  private vectorMoveEndListener?: () => void;
  private rulerRenderCallback: (() => void) | null = null;
  private disposeRulers?: () => void;
  private readonly pendingFeatureStyleRefreshHandles = new Set<number>();
  public axisScopeRevision = 0;
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
  } = markRaw({
    selectedContigFeatures: new Collection(),
    selectedScaffoldFeatures: new Collection(),
    selectedTranslocationArrowsFeatures: new Collection(),
  });

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
    readonly entityDragBox: DragBox;
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
    this.sequenceScaleSupported =
      response.capabilities?.sequenceScaleTiles === true;
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
    this.pixelProjection = markRaw(
      new Projection({
        code: "pixelate",
        units: "pixels",
        metersPerUnit: undefined,
        extent: maximum_global_extent,
        axisOrientation: "esu", // OK, axis orientation is changed in layer projections
        global: false,
        getPointResolution: (resolution) => resolution,
      })
    );
    // Define view:
    this.view = markRaw(
      new View({
        ...this.createViewOptions(maximum_global_extent),
        center: [
          this.pixelProjection.getExtent()[0],
          this.pixelProjection.getExtent()[3],
        ],
        resolution:
          this.pixelResolutionSet.length > 0
            ? Math.max(...this.pixelResolutionSet)
            : 1,
      })
    );
    installTopLeftAnchor(
      this.view,
      maximum_global_extent,
      () =>
        useUiSettingsStore().mapAnchorTopLeft && !this.mapManager.isExporting
    );

    this.currentViewState = shallowReactive({
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
      entitySelectionKind: "contig",
      selectedContigIds: [],
      selectedScaffoldIds: [],
      hideScopedBorders: false,
      scopedAxes: false,
    });

    // The armed tool is read by toolbar buttons and written from async completions that hold the raw
    // manager, which Vue cannot observe. Backing it with a ref keeps the buttons truthful either way.
    const armedTool = shallowRef<ActiveTool | undefined>(undefined);
    Object.defineProperty(this.currentViewState, "activeTool", {
      get: () => armedTool.value,
      set: (tool: ActiveTool | undefined) => {
        armedTool.value = tool;
      },
      enumerable: true,
      configurable: true,
    });

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
      NamePlacement.BOTTOM
    );
    this.track2DHolder.scaffoldBordersTrack.setNamePlacement(NamePlacement.TOP);

    this.deferredInitializationInteractions = {
      scissorsGuideInteraction: undefined,
    };

    this.selectionInteractions = markRaw({
      contigSelectionInteraction: new Select({
        multi: false,
        layers: this.layersHolder.contigBordersLayers,
        style: null,
        hitTolerance: 0,
        features: this.selectionCollections.selectedContigFeatures,
        // Entity clicks are resolved through assembly BP, even with borders hidden.
        condition: never,
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
        condition: (event) => {
          if (!this.canSelect()) return false;
          if (event.type === "pointerup" && this.regionGestureActive) {
            this.regionGestureActive = false;
            return true;
          }
          if (event.type === "pointerdown" && platformModifierKeyOnly(event))
            this.regionGestureActive = true;
          return this.regionGestureActive || platformModifierKeyOnly(event);
        },
        pixelTolerance: 0,
        boxStyle: selectionAreaStyle(),
        pointerStyle: selectionPointerStyle(),
      }),
      entityDragBox: new DragBox({
        condition: (event) => shiftKeyOnly(event) && this.canSelect(),
        minArea: 0,
        className: "hict-entity-drag",
      }),
    });

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
    if (this.sequenceCoordinates) {
      const holder = this.mapManager.contigDimensionHolder;
      return Math.max(
        1,
        (holder.prefix_sum_bp[holder.contig_count] ?? 0) / this.coordinateBaseBp
      );
    }
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
      resolutions: uniqueDescriptors.map(
        (descriptor) => descriptor.bpResolution
      ),
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
    return all.filter((resolution) =>
      this.enabledBpResolutions?.has(resolution)
    );
  }

  public setEnabledBpResolutions(resolutions: number[]): void {
    const valid = new Set(this.getAllNavigationBpResolutions());
    const next = resolutions
      .map((resolution) => Number(resolution))
      .filter(
        (resolution) => Number.isFinite(resolution) && valid.has(resolution)
      );
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
    const native = getVectorResolutionTuplesForSets(
      this.primaryResolutionSet,
      this.secondaryResolutionSet
    );
    if (
      !this.sequenceScaleSupported ||
      native.some((tuple) => tuple.bpResolution === 1)
    )
      return native;
    const finest = native.reduce((best, tuple) =>
      tuple.bpResolution < best.bpResolution ? tuple : best
    );
    return [...native, this.sequenceDescriptor(finest)];
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

  private exportMaxResolution: number | undefined;

  /** Whole-map export reserves caption margins; fitting the heatmap to the canvas would erase them. */
  public setExportMaxResolution(resolution: number | undefined): void {
    if (
      resolution !== undefined &&
      (!Number.isFinite(resolution) || resolution <= 0)
    )
      throw new Error("Invalid export resolution");
    this.exportMaxResolution = resolution;
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
    // OpenLayers rounds this limit up to a power-of-two zoom level. Reserve
    // one extra level so the 12-pixel nucleotide zoom remains reachable.
    const minResolution = Math.min(
      minPixelResolution / overzoomFactor,
      ...navigationModel.pixelResolutionSet.map(
        (pixel, index) =>
          pixel / Math.max(1, navigationModel.resolutions?.[index] ?? 1) / 32
      )
    );
    const size = this.mapManager.getMap()?.getSize();
    const maxResolution =
      size && size[0] > 0 && size[1] > 0
        ? Math.max(
            (extent[2] - extent[0]) / size[0],
            (extent[3] - extent[1]) / size[1]
          )
        : Math.max(maxPixelResolution, maximumScaledImageSize);
    return {
      minResolution,
      maxResolution: Math.max(maxResolution, this.exportMaxResolution ?? 0),
      constrainResolution: false,
      smoothResolutionConstraint: false,
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

  public fitViewToActiveExtent(): void {
    this.updateZoomLimit();
    this.fitViewToExtent(this.getActiveMapExtent());
    this.updateCurrentHiCViewState();
    this.scheduleRulerRender();
    this.mapManager.getMap().changed();
  }

  private zoomLimitUpdatePending = false;
  public updateZoomLimit(): void {
    const size = this.mapManager.getMap().getSize();
    if (!size || size[0] <= 0 || size[1] <= 0) return;
    const extent = this.getActiveMapExtent();
    const maxResolution = Math.max(
      (extent[2] - extent[0]) / size[0],
      (extent[3] - extent[1]) / size[1],
      this.exportMaxResolution ?? 0
    );
    if (
      !Number.isFinite(maxResolution) ||
      maxResolution <= 0 ||
      this.view.getMaxResolution() === maxResolution
    )
      return;
    // Updating OL constraints cancels animations. A FASTA strip can resize the
    // viewport midway through a wheel zoom; finish that gesture before changing
    // the zoom-out limit, preserving both its target and its pointer anchor.
    if (this.view.getAnimating() || this.view.getInteracting()) {
      if (!this.zoomLimitUpdatePending) {
        this.zoomLimitUpdatePending = true;
        this.mapManager.getMap().once("moveend", () => {
          this.zoomLimitUpdatePending = false;
          if (!this.mapManager.isDisposed) this.updateZoomLimit();
        });
      }
      return;
    }
    // Retain the View object, center and resolution when changing its limits.
    this.view.applyOptions_(
      this.view.getUpdatedOptions_(this.createViewOptions(extent))
    );
  }

  public setAxisScopes(
    row: AxisScopeSelection,
    column: AxisScopeSelection
  ): void {
    this.clearSelections();
    this.activeAxisScopes = {
      row: this.normalizeAxisScope(row, "row"),
      column: this.normalizeAxisScope(column, "column"),
    };
    this.reapplyAxisScopes({ fit: true });
    this.axisScopeRevision += 1;
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
    this.currentViewState.scopedAxes =
      resolvedRow.kind !== "all" && resolvedColumn.kind !== "all";

    const nextExtent = this.computeAxisScopeExtent(resolvedRow, resolvedColumn);
    this.activeAxisScopeExtent = nextExtent ?? undefined;
    const appliedExtent = this.getActiveMapExtent();
    if (options?.refreshViewOptions !== false) {
      // applyOptions_ resets omitted view state, including the center to null.
      this.view.applyOptions_(
        this.view.getUpdatedOptions_(this.createViewOptions(appliedExtent))
      );
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
      this.axisScopeRevision += 1;
    }
  }

  private normalizeAxisScope(
    scope: AxisScopeSelection | undefined,
    axis: "row" | "column"
  ): AxisScopeSelection {
    if (!scope || scope.kind === "all" || scope.id === undefined) {
      return {
        kind: "all",
        label: axis === "row" ? "All Rows" : "All Columns",
      };
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
      return {
        kind: "all",
        label: axis === "row" ? "All Rows" : "All Columns",
      };
    }
    if (scope.kind === "contig") {
      const order =
        this.mapManager.contigDimensionHolder.contigIdToOrd[scope.id];
      const descriptor =
        order !== undefined
          ? this.mapManager.contigDimensionHolder.contigDescriptors[order]
          : undefined;
      if (!descriptor) {
        return {
          kind: "all",
          label: axis === "row" ? "All Rows" : "All Columns",
        };
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
      return {
        kind: "all",
        label: axis === "row" ? "All Rows" : "All Columns",
      };
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

  public getActiveMapPixelBounds(
    bpResolution: number
  ): MapAxisScopePixelBounds {
    const holder = this.mapManager.contigDimensionHolder;
    holder.ensureResolution(bpResolution);
    const mapSizePx =
      holder.prefix_sum_px.get(bpResolution)?.[holder.contig_count] ??
      Math.max(1, Math.round(this.imageSizes[0] ?? 1));
    const row = this.resolveAxisScope(this.activeAxisScopes.row, "row");
    const column = this.resolveAxisScope(
      this.activeAxisScopes.column,
      "column"
    );
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
      const end = Math.max(start + 1, Math.min(mapSizePx, Math.ceil(range[1])));
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
    const candidates = this.getVectorResolutionTuples()
      .filter(
        (tuple) =>
          this.sequenceCoordinates || tuple.displayGrid !== "SEQUENCE_BP"
      )
      .slice()
      .sort((a, b) => a.bpResolution - b.bpResolution);
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
    const endPx =
      holder.getPxContainingBp(endBpExclusive - 1, bpResolution) + 1;
    return [startPx, endPx];
  }

  private fitViewToExtent(extent: [number, number, number, number]): void {
    const size = this.mapManager.getMap().getSize();
    if (size && size[0] > 0 && size[1] > 0) {
      this.view.fit(extent, {
        size,
        nearest: false,
        padding: [0, 0, 0, 0],
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

  private updateProjectionAndViewExtent(
    scalePreservedView = 1,
    displayView?: { center: [number, number]; resolution: number }
  ): void {
    const previousCenter = this.view.getCenter();
    const previousResolution = this.view.getResolution();
    const maximumScaledImageSize = this.calculateMaximumScaledImageSize(
      this.primaryResolutionSet,
      this.secondaryResolutionSet
    );
    const extent = [0, -maximumScaledImageSize, maximumScaledImageSize, 0] as [
      number,
      number,
      number,
      number
    ];
    this.fullGlobalExtent = extent;
    this.pixelProjection.setExtent(extent);
    this.activeAxisScopeExtent =
      this.computeAxisScopeExtent(
        this.activeAxisScopes.row,
        this.activeAxisScopes.column
      ) ?? undefined;
    const activeExtent = this.getActiveMapExtent();
    const nextCenter =
      displayView?.center ??
      (previousCenter &&
      previousCenter.length >= 2 &&
      previousCenter.every((value) => Number.isFinite(value))
        ? ([
            previousCenter[0] * scalePreservedView,
            previousCenter[1] * scalePreservedView,
          ] as [number, number])
        : ([activeExtent[0], activeExtent[3]] as [number, number]));
    const nextResolution =
      displayView?.resolution ??
      (previousResolution !== undefined && Number.isFinite(previousResolution)
        ? previousResolution * scalePreservedView
        : Math.max(
            ...this.getNavigationResolutionModel().pixelResolutionSet,
            1
          ));

    const viewOptions = this.view.getUpdatedOptions_({
      ...this.createViewOptions(activeExtent),
      center: this.clampPointToExtent(nextCenter, activeExtent),
    });
    if (Number.isFinite(nextResolution) && nextResolution > 0) {
      viewOptions.resolution = nextResolution;
    }
    this.view.applyOptions_(viewOptions);
    this.applyLayerScopeExtent(this.activeAxisScopeExtent);
  }

  private previousSequenceZoomResolution: number | undefined;
  private sequenceZoomPending = false;
  public async onViewResolutionChanged(): Promise<void> {
    if (this.changingDisplayGrid) return;
    const requested = this.view.getResolution();
    if (requested && !this.mapManager.isExporting)
      this.transitionDisplayGrid(requested);
    if (
      requested &&
      !this.mapManager.isExporting &&
      // Wheel/trackpad already normalize their target with a BP pointer anchor.
      // Rewriting an intermediate animation frame cancels that anchored zoom.
      !this.view.getAnimating() &&
      !this.view.getInteracting() &&
      (this.sequenceScaleSupported ||
        this.mapManager.networkManager.requestManager.hasLinkedFasta)
    ) {
      const model = this.getNavigationResolutionModel();
      const index = model.resolutions.indexOf(Math.min(...model.resolutions));
      const target = sequenceZoomResolution(
        this.previousSequenceZoomResolution,
        requested,
        model.pixelResolutionSet[index],
        model.resolutions[index],
        this.mapManager.getMap().getSize() ?? [1, 1]
      );
      if (target !== requested && !this.sequenceZoomPending) {
        // OpenLayers is still applying its target during change:resolution.
        // Defer the jump so its enclosing state update cannot restore the old target.
        this.sequenceZoomPending = true;
        queueMicrotask(() => {
          this.sequenceZoomPending = false;
          if (
            this.mapManager.isDisposed ||
            this.view.getResolution() !== requested
          )
            return;
          this.previousSequenceZoomResolution = target;
          this.view.cancelAnimations();
          this.view.setResolution(target);
        });
      } else if (!this.sequenceZoomPending)
        this.previousSequenceZoomResolution = requested;
    } else this.previousSequenceZoomResolution = requested;
    this.updateCurrentHiCViewState();
    // This runs on every animation frame of a zoom. With no row/column restriction there is no
    // scope extent to recompute, so only the rulers need refreshing.
    if (
      this.activeAxisScopes.row.kind === "all" &&
      this.activeAxisScopes.column.kind === "all"
    ) {
      this.scheduleRulerRender();
    } else {
      this.reapplyAxisScopes({
        renderLinearTracks: false,
        refreshViewOptions: false,
      });
    }
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

  public loadedViewportSignalRange(
    source: MatrixSourceName,
    expression: unknown
  ) {
    const descriptor = this.currentViewState.resolutionDesciptor;
    const layers =
      source === "SECONDARY"
        ? this.layersHolder.secondaryHiCDataLayers
        : this.layersHolder.primaryHiCDataLayers;
    const extent = this.view.calculateExtent(
      this.mapManager.getMap().getSize()
    );
    const signals = layers.flatMap((layer) => {
      if (!layer.getVisible() || layer === this.outgoingOverlay) return [];
      const tiles = layer.getSource();
      return tiles instanceof VersionedXYZContactMapSource
        ? tiles.loadedViewportSignals(extent)
        : [];
    });
    // The secondary source can use its own coarser resolution.
    const resolution =
      signals.find((tile) => tile.source === source)?.bpResolution ??
      descriptor.bpResolution;
    return aggregateTileSignals(signals, source, resolution, expression);
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

    this.trackStyleState.revision.value++;
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

    this.trackStyleState.revision.value++;
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
    this.trackStyleState.revision.value++;
    this.reloadTracks();
  }

  public onScaffoldNamePlacementChanged(placement: NamePlacement): void {
    this.track2DHolder.scaffoldBordersTrack.setNamePlacement(placement);
    this.trackStyleState.revision.value++;
    this.reloadTracks();
  }

  public onNamePlacementChanged(placement: NamePlacement): void {
    this.track2DHolder.contigBordersTrack.setNamePlacement(placement);
    this.track2DHolder.scaffoldBordersTrack.setNamePlacement(placement);
    this.trackStyleState.revision.value++;
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
    this.trackStyleState.revision.value++;
    this.trackStyleState.loaded.value =
      ++HiCViewAndLayersManager.styleLoadSerial;
    this.reloadTracks();
  }

  private getSingleTrackStylePreset(track: Track2DSymmetric): TrackStylePreset {
    const borderColor = this.colorLikeToString(track.options.borderColor);
    const fillColor = this.colorLikeToString(track.options.fillColor);
    return {
      borderColor,
      fillColor,
      width: track.options.width,
      borderOutline: track.options.borderOutline,
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
    track.options.borderOutline = preset.borderOutline ?? false;
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
      // Visibility is selected from the enabled resolution model below. Static
      // pyramid bounds would hide that layer when finer resolutions are disabled.
      const layer = new TileLayer({
        source: layerSource,
        visible: false,
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
    const native = this.getNativeResolutionDescriptor(
      sourceName,
      viewResolution
    );
    return this.sequenceCoordinates ? this.sequenceDescriptor(native) : native;
  }

  public getNativeResolutionDescriptor(
    sourceName: MatrixSourceName = "PRIMARY",
    viewResolution = this.view.getResolution() ?? 0
  ): LayerResolutionDescriptor {
    const set =
      sourceName === "SECONDARY"
        ? this.secondaryResolutionSet
        : this.primaryResolutionSet;
    if (!set) {
      throw new Error(`No resolutions available for ${sourceName}`);
    }
    const tuples = this.getEnabledResolutionTuples(set);
    if (!this.secondaryResolutionSet) {
      return getResolutionDescriptorForViewResolution(
        tuples === set.resolutionTuples
          ? set
          : { ...set, resolutionTuples: tuples },
        viewResolution
      );
    }
    return selectNearestResolution(
      tuples,
      viewResolution,
      this.currentLevels[sourceName]
    );
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
    const primary = this.viewResolutionToSourceResolutionDescriptor(
      "PRIMARY",
      viewResolution
    );
    if (!this.secondaryResolutionSet || this.secondaryUsesPrimaryGrid)
      return primary;
    const secondary = this.viewResolutionToSourceResolutionDescriptor(
      "SECONDARY",
      viewResolution
    );
    return secondary.pixelResolution < primary.pixelResolution
      ? secondary
      : primary;
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
    const holder = this.getDimensionHolderForDescriptor(descriptor);
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
    const primary = this.getNativeResolutionDescriptor(
      "PRIMARY",
      viewResolution
    );
    if (this.wantsSequenceCoordinates(viewResolution))
      return this.ensureGuidanceResolutionDescriptor(
        this.sequenceDescriptor(primary)
      );
    const secondary = this.secondaryResolutionSet
      ? this.getNativeResolutionDescriptor("SECONDARY", viewResolution)
      : undefined;
    const native =
      secondary &&
      !this.secondaryUsesPrimaryGrid &&
      secondary.pixelResolution < primary.pixelResolution
        ? secondary
        : primary;
    return this.ensureGuidanceResolutionDescriptor(native);
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
    this.secondaryUsesPrimaryGrid = compatibility?.sharedReference === true;
    this.currentLevels = {};
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
      if (this.secondaryResolutionSet.resolutionTuples.length === 0) {
        this.secondaryResolutionSet = undefined;
      } else if (!this.secondaryUsesPrimaryGrid) {
        this.addSourceHiCDataLayers(this.secondaryResolutionSet);
      }
    }
    this.updateProjectionAndViewExtent(previousBaseBp / this.coordinateBaseBp);
    if (baseChanged) this.mapManager.rebuildOverviewMinimap();
    this.updateWheelZoomResolutionModel();
    this.updateCurrentHiCViewState();
    this.rebuildBuiltinVectorLayers();
    this.reloadTiles();
    this.syncLayerVisibilityForCurrentResolution();
    this.mapManager.scheduleWorkspaceLayoutRefresh({ renderTracks: false });
  }

  public hasSecondarySource(): boolean {
    return this.secondaryResolutionSet !== undefined;
  }

  private removeSourceHiCDataLayers(sourceName: MatrixSourceName): void {
    if (sourceName === "SECONDARY") {
      this.cancelOverlayTransition?.();
      this.activeOverlay = undefined;
      this.outgoingOverlay = undefined;
      this.overlayStatus.loading.value = false;
    }
    const layers =
      sourceName === "PRIMARY"
        ? this.layersHolder.primaryHiCDataLayers
        : this.layersHolder.secondaryHiCDataLayers;
    for (const layer of layers) {
      this.mapManager.getMap().removeLayer(layer);
      layer.getSource()?.dispose();
      layer.dispose();
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
    // Run before layer rendering, also during pan/zoom/resize animations. The
    // completed frame must contain the newly visible annotations, not merely
    // schedule their construction for a later idle callback.
    this.vectorViewportListener = () => {
      const viewport = this.getTrackViewport();
      if (!viewport) return;
      const view = this.view;
      const size = this.mapManager.getMap().getSize();
      if (!size) return;
      const built = this.vectorBuilt;
      // Panning inside the padded extent and zooming inside one bucket reuse the built features.
      if (
        built &&
        built.bucket ===
          HiCViewAndLayersManager.resolutionBucket(viewport.resolution) &&
        built.bpResolution ===
          this.getActiveVectorResolutionDescriptor().bpResolution &&
        containsExtent(built.extent, view.calculateExtent(size))
      ) {
        return;
      }
      this.rebuildVectorViewport();
    };
    this.mapManager.getMap().on("precompose", this.vectorViewportListener);
    // After motion stops, rebuild exactly for the final view so label selection settles.
    this.vectorMoveEndListener = () => {
      const viewport = this.getTrackViewport();
      if (!viewport) return;
      const key = [
        ...viewport.extent,
        viewport.resolution,
        this.getActiveVectorResolutionDescriptor().bpResolution,
      ].join(",");
      if (key === this.vectorExactKey) return;
      this.vectorExactKey = key;
      this.rebuildVectorViewport();
    };
    this.mapManager.getMap().on("moveend", this.vectorMoveEndListener);
  }

  /** Quarter-octave zoom bucket: label fitting only needs to change when the zoom changes noticeably. */
  private static resolutionBucket(resolution: number): number {
    return Math.round(Math.log2(resolution) * 4);
  }

  private rebuildVectorViewport(): void {
    for (const layers of [
      this.layersHolder.contigBordersLayers,
      this.layersHolder.scaffoldBordersLayers,
      this.layersHolder.contigTranslocationArrowsLayers,
    ]) {
      for (const layer of layers) {
        layer.set(HiCViewAndLayersManager.VECTOR_SOURCE_DIRTY_FLAG, true);
      }
    }
    this.refreshVisibleBuiltinVectorSources();
    this.recordVectorBuild();
  }

  private recordVectorBuild(): void {
    const viewport = this.getTrackViewport();
    this.vectorBuilt = viewport
      ? {
          extent: viewport.extent,
          bucket: HiCViewAndLayersManager.resolutionBucket(viewport.resolution),
          bpResolution: this.getActiveVectorResolutionDescriptor().bpResolution,
        }
      : undefined;
  }

  private getTrackViewport(): TrackViewport | undefined {
    // The layer manager also runs during construction, before the native map
    // exists. Preserve full generation until a viewport is available.
    const size = this.mapManager.getMap()?.getSize();
    const resolution = this.view.getResolution();
    if (!size || !resolution || !this.view.getCenter()) return undefined;
    const extent = this.view.calculateExtent(size);
    const tracks = this.track2DHolder;
    const margin =
      Math.max(
        100,
        tracks.contigBordersTrack.options.width + 3,
        tracks.scaffoldBordersTrack.options.width + 3,
        tracks.contigTranslocationArrowsTrack.options.width + 3
      ) * resolution;
    // One full viewport on each side, so ordinary panning rarely needs a rebuild.
    const marginX = Math.max(margin, extent[2] - extent[0]);
    const marginY = Math.max(margin, extent[3] - extent[1]);
    return {
      extent: [
        extent[0] - marginX,
        extent[1] - marginY,
        extent[2] + marginX,
        extent[3] + marginY,
      ],
      resolution,
      visibleExtent: extent,
    };
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
    const map = this.mapManager.getMap();
    const view = map.getView();
    let frame: number | undefined;
    const scheduleRulerRender = () => {
      if (frame !== undefined) return;
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        rulerH.render({ map } as never);
        rulerV.render({ map } as never);
      });
    };
    const keys = [
      map.on("moveend", scheduleRulerRender),
      view.on("change:center", scheduleRulerRender),
      view.on("change:resolution", scheduleRulerRender),
      map.once("postrender", scheduleRulerRender),
    ];
    this.rulerRenderCallback = scheduleRulerRender;
    this.disposeRulers = () => {
      unByKey(keys);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      rulerH.dispose();
      rulerV.dispose();
    };
  }

  public scheduleRulerRender(): void {
    this.rulerRenderCallback?.();
  }

  public dispose(): void {
    if (!this.mapManager.getMap()) {
      return;
    }
    try {
      unByKey(this.selectionEventKeys);
      this.selectionEventKeys = [];
      if (this.vectorViewportListener) {
        this.mapManager.getMap().un("precompose", this.vectorViewportListener);
        this.vectorViewportListener = undefined;
      }
      if (this.vectorMoveEndListener) {
        this.mapManager.getMap().un("moveend", this.vectorMoveEndListener);
        this.vectorMoveEndListener = undefined;
      }
      for (const handle of this.pendingFeatureStyleRefreshHandles) {
        window.clearTimeout(handle);
      }
      this.pendingFeatureStyleRefreshHandles.clear();
      this.cancelOverlayTransition?.();
      this.overlayStatus.loading.value = false;
      this.rulerRenderCallback = null;
      this.disposeRulers?.();
      this.disposeRulers = undefined;
      this.mapManager.getMap().getControls().clear();
      const hRuler = document.getElementById("horizontal-ruler-div");
      if (hRuler) {
        hRuler
          .querySelectorAll("canvas:not(.sequence-axis), .hict-ruler-tooltip")
          .forEach((element) => element.remove());
      }
      const vRuler = document.getElementById("vertical-ruler-div");
      if (vRuler) {
        vRuler
          .querySelectorAll("canvas:not(.sequence-axis), .hict-ruler-tooltip")
          .forEach((element) => element.remove());
      }
    } catch (e: unknown) {
      console.log("Error while disposing controls", e);
    }
  }

  public initializeMapInteractions(): void {
    this.entityHighlightLayer = new VectorLayer({
      source: new VectorSource(),
      style: selectionBorderStyle(),
      zIndex: this.layersZIndices.TRACK_2D_LAYER_Z_INDEX * 2 + 2,
    });
    this.mapManager.getMap().addLayer(this.entityHighlightLayer);
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
    this.selectionInteractions.translocationArrowSelectionInteraction
      .getFeatures()
      .on("add", () => {
        this.mapManager.eventManager.onClickInTranslocationMode();
        this.selectionInteractions.translocationArrowSelectionInteraction
          .getFeatures()
          .clear();
      });
    this.selectionInteractions.contigSelectExtent.on("extentchanged", () => {
      if (this.projectingRegion) return;
      const extent = this.selectionInteractions.contigSelectExtent.getExtent();
      if (!extent || extent[2] <= extent[0] || extent[3] <= extent[1]) {
        this.currentViewState.selectionBorders = {};
        return;
      }
      const region = this.regionFromExtent(extent);
      if (region) this.setRegionBounds(region);
    });
    const box = this.selectionInteractions.entityDragBox;
    box.on("boxstart", () => {
      this.clearRegionSelection();
      this.clearEntitySelection();
    });
    box.on("boxend", () => {
      const region = this.regionFromExtent(box.getGeometry().getExtent());
      if (!region) return;
      this.selectEntityRangeByBp(
        Math.max(region.rowStart, region.columnStart),
        Math.min(region.rowEnd, region.columnEnd)
      );
    });
    this.mapManager.map.addInteraction(box);
    this.selectionEventKeys.push(
      this.mapManager.map.on("singleclick", (event) => {
        if (!this.canSelect()) return;
        if (shiftKeyOnly(event)) {
          const d = this.currentViewState.resolutionDesciptor,
            holder = this.mapManager.contigDimensionHolder;
          const bp = [event.coordinate[0], -event.coordinate[1]].map((value) =>
            holder.getFractionalBpOfPx(
              value / d.pixelResolution,
              d.bpResolution
            )
          );
          const region = this.getRegionDomain();
          if (
            bp[0] < region.columnStart ||
            bp[0] >= region.columnEnd ||
            bp[1] < region.rowStart ||
            bp[1] >= region.rowEnd
          )
            return;
          const start = Math.max(...bp),
            end = Math.min(...bp);
          const kind = this.currentViewState.entitySelectionKind;
          const first =
            kind === "contig"
              ? holder.getContigLocusByBp(Math.floor(bp[0])).contigId
              : this.mapManager.scaffoldHolder.getScaffoldLocusByBp(
                  Math.floor(bp[0])
                )?.scaffoldId;
          const last =
            kind === "contig"
              ? holder.getContigLocusByBp(Math.floor(bp[1])).contigId
              : this.mapManager.scaffoldHolder.getScaffoldLocusByBp(
                  Math.floor(bp[1])
                )?.scaffoldId;
          if (first !== undefined && first === last)
            this.selectEntityRangeByBp(Math.floor(end), Math.floor(start) + 1);
          else {
            this.clearRegionSelection();
            this.clearEntitySelection();
          }
        } else if (
          !event.originalEvent.ctrlKey &&
          !event.originalEvent.metaKey &&
          !event.originalEvent.altKey
        ) {
          const extent =
            this.selectionInteractions.contigSelectExtent.getExtent();
          if (
            !extent ||
            event.coordinate[0] < extent[0] ||
            event.coordinate[0] > extent[2] ||
            event.coordinate[1] < extent[1] ||
            event.coordinate[1] > extent[3]
          )
            this.clearRegionSelection();
          this.clearEntitySelection();
        }
      })
    );
    this.mapManager.map.addInteraction(
      this.selectionInteractions.contigSelectExtent
    );
  }

  public getActiveHiCDataLayer(): Layer {
    const bpResolution = this.currentViewState.resolutionDesciptor.bpResolution;
    const layer = this.sequenceCoordinates
      ? this.sequenceLayers.get("PRIMARY")
      : this.layersHolder.primaryBpResolutionToHiCDataLayer.get(bpResolution);
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
    this.refreshNativeGeometry();
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
    if (!visible) {
      if (clearWhenHidden) {
        if (!source.isEmpty()) {
          source.clear(true);
          source.changed();
          layer.changed();
        }
        // Clearing a hidden source invalidates it for the next resolution switch.
        layer.set(HiCViewAndLayersManager.VECTOR_SOURCE_DIRTY_FLAG, true);
      }
      return;
    }
    if (!force && !dirty) {
      return;
    }

    const bpResolution = Number(layer.get("bpResolution"));
    const features = featuresByResolution.get(bpResolution);
    if (!features) {
      throw new Error(
        `Cannot refresh vector track at resolution ${bpResolution}`
      );
    }
    const hideBorders =
      this.currentViewState.hideScopedBorders &&
      this.activeAxisScopes.row.kind !== "all" &&
      this.activeAxisScopes.column.kind !== "all";
    const wanted = hideBorders
      ? features.filter(
          (feature) =>
            !["contigBorders", "scaffoldBorders"].includes(
              String(feature.get("trackType"))
            )
        )
      : features;
    // Preserve unchanged border instances and their spatial index/listeners.
    // Labels are still replaced when their viewport layout changes.
    const desired = new Set(wanted);
    const current = source.getFeatures();
    const removed = current.filter((feature) => !desired.has(feature));
    if (removed.length === current.length && removed.length) source.clear(true);
    else if (removed.length) source.removeFeatures(removed);
    const added = wanted.filter((feature) => !source.hasFeature(feature));
    if (added.length) source.addFeatures(added);
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
      while (
        groupIndex < resolutionFeatureGroups.length &&
        performance.now() < deadline
      ) {
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
    const viewport = this.getTrackViewport();
    let rebuilt = false;
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

    if (
      annotationLayer?.getVisible() &&
      this.isVectorLayerDirty(annotationLayer)
    ) {
      this.track2DHolder.annotationTrack.recalculateBorders(activeResolution);
    }
    if (contigLayer?.getVisible() && this.isVectorLayerDirty(contigLayer)) {
      this.track2DHolder.contigBordersTrack.recalculateBorders(
        activeResolution,
        viewport
      );
      rebuilt = true;
    }
    if (scaffoldLayer?.getVisible() && this.isVectorLayerDirty(scaffoldLayer)) {
      this.track2DHolder.scaffoldBordersTrack.recalculateBorders(
        activeResolution,
        viewport
      );
      rebuilt = true;
    }
    if (
      translocationLayer?.getVisible() &&
      this.isVectorLayerDirty(translocationLayer)
    ) {
      this.track2DHolder.contigTranslocationArrowsTrack.recalculateBorders(
        activeResolution,
        viewport
      );
      rebuilt = true;
    }
    if (rebuilt) this.recordVectorBuild();
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
    this.refreshEntityHighlights();
  }

  public setHideScopedBorders(hidden: boolean): void {
    this.currentViewState.hideScopedBorders = hidden;
    this.markBuiltinVectorLayersDirty();
    this.refreshVisibleBuiltinVectorSources();
  }

  public refreshTranslocationArrows(): void {
    const activeResolution =
      this.getActiveVectorResolutionDescriptor().bpResolution;
    for (const layer of this.layersHolder.contigTranslocationArrowsLayers) {
      layer.set(HiCViewAndLayersManager.VECTOR_SOURCE_DIRTY_FLAG, true);
      layer.setVisible(
        this.currentViewState.activeTool === ActiveTool.TRANSLOCATION &&
          Number(layer.get("bpResolution")) === activeResolution
      );
    }
    // Entering/leaving a tool does not change contig/scaffold coordinates.
    // Refresh arrows without rebuilding every unchanged border and label.
    this.refreshVisibleBuiltinVectorSources();
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

  public getActiveVectorResolutionDescriptor(): LayerResolutionDescriptor {
    return this.getVisibleSourceResolutionDescriptors().primary;
  }

  private syncLayerVisibilityForCurrentResolution(): void {
    this.ensureSequenceLayers();
    const visibleDescriptors = this.getVisibleSourceResolutionDescriptors();
    const activeResolution = visibleDescriptors.primary.bpResolution;
    if (!Number.isFinite(activeResolution)) {
      return;
    }
    const activeVectorResolution =
      this.getActiveVectorResolutionDescriptor().bpResolution;

    for (const layer of this.layersHolder.primaryHiCDataLayers) {
      const layerResolution = Number(layer.get("bpResolution"));
      layer.setVisible(
        layerResolution === activeResolution &&
          !!layer.get("sequenceScale") === this.sequenceCoordinates
      );
    }
    this.currentLevels.PRIMARY = visibleDescriptors.primary.bpResolution;
    this.currentLevels.SECONDARY = visibleDescriptors.secondary?.bpResolution;
    if (
      visibleDescriptors.secondary &&
      this.secondaryUsesPrimaryGrid &&
      !this.sequenceCoordinates
    ) {
      const showOverlay = this.showProjectedOverlay(
        visibleDescriptors.primary,
        visibleDescriptors.secondary
      );
      this.overlayStatus.zoomRequired.value = !showOverlay;
      // Changing from a native/sequence grid can leave its secondary layer
      // visible. Only the projected pair belongs in this coordinate grid;
      // otherwise the hidden-underneath native image also queues every tile.
      for (const layer of this.layersHolder.secondaryHiCDataLayers) {
        layer.setVisible(
          showOverlay &&
            (layer === this.activeOverlay || layer === this.outgoingOverlay)
        );
      }
    } else {
      this.overlayStatus.zoomRequired.value = false;
      this.activeOverlay?.setVisible(false);
      this.outgoingOverlay?.setVisible(false);
      for (const layer of this.layersHolder.secondaryHiCDataLayers) {
        layer.setVisible(
          layer.get("bpResolution") ===
            visibleDescriptors.secondary?.bpResolution &&
            !!layer.get("sequenceScale") === this.sequenceCoordinates &&
            layer !== this.activeOverlay &&
            layer !== this.outgoingOverlay
        );
      }
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

  private ensureSequenceLayers(): void {
    if (!this.sequenceScaleSupported || !this.mapManager.getMap()) return;
    for (const source of ["PRIMARY", "SECONDARY"] as const) {
      if (!this.sequenceCoordinates) continue;
      if (source === "SECONDARY" && !this.secondaryResolutionSet) continue;
      const collection =
        source === "PRIMARY"
          ? this.layersHolder.primaryHiCDataLayers
          : this.layersHolder.secondaryHiCDataLayers;
      const existing = this.sequenceLayers.get(source);
      const native = this.getNativeResolutionDescriptor(source, 0);
      if (
        existing &&
        existing.get("sourceBpResolution") === native.bpResolution &&
        existing.get("pixelResolution") === 1 / this.coordinateBaseBp &&
        collection.includes(existing) &&
        existing.get("sequenceLengthBp") ===
          (this.mapManager.contigDimensionHolder.prefix_sum_bp[
            this.mapManager.contigDimensionHolder.contig_count
          ] ?? 0)
      )
        continue;
      if (existing) {
        this.mapManager.getMap().removeLayer(existing);
        existing.getSource()?.dispose();
        for (const layers of [collection, this.layersHolder.hicDataLayers]) {
          const index = layers.indexOf(existing);
          if (index >= 0) layers.splice(index, 1);
        }
      }
      const holder = this.mapManager.contigDimensionHolder;
      const size =
        (holder.prefix_sum_bp[holder.contig_count] ?? 0) /
        this.coordinateBaseBp;
      const pixel = 1 / this.coordinateBaseBp;
      const grid = new TileGrid({
        extent: [0, -size, size, 0],
        resolutions: [pixel],
        tileSize: [this.tileSize, this.tileSize],
      });
      const tiles = new VersionedXYZContactMapSource(
        this,
        native.imageSizeIndex,
        native.bpResolution,
        source,
        {
          projection: this.pixelProjection,
          tileGrid: grid,
          interpolate: false,
          cacheSize: 0,
        },
        undefined,
        true
      );
      const layer = markRaw(new TileLayer({
        source: tiles,
        visible: false,
        zIndex:
          this.layersZIndices.HIC_MAP_LAYER_Z_INDEX +
          (source === "SECONDARY" ? 1 : 0),
      }));
      layer.set("sourceName", source);
      layer.set("bpResolution", 1);
      layer.set("pixelResolution", pixel);
      layer.set("sourceBpResolution", native.bpResolution);
      layer.set("sequenceScale", true);
      layer.set(
        "sequenceLengthBp",
        holder.prefix_sum_bp[holder.contig_count] ?? 0
      );
      this.sequenceLayers.set(source, layer);
      collection.push(layer);
      this.layersHolder.hicDataLayers.push(layer);
      this.mapManager.getMap().addLayer(layer);
    }
    const map = this.layersHolder.bpResolutionToHiCDataLayer;
    const active = this.sequenceCoordinates
      ? this.sequenceLayers.get("PRIMARY")
      : this.layersHolder.primaryHiCDataLayers.find(
          (layer) =>
            layer.get("bpResolution") === 1 && !layer.get("sequenceScale")
        );
    if (active) map.set(1, active);
    else map.delete(1);
  }

  /** Figures must render a complete current overlay, without waiting on an outgoing cross-fade. */
  public settleProjectedOverlayForFigure(): void {
    this.cancelOverlayTransition?.();
    if (this.outgoingOverlay) this.removeProjectedOverlay(this.outgoingOverlay);
    this.outgoingOverlay = undefined;
    this.activeOverlay?.setOpacity(1);
    this.overlayStatus.loading.value = false;
  }

  private showProjectedOverlay(
    primary: LayerResolutionDescriptor,
    secondary: LayerResolutionDescriptor
  ): boolean {
    const target = this.view.getResolution() ?? primary.pixelResolution;
    const nativeRatio = primary.bpResolution / secondary.bpResolution;
    const maximumFactor = Math.min(65_536, primary.bpResolution);
    const oversampling = Math.min(
      maximumFactor,
      nativeRatio,
      primary.pixelResolution / target
    );
    const sampleFactor =
      nativeRatio > 1 && target <= secondary.pixelResolution
        ? Math.min(
            maximumFactor,
            Number.isInteger(nativeRatio)
              ? nativeRatio
              : Math.ceil(2 * nativeRatio)
          )
        : oversampling > 1
        ? 2 ** Math.floor(Math.log2(oversampling))
        : 1;
    // The server bounds reads to 32 Mi native cells per projected tile. A
    // fine-only overlay can exceed that budget until the user zooms closer.
    const nativeEdge =
      Math.ceil((this.tileSize * (nativeRatio + 1)) / sampleFactor) + 2;
    if (nativeEdge ** 2 > 32 * 1024 * 1024) {
      this.settleProjectedOverlayForFigure();
      return false;
    }
    const key = `${primary.bpResolution}/${secondary.bpResolution}/${sampleFactor}`;
    // A single-resolution outgoing tile grid still enumerates every visible
    // tile when loading is paused. Retire it before a large zoom-out asks
    // OpenLayers to enumerate a whole genome in base-resolution tiles.
    const tooFineForViewport = (layer: Layer | undefined) =>
      !!layer && target > 4 * Number(layer.get("pixelResolution"));
    if (tooFineForViewport(this.outgoingOverlay)) {
      this.settleProjectedOverlayForFigure();
    }
    if (this.activeOverlay && tooFineForViewport(this.activeOverlay)) {
      this.settleProjectedOverlayForFigure();
      this.removeProjectedOverlay(this.activeOverlay);
      this.activeOverlay = undefined;
    }
    if (this.mapManager.isExporting) {
      this.settleProjectedOverlayForFigure();
      if (
        this.activeOverlay?.get("projectionKey") !== key &&
        this.activeOverlay
      ) {
        this.removeProjectedOverlay(this.activeOverlay);
        this.activeOverlay = undefined;
      }
    }
    if (this.activeOverlay?.get("projectionKey") === key) return true;

    const map = this.mapManager.getMap();
    this.cancelOverlayTransition?.();
    if (this.outgoingOverlay && this.activeOverlay) {
      this.removeProjectedOverlay(this.activeOverlay);
    } else if (this.activeOverlay) {
      this.outgoingOverlay = this.activeOverlay;
      const previousSource = this.outgoingOverlay.getSource();
      if (previousSource instanceof VersionedXYZContactMapSource)
        previousSource.pauseLoading();
    }

    const extentSize =
      this.primaryResolutionSet.imageSizes[primary.imageSizeIndex] *
      primary.pixelResolution;
    const pixelResolution = primary.pixelResolution / sampleFactor;
    const grid = new TileGrid({
      extent: [0, -extentSize, extentSize, 0],
      resolutions: [pixelResolution],
      tileSize: this.tileSize,
    });
    const source = new VersionedXYZContactMapSource(
      this,
      secondary.imageSizeIndex,
      secondary.bpResolution,
      "SECONDARY",
      {
        projection: this.pixelProjection,
        tileGrid: grid,
        interpolate: false,
      },
      { bpResolution: primary.bpResolution, sampleFactor }
    );
    const layer = markRaw(
      new TileLayer({
        source,
        zIndex: this.layersZIndices.HIC_MAP_LAYER_Z_INDEX + 1,
        opacity: this.outgoingOverlay ? 0 : 1,
      })
    );
    layer.set("sourceName", "SECONDARY");
    layer.set("bpResolution", secondary.bpResolution);
    layer.set("pixelResolution", pixelResolution);
    layer.set("projectionKey", key);
    layer.setExtent(this.activeAxisScopeExtent);
    this.activeOverlay = layer;
    this.layersHolder.secondaryHiCDataLayers.push(layer);
    this.layersHolder.hicDataLayers.push(layer);
    this.overlayStatus.loading.value = true;
    map.addLayer(layer);
    if (this.mapManager.isExporting) {
      this.overlayStatus.loading.value = false;
      return true;
    }

    const finish = () => {
      this.cancelOverlayTransition?.();
      layer.setOpacity(1);
      if (this.outgoingOverlay)
        this.removeProjectedOverlay(this.outgoingOverlay);
      this.outgoingOverlay = undefined;
      this.overlayStatus.loading.value = false;
    };
    const rendered = map.once("rendercomplete", finish);
    // OpenLayers can drop the last queued tiles from an outgoing source after
    // computing frame readiness. Ask for another frame while the transition
    // is pending so that a dropped queue cannot leave the old imagery visible.
    const renderCheck = window.setInterval(() => map.render(), 100);
    this.cancelOverlayTransition = () => {
      unByKey(rendered);
      window.clearInterval(renderCheck);
      this.cancelOverlayTransition = undefined;
    };
    return true;
  }

  private removeProjectedOverlay(layer: Layer): void {
    this.mapManager.getMap().removeLayer(layer);
    layer.getSource()?.dispose();
    layer.dispose();
    for (const layers of [
      this.layersHolder.hicDataLayers,
      this.layersHolder.secondaryHiCDataLayers,
    ]) {
      const index = layers.indexOf(layer);
      if (index >= 0) layers.splice(index, 1);
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
