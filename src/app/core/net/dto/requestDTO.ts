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
  ListFilesRequest,
  ListFilesDetailedRequest,
  OpenFileRequest,
  CloseFileRequest,
  AttachSessionRequest,
  GetFastaForAssemblyRequest,
  type HiCTAPIRequest,
  GroupContigsIntoScaffoldRequest,
  UngroupContigsFromScaffoldRequest,
  ReverseSelectionRangeRequest,
  ListFASTAFilesRequest,
  LinkFASTARequest,
  MoveSelectionRangeRequest,
  ListAGPFilesRequest,
  LoadAGPRequest,
  OpenProgressRequest,
  OpenSecondarySourceRequest,
  CloseSecondarySourceRequest,
  GetSecondarySourceStatusRequest,
  SetAssemblyInfoSourceRequest,
  GetWorkerDiagnosticsRequest,
  GetRenderPipelineRequest,
  SetRenderPipelineRequest,
  ResetRenderPipelineRequest,
  GetFastaForSelectionRequest,
  SetNormalizationRequest,
  SetContrastRangeRequest,
  GetCurrentSignalRangeRequest,
  SaveFileRequest,
  GetAGPForAssemblyRequest,
  ListCoolerFilesRequest,
  ListTrackFilesRequest,
  OpenTrackRequest,
  OpenCoolerWeightsTrackRequest,
  ProbeTrackCompatibilityRequest,
  ListTracksRequest,
  UpdateTrackRequest,
  RemoveTrackRequest,
  QueryTracks1DRequest,
  StartTracksPrecomputeRequest,
  GetTracksPrecomputeStatusRequest,
  StartConversionJobRequest,
  StartBatchConversionJobsRequest,
  ListConversionJobsRequest,
  GetConversionJobRequest,
  StopConversionJobRequest,
  RenameContigRequest,
  RenameScaffoldRequest,
  ExportNameMappingRequest,
  ImportNameMappingRequest,
  ReloadTilesRequest,
  SplitContigRequest,
  MoveSelectionToDebrisRequest,
  GetVisualizationOptionsRequest,
  SetVisualizationOptionsRequest,
} from "../api/request";
import { ColormapDTO, OutboundDTO, VisualizationOptionsDTO } from "./dto";

abstract class HiCTAPIRequestDTO<
  T extends HiCTAPIRequest
> extends OutboundDTO<T> {
  public readonly requestPath: string;

  public constructor(entity: T) {
    super(entity);
    this.requestPath = entity.requestPath;
  }

  static toDTOClass(entity: HiCTAPIRequest) {
    switch (true) {
      case entity instanceof GetCurrentSignalRangeRequest:
        return new GetCurrentSignalRangeRequestDTO(
          entity as GetCurrentSignalRangeRequest
        );
      case entity instanceof ReverseSelectionRangeRequest:
        return new ReverseSelectionRangeRequestDTO(
          entity as ReverseSelectionRangeRequest
        );
      case entity instanceof MoveSelectionRangeRequest:
        return new MoveSelectionRangeRequestDTO(
          entity as MoveSelectionRangeRequest
        );
      case entity instanceof GroupContigsIntoScaffoldRequest:
        return new GroupContigsIntoScaffoldRequestDTO(
          entity as GroupContigsIntoScaffoldRequest
        );
      case entity instanceof SplitContigRequest:
        return new SplitContigRequestDTO(entity as SplitContigRequest);
      case entity instanceof StartConversionJobRequest:
        return new StartConversionJobRequestDTO(
          entity as StartConversionJobRequest
        );
      case entity instanceof StartBatchConversionJobsRequest:
        return new StartBatchConversionJobsRequestDTO(
          entity as StartBatchConversionJobsRequest
        );
      case entity instanceof UngroupContigsFromScaffoldRequest:
        return new UngroupContigsFromScaffoldRequestDTO(
          entity as UngroupContigsFromScaffoldRequest
        );
      case entity instanceof MoveSelectionToDebrisRequest:
        return new MoveSelectionRangeRequestDTO(
          entity as MoveSelectionRangeRequest
        );
      case entity instanceof SetNormalizationRequest:
        return new SetNormalizationRequestDTO(
          entity as SetNormalizationRequest
        );
      case entity instanceof SetContrastRangeRequest:
        return new SetContrastRangeRequestDTO(
          entity as SetContrastRangeRequest
        );
      case entity instanceof OpenFileRequest:
        return new OpenFileRequestDTO(entity as OpenFileRequest);
      case entity instanceof SaveFileRequest:
        return new SaveFileRequestDTO(entity as SaveFileRequest);
      case entity instanceof ListFilesRequest:
        return new ListFilesRequestDTO(entity);
      case entity instanceof ListFilesDetailedRequest:
        return new ListFilesDetailedRequestDTO(entity);
      case entity instanceof ListCoolerFilesRequest:
        return new ListCoolerFilesRequestDTO(entity);
      case entity instanceof ListTrackFilesRequest:
        return new ListTrackFilesRequestDTO(entity);
      case entity instanceof OpenTrackRequest:
        return new OpenTrackRequestDTO(entity as OpenTrackRequest);
      case entity instanceof OpenCoolerWeightsTrackRequest:
        return new OpenCoolerWeightsTrackRequestDTO(
          entity as OpenCoolerWeightsTrackRequest
        );
      case entity instanceof ProbeTrackCompatibilityRequest:
        return new ProbeTrackCompatibilityRequestDTO(entity as ProbeTrackCompatibilityRequest);
      case entity instanceof ListTracksRequest:
        return new ListTracksRequestDTO(entity);
      case entity instanceof UpdateTrackRequest:
        return new UpdateTrackRequestDTO(entity as UpdateTrackRequest);
      case entity instanceof RemoveTrackRequest:
        return new RemoveTrackRequestDTO(entity as RemoveTrackRequest);
      case entity instanceof QueryTracks1DRequest:
        return new QueryTracks1DRequestDTO(entity as QueryTracks1DRequest);
      case entity instanceof StartTracksPrecomputeRequest:
        return new StartTracksPrecomputeRequestDTO(entity as StartTracksPrecomputeRequest);
      case entity instanceof GetTracksPrecomputeStatusRequest:
        return new GetTracksPrecomputeStatusRequestDTO(entity as GetTracksPrecomputeStatusRequest);
      case entity instanceof ListConversionJobsRequest:
        return new ListConversionJobsRequestDTO(entity);
      case entity instanceof GetConversionJobRequest:
        return new GetConversionJobRequestDTO(entity as GetConversionJobRequest);
      case entity instanceof StopConversionJobRequest:
        return new StopConversionJobRequestDTO(
          entity as StopConversionJobRequest
        );
      case entity instanceof RenameContigRequest:
        return new RenameContigRequestDTO(entity as RenameContigRequest);
      case entity instanceof RenameScaffoldRequest:
        return new RenameScaffoldRequestDTO(entity as RenameScaffoldRequest);
      case entity instanceof ExportNameMappingRequest:
        return new ExportNameMappingRequestDTO(entity);
      case entity instanceof ImportNameMappingRequest:
        return new ImportNameMappingRequestDTO(entity as ImportNameMappingRequest);
      case entity instanceof ReloadTilesRequest:
        return new ReloadTilesRequestDTO(entity);
      case entity instanceof ListFASTAFilesRequest:
        return new ListFASTAFilesRequestDTO(entity);
      case entity instanceof LinkFASTARequest:
        return new LinkFASTARequestDTO(entity as LinkFASTARequest);
      case entity instanceof ListAGPFilesRequest:
        return new ListAGPFilesRequestDTO(entity);
      case entity instanceof LoadAGPRequest:
        return new LoadAGPRequestDTO(entity as LoadAGPRequest);
      case entity instanceof OpenProgressRequest:
        return new OpenProgressRequestDTO(entity);
      case entity instanceof OpenSecondarySourceRequest:
        return new OpenSecondarySourceRequestDTO(
          entity as OpenSecondarySourceRequest
        );
      case entity instanceof CloseSecondarySourceRequest:
        return new CloseSecondarySourceRequestDTO(
          entity as CloseSecondarySourceRequest
        );
      case entity instanceof GetSecondarySourceStatusRequest:
        return new GetSecondarySourceStatusRequestDTO(
          entity as GetSecondarySourceStatusRequest
        );
      case entity instanceof SetAssemblyInfoSourceRequest:
        return new SetAssemblyInfoSourceRequestDTO(
          entity as SetAssemblyInfoSourceRequest
        );
      case entity instanceof GetWorkerDiagnosticsRequest:
        return new GetWorkerDiagnosticsRequestDTO(entity);
      case entity instanceof GetRenderPipelineRequest:
        return new GetRenderPipelineRequestDTO(entity);
      case entity instanceof SetRenderPipelineRequest:
        return new SetRenderPipelineRequestDTO(entity as SetRenderPipelineRequest);
      case entity instanceof ResetRenderPipelineRequest:
        return new ResetRenderPipelineRequestDTO(entity);
      case entity instanceof CloseFileRequest:
        return new CloseFileRequestDTO(entity as CloseFileRequest);
      case entity instanceof AttachSessionRequest:
        return new AttachSessionRequestDTO(entity as AttachSessionRequest);
      case entity instanceof GetFastaForAssemblyRequest:
        return new GetFastaForAssemblyRequestDTO(
          entity as GetFastaForAssemblyRequest
        );
      case entity instanceof GetAGPForAssemblyRequest:
        return new GetAGPForAssemblyRequestDTO(
          entity as GetAGPForAssemblyRequest
        );
      case entity instanceof GetFastaForSelectionRequest:
        return new GetFastaForSelectionRequestDTO(
          entity as GetFastaForSelectionRequest
        );
      case entity instanceof GetVisualizationOptionsRequest:
        return new GetVisualizationOptionsRequestDTO(
          entity as GetVisualizationOptionsRequest
        );
      case entity instanceof SetVisualizationOptionsRequest:
        return new SetVisualizationOptionsRequestDTO(
          entity as SetVisualizationOptionsRequest
        );
      default:
        return HiCTAPIRequestDTO.toDTOByRequestPath(entity);
    }
  }

  private static toDTOByRequestPath(entity: HiCTAPIRequest) {
    switch (entity.requestPath) {
      case "/tracks/open_cooler_weights":
        return new OpenCoolerWeightsTrackRequestDTO(
          entity as OpenCoolerWeightsTrackRequest
        );
      case "/secondary/open":
        return new OpenSecondarySourceRequestDTO(
          entity as OpenSecondarySourceRequest
        );
      case "/secondary/close":
        return new CloseSecondarySourceRequestDTO(
          entity as CloseSecondarySourceRequest
        );
      case "/secondary/status":
        return new GetSecondarySourceStatusRequestDTO(
          entity as GetSecondarySourceStatusRequest
        );
      case "/secondary/set_assembly_source":
        return new SetAssemblyInfoSourceRequestDTO(
          entity as SetAssemblyInfoSourceRequest
        );
      default:
        throw new Error(
          `Unknown HiCTAPIRequest type: ${typeof entity}, constructor ${
            entity.constructor
          } cannot be transformed to DTO class.`
        );
    }
  }
}

class GetVisualizationOptionsRequestDTO extends HiCTAPIRequestDTO<GetVisualizationOptionsRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class OpenProgressRequestDTO extends HiCTAPIRequestDTO<OpenProgressRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class OpenSecondarySourceRequestDTO extends HiCTAPIRequestDTO<OpenSecondarySourceRequest> {
  toDTO(): Record<string, unknown> {
    return {
      filename: this.entity.options.filename,
      allowMismatch: this.entity.options.allowMismatch ?? false,
    };
  }
}

class CloseSecondarySourceRequestDTO extends HiCTAPIRequestDTO<CloseSecondarySourceRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class GetSecondarySourceStatusRequestDTO extends HiCTAPIRequestDTO<GetSecondarySourceStatusRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class SetAssemblyInfoSourceRequestDTO extends HiCTAPIRequestDTO<SetAssemblyInfoSourceRequest> {
  toDTO(): Record<string, unknown> {
    return {
      assemblySource: this.entity.options.assemblySource,
    };
  }
}

class GetWorkerDiagnosticsRequestDTO extends HiCTAPIRequestDTO<GetWorkerDiagnosticsRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class GetRenderPipelineRequestDTO extends HiCTAPIRequestDTO<GetRenderPipelineRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class SetRenderPipelineRequestDTO extends HiCTAPIRequestDTO<SetRenderPipelineRequest> {
  toDTO(): Record<string, unknown> {
    return this.entity.options;
  }
}

class ResetRenderPipelineRequestDTO extends HiCTAPIRequestDTO<ResetRenderPipelineRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class SetVisualizationOptionsRequestDTO extends HiCTAPIRequestDTO<SetVisualizationOptionsRequest> {
  toDTO(): Record<string, unknown> {
    return {
      preLogBase: this.entity.options.options.preLogBase,
      postLogBase: this.entity.options.options.postLogBase,
      applyCoolerWeights: this.entity.options.options.applyCoolerWeights,
      resolutionScaling: this.entity.options.options.resolutionScaling,
      resolutionLinearScaling:
        this.entity.options.options.resolutionLinearScaling,
      colormap: ColormapDTO.fromEntity(this.entity.options.options.colormap)
        .json,
    };
  }
}

class ReverseSelectionRangeRequestDTO extends HiCTAPIRequestDTO<ReverseSelectionRangeRequest> {
  toDTO(): Record<string, unknown> {
    return {
      startBP: this.entity.options.startBP,
      endBP: this.entity.options.endBP,
    };
  }
}
class StartConversionJobRequestDTO extends HiCTAPIRequestDTO<StartConversionJobRequest> {
  toDTO(): Record<string, unknown> {
    return {
      filename: this.entity.options.filename,
      direction: this.entity.options.direction,
      overwrite: this.entity.options.overwrite,
      resolutions: this.entity.options.resolutions,
      compression: this.entity.options.compression,
      compressionAlgorithm: this.entity.options.compressionAlgorithm,
      chunkSize: this.entity.options.chunkSize,
      parallelism: this.entity.options.parallelism,
    };
  }
}

class StartBatchConversionJobsRequestDTO extends HiCTAPIRequestDTO<StartBatchConversionJobsRequest> {
  toDTO(): Record<string, unknown> {
    return {
      files: this.entity.options.files,
      parallelJobs: this.entity.options.parallelJobs,
      parallelism: this.entity.options.parallelism,
      overwrite: this.entity.options.overwrite,
      resolutions: this.entity.options.resolutions,
      compression: this.entity.options.compression,
      compressionAlgorithm: this.entity.options.compressionAlgorithm,
      chunkSize: this.entity.options.chunkSize,
    };
  }
}

class ListConversionJobsRequestDTO extends HiCTAPIRequestDTO<ListConversionJobsRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class GetConversionJobRequestDTO extends HiCTAPIRequestDTO<GetConversionJobRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class StopConversionJobRequestDTO extends HiCTAPIRequestDTO<StopConversionJobRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class RenameContigRequestDTO extends HiCTAPIRequestDTO<RenameContigRequest> {
  toDTO(): Record<string, unknown> {
    return {
      contigId: this.entity.options.contigId,
      newName: this.entity.options.newName,
    };
  }
}

class RenameScaffoldRequestDTO extends HiCTAPIRequestDTO<RenameScaffoldRequest> {
  toDTO(): Record<string, unknown> {
    return {
      scaffoldId: this.entity.options.scaffoldId,
      newName: this.entity.options.newName,
    };
  }
}

class ExportNameMappingRequestDTO extends HiCTAPIRequestDTO<ExportNameMappingRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class ImportNameMappingRequestDTO extends HiCTAPIRequestDTO<ImportNameMappingRequest> {
  toDTO(): Record<string, unknown> {
    return {
      contigs: this.entity.options.contigs,
      scaffolds: this.entity.options.scaffolds,
    };
  }
}

class ReloadTilesRequestDTO extends HiCTAPIRequestDTO<ReloadTilesRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class MoveSelectionRangeRequestDTO extends HiCTAPIRequestDTO<MoveSelectionRangeRequest> {
  toDTO(): Record<string, unknown> {
    return {
      startBP: this.entity.options.startBP,
      endBP: this.entity.options.endBP,
      targetStartBP: this.entity.options.targetStartBP,
    };
  }
}

class SplitContigRequestDTO extends HiCTAPIRequestDTO<SplitContigRequest> {
  toDTO(): Record<string, unknown> {
    return {
      splitPx: this.entity.options.splitPx,
      bpResolution: this.entity.options.bpResolution,
    };
  }
}

class OpenFileRequestDTO extends HiCTAPIRequestDTO<OpenFileRequest> {
  toDTO(): Record<string, unknown> {
    return {
      filename: this.entity.options.filename,
      fastaFilename: this.entity.options.fastaFilename,
    };
  }
}

class SaveFileRequestDTO extends HiCTAPIRequestDTO<SaveFileRequest> {
  toDTO(): Record<string, unknown> {
    return {
      filename: this.entity.options.filename,
    };
  }
}

class LinkFASTARequestDTO extends HiCTAPIRequestDTO<LinkFASTARequest> {
  toDTO(): Record<string, unknown> {
    return {
      fastaFilename: this.entity.options.fastaFilename,
      allowMismatch: this.entity.options.allowMismatch,
    };
  }
}
class LoadAGPRequestDTO extends HiCTAPIRequestDTO<LoadAGPRequest> {
  toDTO(): Record<string, unknown> {
    return {
      agpFilename: this.entity.options.agpFilename,
    };
  }
}

class GroupContigsIntoScaffoldRequestDTO extends HiCTAPIRequestDTO<GroupContigsIntoScaffoldRequest> {
  toDTO(): Record<string, unknown> {
    return {
      startBP: this.entity.options.startBP,
      endBP: this.entity.options.endBP,
      scaffoldName: this.entity.options.newScaffoldName,
      spacerLength: this.entity.options.spacerLength,
    };
  }
}

class SetNormalizationRequestDTO extends HiCTAPIRequestDTO<SetNormalizationRequest> {
  toDTO(): Record<string, unknown> {
    return this.entity.options.normalizationSettings as unknown as Record<
      string,
      unknown
    >;
  }
}

class SetContrastRangeRequestDTO extends HiCTAPIRequestDTO<SetContrastRangeRequest> {
  toDTO(): Record<string, unknown> {
    return this.entity.options.contrastRangeSettings as unknown as Record<
      string,
      unknown
    >;
  }
}

class GetCurrentSignalRangeRequestDTO extends HiCTAPIRequestDTO<GetCurrentSignalRangeRequest> {
  toDTO(): Record<string, unknown> {
    return this.entity.options;
  }
}

class UngroupContigsFromScaffoldRequestDTO extends HiCTAPIRequestDTO<UngroupContigsFromScaffoldRequest> {
  toDTO(): Record<string, unknown> {
    return {
      startBP: this.entity.options.startBP,
      endBP: this.entity.options.endBP,
    };
  }
}

class MoveSelectionToDebrisRequestDTO extends HiCTAPIRequestDTO<MoveSelectionToDebrisRequest> {
  toDTO(): Record<string, unknown> {
    return {
      startBP: this.entity.options.startBP,
      endBP: this.entity.options.endBP,
    };
  }
}

class ListFilesRequestDTO extends HiCTAPIRequestDTO<ListFilesRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class ListFilesDetailedRequestDTO extends HiCTAPIRequestDTO<ListFilesDetailedRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class ListCoolerFilesRequestDTO extends HiCTAPIRequestDTO<ListCoolerFilesRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class ListTrackFilesRequestDTO extends HiCTAPIRequestDTO<ListTrackFilesRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class OpenTrackRequestDTO extends HiCTAPIRequestDTO<OpenTrackRequest> {
  toDTO(): Record<string, unknown> {
    return {
      filename: this.entity.options.filename,
      name: this.entity.options.name,
      color: this.entity.options.color,
    };
  }
}

class OpenCoolerWeightsTrackRequestDTO extends HiCTAPIRequestDTO<OpenCoolerWeightsTrackRequest> {
  toDTO(): Record<string, unknown> {
    return {
      name: this.entity.options.name,
      color: this.entity.options.color,
    };
  }
}

class ProbeTrackCompatibilityRequestDTO extends HiCTAPIRequestDTO<ProbeTrackCompatibilityRequest> {
  toDTO(): Record<string, unknown> {
    return {
      filename: this.entity.options.filename,
    };
  }
}

class ListTracksRequestDTO extends HiCTAPIRequestDTO<ListTracksRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class UpdateTrackRequestDTO extends HiCTAPIRequestDTO<UpdateTrackRequest> {
  toDTO(): Record<string, unknown> {
    return {
      trackId: this.entity.options.trackId,
      visible: this.entity.options.visible,
      color: this.entity.options.color,
      name: this.entity.options.name,
      renderMode: this.entity.options.renderMode,
      aggregationMode: this.entity.options.aggregationMode,
      logScale: this.entity.options.logScale,
    };
  }
}

class RemoveTrackRequestDTO extends HiCTAPIRequestDTO<RemoveTrackRequest> {
  toDTO(): Record<string, unknown> {
    return {
      trackId: this.entity.options.trackId,
    };
  }
}

class QueryTracks1DRequestDTO extends HiCTAPIRequestDTO<QueryTracks1DRequest> {
  toDTO(): Record<string, unknown> {
    const dto: Record<string, unknown> = {
      widthPx: this.entity.options.widthPx,
      bpResolution: this.entity.options.bpResolution,
    };
    if (this.entity.options.unit) {
      dto.unit = this.entity.options.unit;
    }
    if (this.entity.options.startPx !== undefined) {
      dto.startPx = this.entity.options.startPx;
    }
    if (this.entity.options.endPx !== undefined) {
      dto.endPx = this.entity.options.endPx;
    }
    if (this.entity.options.startBin !== undefined) {
      dto.startBin = this.entity.options.startBin;
    }
    if (this.entity.options.endBin !== undefined) {
      dto.endBin = this.entity.options.endBin;
    }
    if (this.entity.options.startBP !== undefined) {
      dto.startBP = this.entity.options.startBP;
    }
    if (this.entity.options.endBP !== undefined) {
      dto.endBP = this.entity.options.endBP;
    }
    return dto;
  }
}

class StartTracksPrecomputeRequestDTO extends HiCTAPIRequestDTO<StartTracksPrecomputeRequest> {
  toDTO(): Record<string, unknown> {
    return {
      trackId: this.entity.options.trackId,
      force: this.entity.options.force,
    };
  }
}

class GetTracksPrecomputeStatusRequestDTO extends HiCTAPIRequestDTO<GetTracksPrecomputeStatusRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class ListFASTAFilesRequestDTO extends HiCTAPIRequestDTO<ListFASTAFilesRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}
class ListAGPFilesRequestDTO extends HiCTAPIRequestDTO<ListAGPFilesRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class CloseFileRequestDTO extends HiCTAPIRequestDTO<CloseFileRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class AttachSessionRequestDTO extends HiCTAPIRequestDTO<AttachSessionRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class GetFastaForAssemblyRequestDTO extends HiCTAPIRequestDTO<GetFastaForAssemblyRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}
class GetAGPForAssemblyRequestDTO extends HiCTAPIRequestDTO<GetFastaForAssemblyRequest> {
  toDTO(): Record<string, unknown> {
    return {};
  }
}

class GetFastaForSelectionRequestDTO extends HiCTAPIRequestDTO<GetFastaForSelectionRequest> {
  toDTO(): Record<string, unknown> {
    return {
      fromBpX: this.entity.options.fromBpX,
      fromBpY: this.entity.options.fromBpY,
      toBpX: this.entity.options.toBpX,
      toBpY: this.entity.options.toBpY,
    };
  }
}

export {
  HiCTAPIRequestDTO,
  OpenFileRequestDTO,
  ListFilesRequestDTO,
  ListFilesDetailedRequestDTO,
  CloseFileRequestDTO,
  AttachSessionRequestDTO,
  StartConversionJobRequestDTO,
  StartBatchConversionJobsRequestDTO,
  ListConversionJobsRequestDTO,
  GetConversionJobRequestDTO,
  StopConversionJobRequestDTO,
  RenameContigRequestDTO,
  RenameScaffoldRequestDTO,
  ExportNameMappingRequestDTO,
  ImportNameMappingRequestDTO,
  ReloadTilesRequestDTO,
  GetFastaForAssemblyRequestDTO,
  GetAGPForAssemblyRequestDTO,
  GroupContigsIntoScaffoldRequestDTO,
  UngroupContigsFromScaffoldRequestDTO,
  ReverseSelectionRangeRequestDTO,
  SetNormalizationRequestDTO,
  SetContrastRangeRequestDTO,
  GetCurrentSignalRangeRequestDTO,
  SaveFileRequestDTO,
  ListTrackFilesRequestDTO,
  OpenTrackRequestDTO,
  ProbeTrackCompatibilityRequestDTO,
  ListTracksRequestDTO,
  UpdateTrackRequestDTO,
  RemoveTrackRequestDTO,
  QueryTracks1DRequestDTO,
  StartTracksPrecomputeRequestDTO,
  GetTracksPrecomputeStatusRequestDTO,
  ListCoolerFilesRequestDTO,
  SplitContigRequestDTO,
  MoveSelectionToDebrisRequestDTO,
  GetVisualizationOptionsRequestDTO,
  SetVisualizationOptionsRequestDTO,
  GetWorkerDiagnosticsRequestDTO,
};
