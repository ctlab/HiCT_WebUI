import { Feature } from "ol";
import { LineString, Point } from "ol/geom";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import { Icon, Stroke, Style } from "ol/style";
import { markRaw, ref, watch } from "vue";
import { sequenceLetterMinimumPixels } from "../visualization/sequenceLetterMetrics";
import type { ContactMapManager } from "./ContactMapManager";
import type { AlignmentDetailSegment } from "../net/api/RequestManager";
import { SequenceAnalysisRequest } from "../net/api/SequenceAnalysisRequest";

import { useUiSettingsStore } from "@/app/stores/uiSettingsStore";
import {
  alignmentMarker,
  alignmentMarkerSvg,
} from "../visualization/alignmentMarkers";

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
      this.controller?.abort();
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
        let response = await api.queryAlignmentDetail(
          windows,
          controller.signal
        );
        if (generation !== this.generation || controller.signal.aborted) return;
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
    const point = (column: number, row: number) => [
      holder.getFractionalPxOfBp(column, descriptor.bpResolution) *
        descriptor.pixelResolution,
      -holder.getFractionalPxOfBp(row, descriptor.bpResolution) *
        descriptor.pixelResolution,
    ];
    for (const segment of segments) {
      const { rowStart, rowEnd, columnStart, columnEnd, operation, reverse } =
        segment;
      const marker = alignmentMarker(operation, reverse);
      const style = new Style({
        stroke: new Stroke({ color: marker.color, width: 3 }),
        image: new Icon({
          src: `data:image/svg+xml,${encodeURIComponent(
            alignmentMarkerSvg(marker)
          )}`,
          scale: 0.75,
        }),
      });
      if (operation === "INSERTION" || operation === "DELETION") {
        const geometry = new LineString([
          point(columnStart, rowStart),
          point(columnEnd, rowEnd),
        ]);
        const feature = new Feature(geometry);
        feature.setStyle(style);
        features.push(feature);
      } else {
        const bases = rowEnd - rowStart;
        for (let i = 0; i < bases; i++) {
          if (features.length >= 8192)
            throw new Error(
              "Too many alignment bases to display. Zoom into a smaller region."
            );
          const col = reverse ? columnEnd - i - 0.5 : columnStart + i + 0.5;
          const feature = new Feature(
            new Point(point(col, rowStart + i + 0.5))
          );
          feature.setStyle(style);
          features.push(feature);
        }
      }
    }
    return features;
  }

  private cancel(): void {
    ++this.generation;
    this.controller?.abort();
    this.controller = undefined;
    if (this.jobId) {
      void this.manager.networkManager.requestManager
        .sendRequest(
          new SequenceAnalysisRequest(`/sequence/jobs/${this.jobId}/stop`)
        )
        .catch(() => undefined);
      this.jobId = undefined;
    }
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
