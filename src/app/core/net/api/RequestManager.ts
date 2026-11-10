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

import {
  chooseMissingComponents,
  AgpImportCancelledError,
} from "../agpImportChoice";
import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import type { WorkspaceState } from "@/app/core/mapmanagers/WorkspaceState";
import type { AssemblyInfo } from "../../domain/AssemblyInfo";
import {
  AssemblyInfoDTO,
  OpenFileResponseDTO,
  VisualizationOptionsDTO,
} from "../dto/dto";
import { HiCTAPIRequestDTO } from "../dto/requestDTO";
import {
  ConversionJobResponseDTO,
  ConversionToolchainStatusResponseDTO,
  CurrentSignalRangeResponseDTO,
  FastaLinkResponseDTO,
  NameMappingResponseDTO,
  TracksPrecomputeStatusResponseDTO,
  TrackCompatibilityReportResponseDTO,
  FileEntryResponseDTO,
  MatrixSourceResolutionResponseDTO,
  TrackFeatureContextResponseDTO,
  TrackFeatureSearchResponseDTO,
  TrackPrecomputeCacheProbeResponseDTO,
  TrackQueryResponseDTO,
  TrackSummaryResponseDTO,
  WorkerSchedulerDiagnosticsResponseDTO,
} from "../dto/responseDTO";
import type { OpenFileResponse } from "../netcommon";
import {
  parseSourceCapabilities,
  type SourceCapabilities,
} from "../SourceCapabilities";
import type { NetworkManager } from "../NetworkManager";
import {
  GetAGPForAssemblyRequest,
  GetCurrentSignalRangeRequest,
  GetFastaForAssemblyRequest,
  GetFastaForSelectionRequest,
  GroupContigsIntoScaffoldRequest,
  LinkFASTARequest,
  ListAGPFilesRequest,
  ListCoolerFilesRequest,
  ListConvertibleMatrixFilesRequest,
  ListDirectoryRequest,
  ListFilesDetailedRequest,
  ListFASTAFilesRequest,
  ListFilesRequest,
  ResolveMatrixSourceRequest,
  DropAllCachesRequest,
  LoadAGPRequest,
  MoveSelectionRangeRequest,
  OpenFileRequest,
  ReverseSelectionRangeRequest,
  SaveFileRequest,
  UngroupContigsFromScaffoldRequest,
  type HiCTAPIRequest,
  SplitContigRequest,
  MoveSelectionToDebrisRequest,
  GetVisualizationOptionsRequest,
  SetVisualizationOptionsRequest,
  SetViewportExpectedProfileRequest,
  StartBatchConversionJobsRequest,
  StartConversionJobRequest,
  StartDotplotJobsRequest,
  ListDotplotJobsRequest,
  StopDotplotJobRequest,
  ListConversionJobsRequest,
  GetConversionJobRequest,
  GetConversionToolchainStatusRequest,
  SetDotplotAlignerPreferenceRequest,
  ConvertAssemblyToAgpRequest,
  ApplyJuiceboxAssemblyRequest,
  StopConversionJobRequest,
  RenameContigRequest,
  RenameScaffoldRequest,
  ExportNameMappingRequest,
  ImportNameMappingRequest,
  ReloadTilesRequest,
  GetSessionSnapshotRequest,
  RestoreSessionRequest,
  AttachSessionRequest,
  CloseFileRequest,
  OpenProgressRequest,
  OpenSecondarySourceRequest,
  CloseSecondarySourceRequest,
  GetSecondarySourceStatusRequest,
  SetAssemblyInfoSourceRequest,
  ListTrackFilesRequest,
  OpenTrackRequest,
  OpenCoolerWeightsTrackRequest,
  ListExamplesRequest,
  StartExampleDownloadRequest,
  ExampleDownloadStatusRequest,
  CancelExampleDownloadRequest,
  StartFastaOnlyRequest,
  FastaOnlyStatusRequest,
  CancelFastaOnlyRequest,
  PrepareCoverageNormalizationRequest,
  CoverageNormalizationStatusRequest,
  CancelCoverageNormalizationRequest,
  SelectNormalizationWeightsRequest,
  ProbeTrackCompatibilityRequest,
  ListTracksRequest,
  UpdateTrackRequest,
  RemoveTrackRequest,
  ReorderTrackRequest,
  QueryTracks1DRequest,
  SearchTrackFeaturesRequest,
  GetTrackFeatureContextRequest,
  StartTracksPrecomputeRequest,
  GetTracksPrecomputeStatusRequest,
  ProbeTrackPrecomputeCacheRequest,
  GetWorkerDiagnosticsRequest,
  GetNativeProcessingStatusRequest,
  GetServerStatisticsRequest,
  SetNativeProcessingEnabledRequest,
  GetRenderPipelineRequest,
  SetRenderPipelineRequest,
  ResetRenderPipelineRequest,
} from "./request";
import {
  ConversionJobResponse,
  ConversionToolchainStatusResponse,
  CurrentSignalRangeResponse,
  FastaLinkResponse,
  FileEntryResponse,
  MatrixSourceResolutionResponse,
  NameMappingResponse,
  TrackCompatibilityReportResponse,
  TrackFeatureContextResponse,
  TrackFeatureSearchResponse,
  TrackPrecomputeCacheProbeResponse,
  TracksPrecomputeStatusResponse,
  TrackQueryResponse,
  TrackSummaryResponse,
  WorkerSchedulerDiagnosticsResponse,
} from "./response";
import { toast } from "vue-sonner";
import { useSessionStore } from "@/app/stores/sessionStore";
import VisualizationOptions from "../../visualization/VisualizationOptions";
import { extractErrorMessage } from "./errorMessage";

export type SecondarySourceCompatibility = {
  sameResolutions: boolean;
  sameMatrixSizes: boolean;
  exactMatch: boolean;
  primaryMaxBins: number;
  secondaryMaxBins: number;
  primaryResolutions: number[];
  secondaryResolutions: number[];
  primaryPixelResolutions: number[];
  secondaryPixelResolutions: number[];
  primaryBinsByResolution: number[];
  secondaryBinsByResolution: number[];
  mismatchedResolutionOrders: number[];
};

export type SecondarySourceStatusResponse = {
  assemblyInfo?: AssemblyInfo;
  capabilities?: SourceCapabilities;
  attached: boolean;
  filename: string;
  assemblySource: "PRIMARY" | "SECONDARY";
  requiresConfirmation: boolean;
  requestedFilename?: string;
  warnings: string[];
  compatibility?: SecondarySourceCompatibility;
  sequenceAnalysis?: {
    kind: string;
    minimumIdentity: number;
    scoreScale: number;
    scoreUnit: string;
  };
};

export type NativeProcessingStatusResponse = {
  requested: boolean;
  enabled: boolean;
  available: boolean;
  version: string;
  source: string;
  reason: string;
  lastFailure: string;
  nativeSessionActive?: boolean;
  nativeOperationCount?: number;
  nativeFailedOperationCount?: number;
  nativeHdf5BackendAvailable?: boolean;
};

export type ServerEndpointStatisticsResponse = {
  path: string;
  totalRequests: number;
  requestsPerSecondLast10s: number;
  requestsPerSecondLast60s: number;
};

export type ServerStatisticsResponse = {
  timestampMs: number;
  startedMs: number;
  uptimeSeconds: number;
  totalRequests: number;
  inFlightRequests: number;
  meanRequestsPerSecond: number;
  requestsPerSecondLast10s: number;
  requestsPerSecondLast60s: number;
  heapUsedBytes: number;
  heapCommittedBytes: number;
  heapMaxBytes: number;
  nonHeapUsedBytes: number;
  availableProcessors: number;
  liveThreads: number;
  daemonThreads: number;
  peakThreads: number;
  endpoints: ServerEndpointStatisticsResponse[];
  nativeProcessing: NativeProcessingStatusResponse;
};

import { shallowReactive } from "vue";
import {
  UnscaffoldAllRequest,
  AssemblyHistoryRequest,
  RestoreAssemblyHistoryRequest,
} from "./request";
export type HistorySummary = {
  session: string;
  revision: number;
  currentId: number;
  position: number;
  size: number;
  canUndo: boolean;
  canRedo: boolean;
};
export type HistoryPage = {
  summary: HistorySummary | null;
  offset: number;
  entries: { id: number; label: string; timestamp: string }[];
};
const assemblyMutationPaths = new Set([
  "/reverse_selection_range",
  "/move_selection_range",
  "/split_contig_at_bin",
  "/unscaffold_all",
  "/group_contigs_into_scaffold",
  "/ungroup_contigs_from_scaffold",
  "/move_selection_to_debris",
  "/load_agp",
  "/apply_juicebox_assembly",
  "/names/contig",
  "/names/scaffold",
  "/names/import",
]);
const assemblySessionPaths = new Set([
  "/open",
  "/close",
  "/secondary/open",
  "/secondary/close",
  "/secondary/set_assembly_source",
  "/session/restore",
]);

export interface AttachedSession {
  filename: string;
  fastaFilename: string;
  response: OpenFileResponse;
  workspaceState?: WorkspaceState;
  /** Present on restore and attach: status of the attached overlay source. */
  secondarySource?: Record<string, unknown>;
  assemblySource?: "PRIMARY" | "SECONDARY";
  /** Present only on restore: the saved processing graph, visualization options and track definitions. */
  renderPipeline?: Record<string, unknown>;
  visualizationOptions?: Record<string, unknown>;
  tracks?: Record<string, unknown>[];
}

/** State of the square-root coverage preparation job and of the weights tiles use. */
export type CoverageNormalizationStatus = {
  state: "IDLE" | "RUNNING" | "READY" | "FAILED" | "CANCELLED";
  progress: number;
  message: string;
  algorithm: string;
  error: string | null;
  /** Vectors exist for every open source. */
  prepared: boolean;
  /** Weights the primary source uses when weights are applied. */
  mode: "FILE" | "SQRT_COVERAGE";
  /** Every open source uses the same weights. */
  consistent: boolean;
  estimatedBytes: number;
};

/** One example dataset of the catalog, as the server sends it. Text is shown as text, never as markup. */
export type ExampleFile = {
  id: string;
  role: string;
  format: string;
  url: string;
  filename: string;
  required: boolean;
  bytes?: number;
  sha256?: string;
  description?: string;
};
export type ExampleEntry = {
  id: string;
  sectionId: string;
  title: string;
  description: string;
  organism?: string;
  tags?: string[];
  publications: {
    title: string;
    citation: string;
    url: string;
    doi?: string;
    kind?: string;
  }[];
  files: ExampleFile[];
  attribution: {
    provider: string;
    url: string;
    termsUrl: string;
    acknowledgement: string;
    licenseName?: string;
    licenseUrl?: string;
    restrictions?: string;
  };
  openingRecipe: {
    matrix?: string;
    fasta?: string;
    agp?: string;
    assembly?: string;
    tracks?: string[];
    referenceId?: string;
  };
  provenance?: { reviewStatus?: string; retrieved?: string; origin?: string };
  source: string;
  bundled: boolean;
  /** The manifest and every required file are on the server. */
  downloaded?: boolean;
};
export type ExamplesCatalogResponse = {
  sections: {
    id: string;
    title: string;
    description?: string;
    order?: number;
  }[];
  examples: ExampleEntry[];
  problems: { source: string; pointer: string; message: string }[];
};
export type ExampleDownloadStatus = {
  state: "IDLE" | "RUNNING" | "READY" | "FAILED" | "CANCELLED";
  exampleId: string | null;
  progress: number;
  message: string;
  error: string | null;
  downloadedBytes: number;
  totalBytes: number;
  currentFile: string | null;
  files: string[];
  skippedOptional: string[];
  allRequiredPresent: boolean;
};

/** State of the job that builds an assembly from a FASTA file alone. */
export type FastaOnlyStatus = {
  state: "IDLE" | "RUNNING" | "READY" | "FAILED" | "CANCELLED";
  progress: number;
  message: string;
  error: string | null;
  /** Paths relative to the server data folder. */
  outputFilename: string | null;
  agpFilename: string | null;
  fastaFilename: string | null;
  contigCount: number;
  totalBases: number;
  warnings: string[];
  reused: boolean;
};

const quietStatusPrefixes = ["/normalization/", "/fasta_only/", "/examples/"];
const quietStatusPath = (path: string): boolean =>
  quietStatusPrefixes.some((prefix) => path.startsWith(prefix));

const journalResetPaths = new Set([
  "/secondary/open",
  "/secondary/close",
  "/secondary/set_assembly_source",
]);

class RequestManager {
  private workspaceVersion?: { session: string; revision: number };
  public renderPipelineRevision = 0;
  private readonly sequenceState = shallowReactive({
    revision: 0,
    linked: false,
  });
  private readonly sequenceListeners = new Set<() => void>();
  /** Advances whenever sequence content or its linkage may have changed. */
  public get sequenceRevision(): number {
    return this.sequenceState.revision;
  }
  /** Whether a FASTA file is linked. Changing it notifies sequence views. */
  public get hasLinkedFasta(): boolean {
    return this.sequenceState.linked;
  }
  public set hasLinkedFasta(value: boolean) {
    if (this.sequenceState.linked === value) return;
    this.sequenceState.linked = value;
    this.bumpSequenceRevision();
  }
  /** The one place that invalidates sequence caches and asks sequence views to repaint. */
  public bumpSequenceRevision(): void {
    this.sequenceState.revision++;
    for (const listener of [...this.sequenceListeners]) {
      try {
        listener();
      } catch (error) {
        console.debug("Sequence listener failed", error);
      }
    }
  }
  public onSequenceChange(listener: () => void): () => void {
    this.sequenceListeners.add(listener);
    return () => this.sequenceListeners.delete(listener);
  }
  public sourceCapabilities: Partial<
    Record<"PRIMARY" | "SECONDARY", SourceCapabilities>
  > = {};
  private readonly sequenceViewState = shallowReactive({ readOnly: false });
  public get sequenceViewReadOnly(): boolean {
    return this.sequenceViewState.readOnly;
  }
  public set sequenceViewReadOnly(value: boolean) {
    this.sequenceViewState.readOnly = value;
  }
  public readonly history = shallowReactive({
    summary: null as HistorySummary | null,
    applied: null as HistorySummary | null,
    busy: 0,
  });

  /** Journal state of the last open, restore or completed save. Null while unknown, for example after Attach. */
  private assemblySavedMark: { session: string; currentId: number } | null =
    null;

  /**
   * Records a journal state as the saved baseline. Defaults to the latest known state, so call it with the
   * state captured at the moment of a save rather than after later awaits.
   */
  public markAssemblySaved(
    state: Pick<HistorySummary, "session" | "currentId"> | null = this.history
      .summary
  ): void {
    this.assemblySavedMark = state
      ? { session: state.session, currentId: state.currentId }
      : null;
  }

  /** True when the assembly differs from the last opened or saved state. Undoing back to it counts as clean. */
  public hasUnsavedAssemblyEdits(): boolean {
    const summary = this.history.summary;
    if (!summary) return false;
    const mark = this.assemblySavedMark;
    if (!mark) return summary.position > 0;
    return (
      mark.session !== summary.session || mark.currentId !== summary.currentId
    );
  }

  public async getAssemblyHistory(offset?: number): Promise<HistoryPage> {
    const response = await this.sendRequest(
      new AssemblyHistoryRequest({ offset, limit: 100 })
    );
    return response.data as HistoryPage;
  }

  public async restoreAssemblyHistory(
    action: "undo" | "redo" | "restore",
    id?: number
  ): Promise<void> {
    const summary = this.history.summary;
    if (!summary || this.history.busy) return;
    const response = await this.sendRequest(
      new RestoreAssemblyHistoryRequest({
        session: summary.session,
        revision: summary.revision,
        action,
        id,
        assemblyFormat: "compact-v1",
      })
    );
    const assembly = new AssemblyInfoDTO(
      this.normalizeAssemblyInfo(response.data)
    ).toEntity();
    const manager = this.networkManager.mapManager;
    if (!manager) return;
    manager.deactivateTranslocation();
    manager.viewAndLayersManager.currentViewState.activeTool = undefined;
    manager.eventManager.resetSelection();
    manager.contigDimensionHolder.updateContigData(assembly.contigDescriptors);
    manager.scaffoldHolder.updateScaffoldData(assembly.scaffoldDescriptors);
    manager.getLayersManager().reapplyAxisScopes();
    manager.refreshOverviewMinimap();
    manager.reloadVisuals();
  }

  constructor(public readonly networkManager: NetworkManager) {}

  private notifyInboundPayload(payload: unknown): void {
    if (!payload || typeof payload !== "object") {
      return;
    }
    const json = payload as Record<string, unknown>;
    if (typeof json.info === "string" && json.info.trim().length > 0) {
      toast.success(json.info);
    }
    if (typeof json.message === "string" && json.message.trim().length > 0) {
      toast.message(json.message);
    }
    if (typeof json.warning === "string" && json.warning.trim().length > 0) {
      toast.message(json.warning, {
        style: {
          "background-color": "lightyellow",
          color: "black",
        },
      });
    }
  }

  private normalizeAssemblyInfo(
    json: Record<string, unknown>
  ): Record<string, unknown> {
    const assemblyInfo = json["assemblyInfo"] as
      | Record<string, unknown>
      | undefined;
    return assemblyInfo ?? json;
  }

  private parseSecondarySourceStatus(
    json: Record<string, unknown>
  ): SecondarySourceStatusResponse {
    if (typeof json.error === "string" && json.error.trim().length > 0) {
      throw new Error(json.error);
    }
    const compatibilityRaw =
      (json.compatibility as Record<string, unknown> | undefined) ?? undefined;
    const compatibility: SecondarySourceCompatibility | undefined =
      compatibilityRaw
        ? {
            sameResolutions: Boolean(compatibilityRaw.sameResolutions ?? false),
            sameMatrixSizes: Boolean(compatibilityRaw.sameMatrixSizes ?? false),
            exactMatch: Boolean(compatibilityRaw.exactMatch ?? false),
            primaryMaxBins: Number(compatibilityRaw.primaryMaxBins ?? 0),
            secondaryMaxBins: Number(compatibilityRaw.secondaryMaxBins ?? 0),
            primaryResolutions: Array.isArray(
              compatibilityRaw.primaryResolutions
            )
              ? (compatibilityRaw.primaryResolutions as unknown[]).map(
                  (value) => Number(value ?? 0)
                )
              : [],
            secondaryResolutions: Array.isArray(
              compatibilityRaw.secondaryResolutions
            )
              ? (compatibilityRaw.secondaryResolutions as unknown[]).map(
                  (value) => Number(value ?? 0)
                )
              : [],
            primaryPixelResolutions: Array.isArray(
              compatibilityRaw.primaryPixelResolutions
            )
              ? (compatibilityRaw.primaryPixelResolutions as unknown[]).map(
                  (value) => Number(value ?? 0)
                )
              : [],
            secondaryPixelResolutions: Array.isArray(
              compatibilityRaw.secondaryPixelResolutions
            )
              ? (compatibilityRaw.secondaryPixelResolutions as unknown[]).map(
                  (value) => Number(value ?? 0)
                )
              : [],
            primaryBinsByResolution: Array.isArray(
              compatibilityRaw.primaryBinsByResolution
            )
              ? (compatibilityRaw.primaryBinsByResolution as unknown[]).map(
                  (value) => Number(value ?? 0)
                )
              : [],
            secondaryBinsByResolution: Array.isArray(
              compatibilityRaw.secondaryBinsByResolution
            )
              ? (compatibilityRaw.secondaryBinsByResolution as unknown[]).map(
                  (value) => Number(value ?? 0)
                )
              : [],
            mismatchedResolutionOrders: Array.isArray(
              compatibilityRaw.mismatchedResolutionOrders
            )
              ? (compatibilityRaw.mismatchedResolutionOrders as unknown[]).map(
                  (value) => Number(value ?? 0)
                )
              : [],
          }
        : undefined;
    return {
      attached: Boolean(json.attached ?? false),
      filename: String(json.filename ?? ""),
      assemblySource:
        String(json.assemblySource ?? "PRIMARY").toUpperCase() === "SECONDARY"
          ? "SECONDARY"
          : "PRIMARY",
      requiresConfirmation: Boolean(json.requiresConfirmation ?? false),
      requestedFilename:
        typeof json.requestedFilename === "string"
          ? json.requestedFilename
          : undefined,
      warnings: Array.isArray(json.warnings)
        ? (json.warnings as unknown[]).map((value) => String(value))
        : [],
      compatibility,
      assemblyInfo: json.assemblyInfo
        ? new AssemblyInfoDTO(
            json.assemblyInfo as Record<string, unknown>
          ).toEntity()
        : undefined,
      capabilities: parseSourceCapabilities(json.capabilities),
      sequenceAnalysis: json.sequenceAnalysis
        ? {
            kind: String(
              (json.sequenceAnalysis as Record<string, unknown>).kind ?? ""
            ),
            minimumIdentity: Number(
              (json.sequenceAnalysis as Record<string, unknown>)
                .minimumIdentity ?? 80
            ),
            scoreScale: Number(
              (json.sequenceAnalysis as Record<string, unknown>).scoreScale ??
                10000
            ),
            scoreUnit: String(
              (json.sequenceAnalysis as Record<string, unknown>).scoreUnit ?? ""
            ),
          }
        : undefined,
    };
  }

  private parseNativeProcessingStatus(
    json: Record<string, unknown>
  ): NativeProcessingStatusResponse {
    return {
      requested: Boolean(json.requested ?? false),
      enabled: Boolean(json.enabled ?? false),
      available: Boolean(json.available ?? false),
      version: String(json.version ?? "unknown"),
      source: String(json.source ?? ""),
      reason: String(json.reason ?? ""),
      lastFailure: String(json.lastFailure ?? ""),
      nativeSessionActive: Boolean(json.nativeSessionActive ?? false),
      nativeOperationCount: Number(json.nativeOperationCount ?? 0),
      nativeFailedOperationCount: Number(json.nativeFailedOperationCount ?? 0),
      nativeHdf5BackendAvailable: Boolean(
        json.nativeHdf5BackendAvailable ?? false
      ),
    };
  }

  private parseServerStatistics(
    json: Record<string, unknown>
  ): ServerStatisticsResponse {
    const endpointsRaw = Array.isArray(json.endpoints)
      ? (json.endpoints as Record<string, unknown>[])
      : [];
    const nativeProcessingRaw =
      (json.nativeProcessing as Record<string, unknown> | undefined) ?? {};
    return {
      timestampMs: Number(json.timestampMs ?? 0),
      startedMs: Number(json.startedMs ?? 0),
      uptimeSeconds: Number(json.uptimeSeconds ?? 0),
      totalRequests: Number(json.totalRequests ?? 0),
      inFlightRequests: Number(json.inFlightRequests ?? 0),
      meanRequestsPerSecond: Number(json.meanRequestsPerSecond ?? 0),
      requestsPerSecondLast10s: Number(json.requestsPerSecondLast10s ?? 0),
      requestsPerSecondLast60s: Number(json.requestsPerSecondLast60s ?? 0),
      heapUsedBytes: Number(json.heapUsedBytes ?? 0),
      heapCommittedBytes: Number(json.heapCommittedBytes ?? 0),
      heapMaxBytes: Number(json.heapMaxBytes ?? 0),
      nonHeapUsedBytes: Number(json.nonHeapUsedBytes ?? 0),
      availableProcessors: Number(json.availableProcessors ?? 0),
      liveThreads: Number(json.liveThreads ?? 0),
      daemonThreads: Number(json.daemonThreads ?? 0),
      peakThreads: Number(json.peakThreads ?? 0),
      endpoints: endpointsRaw.map((endpoint) => ({
        path: String(endpoint.path ?? ""),
        totalRequests: Number(endpoint.totalRequests ?? 0),
        requestsPerSecondLast10s: Number(
          endpoint.requestsPerSecondLast10s ?? 0
        ),
        requestsPerSecondLast60s: Number(
          endpoint.requestsPerSecondLast60s ?? 0
        ),
      })),
      nativeProcessing: this.parseNativeProcessingStatus(nativeProcessingRaw),
    };
  }

  public async sendRequest(
    request: HiCTAPIRequest,
    axiosConfig?: AxiosRequestConfig | undefined
  ): Promise<AxiosResponse> {
    const host = this.networkManager.host.replace(/\/+$/, "");
    const path = request.requestPath.replace(/^\/+/, "");
    const mutation = assemblyMutationPaths.has(request.requestPath);
    if (
      this.sequenceViewReadOnly &&
      (mutation || request.requestPath === "/assembly/history/restore")
    ) {
      throw new Error("Return to the contact map before editing the assembly.");
    }
    const tracked =
      mutation ||
      assemblySessionPaths.has(request.requestPath) ||
      request.requestPath === "/assembly/history/restore";
    // Attaching or detaching a source starts a new journal. That is not an edit, so a clean
    // assembly must stay clean, while an edited one stays marked as unsaved.
    const keepCleanState =
      journalResetPaths.has(request.requestPath) &&
      !this.hasUnsavedAssemblyEdits();
    const summary = this.history.applied;
    const sequenceSnapshot =
      request.requestPath.startsWith("/sequence/") &&
      request.requestPath.endsWith("/jobs");
    const historyHeaders =
      (mutation ||
        sequenceSnapshot ||
        request.requestPath === "/session/snapshot") &&
      summary
        ? {
            "X-HiCT-History-Session": summary.session,
            "X-HiCT-History-Revision": String(summary.revision),
          }
        : {};
    if (tracked) this.history.busy++;
    const mergedConfig: AxiosRequestConfig = {
      ...(axiosConfig ?? {}),
      headers: {
        Accept: "application/json",
        ...historyHeaders,
        ...((axiosConfig ?? {}).headers ?? {}),
      },
    };
    return Promise.resolve()
      .then(() =>
        axios.post(
          `${host}/${path}`,
          HiCTAPIRequestDTO.toDTOClass(request).toDTO(),
          mergedConfig
        )
      )
      .then((req) => {
        if (typeof req.data === "string") {
          try {
            req.data = JSON.parse(req.data);
          } catch (e) {
            throw new Error(
              `Invalid response from ${request.requestPath}: ${req.data.slice(
                0,
                200
              )}`
            );
          }
        }
        const header = req.headers["x-hict-history"];
        if (typeof header === "string") {
          const next = JSON.parse(header) as HistorySummary | null;
          const current = this.history.summary;
          if (
            !next ||
            !current ||
            next.session !== current.session ||
            next.revision > current.revision
          )
            this.history.summary = next;
          // Listing history may observe another client's edit. It must not advance
          // the coordinate guard until this client's assembly model is refreshed.
          if (
            (tracked && req.data?.requiresMissingComponentsChoice !== true) ||
            request.requestPath === "/attach"
          )
            this.history.applied = next;
        }
        if (keepCleanState) this.markAssemblySaved();
        // Job status answers carry a progress message of their own. The dialogs that poll them show it
        // where it belongs, so it must not also appear as a toast on every poll.
        if (!quietStatusPath(request.requestPath))
          this.notifyInboundPayload(req.data);
        return req;
      })
      .catch((err) => {
        // A failed/conflicting command can leave another client's newer journal.
        if (tracked) void this.getAssemblyHistory().catch(() => undefined);
        throw err;
      })
      .finally(() => {
        if (tracked) this.history.busy--;
      });
  }

  public async openFile(
    filename: string,
    fastaFilename: string | undefined
  ): Promise<OpenFileResponse> {
    return this.sendRequest(
      new OpenFileRequest({ filename: filename, fastaFilename: fastaFilename })
    )
      .then((response) => response.data)
      .then((json) => {
        this.workspaceVersion = json.workspaceVersion;
        this.hasLinkedFasta = false;
        this.bumpSequenceRevision();
        this.markAssemblySaved();
        const response = new OpenFileResponseDTO(json).toEntity();
        this.sourceCapabilities = { PRIMARY: response.capabilities };
        return response;
      });
  }

  public async getOpenProgress(): Promise<{ stage: string; progress: number }> {
    return this.sendRequest(new OpenProgressRequest())
      .then((response) => response.data)
      .then((json) => {
        return {
          stage: String((json as Record<string, unknown>)?.stage ?? "unknown"),
          progress: Number((json as Record<string, unknown>)?.progress ?? 0),
        };
      });
  }

  /** Keeps the "open files" display in step with every attach/detach, whichever dialog caused it. */
  private publishSecondarySourceStatus(
    status: SecondarySourceStatusResponse
  ): SecondarySourceStatusResponse {
    if (!status.requiresConfirmation) {
      this.sourceCapabilities = {
        ...this.sourceCapabilities,
        SECONDARY: status.attached ? status.capabilities : undefined,
      };
      useSessionStore().setSecondaryMapFilename(
        status.attached ? status.filename : ""
      );
    }
    return status;
  }

  /** Capture server state for a future v3 session without advancing displayed coordinates. */
  public async getSessionSnapshot(
    verifyAssemblyRoundTrip = false,
    fingerprintFiles = false,
    verifyTrackDefinitions = false,
    fullFingerprints = false
  ): Promise<Record<string, unknown>> {
    if (!this.history.applied)
      throw new Error(
        "Attach to the current assembly before saving a session."
      );
    const response = await this.sendRequest(
      new GetSessionSnapshotRequest(
        verifyAssemblyRoundTrip,
        fingerprintFiles,
        verifyTrackDefinitions,
        fullFingerprints
      )
    );
    const snapshot = response.data as Record<string, unknown>;
    if (snapshot.snapshotVersion !== 1)
      throw new Error("Unsupported server session snapshot version");
    if (verifyAssemblyRoundTrip && snapshot.assemblyVerified !== true)
      throw new Error("Server did not verify assembly reconstruction");
    if (fingerprintFiles && snapshot.filesFingerprinted !== true)
      throw new Error("Server did not fingerprint session resources");
    if (verifyTrackDefinitions && snapshot.tracksVerified !== true)
      throw new Error("Server did not verify session track definitions");
    return snapshot;
  }

  public async getSecondarySourceStatus(): Promise<SecondarySourceStatusResponse> {
    return this.sendRequest(new GetSecondarySourceStatusRequest())
      .then((response) => response.data as Record<string, unknown>)
      .then((json) => this.parseSecondarySourceStatus(json))
      .then((status) => this.publishSecondarySourceStatus(status));
  }

  public async openSecondarySource(
    filename: string,
    allowMismatch = false
  ): Promise<SecondarySourceStatusResponse> {
    return this.sendRequest(
      new OpenSecondarySourceRequest({ filename, allowMismatch })
    )
      .then((response) => response.data as Record<string, unknown>)
      .then((json) => this.parseSecondarySourceStatus(json))
      .then((status) => this.publishSecondarySourceStatus(status));
  }

  public async closeSecondarySource(): Promise<SecondarySourceStatusResponse> {
    return this.sendRequest(new CloseSecondarySourceRequest())
      .then((response) => response.data as Record<string, unknown>)
      .then((json) => this.parseSecondarySourceStatus(json))
      .then((status) => this.publishSecondarySourceStatus(status));
  }

  public async setAssemblyInfoSource(
    assemblySource: "PRIMARY" | "SECONDARY"
  ): Promise<{
    assemblySource: "PRIMARY" | "SECONDARY";
    assemblyInfo: AssemblyInfo;
  }> {
    return this.sendRequest(
      new SetAssemblyInfoSourceRequest({ assemblySource })
    )
      .then((response) => response.data as Record<string, unknown>)
      .then((json) => ({
        assemblySource:
          String(json.assemblySource ?? "PRIMARY").toUpperCase() === "SECONDARY"
            ? "SECONDARY"
            : "PRIMARY",
        assemblyInfo: new AssemblyInfoDTO(
          (json.assemblyInfo ?? {}) as Record<string, unknown>
        ).toEntity(),
      }));
  }

  public async closeFile(): Promise<void> {
    await this.sendRequest(new CloseFileRequest());
    this.assemblySavedMark = null;
    this.sourceCapabilities = {};
    this.workspaceVersion = undefined;
    this.hasLinkedFasta = false;
    this.bumpSequenceRevision();
  }

  public async attachSession(): Promise<AttachedSession> {
    return this.sendRequest(new AttachSessionRequest())
      .then((response) => response.data as Record<string, unknown>)
      .then((json) => this.adoptSessionPayload(json));
  }

  /**
   * Replaces the live server session with a saved v3 snapshot. The server prepares
   * every resource first, so a rejected snapshot leaves the current session usable.
   */
  public async restoreSession(
    snapshot: Record<string, unknown>
  ): Promise<AttachedSession> {
    // The caller reports one actionable message, so the generic request toast is off.
    return this.sendRequest(new RestoreSessionRequest(snapshot))
      .then((response) => response.data as Record<string, unknown>)
      .then((json) => {
        // The restored assembly is the saved one, so it starts clean.
        this.markAssemblySaved();
        return this.adoptSessionPayload(json);
      });
  }

  private adoptSessionPayload(json: Record<string, unknown>): AttachedSession {
    if (json && typeof json === "object" && "error" in json) {
      throw new Error(String((json as Record<string, unknown>).error));
    }
    const filename = (json["filename"] as string) ?? "";
    this.workspaceVersion =
      json.workspaceVersion as typeof this.workspaceVersion;
    const fastaFilename = (json["fastaFilename"] as string) ?? "";
    this.hasLinkedFasta = Boolean(fastaFilename);
    this.bumpSequenceRevision();
    const response = new OpenFileResponseDTO(
      json["openFileResponse"] as Record<string, unknown>
    ).toEntity();
    this.sourceCapabilities = { PRIMARY: response.capabilities };
    return {
      filename,
      fastaFilename,
      response,
      workspaceState: json.workspaceState as WorkspaceState | undefined,
      secondarySource: json.secondarySource as
        | Record<string, unknown>
        | undefined,
      assemblySource: json.assemblySource as
        | "PRIMARY"
        | "SECONDARY"
        | undefined,
      renderPipeline: json.renderPipeline as
        | Record<string, unknown>
        | undefined,
      visualizationOptions: json.visualizationOptions as
        | Record<string, unknown>
        | undefined,
      tracks: json.tracks as Record<string, unknown>[] | undefined,
    };
  }

  public async getSignalRanges(
    tileVersion: number
  ): Promise<CurrentSignalRangeResponse> {
    return this.sendRequest(
      new GetCurrentSignalRangeRequest({ tileVersion: tileVersion })
    )
      .then((response) => response.data)
      .then((json) => new CurrentSignalRangeResponseDTO(json).toEntity());
  }

  public async saveWorkspaceState(
    filename: string,
    state: WorkspaceState
  ): Promise<void> {
    const host = this.networkManager.host.replace(/\/+$/, "");
    const expectedVersion = this.workspaceVersion;
    if (!expectedVersion)
      throw new Error(
        "Attach to a compatible server before saving workspace settings."
      );
    const response = await axios.post(`${host}/workspace/state`, {
      filename,
      state,
      expectedVersion,
    });
    // A delayed save from the previous map must not replace an Open/Attach token.
    if (this.workspaceVersion === expectedVersion)
      this.workspaceVersion = response.data.workspaceVersion;
  }

  public async listFiles(): Promise<string[]> {
    const response = await this.sendRequest(new ListFilesRequest());
    return response.data as string[];
  }

  public async listFilesDetailed(): Promise<FileEntryResponse[]> {
    return this.sendRequest(new ListFilesDetailedRequest())
      .then((response) => response.data as Record<string, unknown>[])
      .then((items) =>
        items.map((item) => new FileEntryResponseDTO(item).toEntity())
      );
  }

  public async listDirectory(directory = ""): Promise<FileEntryResponse[]> {
    return this.sendRequest(new ListDirectoryRequest({ directory }))
      .then((response) => response.data as Record<string, unknown>[])
      .then((items) =>
        items.map((item) => new FileEntryResponseDTO(item).toEntity())
      );
  }

  public async listCoolers(): Promise<string[]> {
    const response = await this.sendRequest(new ListCoolerFilesRequest());
    return response.data as string[];
  }

  public async listConvertibleMatrices(): Promise<string[]> {
    const response = await this.sendRequest(
      new ListConvertibleMatrixFilesRequest()
    );
    return response.data as string[];
  }

  public async listTrackFiles(): Promise<string[]> {
    const response = await this.sendRequest(new ListTrackFilesRequest());
    return response.data as string[];
  }

  public async resolveMatrixSource(
    filename: string,
    options: {
      readonly buildResolutionPyramid?: boolean;
      readonly balanceInputCoolers?: boolean;
    } = {}
  ): Promise<MatrixSourceResolutionResponse> {
    return this.sendRequest(
      new ResolveMatrixSourceRequest({ filename, ...options })
    )
      .then((response) => response.data)
      .then((json) => new MatrixSourceResolutionResponseDTO(json).toEntity());
  }

  public async dropAllCaches(): Promise<{
    status: string;
    matrixMetadataDeleted: number;
    trackCacheEntriesDeleted: number;
  }> {
    return this.sendRequest(new DropAllCachesRequest())
      .then((response) => response.data as Record<string, unknown>)
      .then((json) => ({
        status: String(json.status ?? "unknown"),
        matrixMetadataDeleted: Number(json.matrixMetadataDeleted ?? 0),
        trackCacheEntriesDeleted: Number(json.trackCacheEntriesDeleted ?? 0),
      }));
  }

  public async openTrack(
    filename: string,
    name?: string,
    color?: string
  ): Promise<TrackSummaryResponse> {
    return this.sendRequest(new OpenTrackRequest({ filename, name, color }))
      .then((response) => response.data)
      .then((json) => new TrackSummaryResponseDTO(json).toEntity());
  }

  private readonly normalizationState = shallowReactive({
    mode: "FILE" as "FILE" | "SQRT_COVERAGE",
  });
  /** The weights the server applies when weights are on. Reactive, shared by every view of it. */
  public get normalizationWeightsMode(): "FILE" | "SQRT_COVERAGE" {
    return this.normalizationState.mode;
  }

  private noteNormalization(
    status: CoverageNormalizationStatus
  ): CoverageNormalizationStatus {
    if (status.mode === "FILE" || status.mode === "SQRT_COVERAGE")
      this.normalizationState.mode = status.mode;
    return status;
  }

  public async listExamples(): Promise<ExamplesCatalogResponse> {
    return this.sendRequest(new ListExamplesRequest()).then(
      (response) => response.data as ExamplesCatalogResponse
    );
  }

  public async startExampleDownload(
    exampleId: string
  ): Promise<ExampleDownloadStatus> {
    return this.sendRequest(
      new StartExampleDownloadRequest({ exampleId })
    ).then((response) => response.data as ExampleDownloadStatus);
  }

  public async exampleDownloadStatus(): Promise<ExampleDownloadStatus> {
    return this.sendRequest(new ExampleDownloadStatusRequest()).then(
      (response) => response.data as ExampleDownloadStatus
    );
  }

  public async cancelExampleDownload(): Promise<ExampleDownloadStatus> {
    return this.sendRequest(new CancelExampleDownloadRequest()).then(
      (response) => response.data as ExampleDownloadStatus
    );
  }

  public async startFastaOnly(options: {
    fastaFilename: string;
    splitAtN: boolean;
    minNRun: number;
  }): Promise<FastaOnlyStatus> {
    return this.sendRequest(new StartFastaOnlyRequest(options)).then(
      (response) => response.data as FastaOnlyStatus
    );
  }

  public async fastaOnlyStatus(): Promise<FastaOnlyStatus> {
    return this.sendRequest(new FastaOnlyStatusRequest()).then(
      (response) => response.data as FastaOnlyStatus
    );
  }

  public async cancelFastaOnly(): Promise<FastaOnlyStatus> {
    return this.sendRequest(new CancelFastaOnlyRequest()).then(
      (response) => response.data as FastaOnlyStatus
    );
  }

  public async prepareCoverageNormalization(): Promise<CoverageNormalizationStatus> {
    return this.sendRequest(new PrepareCoverageNormalizationRequest())
      .then((response) => this.noteNormalization(response.data))
      .catch((error) => {
        throw new Error(
          extractErrorMessage(error, "Coverage preparation request failed")
        );
      });
  }

  public async coverageNormalizationStatus(): Promise<CoverageNormalizationStatus> {
    return this.sendRequest(new CoverageNormalizationStatusRequest()).then(
      (response) => this.noteNormalization(response.data)
    );
  }

  public async cancelCoverageNormalization(): Promise<CoverageNormalizationStatus> {
    return this.sendRequest(new CancelCoverageNormalizationRequest()).then(
      (response) => this.noteNormalization(response.data)
    );
  }

  /** Switches the weights of every open source together. Coverage must have been prepared. */
  public async selectNormalizationWeights(
    mode: "FILE" | "SQRT_COVERAGE"
  ): Promise<{ mode: string; version: number }> {
    return this.sendRequest(
      new SelectNormalizationWeightsRequest({ mode })
    ).then((response) => {
      const result = response.data as { mode: string; version: number };
      if (result.mode === "FILE" || result.mode === "SQRT_COVERAGE")
        this.normalizationState.mode = result.mode;
      return result;
    });
  }

  public async openCoolerWeightsTrack(
    name?: string,
    color?: string,
    source?: "PRIMARY" | "SECONDARY"
  ): Promise<TrackSummaryResponse> {
    return this.sendRequest(
      new OpenCoolerWeightsTrackRequest({ name, color, source })
    )
      .then((response) => response.data)
      .then((json) => new TrackSummaryResponseDTO(json).toEntity());
  }

  public async probeTrackCompatibility(
    filename: string
  ): Promise<TrackCompatibilityReportResponse> {
    return this.sendRequest(new ProbeTrackCompatibilityRequest({ filename }))
      .then((response) => response.data)
      .then((json) => new TrackCompatibilityReportResponseDTO(json).toEntity());
  }

  public async listTracks(): Promise<TrackSummaryResponse[]> {
    return this.sendRequest(new ListTracksRequest())
      .then((response) => response.data as Record<string, unknown>[])
      .then((items) =>
        items.map((item) => new TrackSummaryResponseDTO(item).toEntity())
      );
  }

  public async updateTrack(
    trackId: string,
    options: {
      visible?: boolean;
      color?: string;
      name?: string;
      renderMode?: string;
      aggregationMode?: string;
      logScale?: boolean;
      rangeAuto?: boolean;
      rangeMin?: number;
      rangeMax?: number;
    }
  ): Promise<TrackSummaryResponse> {
    return this.sendRequest(
      new UpdateTrackRequest({
        trackId,
        visible: options.visible,
        color: options.color,
        name: options.name,
        renderMode: options.renderMode,
        aggregationMode: options.aggregationMode,
        logScale: options.logScale,
        rangeAuto: options.rangeAuto,
        rangeMin: options.rangeMin,
        rangeMax: options.rangeMax,
      })
    )
      .then((response) => response.data)
      .then((json) => new TrackSummaryResponseDTO(json).toEntity());
  }

  public async removeTrack(trackId: string): Promise<void> {
    await this.sendRequest(new RemoveTrackRequest({ trackId }));
  }

  public async reorderTrack(
    trackId: string,
    targetIndex: number
  ): Promise<TrackSummaryResponse[]> {
    return this.sendRequest(new ReorderTrackRequest({ trackId, targetIndex }))
      .then((response) => response.data as Record<string, unknown>[])
      .then((items) =>
        items.map((item) => new TrackSummaryResponseDTO(item).toEntity())
      );
  }

  public async queryTracks1D(
    startPx: number,
    endPx: number,
    widthPx: number,
    bpResolution: number
  ): Promise<TrackQueryResponse> {
    return this.sendRequest(
      new QueryTracks1DRequest({
        unit: "PIXELS",
        startPx,
        endPx,
        widthPx,
        bpResolution,
      })
    )
      .then((response) => response.data)
      .then((json) => new TrackQueryResponseDTO(json).toEntity());
  }

  public async queryTracks1DByUnits(
    options: {
      unit: "PIXELS" | "BINS" | "BP";
      start: number;
      end: number;
      widthPx: number;
      bpResolution: number;
    },
    signal?: AbortSignal
  ): Promise<TrackQueryResponse> {
    const payload: {
      unit: "PIXELS" | "BINS" | "BP";
      widthPx: number;
      bpResolution: number;
      startPx?: number;
      endPx?: number;
      startBin?: number;
      endBin?: number;
      startBP?: number;
      endBP?: number;
    } = {
      unit: options.unit,
      widthPx: options.widthPx,
      bpResolution: options.bpResolution,
    };
    if (options.unit === "PIXELS") {
      payload.startPx = options.start;
      payload.endPx = options.end;
    } else if (options.unit === "BINS") {
      payload.startBin = options.start;
      payload.endBin = options.end;
    } else {
      payload.startBP = options.start;
      payload.endBP = options.end;
    }
    return this.sendRequest(new QueryTracks1DRequest(payload), { signal })
      .then((response) => response.data)
      .then((json) => new TrackQueryResponseDTO(json).toEntity());
  }

  public async searchTrackFeatures(options: {
    query: string;
    limit?: number;
    offset?: number;
    trackId?: string;
  }): Promise<TrackFeatureSearchResponse> {
    return this.sendRequest(
      new SearchTrackFeaturesRequest({
        query: options.query,
        limit: options.limit,
        offset: options.offset,
        trackId: options.trackId,
      })
    )
      .then((response) => response.data)
      .then((json) => new TrackFeatureSearchResponseDTO(json).toEntity());
  }

  public async getTrackFeatureContext(options: {
    unit: "PIXELS" | "BINS" | "BP";
    start: number;
    end: number;
    widthPx: number;
    bpResolution: number;
    marginScreens?: number;
  }): Promise<TrackFeatureContextResponse> {
    const payload: {
      unit: "PIXELS" | "BINS" | "BP";
      widthPx: number;
      bpResolution: number;
      marginScreens?: number;
      startPx?: number;
      endPx?: number;
      startBin?: number;
      endBin?: number;
      startBP?: number;
      endBP?: number;
    } = {
      unit: options.unit,
      widthPx: options.widthPx,
      bpResolution: options.bpResolution,
      marginScreens: options.marginScreens,
    };
    if (options.unit === "PIXELS") {
      payload.startPx = options.start;
      payload.endPx = options.end;
    } else if (options.unit === "BINS") {
      payload.startBin = options.start;
      payload.endBin = options.end;
    } else {
      payload.startBP = options.start;
      payload.endBP = options.end;
    }
    return this.sendRequest(new GetTrackFeatureContextRequest(payload))
      .then((response) => response.data)
      .then((json) => new TrackFeatureContextResponseDTO(json).toEntity());
  }

  public async startTracksPrecompute(
    trackId?: string,
    force = false
  ): Promise<TracksPrecomputeStatusResponse> {
    return this.sendRequest(
      new StartTracksPrecomputeRequest({ trackId, force })
    )
      .then((response) => response.data)
      .then((json) => new TracksPrecomputeStatusResponseDTO(json).toEntity());
  }

  public async getTracksPrecomputeStatus(): Promise<TracksPrecomputeStatusResponse> {
    return this.sendRequest(new GetTracksPrecomputeStatusRequest())
      .then((response) => response.data)
      .then((json) => new TracksPrecomputeStatusResponseDTO(json).toEntity());
  }

  public async probeTrackPrecomputeCache(
    filename: string
  ): Promise<TrackPrecomputeCacheProbeResponse> {
    return this.sendRequest(new ProbeTrackPrecomputeCacheRequest({ filename }))
      .then((response) => response.data)
      .then((json) =>
        new TrackPrecomputeCacheProbeResponseDTO(json).toEntity()
      );
  }

  public async getWorkerDiagnostics(): Promise<WorkerSchedulerDiagnosticsResponse> {
    return this.sendRequest(new GetWorkerDiagnosticsRequest())
      .then((response) => response.data)
      .then((json) =>
        new WorkerSchedulerDiagnosticsResponseDTO(json).toEntity()
      );
  }

  public async getNativeProcessingStatus(): Promise<NativeProcessingStatusResponse> {
    return this.sendRequest(new GetNativeProcessingStatusRequest())
      .then((response) => response.data as Record<string, unknown>)
      .then((json) => this.parseNativeProcessingStatus(json));
  }

  public async getServerStatistics(): Promise<ServerStatisticsResponse> {
    return this.sendRequest(new GetServerStatisticsRequest())
      .then((response) => response.data as Record<string, unknown>)
      .then((json) => this.parseServerStatistics(json));
  }

  public async setNativeProcessingEnabled(
    enabled: boolean
  ): Promise<NativeProcessingStatusResponse> {
    return this.sendRequest(new SetNativeProcessingEnabledRequest({ enabled }))
      .then((response) => response.data as Record<string, unknown>)
      .then((json) => this.parseNativeProcessingStatus(json));
  }

  public async getRenderPipelineConfig(): Promise<Record<string, unknown>> {
    return this.sendRequest(new GetRenderPipelineRequest()).then(
      (response) => response.data as Record<string, unknown>
    );
  }

  public async setRenderPipelineConfig(
    config: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    ++this.renderPipelineRevision;
    const response = await this.sendRequest(
      new SetRenderPipelineRequest(config)
    );
    if (typeof window !== "undefined")
      window.dispatchEvent(new CustomEvent("hict:render-pipeline-changed"));
    return response.data as Record<string, unknown>;
  }

  public async resetRenderPipelineConfig(): Promise<Record<string, unknown>> {
    ++this.renderPipelineRevision;
    const response = await this.sendRequest(new ResetRenderPipelineRequest());
    if (typeof window !== "undefined")
      window.dispatchEvent(new CustomEvent("hict:render-pipeline-changed"));
    return response.data as Record<string, unknown>;
  }

  public async listFASTAFiles(): Promise<string[]> {
    const response = await this.sendRequest(new ListFASTAFilesRequest());
    return response.data as string[];
  }

  public async linkFASTA(
    request: LinkFASTARequest
  ): Promise<FastaLinkResponse> {
    return this.sendRequest(request)
      .then((response) => response.data)
      .then((json) => {
        const result = new FastaLinkResponseDTO(json).toEntity();
        this.bumpSequenceRevision();
        this.hasLinkedFasta = result.linked;
        this.networkManager.mapManager?.getMap().render();
        return result;
      })
      .catch((err) => {
        throw Object.assign(
          new Error(extractErrorMessage(err, "Cannot link FASTA file")),
          { cause: err }
        );
      });
  }

  public async startConversionJob(
    request: StartConversionJobRequest
  ): Promise<{ status: string; jobId: string }> {
    return this.sendRequest(request).then((response) => response.data);
  }

  public async convertAssemblyToAgp(options: {
    filename: string;
    outputFilename?: string;
    overwrite?: boolean;
  }): Promise<{
    status: string;
    inputFilename: string;
    outputFilename: string;
  }> {
    return this.sendRequest(new ConvertAssemblyToAgpRequest(options)).then(
      (response) => response.data
    );
  }

  public async startBatchConversionJobs(
    request: StartBatchConversionJobsRequest
  ): Promise<{ status: string; groupId: string; jobIds: string[] }> {
    return this.sendRequest(request).then((response) => response.data);
  }

  public async startDotplotJobs(
    request: StartDotplotJobsRequest
  ): Promise<{ status: string; groupId: string; jobIds: string[] }> {
    return this.sendRequest(request).then((response) => response.data);
  }

  public async listDotplotJobs(): Promise<ConversionJobResponse[]> {
    return this.sendRequest(new ListDotplotJobsRequest()).then((response) =>
      (response.data as Record<string, unknown>[]).map((job) =>
        new ConversionJobResponseDTO(job).toEntity()
      )
    );
  }

  public async stopDotplotJob(
    jobId: string
  ): Promise<{ status: string; jobId: string }> {
    return this.sendRequest(new StopDotplotJobRequest(jobId)).then(
      (response) => response.data
    );
  }

  public async listConversionJobs(): Promise<ConversionJobResponse[]> {
    return this.sendRequest(new ListConversionJobsRequest()).then((response) =>
      (response.data as Record<string, unknown>[]).map((job) =>
        new ConversionJobResponseDTO(job).toEntity()
      )
    );
  }

  public async getConversionJob(jobId: string): Promise<ConversionJobResponse> {
    return this.sendRequest(new GetConversionJobRequest(jobId)).then(
      (response) => new ConversionJobResponseDTO(response.data).toEntity()
    );
  }

  public async stopConversionJob(
    jobId: string
  ): Promise<{ status: string; jobId: string }> {
    return this.sendRequest(new StopConversionJobRequest(jobId)).then(
      (response) => response.data
    );
  }

  public async getConversionToolchainStatus(): Promise<ConversionToolchainStatusResponse> {
    return this.sendRequest(new GetConversionToolchainStatusRequest()).then(
      (response) =>
        new ConversionToolchainStatusResponseDTO(response.data).toEntity()
    );
  }

  public async setDotplotAlignerPreference(
    alignerPreference: string
  ): Promise<ConversionToolchainStatusResponse> {
    return this.sendRequest(
      new SetDotplotAlignerPreferenceRequest(alignerPreference)
    ).then((response) =>
      new ConversionToolchainStatusResponseDTO(response.data).toEntity()
    );
  }

  public async renameContig(
    contigId: number,
    newName: string | null
  ): Promise<AssemblyInfo> {
    return this.sendRequest(new RenameContigRequest({ contigId, newName }))
      .then((response) => response.data)
      .then((json) =>
        new AssemblyInfoDTO(this.normalizeAssemblyInfo(json)).toEntity()
      );
  }

  public async renameScaffold(
    scaffoldId: number,
    newName: string | null
  ): Promise<AssemblyInfo> {
    return this.sendRequest(new RenameScaffoldRequest({ scaffoldId, newName }))
      .then((response) => response.data)
      .then((json) =>
        new AssemblyInfoDTO(this.normalizeAssemblyInfo(json)).toEntity()
      );
  }

  public async exportNameMapping(): Promise<NameMappingResponse> {
    return this.sendRequest(new ExportNameMappingRequest())
      .then((response) => response.data)
      .then((json) => new NameMappingResponseDTO(json).toEntity());
  }

  public async importNameMapping(
    contigs: { contigId: number; name: string }[],
    scaffolds: { scaffoldId: number; name: string }[]
  ): Promise<AssemblyInfo> {
    return this.sendRequest(
      new ImportNameMappingRequest({ contigs, scaffolds })
    )
      .then((response) => response.data)
      .then((json) =>
        new AssemblyInfoDTO(this.normalizeAssemblyInfo(json)).toEntity()
      );
  }

  public async reloadTilesVersion(): Promise<number> {
    return this.sendRequest(new ReloadTilesRequest())
      .then((response) => response.data)
      .then((json) => Number(json.version ?? 0));
  }

  public async getBackendVersion(): Promise<
    { version: string; webuiVersion?: string } | string
  > {
    const host = this.networkManager.host.replace(/\/+$/, "");
    return axios
      .get(`${host}/version`)
      .then((resp) => resp.data ?? { version: "unknown" })
      .catch(() => "unknown");
  }

  public async getChangelog(): Promise<string> {
    const host = this.networkManager.host.replace(/\/+$/, "");
    return axios
      .get(`${host}/changelog`, { headers: { Accept: "application/json" } })
      .then((resp) => {
        const data = resp.data;
        if (typeof data === "string") {
          return data;
        }
        return String(
          data?.text ?? "Changelog for this build was not detected"
        );
      })
      .catch(() => "Changelog for this build was not detected");
  }

  public async querySequenceRegion(
    startBp: number,
    endBp: number,
    signal?: AbortSignal,
    options: { includeGaps?: boolean; assemblyAnchorBp?: number } = {}
  ): Promise<{
    linked: boolean;
    startBp?: number;
    sequence?: string;
    totalLength?: number;
    coordinateSystem?: string;
    segments?: {
      start: number;
      end: number;
      assemblyStart: number | null;
      assemblyEnd: number | null;
      source: string | null;
      sourceStart: number | null;
      sourceEnd: number | null;
      contig: string | null;
      scaffold: string | null;
      reversed: boolean;
      gap: boolean;
    }[];
  }> {
    const host = this.networkManager.host.replace(/\/+$/, "");
    const version = this.history.applied;
    const headers = version
      ? {
          "X-HiCT-History-Session": version.session,
          "X-HiCT-History-Revision": String(version.revision),
        }
      : undefined;
    return (
      await axios.post(
        `${host}/sequence/region`,
        { startBp, endBp, ...options },
        { signal, headers }
      )
    ).data;
  }

  public async querySignalStatistics(options: {
    bpResolution: number;
    metadataOnly?: boolean;
    revision?: string;
    startRowPx?: number;
    startColPx?: number;
    expression?: Record<string, unknown>;
    signal?: AbortSignal;
  }): Promise<{
    revision: string;
    size: number;
    rows?: number;
    cols?: number;
    min?: number | null;
    max?: number | null;
    count?: number;
  }> {
    const { signal, ...request } = options;
    const host = this.networkManager.host.replace(/\/+$/, "");
    return (await axios.post(`${host}/matrix/statistics`, request, { signal }))
      .data;
  }

  public async queryMatrixFloat32(options: {
    bpResolution: number;
    startRowPx: number;
    endRowPx: number;
    startColPx: number;
    endColPx: number;
    source?: "PRIMARY" | "SECONDARY";
    signalMode?:
      | "RAW_COUNTS"
      | "COOLER_WEIGHTED"
      | "TRADITIONAL_NORMALIZED"
      | "PIPELINE_SIGNAL";
    expression?: Record<string, unknown>;
    signal?: AbortSignal;
  }): Promise<{
    rows: number;
    cols: number;
    values: Float32Array;
  }> {
    const host = this.networkManager.host.replace(/\/+$/, "");
    const response = await axios.post(
      `${host}/matrix/query`,
      {
        unit: "PIXELS",
        bpResolution: options.bpResolution,
        startRowPx: options.startRowPx,
        endRowPx: options.endRowPx,
        startColPx: options.startColPx,
        endColPx: options.endColPx,
        source: options.source ?? "PRIMARY",
        signalMode: options.signalMode ?? "TRADITIONAL_NORMALIZED",
        format: "BINARY_FLOAT32",
        expression: options.expression,
      },
      {
        responseType: "arraybuffer",
        signal: options.signal,
        headers: {
          Accept: "application/octet-stream",
        },
      }
    );
    const rows = Number.parseInt(response.headers["x-hict-rows"] || "0", 10);
    const cols = Number.parseInt(response.headers["x-hict-cols"] || "0", 10);
    const buffer = response.data as ArrayBuffer;
    const count = Math.max(0, Math.floor(buffer.byteLength / 4));
    const view = new DataView(buffer);
    const values = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      values[index] = view.getFloat32(index * 4, true);
    }
    return {
      rows,
      cols,
      values,
    };
  }

  public async listAGPFiles(): Promise<string[]> {
    const response = await this.sendRequest(new ListAGPFilesRequest());
    return response.data as string[];
  }

  public async save(): Promise<void> {
    return this.sendRequest(new SaveFileRequest({})).then(() => {
      return;
    });
  }

  public async loadAGP(
    request: LoadAGPRequest,
    options: { updateAssemblyState?: boolean } = {}
  ): Promise<AssemblyInfo> {
    try {
      let response = await this.sendRequest(request);
      if (response.data.requiresMissingComponentsChoice === true) {
        const policy = await chooseMissingComponents(
          response.data.importReport
        );
        if (!policy) throw new AgpImportCancelledError();
        response = await this.sendRequest(
          new LoadAGPRequest({
            ...request.options,
            missingComponentsPolicy: policy,
          })
        );
      }
      const asmInfo = new AssemblyInfoDTO(response.data).toEntity();
      if (options.updateAssemblyState !== false) {
        this.networkManager.mapManager?.contigDimensionHolder.updateContigData(
          asmInfo.contigDescriptors
        );
        this.networkManager.mapManager?.scaffoldHolder.updateScaffoldData(
          asmInfo.scaffoldDescriptors
        );
        this.networkManager.mapManager?.getLayersManager().reapplyAxisScopes();
        this.networkManager.mapManager?.reloadVisuals();
      }
      return asmInfo;
    } catch (err) {
      if (err instanceof AgpImportCancelledError) throw err;
      throw new Error(extractErrorMessage(err, "Cannot link AGP file"));
    }
  }

  public async applyJuiceboxAssembly(
    request: ApplyJuiceboxAssemblyRequest
  ): Promise<AssemblyInfo> {
    return this.sendRequest(request)
      .then((response) => response.data)
      .then((json) => new AssemblyInfoDTO(json).toEntity())
      .then((asmInfo) => {
        this.networkManager.mapManager?.contigDimensionHolder.updateContigData(
          asmInfo.contigDescriptors
        );
        this.networkManager.mapManager?.scaffoldHolder.updateScaffoldData(
          asmInfo.scaffoldDescriptors
        );
        this.networkManager.mapManager?.getLayersManager().reapplyAxisScopes();
        this.networkManager.mapManager?.reloadVisuals();
        return asmInfo;
      })
      .catch((err) => {
        throw new Error(
          extractErrorMessage(err, "Cannot apply Juicebox assembly")
        );
      });
  }

  public async getFASTAForAssembly(
    request: GetFastaForAssemblyRequest
  ): Promise<unknown> {
    return this.sendRequest(request, { responseType: "arraybuffer" })
      .then((response) => response.data)
      .catch((err) => {
        throw new Error(
          extractErrorMessage(err, "Cannot download FASTA for assembly")
        );
      });
  }

  public async getAGPForAssembly(
    request: GetAGPForAssemblyRequest
  ): Promise<unknown> {
    return this.sendRequest(request, { responseType: "arraybuffer" })
      .then((response) => response.data)
      .catch((err) => {
        throw new Error(
          extractErrorMessage(err, "Cannot download AGP for assembly")
        );
      });
  }

  public async getFASTAForSelection(
    request: GetFastaForSelectionRequest
  ): Promise<unknown> {
    return this.sendRequest(request, { responseType: "arraybuffer" })
      .then((response) => response.data)
      .catch((err) => {
        throw new Error(
          extractErrorMessage(err, "Cannot download FASTA for selection")
        );
      });
  }

  public async groupContigsIntoScaffold(
    request: GroupContigsIntoScaffoldRequest
  ): Promise<AssemblyInfo> {
    return this.sendRequest(request)
      .then((response) => response.data)
      .then((json) =>
        new AssemblyInfoDTO(this.normalizeAssemblyInfo(json)).toEntity()
      );
  }

  public async unscaffoldAll(): Promise<AssemblyInfo> {
    const response = await this.sendRequest(new UnscaffoldAllRequest());
    return new AssemblyInfoDTO(
      this.normalizeAssemblyInfo(response.data)
    ).toEntity();
  }

  public async ungroupContigsFromScaffold(
    request: UngroupContigsFromScaffoldRequest
  ): Promise<AssemblyInfo> {
    return this.sendRequest(request)
      .then((response) => response.data)
      .then((json) =>
        new AssemblyInfoDTO(this.normalizeAssemblyInfo(json)).toEntity()
      );
  }

  public async moveSelectionToDebris(
    request: MoveSelectionToDebrisRequest
  ): Promise<AssemblyInfo> {
    return this.sendRequest(request)
      .then((response) => response.data)
      .then((json) =>
        new AssemblyInfoDTO(this.normalizeAssemblyInfo(json)).toEntity()
      );
  }

  public async reverseSelectionRange(
    request: ReverseSelectionRangeRequest
  ): Promise<AssemblyInfo> {
    return this.sendRequest(request)
      .then((response) => response.data)
      .then((json) =>
        new AssemblyInfoDTO(this.normalizeAssemblyInfo(json)).toEntity()
      );
  }

  public async moveSelectionRange(
    request: MoveSelectionRangeRequest
  ): Promise<AssemblyInfo> {
    return this.sendRequest(request)
      .then((response) => response.data)
      .then((json) =>
        new AssemblyInfoDTO(this.normalizeAssemblyInfo(json)).toEntity()
      );
  }

  public async splitContigAtPx(
    request: SplitContigRequest
  ): Promise<AssemblyInfo> {
    return this.sendRequest(request)
      .then((response) => response.data)
      .then((json) =>
        new AssemblyInfoDTO(this.normalizeAssemblyInfo(json)).toEntity()
      );
  }

  public async getVisualizationOptions(
    request: GetVisualizationOptionsRequest
  ): Promise<VisualizationOptions> {
    return this.sendRequest(request)
      .then((response) => response.data)
      .then((json) => new VisualizationOptionsDTO(json).toEntity());
  }

  public async setVisualizationOptions(
    request: SetVisualizationOptionsRequest
  ): Promise<VisualizationOptions> {
    const publishesPipeline = request.options.renderPipeline !== undefined;
    if (publishesPipeline) ++this.renderPipelineRevision;
    const response = await this.sendRequest(request);
    if (publishesPipeline && typeof window !== "undefined")
      window.dispatchEvent(new CustomEvent("hict:render-pipeline-changed"));
    return new VisualizationOptionsDTO(response.data).toEntity();
  }

  public async setViewportExpectedProfile(options: {
    bpResolution: number;
    startRowPx: number;
    endRowPx: number;
    startColPx: number;
    endColPx: number;
  }): Promise<void> {
    await this.sendRequest(new SetViewportExpectedProfileRequest(options));
  }

  /*
  public async loadTilePOSTFunction(tile: Tile, requestPath: string): Promise<void> {
    assert(tile instanceof ImageTile, "TileLoadPOSTRequest is only applicable for loading ImageTiles");
    return axios.get("requestPath").then(
      (response) => {
        return new TilePOSTResponseDTO(response.data).toEntity()
      }
    ).then((resp) => {
      const imageTile: ImageTile = tile as ImageTile;
      const image: HTMLImageElement | HTMLVideoElement =
        imageTile.getImage() as HTMLImageElement | HTMLVideoElement;
    }).catch(() => tile.setState(TileState.ERROR));
  }*/
}

export { RequestManager };
