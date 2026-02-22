/*
 Copyright (c) 2021-2024 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis and Computer Technologies Laboratory ITMO University team.

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
  ConverterStatusResponseDTO,
  CurrentSignalRangeResponseDTO,
  TilePOSTResponseDTO,
} from "../dto/responseDTO";
import type { OpenFileResponse } from "../netcommon";
import type { NetworkManager } from "../NetworkManager";
import {
  ConvertCoolerRequest,
  GetAGPForAssemblyRequest,
  GetConverterStatusRequest,
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
} from "./request";
import {
  ConverterStatusResponse,
  CurrentSignalRangeResponse,
} from "./response";
import { toast } from "vue-sonner";
import { useErrorToastStore } from "@/app/stores/errorToastStore";
import VisualizationOptions from "../../visualization/VisualizationOptions";

class RequestManager {
  constructor(public readonly networkManager: NetworkManager) {}

  public async sendRequest(
    request: HiCTAPIRequest,
    axiosConfig?: AxiosRequestConfig | undefined
  ): Promise<AxiosResponse> {
    return axios
      .post(
        `${this.networkManager.host}/${request.requestPath}`,
        HiCTAPIRequestDTO.toDTOClass(request).toDTO(),
        axiosConfig ?? undefined
      )
      .then((req) => {
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

  public async listFASTAFiles(): Promise<string[]> {
    const response = await this.sendRequest(new ListFASTAFilesRequest());
    return response.data as string[];
  }

  public async linkFASTA(request: LinkFASTARequest): Promise<void> {
    return this.sendRequest(request)
      .then(() => {
        return;
      })
      .catch((err) => {
        throw new Error("Cannot link FASTA file: " + err);
      });
  }

  public async convertCooler(request: ConvertCoolerRequest): Promise<void> {
    return this.sendRequest(request).then(() => {
      return;
    });
  }

  public async getConverterStatus(): Promise<ConverterStatusResponse> {
    return this.sendRequest(new GetConverterStatusRequest(), {
      timeout: 1000,
    }).then((response) =>
      new ConverterStatusResponseDTO(response.data).toEntity()
    );
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
      .then((json) => new AssemblyInfoDTO(json).toEntity());
  }

  public async ungroupContigsFromScaffold(
    request: UngroupContigsFromScaffoldRequest
  ): Promise<AssemblyInfo> {
    return this.sendRequest(request)
      .then((response) => response.data)
      .then((json) => new AssemblyInfoDTO(json).toEntity());
  }

  public async moveSelectionToDebris(
    request: MoveSelectionToDebrisRequest
  ): Promise<AssemblyInfo> {
    return this.sendRequest(request)
      .then((response) => response.data)
      .then((json) => new AssemblyInfoDTO(json).toEntity());
  }

  public async reverseSelectionRange(
    request: ReverseSelectionRangeRequest
  ): Promise<AssemblyInfo> {
    return this.sendRequest(request)
      .then((response) => response.data)
      .then((json) => new AssemblyInfoDTO(json).toEntity());
  }

  public async moveSelectionRange(
    request: MoveSelectionRangeRequest
  ): Promise<AssemblyInfo> {
    return this.sendRequest(request)
      .then((response) => response.data)
      .then((json) => new AssemblyInfoDTO(json).toEntity());
  }

  public async splitContigAtPx(
    request: SplitContigRequest
  ): Promise<AssemblyInfo> {
    return this.sendRequest(request)
      .then((response) => response.data)
      .then((json) => new AssemblyInfoDTO(json).toEntity());
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
