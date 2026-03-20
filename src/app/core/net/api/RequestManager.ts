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

import assert from "assert";
import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import { ImageTile, Tile } from "ol";
import TileState from "ol/TileState";
import type { AssemblyInfo } from "../../domain/AssemblyInfo";
import {
  AssemblyInfoDTO,
  InboundDTO,
  OpenFileResponseDTO,
  VisualizationOptionsDTO,
} from "../dto/dto";
import { HiCTAPIRequestDTO } from "../dto/requestDTO";
import {
  ConversionJobResponseDTO,
  CurrentSignalRangeResponseDTO,
  FastaLinkResponseDTO,
  NameMappingResponseDTO,
  TrackQueryResponseDTO,
  TrackSummaryResponseDTO,
  TilePOSTResponseDTO,
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
  ListFASTAFilesRequest,
  ListFilesRequest,
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
  StartBatchConversionJobsRequest,
  StartConversionJobRequest,
  ListConversionJobsRequest,
  GetConversionJobRequest,
  StopConversionJobRequest,
  RenameContigRequest,
  RenameScaffoldRequest,
  ExportNameMappingRequest,
  ImportNameMappingRequest,
  ReloadTilesRequest,
  AttachSessionRequest,
  CloseFileRequest,
  OpenProgressRequest,
  ListTrackFilesRequest,
  OpenTrackRequest,
  ListTracksRequest,
  UpdateTrackRequest,
  RemoveTrackRequest,
  QueryTracks1DRequest,
} from "./request";
import {
  ConversionJobResponse,
  CurrentSignalRangeResponse,
  FastaLinkResponse,
  NameMappingResponse,
  TrackQueryResponse,
  TrackSummaryResponse,
} from "./response";
import { toast } from "vue-sonner";
import { useErrorToastStore } from "@/app/stores/errorToastStore";
import VisualizationOptions from "../../visualization/VisualizationOptions";

class RequestManager {
  constructor(public readonly networkManager: NetworkManager) {}

  private normalizeAssemblyInfo(json: Record<string, unknown>): Record<string, unknown> {
    const assemblyInfo = json["assemblyInfo"] as Record<string, unknown> | undefined;
    return assemblyInfo ?? json;
  }

  public async sendRequest(
    request: HiCTAPIRequest,
    axiosConfig?: AxiosRequestConfig | undefined
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
              `Invalid response from ${request.requestPath}: ${req.data.slice(0, 200)}`
            );
          }
        }
        if (req instanceof InboundDTO) {
          if (req.error) {
            toast.error(req.error);
          }
          if (req.info) {
            toast.success(req.info);
          }
          if (req.message) {
            toast(req.message);
          }
          if (req.warning) {
            toast(req.warning, {
              style: {
                "background-color": "lightyellow",
                color: "black",
              },
            });
          }
        }
        return req;
      })
      .catch((err) => {
        const errorToastStore = useErrorToastStore();
        if (errorToastStore.requestErrorToastsEnabled) {
          const message =
            err?.response?.data?.error ??
            err?.message ??
            "Request failed";
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

  public async closeFile(): Promise<void> {
    await this.sendRequest(new CloseFileRequest());
  }

  public async attachSession(): Promise<{ filename: string; fastaFilename: string; response: OpenFileResponse }> {
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

  public async listCoolers(): Promise<string[]> {
    const response = await this.sendRequest(new ListCoolerFilesRequest());
    return response.data as string[];
  }

  public async listTrackFiles(): Promise<string[]> {
    const response = await this.sendRequest(new ListTrackFilesRequest());
    return response.data as string[];
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

  public async listTracks(): Promise<TrackSummaryResponse[]> {
    return this.sendRequest(new ListTracksRequest())
      .then((response) => response.data as Record<string, unknown>[])
      .then((items) => items.map((item) => new TrackSummaryResponseDTO(item).toEntity()));
  }

  public async updateTrack(
    trackId: string,
    options: {
      visible?: boolean;
      color?: string;
      name?: string;
      renderMode?: string;
      aggregationMode?: string;
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
      })
    )
      .then((response) => response.data)
      .then((json) => new TrackSummaryResponseDTO(json).toEntity());
  }

  public async removeTrack(trackId: string): Promise<void> {
    await this.sendRequest(new RemoveTrackRequest({ trackId }));
  }

  public async queryTracks1D(
    startPx: number,
    endPx: number,
    widthPx: number,
    bpResolution: number
  ): Promise<TrackQueryResponse> {
    return this.sendRequest(new QueryTracks1DRequest({ startPx, endPx, widthPx, bpResolution }))
      .then((response) => response.data)
      .then((json) => new TrackQueryResponseDTO(json).toEntity());
  }

  public async listFASTAFiles(): Promise<string[]> {
    const response = await this.sendRequest(new ListFASTAFilesRequest());
    return response.data as string[];
  }

  public async linkFASTA(request: LinkFASTARequest): Promise<FastaLinkResponse> {
    return this.sendRequest(request)
      .then((response) => response.data)
      .then((json) => new FastaLinkResponseDTO(json).toEntity())
      .catch((err) => {
        throw new Error("Cannot link FASTA file: " + err);
      });
  }

  public async startConversionJob(
    request: StartConversionJobRequest
  ): Promise<{ status: string; jobId: string }> {
    return this.sendRequest(request).then((response) => response.data);
  }

  public async startBatchConversionJobs(
    request: StartBatchConversionJobsRequest
  ): Promise<{ status: string; groupId: string; jobIds: string[] }> {
    return this.sendRequest(request).then((response) => response.data);
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
    return this.sendRequest(
      new RenameScaffoldRequest({ scaffoldId, newName })
    )
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

  public async getBackendVersion(): Promise<{ version: string; webuiVersion?: string } | string> {
    const host = this.networkManager.host.replace(/\/+$/, "");
    return axios
      .get(`${host}/version`)
      .then((resp) => resp.data ?? { version: "unknown" })
      .catch(() => "unknown");
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

  public async loadAGP(request: LoadAGPRequest): Promise<void> {
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
      })
      .catch((err) => {
        throw new Error("Cannot link AGP file: " + err);
      });
  }

  public async getFASTAForAssembly(
    request: GetFastaForAssemblyRequest
  ): Promise<unknown> {
    return this.sendRequest(request, { responseType: "arraybuffer" })
      .then((response) => response.data)
      .catch((err) => {
        throw new Error("Cannot download FASTA for assembly: " + err);
      });
  }

  public async getAGPForAssembly(
    request: GetAGPForAssemblyRequest
  ): Promise<unknown> {
    return this.sendRequest(request, { responseType: "arraybuffer" })
      .then((response) => response.data)
      .catch((err) => {
        throw new Error("Cannot download AGP for assembly: " + err);
      });
  }

  public async getFASTAForSelection(
    request: GetFastaForSelectionRequest
  ): Promise<unknown> {
    return this.sendRequest(request, { responseType: "arraybuffer" })
      .then((response) => response.data)
      .catch((err) => {
        throw new Error("Cannot download FASTA for selection: " + err);
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
