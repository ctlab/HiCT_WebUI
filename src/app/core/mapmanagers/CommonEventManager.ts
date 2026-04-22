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

import CommonUtils from "@/CommonUtils";
import {
  ContrastRangeSettings,
  NormalizationSettings,
} from "@/app/ui/components/ComponentCommon";
import { ContigDescriptor } from "../domain/ContigDescriptor";
import { type ScaffoldDescriptor } from "../domain/ScaffoldDescriptor";
import {
  GroupContigsIntoScaffoldRequest,
  UngroupContigsFromScaffoldRequest,
  ReverseSelectionRangeRequest,
  MoveSelectionRangeRequest,
  GetFastaForSelectionRequest,
  SetNormalizationRequest,
  SetContrastRangeRequest,
  SplitContigRequest,
  MoveSelectionToDebrisRequest,
} from "../net/api/request";
import { ContactMapManager } from "./ContactMapManager";
import { useMatrixViewStore } from "@/app/stores/matrixViewStore";
import { ActiveTool } from "./HiCViewAndLayersManager";
import { BorderStyle, NamePlacement } from "@/app/core/tracks/Track2DSymmetric";
import { Coordinate } from "ol/coordinate";
import { toast } from "vue-sonner";

class CommonEventManager {
  public constructor(public readonly mapManager: ContactMapManager) {}

  private applyAssemblyInfo(asmInfo: {
    contigDescriptors: ContigDescriptor[];
    scaffoldDescriptors: ScaffoldDescriptor[];
  }): void {
    this.mapManager.contigDimensionHolder.updateContigData(asmInfo.contigDescriptors);
    this.mapManager.scaffoldHolder.updateScaffoldData(asmInfo.scaffoldDescriptors);
    this.mapManager.refreshOverviewMinimap();
  }

  public reloadTiles() {
    this.mapManager.reloadTiles();
  }

  public reloadVisuals() {
    this.mapManager.reloadVisuals();
  }

  public reloadTracks() {
    this.mapManager.viewAndLayersManager.reloadTracks();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public onTileSizeChanged(tileSize: number): void {
    throw new Error("Not yet implemented");

    // this.mapManager.options.tileSize = tileSize;
    // this.mapManager.viewAndLayersManager.onTileSizeChanged(tileSize);
  }

  public onContigBorderColorChanged(newColor: string): void {
    this.mapManager.viewAndLayersManager.onContigBorderColorChanged(newColor);
  }

  public onScanffoldBorderColorChanged(newColor: string): void {
    this.mapManager.viewAndLayersManager.onScanffoldBorderColorChanged(
      newColor
    );
  }

  public onContigBorderStyleChanged(style: BorderStyle): void {
    this.mapManager.viewAndLayersManager.onContigBorderStyleChanged(style);
  }

  public onScanffoldBorderStyleChanged(style: BorderStyle): void {
    this.mapManager.viewAndLayersManager.onScanffoldBorderStyleChanged(style);
  }

  public onContigBorderWidthChanged(width: number): void {
    this.mapManager.viewAndLayersManager.onContigBorderWidthChanged(width);
  }

  public onScaffoldBorderWidthChanged(width: number): void {
    this.mapManager.viewAndLayersManager.onScaffoldBorderWidthChanged(width);
  }

  public onContigFillColorChanged(fillColor: string): void {
    this.mapManager.viewAndLayersManager.onContigFillColorChanged(fillColor);
  }

  public onScaffoldFillColorChanged(fillColor: string): void {
    this.mapManager.viewAndLayersManager.onScaffoldFillColorChanged(fillColor);
  }

  public onContigLabelSizeChanged(size: number): void {
    this.mapManager.viewAndLayersManager.onContigLabelSizeChanged(size);
  }

  public onScaffoldLabelSizeChanged(size: number): void {
    this.mapManager.viewAndLayersManager.onScaffoldLabelSizeChanged(size);
  }

  private toNamePlacement(style: BorderStyle): NamePlacement {
    switch (style) {
      case BorderStyle.FULL:
        return NamePlacement.CENTER;
      case BorderStyle.BOTTOM:
        return NamePlacement.BOTTOM;
      case BorderStyle.TOP:
        return NamePlacement.TOP;
      case BorderStyle.NONE:
      default:
        return NamePlacement.HIDDEN;
    }
  }

  public onContigNamePlacementChanged(style: BorderStyle): void {
    const placement = this.toNamePlacement(style);
    this.mapManager.viewAndLayersManager.onContigNamePlacementChanged(placement);
  }

  public onScaffoldNamePlacementChanged(style: BorderStyle): void {
    const placement = this.toNamePlacement(style);
    this.mapManager.viewAndLayersManager.onScaffoldNamePlacementChanged(
      placement
    );
  }

  public onContigLabelOffsetMultiplierChanged(multiplier: number): void {
    this.mapManager.viewAndLayersManager.onContigLabelOffsetMultiplierChanged(
      multiplier
    );
  }

  public onScaffoldLabelOffsetMultiplierChanged(multiplier: number): void {
    this.mapManager.viewAndLayersManager.onScaffoldLabelOffsetMultiplierChanged(
      multiplier
    );
  }

  public onContigLabelBoldChanged(enabled: boolean): void {
    this.mapManager.viewAndLayersManager.onContigLabelBoldChanged(enabled);
  }

  public onScaffoldLabelBoldChanged(enabled: boolean): void {
    this.mapManager.viewAndLayersManager.onScaffoldLabelBoldChanged(enabled);
  }

  public onContigLabelOutlineChanged(enabled: boolean): void {
    this.mapManager.viewAndLayersManager.onContigLabelOutlineChanged(enabled);
  }

  public onScaffoldLabelOutlineChanged(enabled: boolean): void {
    this.mapManager.viewAndLayersManager.onScaffoldLabelOutlineChanged(enabled);
  }

  public onContigLabelOutlineWidthChanged(width: number): void {
    this.mapManager.viewAndLayersManager.onContigLabelOutlineWidthChanged(width);
  }

  public onScaffoldLabelOutlineWidthChanged(width: number): void {
    this.mapManager.viewAndLayersManager.onScaffoldLabelOutlineWidthChanged(
      width
    );
  }

  public onContigExportEnabledChanged(enabled: boolean): void {
    this.mapManager.viewAndLayersManager.onContigExportEnabledChanged(enabled);
  }

  public onScaffoldExportEnabledChanged(enabled: boolean): void {
    this.mapManager.viewAndLayersManager.onScaffoldExportEnabledChanged(enabled);
  }

  public onContigNamesExportEnabledChanged(enabled: boolean): void {
    this.mapManager.viewAndLayersManager.onContigNamesExportEnabledChanged(
      enabled
    );
  }

  public onScaffoldNamesExportEnabledChanged(enabled: boolean): void {
    this.mapManager.viewAndLayersManager.onScaffoldNamesExportEnabledChanged(
      enabled
    );
  }

  public onNamePlacementChanged(style: BorderStyle): void {
    const placement = (() => {
      switch (style) {
        case BorderStyle.FULL:
          return NamePlacement.TOP;
        case BorderStyle.BOTTOM:
          return NamePlacement.BOTTOM;
        case BorderStyle.TOP:
          return NamePlacement.TOP;
        case BorderStyle.NONE:
        default:
          return NamePlacement.HIDDEN;
      }
    })();
    this.mapManager.viewAndLayersManager.onNamePlacementChanged(placement);
  }

  // public onNormalizationChanged(
  //   normalizationSettings: NormalizationSettings
  // ): void {
  //   this.mapManager.networkManager.requestManager
  //     .sendRequest(
  //       new SetNormalizationRequest({
  //         normalizationSettings: normalizationSettings,
  //       })
  //     )
  //     .then(() => this.mapManager.viewAndLayersManager.reloadTiles())
  //     .catch(alert);
  // }

  // public onContrastChanged(contrastRangeSettings: ContrastRangeSettings): void {
  //   this.mapManager.networkManager.requestManager
  //     .sendRequest(
  //       new SetContrastRangeRequest({
  //         contrastRangeSettings: contrastRangeSettings,
  //       })
  //     )
  //     .then(() => {
  //       this.reloadTiles();
  //     })
  //     .catch(alert);
  // }

  public onAddScaffoldClicked(): void {
    this.mapManager.viewAndLayersManager.currentViewState.activeTool =
      undefined;
    /*
    const [startBP, endBP] = [
      this.mapManager.viewAndLayersManager.currentViewState.selectionBorders.leftBP?.reduce(
        (a, b) => Math.min(a, b)
      ),
      this.mapManager.viewAndLayersManager.currentViewState.selectionBorders.rightBP?.reduce(
        (a, b) => Math.max(a, b)
      ),
    ];
    */
    const selectedArray =
      this.mapManager.viewAndLayersManager.selectionCollections.selectedContigFeatures
        .getArray()
        .map((cd) => cd.get("contigDescriptor") as ContigDescriptor);
    const prefixSumBp = this.mapManager.contigDimensionHolder.prefix_sum_bp;
    const idToOrder = this.mapManager.contigDimensionHolder.contigIdToOrd;
    const [lcd, rcd] = [
      selectedArray.reduce((accumulator, element) =>
        idToOrder[accumulator.contigId] < idToOrder[element.contigId]
          ? accumulator
          : element
      ),
      selectedArray.reduce((accumulator, element) =>
        idToOrder[accumulator.contigId] > idToOrder[element.contigId]
          ? accumulator
          : element
      ),
    ];
    const [lord, rord] = [lcd, rcd].map((cd) => 1 + idToOrder[cd.contigId]);

    const [startBP, endBP] = [
      lord > 0 ? prefixSumBp[lord - 1] : 0,
      prefixSumBp[rord],
    ];

    if (startBP === undefined || endBP === undefined) {
      console.log(
        "Not grouping contigs into scaffold from selection: left border bp is",
        startBP,
        " right border bp is ",
        endBP
      );
      return;
    }
    this.mapManager.networkManager.requestManager
      .groupContigsIntoScaffold(
        new GroupContigsIntoScaffoldRequest({
          startBP: startBP,
          endBP: endBP,
        })
      )
      .then((asmInfo) => {
        this.applyAssemblyInfo(asmInfo);
        void this.mapManager.linearTrackManager.clearCachesAndRender();
        this.resetSelection();
        this.reloadTracks();
      });
  }

  public onRemoveScaffoldClicked(): void {
    this.mapManager.viewAndLayersManager.currentViewState.activeTool =
      undefined;
    const selectedArray =
      this.mapManager.viewAndLayersManager.selectionCollections.selectedContigFeatures
        .getArray()
        .map((cd) => cd.get("contigDescriptor") as ContigDescriptor);
    const prefixSumBp = this.mapManager.contigDimensionHolder.prefix_sum_bp;
    const idToOrder = this.mapManager.contigDimensionHolder.contigIdToOrd;
    const [lcd, rcd] = [
      selectedArray.reduce((accumulator, element) =>
        idToOrder[accumulator.contigId] < idToOrder[element.contigId]
          ? accumulator
          : element
      ),
      selectedArray.reduce((accumulator, element) =>
        idToOrder[accumulator.contigId] > idToOrder[element.contigId]
          ? accumulator
          : element
      ),
    ];
    const [lord, rord] = [lcd, rcd].map((cd) => 1 + idToOrder[cd.contigId]);

    const [startBP, endBP] = [
      lord > 0 ? prefixSumBp[lord - 1] : 0,
      prefixSumBp[rord],
    ];

    if (startBP === undefined || endBP === undefined) {
      console.log(
        "Not ungrouping contigs from selection: left border bp is",
        startBP,
        " right border bp is ",
        endBP
      );
      return;
    }
    this.mapManager.networkManager.requestManager
      .ungroupContigsFromScaffold(
        new UngroupContigsFromScaffoldRequest({
          startBP: startBP,
          endBP: endBP,
        })
      )
      .then((asmInfo) => {
        this.applyAssemblyInfo(asmInfo);
        void this.mapManager.linearTrackManager.clearCachesAndRender();
        this.resetSelection();
        this.reloadTracks();
      });
  }

  public onMoveToDebrisClicked(): void {
    this.mapManager.viewAndLayersManager.currentViewState.activeTool =
      undefined;
    const selectedArray =
      this.mapManager.viewAndLayersManager.selectionCollections.selectedContigFeatures
        .getArray()
        .map((cd) => cd.get("contigDescriptor") as ContigDescriptor);
    const prefixSumBp = this.mapManager.contigDimensionHolder.prefix_sum_bp;
    const idToOrder = this.mapManager.contigDimensionHolder.contigIdToOrd;
    const [lcd, rcd] = [
      selectedArray.reduce((accumulator, element) =>
        idToOrder[accumulator.contigId] < idToOrder[element.contigId]
          ? accumulator
          : element
      ),
      selectedArray.reduce((accumulator, element) =>
        idToOrder[accumulator.contigId] > idToOrder[element.contigId]
          ? accumulator
          : element
      ),
    ];
    const [lord, rord] = [lcd, rcd].map((cd) => 1 + idToOrder[cd.contigId]);

    const [startBP, endBP] = [
      lord > 0 ? prefixSumBp[lord - 1] : 0,
      prefixSumBp[rord],
    ];

    if (startBP === undefined || endBP === undefined) {
      console.log(
        "Not ungrouping contigs from selection: left border bp is",
        startBP,
        " right border bp is ",
        endBP
      );
      return;
    }
    this.mapManager.networkManager.requestManager
      .moveSelectionToDebris(
        new MoveSelectionToDebrisRequest({
          startBP: startBP,
          endBP: endBP,
        })
      )
      .then((asmInfo) => {
        this.applyAssemblyInfo(asmInfo);
        void this.mapManager.linearTrackManager.clearCachesAndRender();
        this.resetSelection();
        this.reloadTracks();
      });
  }

  public onReverseSelectionClicked(): void {
    this.mapManager.viewAndLayersManager.currentViewState.activeTool =
      undefined;
    const selectedArray =
      this.mapManager.viewAndLayersManager.selectionCollections.selectedContigFeatures
        .getArray()
        .map((cd) => cd.get("contigDescriptor") as ContigDescriptor);
    const prefixSumBp = this.mapManager.contigDimensionHolder.prefix_sum_bp;
    const idToOrder = this.mapManager.contigDimensionHolder.contigIdToOrd;
    const [lcd, rcd] = [
      selectedArray.reduce((accumulator, element) =>
        idToOrder[accumulator.contigId] < idToOrder[element.contigId]
          ? accumulator
          : element
      ),
      selectedArray.reduce((accumulator, element) =>
        idToOrder[accumulator.contigId] > idToOrder[element.contigId]
          ? accumulator
          : element
      ),
    ];
    const [lord, rord] = [lcd, rcd].map((cd) => 1 + idToOrder[cd.contigId]);

    const [startBP, endBP] = [
      lord > 0 ? prefixSumBp[lord - 1] : 0,
      prefixSumBp[rord],
    ];
    if (startBP === undefined || endBP === undefined) {
      console.log(
        "Not reversing selection: left border bp is",
        startBP,
        " right border bp is ",
        endBP
      );
      return;
    }
    this.mapManager.networkManager.requestManager
      .reverseSelectionRange(
        new ReverseSelectionRangeRequest({
          startBP: startBP,
          endBP: endBP,
        })
      )
      .then((asmInfo) => {
        this.applyAssemblyInfo(asmInfo);
        this.resetSelection();
        this.mapManager.reloadVisuals();
      });
  }

  public onMoveSelectionClicked(): void {
    const activeTool =
      this.mapManager.viewAndLayersManager.currentViewState.activeTool;
    if (activeTool === ActiveTool.TRANSLOCATION) {
      toast.success("Translocation mode deactivated");
      this.mapManager.deactivateTranslocation();
    } else {
      toast.message(
        "You've entered translocation mode. Click on arrow at the contig boxes to put selection before or after that arrow. Click again on translocation mode button to leave translocation mode.",
        { duration: 10000 }
      );
      const selectedArray =
        this.mapManager.viewAndLayersManager.selectionCollections.selectedContigFeatures
          .getArray()
          .map((cd) => cd.get("contigDescriptor") as ContigDescriptor);
      const prefixSumBp = this.mapManager.contigDimensionHolder.prefix_sum_bp;
      const idToOrder = this.mapManager.contigDimensionHolder.contigIdToOrd;
      const [lcd, rcd] = [
        selectedArray.reduce((accumulator, element) =>
          idToOrder[accumulator.contigId] < idToOrder[element.contigId]
            ? accumulator
            : element
        ),
        selectedArray.reduce((accumulator, element) =>
          idToOrder[accumulator.contigId] > idToOrder[element.contigId]
            ? accumulator
            : element
        ),
      ];
      const [lord, rord] = [lcd, rcd].map((cd) => 1 + idToOrder[cd.contigId]);

      const [startBP, endBP] = [
        lord > 0 ? prefixSumBp[lord - 1] : 0,
        prefixSumBp[rord],
      ];

      if (startBP === undefined || endBP === undefined) {
        console.log(
          "Not moving (start) selection: left border bp is",
          startBP,
          " right border bp is ",
          endBP
        );
        return;
      }
      this.mapManager.viewAndLayersManager.currentViewState.activeTool =
        ActiveTool.TRANSLOCATION;
      this.mapManager.viewAndLayersManager.selectionInteractions.contigSelectionInteraction.setActive(
        false
      );
      this.mapManager.viewAndLayersManager.selectionInteractions.contigSelectExtent.setActive(
        false
      );
      this.mapManager.viewAndLayersManager.deferredInitializationInteractions.scissorsGuideInteraction?.setActive(
        false
      );
      this.mapManager.viewAndLayersManager.selectionInteractions.translocationArrowSelectionInteraction.setActive(
        true
      );
      this.mapManager.viewAndLayersManager.selectionInteractions.translocationArrowHoverInteraction.setActive(
        true
      );
      this.mapManager.viewAndLayersManager.selectionInteractions.translocationArrowSelectionInteraction.set(
        "startBP",
        startBP
      );
      this.mapManager.viewAndLayersManager.selectionInteractions.translocationArrowSelectionInteraction.set(
        "endBP",
        endBP
      );
    }

    this.mapManager.viewAndLayersManager.reloadTracks();
  }

  public onSplitContigClicked(): void {
    console.log("onSplitContigClicked");
    const activeTool =
      this.mapManager.viewAndLayersManager.currentViewState.activeTool;
    if (activeTool === ActiveTool.SCISSORS) {
      this.mapManager.deactivateScissors();
    } else {
      this.mapManager.viewAndLayersManager.currentViewState.activeTool =
        ActiveTool.SCISSORS;
      console.log(
        "Scissors interaction: ",
        this.mapManager.viewAndLayersManager.deferredInitializationInteractions
          .scissorsGuideInteraction
      );
      this.mapManager.viewAndLayersManager.deferredInitializationInteractions.scissorsGuideInteraction?.setActive(
        true
      );
      this.mapManager.viewAndLayersManager.selectionInteractions.contigSelectionInteraction.setActive(
        false
      );
      this.mapManager.viewAndLayersManager.selectionInteractions.contigSelectExtent.setActive(
        false
      );
      this.mapManager.viewAndLayersManager.selectionInteractions.translocationArrowSelectionInteraction.setActive(
        false
      );
      this.mapManager.viewAndLayersManager.selectionInteractions.translocationArrowHoverInteraction.setActive(
        false
      );
      this.mapManager.viewAndLayersManager.selectionInteractions.translocationArrowSelectionInteraction.unset(
        "startBP"
      );
      this.mapManager.viewAndLayersManager.selectionInteractions.translocationArrowSelectionInteraction.unset(
        "endBP"
      );
    }
  }

  public onClickInTranslocationMode(): void {
    const interaction =
      this.mapManager.viewAndLayersManager.selectionInteractions
        .translocationArrowSelectionInteraction;

    const prefixSumBp = this.mapManager.contigDimensionHolder.prefix_sum_bp;
    const idToOrder = this.mapManager.contigDimensionHolder.contigIdToOrd;

    const features = interaction.getFeatures();

    const clickedArrow = features.getArray()[0];

    if (!clickedArrow) {
      throw new Error(
        "Click event was sent but no translocation arrow is present?"
      );
    }

    const [leftContigDescriptor, rightContigDescriptor] = [
      "leftContigDescriptor",
      "rightContigDescriptor",
    ].map((key) => clickedArrow.get(key) as ContigDescriptor | undefined);

    let targetOrder: number;
    let targetBP: number;
    if (leftContigDescriptor && rightContigDescriptor) {
      targetOrder = idToOrder[leftContigDescriptor.contigId];
      targetBP = prefixSumBp[1 + targetOrder];
    } else if (rightContigDescriptor) {
      targetOrder = 0;
      targetBP = -1;
    } else {
      targetOrder = this.mapManager.contigDimensionHolder.contig_count;
      targetBP = prefixSumBp[prefixSumBp.length - 1] + 1;
    }

    console.log(
      "Click in Translocation mode:",
      "leftContigDescriptor:",
      leftContigDescriptor,
      "left contig order: ",
      idToOrder[leftContigDescriptor?.contigId ?? 0],
      "left contig start bp: ",
      prefixSumBp[idToOrder[leftContigDescriptor?.contigId ?? 0]],
      "rightContigDescirptor:",
      rightContigDescriptor,
      "right contig order: ",
      idToOrder[rightContigDescriptor?.contigId ?? 0],
      "right contig start bp: ",
      prefixSumBp[idToOrder[rightContigDescriptor?.contigId ?? 0]],
      "targetOrder:",
      targetOrder,
      "targetBP:",
      targetBP
    );

    const [startBP, endBP] = ["startBP", "endBP"].map(
      (key) => interaction.get(key) as number
    );

    this.mapManager.networkManager.requestManager
      .moveSelectionRange(
        new MoveSelectionRangeRequest({
          startBP: startBP,
          endBP: endBP,
          targetStartBP: targetBP,
        })
      )
      .then((asmInfo) => {
        this.applyAssemblyInfo(asmInfo);
      })
      .finally(() => {
        this.onMoveSelectionClicked();
        this.resetSelection();
        this.mapManager.reloadVisuals();
      });
  }

  public onClickInScissorsMode(
    coordinate_px: Coordinate,
    bp_resolution: number
  ): void {
    console.log(
      "Click in Scissors mode:",
      "coordinate_px:",
      coordinate_px,
      "bp_resolution:",
      bp_resolution
    );

    this.mapManager.networkManager.requestManager
      .splitContigAtPx(
        new SplitContigRequest({
          splitPx: coordinate_px[0],
          bpResolution: bp_resolution,
        })
      )
      .then((asmInfo) => {
        this.applyAssemblyInfo(asmInfo);
      })
      .finally(() => {
        this.mapManager.deactivateScissors();
        this.mapManager.eventManager.resetSelection();
        this.mapManager.reloadVisuals();
      });
  }

  public onExportFASTAForSelectionClicked(): void {
    const matrixViewStore = useMatrixViewStore();
    this.mapManager.deactivateTranslocation();
    const [fromPx, toPx] = [
      this.mapManager.viewAndLayersManager.currentViewState.selectionBorders
        .leftPx,
      this.mapManager.viewAndLayersManager.currentViewState.selectionBorders
        .rightPx,
    ];
    if (!fromPx || !toPx) {
      console.log(
        "Not exporting FASTA because left selection border is ",
        fromPx,
        " and right selection border is ",
        toPx
      );
    }
    const bpResolution =
      this.mapManager.viewAndLayersManager.currentViewState.resolutionDesciptor
        .bpResolution;
    const [fromBpX, fromBpY, toBpX, toBpY] = [fromPx, toPx]
      .flatMap((coords) => coords ?? [])
      .map((px) =>
        this.mapManager.contigDimensionHolder.getStartBpOfPx(px, bpResolution)
      );
    console.log("Bps: ", fromBpX, fromBpY, toBpX, toBpY, " pxs ", fromPx, toPx);

    this.mapManager.networkManager.requestManager
      .getFASTAForSelection(
        new GetFastaForSelectionRequest({
          fromBpX: fromBpX,
          fromBpY: fromBpY,
          toBpX: toBpX,
          toBpY: toBpY,
          horizontalSource: matrixViewStore.horizontalFastaSource,
          verticalSource: matrixViewStore.verticalFastaSource,
        })
      )
      .then((data) => {
        // eslint-disable-next-line
        const blob = new Blob([data as BlobPart], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = window.URL.createObjectURL(blob);
        link.download = `selection_(${fromBpX}bp-${toBpX}bp).(${fromBpY}bp-${toBpY}bp).fasta`;
        link.click();
      });
    return;
  }

  public resetSelection(): void {
    const extentInteraction =
      this.mapManager.viewAndLayersManager.selectionInteractions
        .contigSelectExtent;
    // @ts-expect-error "Extent should be reset"
    extentInteraction.setExtent(undefined);
    extentInteraction.changed();
  }
}

export { CommonEventManager };
