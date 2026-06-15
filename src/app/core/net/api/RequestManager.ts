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

import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
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
import { useErrorToastStore } from "@/app/stores/errorToastStore";
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
  attached: boolean;
  filename: string;
  assemblySource: "PRIMARY" | "SECONDARY";
  requiresConfirmation: boolean;
  requestedFilename?: string;
  warnings: string[];
  compatibility?: SecondarySourceCompatibility;
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

class RequestManager {
  constructor(public readonly networkManager: NetworkManager) {}

  private notifyInboundPayload(payload: unknown): void {
    if (!payload || typeof payload !== "object") {
      return;
    }
    const json = payload as Record<string, unknown>;
    if (typeof json.error === "string" && json.error.trim().length > 0) {
      toast.error(json.error);
    }
    if (typeof json.info === "string" && json.info.trim().length > 0) {
      toast.success(json.info);
    }
    if (typeof json.message === "string" && json.message.trim().length > 0) {
      toast(json.message);
    }
    if (typeof json.warning === "string" && json.warning.trim().length > 0) {
      toast(json.warning, {
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
      nativeHdf5BackendAvailable: Boolean(json.nativeHdf5BackendAvailable ?? false),
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
        requestsPerSecondLast10s: Number(endpoint.requestsPerSecondLast10s ?? 0),
        requestsPerSecondLast60s: Number(endpoint.requestsPerSecondLast60s ?? 0),
      })),
      nativeProcessing: this.parseNativeProcessingStatus(nativeProcessingRaw),
    };
  }

  public async sendRequest(
    request: HiCTAPIRequest,
    axiosConfig?: AxiosRequestConfig | undefined,
    options?: { suppressErrorToast?: boolean }
  ): Promise<AxiosResponse> {
    const host = this.networkManager.host.replace(/\/+$/, "");
    const path = request.requestPath.replace(/^\/+/, "");
    const mergedConfig: AxiosRequestConfig = {
      ...(axiosConfig ?? {}),
      headers: {
        Accept: "application/json",
        ...((axiosConfig ?? {}).headers ?? {}),
      },
    };
    return axios
      .post(
        `${host}/${path}`,
        HiCTAPIRequestDTO.toDTOClass(request).toDTO(),
        mergedConfig
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
        this.notifyInboundPayload(req.data);
        return req;
      })
      .catch((err) => {
        const errorToastStore = useErrorToastStore();
        if (!options?.suppressErrorToast && errorToastStore.requestErrorToastsEnabled) {
          const message = extractErrorMessage(err, "Request failed");
          toast.error(message);
        }
        throw err;
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
      .then((json) => new OpenFileResponseDTO(json).toEntity());
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

  public async getSecondarySourceStatus(): Promise<SecondarySourceStatusResponse> {
    return this.sendRequest(new GetSecondarySourceStatusRequest())
      .then((response) => response.data as Record<string, unknown>)
      .then((json) => this.parseSecondarySourceStatus(json));
  }

  public async openSecondarySource(
    filename: string,
    allowMismatch = false
  ): Promise<SecondarySourceStatusResponse> {
    return this.sendRequest(
      new OpenSecondarySourceRequest({ filename, allowMismatch })
    )
      .then((response) => response.data as Record<string, unknown>)
      .then((json) => this.parseSecondarySourceStatus(json));
  }

  public async closeSecondarySource(): Promise<SecondarySourceStatusResponse> {
    return this.sendRequest(new CloseSecondarySourceRequest())
      .then((response) => response.data as Record<string, unknown>)
      .then((json) => this.parseSecondarySourceStatus(json));
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
  }

  public async attachSession(): Promise<{
    filename: string;
    fastaFilename: string;
    response: OpenFileResponse;
  }> {
    return this.sendRequest(new AttachSessionRequest())
      .then((response) => response.data as Record<string, unknown>)
      .then((json) => {
        if (json && typeof json === "object" && "error" in json) {
          throw new Error(String((json as Record<string, unknown>).error));
        }
        const filename = (json["filename"] as string) ?? "";
        const fastaFilename = (json["fastaFilename"] as string) ?? "";
        const response = new OpenFileResponseDTO(
          json["openFileResponse"] as Record<string, unknown>
        ).toEntity();
        return { filename, fastaFilename, response };
      });
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
    filename: string
  ): Promise<MatrixSourceResolutionResponse> {
    return this.sendRequest(new ResolveMatrixSourceRequest({ filename }))
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

  public async openCoolerWeightsTrack(
    name?: string,
    color?: string,
    source?: "PRIMARY" | "SECONDARY"
  ): Promise<TrackSummaryResponse> {
    return this.sendRequest(new OpenCoolerWeightsTrackRequest({ name, color, source }))
      .then((response) => response.data)
      .then((json) => new TrackSummaryResponseDTO(json).toEntity());
  }

  public async probeTrackCompatibility(
    filename: string,
    options?: { suppressErrorToast?: boolean }
  ): Promise<TrackCompatibilityReportResponse> {
    return this.sendRequest(
      new ProbeTrackCompatibilityRequest({ filename }),
      undefined,
      options
    )
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

  public async queryTracks1DByUnits(options: {
    unit: "PIXELS" | "BINS" | "BP";
    start: number;
    end: number;
    widthPx: number;
    bpResolution: number;
  }): Promise<TrackQueryResponse> {
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
    return this.sendRequest(new QueryTracks1DRequest(payload))
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
    filename: string,
    options?: { suppressErrorToast?: boolean }
  ): Promise<TrackPrecomputeCacheProbeResponse> {
    return this.sendRequest(
      new ProbeTrackPrecomputeCacheRequest({ filename }),
      undefined,
      options
    )
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
    return this.sendRequest(new SetRenderPipelineRequest(config)).then(
      (response) => response.data as Record<string, unknown>
    );
  }

  public async resetRenderPipelineConfig(): Promise<Record<string, unknown>> {
    return this.sendRequest(new ResetRenderPipelineRequest()).then(
      (response) => response.data as Record<string, unknown>
    );
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
      .then((json) => new FastaLinkResponseDTO(json).toEntity())
      .catch((err) => {
        throw new Error(extractErrorMessage(err, "Cannot link FASTA file"));
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
  }): Promise<{ status: string; inputFilename: string; outputFilename: string }> {
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

  public async queryMatrixFloat32(options: {
    bpResolution: number;
    startRowPx: number;
    endRowPx: number;
    startColPx: number;
    endColPx: number;
    source?: "PRIMARY" | "SECONDARY";
    signalMode?: "RAW_COUNTS" | "COOLER_WEIGHTED" | "TRADITIONAL_NORMALIZED" | "PIPELINE_SIGNAL";
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
      },
      {
        responseType: "arraybuffer",
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
    return this.sendRequest(request)
      .then((response) => response.data)
      .then((json) => new AssemblyInfoDTO(json).toEntity())
      .then((asmInfo) => {
        if (options.updateAssemblyState !== false) {
          this.networkManager.mapManager?.contigDimensionHolder.updateContigData(
            asmInfo.contigDescriptors
          );
          this.networkManager.mapManager?.scaffoldHolder.updateScaffoldData(
            asmInfo.scaffoldDescriptors
          );
          this.networkManager.mapManager?.reloadVisuals();
        }
        return asmInfo;
      })
      .catch((err) => {
        throw new Error(extractErrorMessage(err, "Cannot link AGP file"));
      });
  }

  public async applyJuiceboxAssembly(request: ApplyJuiceboxAssemblyRequest): Promise<AssemblyInfo> {
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
    return this.sendRequest(request)
      .then((response) => response.data)
      .then((json) => new VisualizationOptionsDTO(json).toEntity());
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
