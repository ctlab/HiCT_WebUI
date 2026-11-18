import { Feature } from "ol";
import { LineString } from "ol/geom";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import { Stroke, Style } from "ol/style";
import { markRaw, ref, watch } from "vue";
import { sequenceLetterMinimumPixels } from "../visualization/sequenceLetterMetrics";
import type { ContactMapManager } from "./ContactMapManager";
import type { AlignmentDetailSegment } from "../net/api/RequestManager";
import { SequenceAnalysisRequest } from "../net/api/SequenceAnalysisRequest";

import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import { alignmentMarker } from "../visualization/alignmentMarkers";
import { alignmentRunGeometry } from "../visualization/alignmentRunGeometry";

/** Bounded alignment geometry uses the same fractional assembly mapping as the FASTA axes. */
export class AlignmentDetailLayer {
  public readonly state = markRaw({ message: ref(""), visible: ref(false) });
  private readonly settings = useUiSettingsStore();
  private readonly source = new VectorSource();
  private readonly layer = new VectorLayer({ source: this.source, zIndex: 90 });
  private readonly listeners: EventsKey[];
  private readonly unsubscribers: (() => void)[];
  private timer?: number;
  private controller?: AbortController;
  private jobId?: string;
  private requestKey = "";
  private generation = 0;
  private pending?: Promise<void>;

  constructor(private readonly manager: ContactMapManager) {
    manager.getMap().addLayer(this.layer);
    const schedule = () => {
      window.clearTimeout(this.timer);
      this.cancel();
      this.timer = window.setTimeout(() => void this.refresh(), 120);
    };
    this.listeners = [
      manager.getMap().on("moveend", schedule),
      manager.getView().on("change:center", schedule),
      manager.getView().on("change:resolution", schedule),
    ];
    const invalidate = () => {
      this.requestKey = "";
      this.source.clear();
      schedule();
    };
    this.unsubscribers = [
      watch(
        () => this.settings.automaticAlignmentEnabled,
        (enabled) => {
          window.clearTimeout(this.timer);
          this.clear();
          if (enabled) schedule();
        },
        { flush: "sync" }
      ),
      manager.networkManager.requestManager.onSequenceChange(invalidate),
      manager.contigDimensionHolder.onChange(invalidate),
      manager.registerSequenceRenderer(() => this.refresh()),
    ];
  }

  private async refresh(): Promise<void> {
    const manager = this.manager;
    if (manager.isDisposed) return;
    const api = manager.networkManager.requestManager;
    const descriptor =
      manager.viewAndLayersManager.getActiveVectorResolutionDescriptor();
    const resolution = manager.getView().getResolution();
    const bpPerPixel = resolution
      ? (resolution * descriptor.bpResolution) / descriptor.pixelResolution
      : Infinity;
    if (
      !this.settings.automaticAlignmentEnabled ||
      !api.hasLinkedFasta ||
      api.sequenceViewReadOnly ||
      1 / bpPerPixel <
        sequenceLetterMinimumPixels() * (this.source.isEmpty() ? 1 : 0.9)
    ) {
      this.clear();
      return;
    }
    const map = manager.getMap();
    const extent = manager.getView().calculateExtent(map.getSize());
    const bounds = manager.viewAndLayersManager.getActiveMapPixelBounds(
      descriptor.bpResolution
    );
    const holder = manager.contigDimensionHolder;
    const bp = (coordinate: number) =>
      holder.getFractionalBpOfPx(coordinate, descriptor.bpResolution);
    const rowStart = Math.max(
      0,
      Math.floor(
        bp(Math.max(bounds.rowStartPx, -extent[3] / descriptor.pixelResolution))
      )
    );
    const rowEnd = Math.ceil(
      bp(Math.min(bounds.rowEndPx, -extent[1] / descriptor.pixelResolution))
    );
    const columnStart = Math.max(
      0,
      Math.floor(
        bp(Math.max(bounds.colStartPx, extent[0] / descriptor.pixelResolution))
      )
    );
    const columnEnd = Math.ceil(
      bp(Math.min(bounds.colEndPx, extent[2] / descriptor.pixelResolution))
    );
    const windows = { rowStart, rowEnd, columnStart, columnEnd };
    if (
      !Object.values(windows).every(Number.isSafeInteger) ||
      rowEnd <= rowStart ||
      columnEnd <= columnStart ||
      rowEnd - rowStart > 4096 ||
      columnEnd - columnStart > 4096
    ) {
      this.clear();
      return;
    }
    const key = JSON.stringify([
      api.history.applied,
      api.sequenceRevision,
      windows,
      descriptor.bpResolution,
      descriptor.pixelResolution,
      descriptor.displayGrid,
    ]);
    if (key === this.requestKey && !this.controller?.signal.aborted)
      return this.pending;
    this.cancel();
    this.requestKey = key;
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.source.clear();
    this.state.visible.value = true;
    this.state.message.value = "Aligning visible FASTA regions…";
    const task = async () => {
      try {
        // Let submission return its job ID even if navigation cancels meanwhile.
        // Aborting the HTTP response loses that ID and can orphan queued work.
        let response = await api.queryAlignmentDetail(windows);
        if (
          generation !== this.generation ||
          controller.signal.aborted ||
          manager.isDisposed
        ) {
          if (response.status === "submitted" || response.status === "running")
            this.stopJob(response.jobId);
          return;
        }
        this.jobId = response.jobId;
        while (
          response.status === "submitted" ||
          response.status === "running"
        ) {
          await new Promise<void>((resolve, reject) => {
            const abort = () => {
              window.clearTimeout(timer);
              reject(new DOMException("Aborted", "AbortError"));
            };
            const timer = window.setTimeout(() => {
              controller.signal.removeEventListener("abort", abort);
              resolve();
            }, 100);
            controller.signal.addEventListener("abort", abort, { once: true });
            if (controller.signal.aborted) abort();
          });
          response = await api.queryAlignmentDetail(
            { jobId: response.jobId },
            controller.signal
          );
        }
        if (
          generation !== this.generation ||
          controller.signal.aborted ||
          manager.isDisposed
        )
          return;
        this.jobId = undefined;
        if (response.status !== "finished" || !response.result) {
          this.state.message.value =
            response.error ?? "Alignment detail is unavailable";
          return;
        }
        const features = this.project(response.result.segments);
        this.source.addFeatures(features);
        this.state.message.value =
          response.result.alignmentCount === 0
            ? "No alignment reported for these visible regions. Short windows may yield no hit."
            : "";
      } catch (error) {
        if (!controller.signal.aborted && generation === this.generation) {
          this.state.message.value =
            error instanceof Error
              ? error.message
              : "Alignment detail is unavailable";
        }
      }
    };
    this.pending = task();
    return this.pending;
  }

  private project(segments: AlignmentDetailSegment[]): Feature[] {
    const holder = this.manager.contigDimensionHolder;
    const descriptor =
      this.manager.viewAndLayersManager.getActiveVectorResolutionDescriptor();
    const features: Feature[] = [];
    let vertices = 0;
    const point = (column: number, row: number) => [
      holder.getFractionalPxOfBp(column, descriptor.bpResolution) *
        descriptor.pixelResolution,
      -holder.getFractionalPxOfBp(row, descriptor.bpResolution) *
        descriptor.pixelResolution,
    ];
    for (const segment of segments) {
      const { operation, reverse } = segment;
      const marker = alignmentMarker(operation, reverse);
      const coordinates = alignmentRunGeometry(segment, point);
      vertices += coordinates.length;
      if (features.length >= 4096 || vertices > 65536)
        throw new Error(
          "Too many alignment runs to display. Zoom into a smaller region."
        );
      const feature = new Feature(new LineString(coordinates));
      feature.set("alignmentSegment", segment);
      const lineDash =
        operation === "AMBIGUOUS"
          ? [3, 3]
          : operation === "INSERTION" || operation === "DELETION"
          ? [5, 3]
          : undefined;
      feature.setStyle([
        new Style({
          stroke: new Stroke({
            color: "rgba(255,255,255,0.9)",
            width: 5,
            lineDash,
            lineCap: "butt",
            lineJoin: "round",
          }),
        }),
        new Style({
          stroke: new Stroke({
            color: marker.color,
            width: 3,
            lineDash,
            lineCap: "butt",
            lineJoin: "round",
          }),
        }),
      ]);
      features.push(feature);
    }
    return features;
  }

  private cancel(): void {
    ++this.generation;
    this.controller?.abort();
    this.controller = undefined;
    this.requestKey = "";
    if (this.jobId) {
      this.stopJob(this.jobId);
      this.jobId = undefined;
    }
  }

  private stopJob(id: string): void {
    void this.manager.networkManager.requestManager
      .sendRequest(new SequenceAnalysisRequest(`/sequence/jobs/${id}/stop`))
      .catch(() => undefined);
  }

  private clear(): void {
    this.cancel();
    this.requestKey = "";
    this.source.clear();
    this.state.message.value = "";
    this.state.visible.value = false;
  }

  public dispose(): void {
    window.clearTimeout(this.timer);
    this.cancel();
    unByKey(this.listeners);
    this.unsubscribers.forEach((off) => off());
    this.manager.getMap().removeLayer(this.layer);
    this.source.dispose();
    this.layer.dispose();
  }
}
