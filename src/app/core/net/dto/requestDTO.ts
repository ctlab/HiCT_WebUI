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

import {
  ListFilesRequest,
  OpenFileRequest,
  CloseFileRequest,
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
  GetFastaForSelectionRequest,
  SetNormalizationRequest,
  SetContrastRangeRequest,
  GetCurrentSignalRangeRequest,
  SaveFileRequest,
  GetAGPForAssemblyRequest,
  ListCoolerFilesRequest,
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
      case entity instanceof ListCoolerFilesRequest:
        return new ListCoolerFilesRequestDTO(entity);
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
      case entity instanceof CloseFileRequest:
        return new CloseFileRequestDTO(entity as CloseFileRequest);
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

class ListCoolerFilesRequestDTO extends HiCTAPIRequestDTO<ListCoolerFilesRequest> {
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
  CloseFileRequestDTO,
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
  ListCoolerFilesRequestDTO,
  SplitContigRequestDTO,
  MoveSelectionToDebrisRequestDTO,
  GetVisualizationOptionsRequestDTO,
  SetVisualizationOptionsRequestDTO,
};
