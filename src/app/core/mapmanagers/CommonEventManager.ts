import { askForConfirmation } from "@/app/ui/confirmAction";
import { offerFastaLink } from "@/app/ui/fastaExportPrerequisite";
import { reportFailure } from "@/app/ui/reportFailure";
import { prepareFileSave } from "../export/FileSave";
import { writeCoordinateFile } from "../export/CoordinateFileExport";
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
import { showTranslocationStatus } from "./TranslocationStatusToast";

class CommonEventManager {
  public constructor(public readonly mapManager: ContactMapManager) {}

  public applyAssemblyInfo(asmInfo: {
    contigDescriptors: ContigDescriptor[];
    scaffoldDescriptors: ScaffoldDescriptor[];
  }): void {
    this.mapManager.viewAndLayersManager.clearSelections();
    this.mapManager.contigDimensionHolder.updateContigData(
      asmInfo.contigDescriptors
    );
    this.mapManager.scaffoldHolder.updateScaffoldData(
      asmInfo.scaffoldDescriptors
    );
    this.mapManager.viewAndLayersManager.reapplyAxisScopes();
    this.mapManager.refreshOverviewMinimap();
  }

  private getSelectedContigBpRange(): {
    startBP: number;
    endBP: number;
  } | null {
    if (this.mapManager.networkManager.requestManager.sequenceViewReadOnly) {
      toast("Return to the contact map before editing the assembly.");
      return null;
    }
    const entityRange =
      this.mapManager.viewAndLayersManager.getSelectedEntityRange();
    if (entityRange) return entityRange;
    const selectedArray =
      this.mapManager.viewAndLayersManager.selectionCollections.selectedContigFeatures
        .getArray()
        .map((cd) => cd.get("contigDescriptor") as ContigDescriptor);
    if (selectedArray.length === 0) {
      toast.error("Select a contig or scaffold first");
      return null;
    }

    const prefixSumBp = this.mapManager.contigDimensionHolder.prefix_sum_bp;
    const idToOrder = this.mapManager.contigDimensionHolder.contigIdToOrd;
    const lcd = selectedArray.reduce((accumulator, element) =>
      idToOrder[accumulator.contigId] < idToOrder[element.contigId]
        ? accumulator
        : element
    );
    const rcd = selectedArray.reduce((accumulator, element) =>
      idToOrder[accumulator.contigId] > idToOrder[element.contigId]
        ? accumulator
        : element
    );
    const [lord, rord] = [lcd, rcd].map((cd) => 1 + idToOrder[cd.contigId]);
    const startBP = lord > 0 ? prefixSumBp[lord - 1] : 0;
    const endBP = prefixSumBp[rord];

    if (typeof startBP !== "number" || typeof endBP !== "number") {
      toast.error(
        "Selected contig range is no longer available in the current assembly."
      );
      return null;
    }
    return { startBP, endBP };
  }

  public reloadTiles() {
    this.mapManager.reloadTiles();
  }

  public reloadVisuals() {
    this.mapManager.reloadVisuals();
  }

  public reloadTracks() {
    this.mapManager.viewAndLayersManager.reloadTracks({
      renderLinearTracks: false,
    });
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
      case BorderStyle.LEFT:
        return NamePlacement.LEFT;
      case BorderStyle.RIGHT:
        return NamePlacement.RIGHT;
      case BorderStyle.NONE:
      default:
        return NamePlacement.HIDDEN;
    }
  }

  public onContigNamePlacementChanged(style: BorderStyle): void {
    const placement = this.toNamePlacement(style);
    this.mapManager.viewAndLayersManager.onContigNamePlacementChanged(
      placement
    );
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
    this.mapManager.viewAndLayersManager.onContigLabelOutlineWidthChanged(
      width
    );
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
    this.mapManager.viewAndLayersManager.onScaffoldExportEnabledChanged(
      enabled
    );
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
    const range = this.getSelectedContigBpRange();
    if (!range) return;
    const { startBP, endBP } = range;
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
      })
      .catch((error) =>
        reportFailure("Group selection into a scaffold", error)
      );
  }

  public onRemoveScaffoldClicked(): void {
    this.mapManager.viewAndLayersManager.currentViewState.activeTool =
      undefined;
    const range = this.getSelectedContigBpRange();
    if (!range) return;
    const { startBP, endBP } = range;
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
      })
      .catch((error) => reportFailure("Ungroup selection", error));
  }

  public async onUnscaffoldAllClicked(): Promise<void> {
    const assembly =
      await this.mapManager.networkManager.requestManager.unscaffoldAll();
    this.applyAssemblyInfo(assembly);
    this.resetSelection();
    await this.mapManager.reloadVisuals();
  }

  public async onMoveToDebrisClicked(): Promise<void> {
    this.mapManager.viewAndLayersManager.currentViewState.activeTool =
      undefined;
    const range = this.getSelectedContigBpRange();
    if (!range) {
      return;
    }
    if (!(await this.confirmDebris(range))) return;
    this.mapManager.networkManager.requestManager
      .moveSelectionToDebris(
        new MoveSelectionToDebrisRequest({
          startBP: range.startBP,
          endBP: range.endBP,
        })
      )
      .then((asmInfo) => {
        this.applyAssemblyInfo(asmInfo);
        void this.mapManager.linearTrackManager.clearCachesAndRender();
        this.resetSelection();
        this.reloadTracks();
      })
      .catch((error) => reportFailure("Move to unplaced (debris)", error));
  }

  public async confirmDebris(range: { startBP: number; endBP: number }): Promise<boolean> {
    const manager = this.mapManager;
    const api = manager.networkManager.requestManager;
    const history = api.history.applied;
    const scaffolds = manager.scaffoldHolder.scaffoldBordersSorted
      .filter(([bounds]) => bounds.startBP < range.endBP && bounds.endBP > range.startBP)
      .map(([, id]) => manager.scaffoldHolder.getScaffoldById(id).scaffoldName);
    if (scaffolds.length < 2) return true;
    const details = scaffolds.slice(0, 5);
    if (scaffolds.length > details.length) details.push(`and ${scaffolds.length - details.length} more`);
    const result = await askForConfirmation({
      title: `Move ${scaffolds.length} scaffolds to unplaced?`,
      body: "These scaffolds will be removed from the assembly and from AGP and FASTA exports. Undo restores them.",
      tone: "danger",
      icon: "bi-box-arrow-down",
      confirmLabel: `Move ${scaffolds.length} scaffolds`,
      details,
    });
    return result === "confirm" && !manager.isDisposed && history === api.history.applied;
  }

  public onReverseSelectionClicked(): void {
    this.mapManager.viewAndLayersManager.currentViewState.activeTool =
      undefined;
    const range = this.getSelectedContigBpRange();
    if (!range) {
      return;
    }
    this.mapManager.networkManager.requestManager
      .reverseSelectionRange(
        new ReverseSelectionRangeRequest({
          startBP: range.startBP,
          endBP: range.endBP,
        })
      )
      .then((asmInfo) => {
        this.applyAssemblyInfo(asmInfo);
        this.resetSelection();
        this.mapManager.reloadVisuals();
      })
      .catch((error) => reportFailure("Reverse selection", error));
  }

  public onMoveSelectionClicked(): void {
    const activeTool =
      this.mapManager.viewAndLayersManager.currentViewState.activeTool;
    if (activeTool === ActiveTool.TRANSLOCATION) {
      showTranslocationStatus(false);
      this.mapManager.deactivateTranslocation();
    } else {
      const range = this.getSelectedContigBpRange();
      if (!range) {
        return;
      }
      showTranslocationStatus(true);
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
        range.startBP
      );
      this.mapManager.viewAndLayersManager.selectionInteractions.translocationArrowSelectionInteraction.set(
        "endBP",
        range.endBP
      );
    }

    this.mapManager.viewAndLayersManager.refreshTranslocationArrows();
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
      .catch((error) => reportFailure("Move selection", error))
      .finally(() => {
        this.onMoveSelectionClicked();
        this.resetSelection();
        this.mapManager.reloadVisuals();
      });
  }

  /** Snapshot both the oriented cut locus and its assembly revision for delayed menu actions. */
  public getExactCutTarget(assemblyBp: number):
    | {
        assemblyBp: number;
        contigId: number;
        offsetBp: number;
        session: string;
        revision: number;
      }
    | undefined {
    const api = this.mapManager.networkManager.requestManager;
    const applied = api.history.applied;
    const holder = this.mapManager.contigDimensionHolder;
    if (
      api.sourceCapabilities.PRIMARY?.sequenceScaleTiles !== true ||
      api.sequenceViewReadOnly ||
      api.history.busy ||
      !applied ||
      this.mapManager.isDisposed ||
      this.mapManager.isExporting ||
      !Number.isSafeInteger(assemblyBp) ||
      assemblyBp <= 0 ||
      assemblyBp >= holder.prefix_sum_bp[holder.contig_count]
    )
      return;
    const locus = holder.getContigLocusByBp(assemblyBp);
    const order = holder.contigIdToOrd[locus.contigId];
    const descriptor = holder.contigDescriptors[order];
    const offsetBp = assemblyBp - holder.prefix_sum_bp[order];
    if (!descriptor || offsetBp <= 0 || offsetBp >= descriptor.contigLengthBp)
      return;
    return {
      assemblyBp,
      contigId: locus.contigId,
      offsetBp,
      session: applied.session,
      revision: applied.revision,
    };
  }

  public async cutAtExactTarget(
    target: NonNullable<ReturnType<CommonEventManager["getExactCutTarget"]>>
  ): Promise<boolean> {
    const current = this.getExactCutTarget(target.assemblyBp);
    if (
      !current ||
      current.session !== target.session ||
      current.revision !== target.revision ||
      current.contigId !== target.contigId ||
      current.offsetBp !== target.offsetBp
    ) {
      toast("The assembly or editing state changed. Choose the cut again.");
      return false;
    }
    let response;
    try {
      response =
        await this.mapManager.networkManager.requestManager.splitContigAtBp(
          target.contigId,
          target.offsetBp
        );
    } catch {
      // RequestManager reports rejected/conflicting requests. Keep the current assembly visible.
      return false;
    }
    try {
      if (this.mapManager.isDisposed) return false;
      // A sequence-preserving cut changes native reference-bin widths, not BP
      // positions. Preserve the locus currently in view while rebuilding them.
      const layers = this.mapManager.viewAndLayersManager;
      const position = layers.captureViewPosition();
      this.applyAssemblyInfo(response);
      this.resetSelection();
      this.mapManager.reloadVisuals();
      layers.restoreViewPosition(position);
      return true;
    } catch (failure) {
      reportFailure("Refresh the cut assembly", failure);
      return false;
    }
  }

  public onClickInScissorsMode(
    coordinate_px: Coordinate,
    bp_resolution: number
  ): void {
    const api = this.mapManager.networkManager.requestManager;
    let operation;
    if (api.sourceCapabilities.PRIMARY?.sequenceScaleTiles === true) {
      const holder = this.mapManager.contigDimensionHolder;
      const bp = Math.round(
        holder.getFractionalBpOfPx(coordinate_px[0], bp_resolution)
      );
      const target = this.getExactCutTarget(bp);
      if (!target) {
        toast("Choose a base boundary inside an editable contig.");
        return;
      }
      void this.cutAtExactTarget(target);
      return;
    } else {
      operation = api.splitContigAtPx(
        new SplitContigRequest({
          splitPx: coordinate_px[0],
          bpResolution: bp_resolution,
        })
      );
    }
    void operation
      .then((response) => {
        this.applyAssemblyInfo(response);
        this.resetSelection();
        this.mapManager.reloadVisuals();
      })
      .catch(() => {
        /* RequestManager reports the recoverable error. Keep the cut tool available. */
      });
  }

  public async onExportFASTAForSelectionClicked(): Promise<void> {
    if (!this.mapManager.networkManager.requestManager.hasLinkedFasta) {
      await offerFastaLink(this.mapManager, () => void this.onExportFASTAForSelectionClicked());
      return;
    }
    const matrixViewStore = useMatrixViewStore();
    this.mapManager.deactivateTranslocation();
    const [fromBp, toBp] = [
      this.mapManager.viewAndLayersManager.currentViewState.selectionBorders
        .leftBP,
      this.mapManager.viewAndLayersManager.currentViewState.selectionBorders
        .rightBP,
    ];
    if (!fromBp || !toBp) {
      const message =
        "Select a region with Ctrl/Cmd-drag or Selection → Select region by coordinates.";
      console.warn(message, {
        fromBp,
        toBp,
      });
      toast.error(message);
      return;
    }
    const [fromBpX, fromBpY, toBpX, toBpY] = [...fromBp, ...toBp];
    if (
      !Number.isFinite(fromBpX) ||
      !Number.isFinite(fromBpY) ||
      !Number.isFinite(toBpX) ||
      !Number.isFinite(toBpY)
    ) {
      const message =
        "Cannot export FASTA for selection because selection coordinates are invalid.";
      console.warn(message, {
        fromBpX,
        fromBpY,
        toBpX,
        toBpY,
      });
      toast.error(message);
      return;
    }

    const api = this.mapManager.networkManager.requestManager;
    const version = api.history.applied ? { ...api.history.applied } : null;
    const request = new GetFastaForSelectionRequest({
      fromBpX: fromBpX,
      fromBpY: fromBpY,
      toBpX: toBpX,
      toBpY: toBpY,
      horizontalSource: matrixViewStore.horizontalFastaSource,
      verticalSource: matrixViewStore.verticalFastaSource,
    });
    try {
      const destination = await prepareFileSave(
        `selection_${fromBpX}-${toBpX}_${fromBpY}-${toBpY}.fasta`,
        "fasta"
      );
      if (!destination) return;
      await writeCoordinateFile(
        destination,
        api,
        request,
        version,
        "Selection FASTA"
      );
    } catch (error) {
      reportFailure("Export FASTA for selection", error);
    }
  }

  public resetSelection(): void {
    this.mapManager.viewAndLayersManager.clearSelections();
  }
}

export { CommonEventManager };
