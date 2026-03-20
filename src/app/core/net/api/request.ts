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
  ContrastRangeSettings,
  NormalizationSettings,
} from "@/app/ui/components/ComponentCommon";
import assert from "assert";
import { ImageTile, Tile } from "ol";
import { VisualizationOptionsDTO } from "../dto/dto";
import VisualizationOptions from "../../visualization/VisualizationOptions";
interface HiCTAPIRequest {
  requestPath: string;
}

class OpenFileRequest implements HiCTAPIRequest {
  requestPath = "/open";

  public constructor(
    public readonly options: {
      readonly filename: string;
      readonly fastaFilename?: string | undefined;
    }
  ) {}
}

class SaveFileRequest implements HiCTAPIRequest {
  requestPath = "/save";

  public constructor(
    public readonly options: {
      readonly filename?: string;
      // readonly fastaFilename?: string | undefined;
    }
  ) {}
}

class ListFilesRequest implements HiCTAPIRequest {
  requestPath = "/list_files";
}

class ListFASTAFilesRequest implements HiCTAPIRequest {
  requestPath = "/list_fasta_files";
}

class ListAGPFilesRequest implements HiCTAPIRequest {
  requestPath = "/list_agp_files";
}

class ListCoolerFilesRequest implements HiCTAPIRequest {
  requestPath = "/list_coolers";
}

class ListTrackFilesRequest implements HiCTAPIRequest {
  requestPath = "/tracks/list_files";
}

class CloseFileRequest implements HiCTAPIRequest {
  requestPath = "/close";
}

class AttachSessionRequest implements HiCTAPIRequest {
  requestPath = "/attach";
}

class GetFastaForAssemblyRequest implements HiCTAPIRequest {
  requestPath = "/get_fasta_for_assembly";
}

class GetAGPForAssemblyRequest implements HiCTAPIRequest {
  requestPath = "/get_agp_for_assembly";
}

class GroupContigsIntoScaffoldRequest implements HiCTAPIRequest {
  requestPath = "/group_contigs_into_scaffold";

  public constructor(
    public readonly options: {
      readonly startBP: number;
      readonly endBP: number;
      readonly newScaffoldName?: string;
      readonly spacerLength?: number;
    }
  ) {}
}

class SetNormalizationRequest implements HiCTAPIRequest {
  requestPath = "/set_normalization";

  public constructor(
    public readonly options: {
      readonly normalizationSettings: NormalizationSettings;
    }
  ) {}
}

class RenameContigRequest implements HiCTAPIRequest {
  requestPath = "/names/contig";

  public constructor(
    public readonly options: {
      readonly contigId: number;
      readonly newName: string | null;
    }
  ) {}
}

class RenameScaffoldRequest implements HiCTAPIRequest {
  requestPath = "/names/scaffold";

  public constructor(
    public readonly options: {
      readonly scaffoldId: number;
      readonly newName: string | null;
    }
  ) {}
}

class ExportNameMappingRequest implements HiCTAPIRequest {
  requestPath = "/names/export";
}

class ImportNameMappingRequest implements HiCTAPIRequest {
  requestPath = "/names/import";

  public constructor(
    public readonly options: {
      readonly contigs: { contigId: number; name: string }[];
      readonly scaffolds: { scaffoldId: number; name: string }[];
    }
  ) {}
}

class StartConversionJobRequest implements HiCTAPIRequest {
  requestPath = "/convert/jobs";

  public constructor(
    public readonly options: {
      readonly filename: string;
      readonly direction?: string;
      readonly resolutions?: string;
      readonly compression?: number;
      readonly compressionAlgorithm?: string;
      readonly chunkSize?: number;
      readonly parallelism?: number;
    }
  ) {}
}

class StartBatchConversionJobsRequest implements HiCTAPIRequest {
  requestPath = "/convert/jobs/batch";

  public constructor(
    public readonly options: {
      readonly files: string[];
      readonly parallelJobs: number;
      readonly parallelism: number;
      readonly resolutions?: string;
      readonly compression?: number;
      readonly compressionAlgorithm?: string;
      readonly chunkSize?: number;
    }
  ) {}
}

class ListConversionJobsRequest implements HiCTAPIRequest {
  requestPath = "/convert/jobs/list";
}

class GetConversionJobRequest implements HiCTAPIRequest {
  public requestPath: string;
  public constructor(public readonly jobId: string) {
    this.requestPath = `/convert/jobs/${jobId}`;
  }
}

class StopConversionJobRequest implements HiCTAPIRequest {
  public requestPath: string;
  public constructor(public readonly jobId: string) {
    this.requestPath = `/convert/jobs/${jobId}/stop`;
  }
}

class SetContrastRangeRequest implements HiCTAPIRequest {
  requestPath = "/set_contrast_range";

  public constructor(
    public readonly options: {
      readonly contrastRangeSettings: ContrastRangeSettings;
    }
  ) {}
}

class ReloadTilesRequest implements HiCTAPIRequest {
  requestPath = "/tiles/reload";
}

class GetCurrentSignalRangeRequest implements HiCTAPIRequest {
  requestPath = "/get_current_signal_range";

  public constructor(
    public readonly options: {
      readonly tileVersion: number;
    }
  ) {}
}

class UngroupContigsFromScaffoldRequest implements HiCTAPIRequest {
  requestPath = "/ungroup_contigs_from_scaffold";

  public constructor(
    public readonly options: {
      readonly startBP: number;
      readonly endBP: number;
    }
  ) {}
}

class MoveSelectionToDebrisRequest implements HiCTAPIRequest {
  requestPath = "/move_selection_to_debris";

  public constructor(
    public readonly options: {
      readonly startBP: number;
      readonly endBP: number;
    }
  ) {}
}

class ReverseSelectionRangeRequest implements HiCTAPIRequest {
  requestPath = "/reverse_selection_range";

  public constructor(
    public readonly options: {
      readonly startBP: number;
      readonly endBP: number;
    }
  ) {}
}

class MoveSelectionRangeRequest implements HiCTAPIRequest {
  requestPath = "/move_selection_range";

  public constructor(
    public readonly options: {
      readonly startBP: number;
      readonly endBP: number;
      readonly targetStartBP: number;
    }
  ) {}
}

class SplitContigRequest implements HiCTAPIRequest {
  requestPath = "/split_contig_at_bin";

  public constructor(
    public readonly options: {
      readonly splitPx: number;
      readonly bpResolution: number;
    }
  ) {}
}

class GetFastaForSelectionRequest implements HiCTAPIRequest {
  requestPath = "/get_fasta_for_selection";

  public constructor(
    public readonly options: {
      readonly fromBpX: number;
      readonly fromBpY: number;
      readonly toBpX: number;
      readonly toBpY: number;
    }
  ) {}
}

class LinkFASTARequest implements HiCTAPIRequest {
  requestPath = "/link_fasta";

  public constructor(
    public readonly options: {
      readonly fastaFilename: string;
      readonly allowMismatch?: boolean;
    }
  ) {}
}

class LoadAGPRequest implements HiCTAPIRequest {
  requestPath = "/load_agp";

  public constructor(
    public readonly options: {
      readonly agpFilename: string;
    }
  ) {}
}

class OpenProgressRequest implements HiCTAPIRequest {
  requestPath = "/open_progress";
  public constructor() {}
}

class GetVisualizationOptionsRequest implements HiCTAPIRequest {
  requestPath = "/get_visualization_options";

  public constructor(public readonly options: Record<string, never>) {}
}

class SetVisualizationOptionsRequest implements HiCTAPIRequest {
  requestPath = "/set_visualization_options";

  public constructor(
    public readonly options: {
      options: VisualizationOptions;
    }
  ) {}
}

class OpenTrackRequest implements HiCTAPIRequest {
  requestPath = "/tracks/open";

  public constructor(
    public readonly options: {
      readonly filename: string;
      readonly name?: string;
      readonly color?: string;
    }
  ) {}
}

class ListTracksRequest implements HiCTAPIRequest {
  requestPath = "/tracks/list";
}

class UpdateTrackRequest implements HiCTAPIRequest {
  requestPath = "/tracks/update";

  public constructor(
    public readonly options: {
      readonly trackId: string;
      readonly visible?: boolean;
      readonly color?: string;
      readonly name?: string;
      readonly renderMode?: string;
      readonly aggregationMode?: string;
    }
  ) {}
}

class RemoveTrackRequest implements HiCTAPIRequest {
  requestPath = "/tracks/remove";

  public constructor(
    public readonly options: {
      readonly trackId: string;
    }
  ) {}
}

class QueryTracks1DRequest implements HiCTAPIRequest {
  requestPath = "/tracks/query_1d";

  public constructor(
    public readonly options: {
      readonly startBp: number;
      readonly endBp: number;
      readonly widthPx: number;
    }
  ) {}
}

// class TileLoadPOSTRequest implements HiCTAPIRequest {
//   requestPath = "/get_tile";

//   public constructor(
//     public readonly options: {
//       readonly tile: Tile;
//       readonly requestSrc: string;
//     }
//   ){
//     assert(this.options.tile instanceof ImageTile, "TileLoadPOSTRequest is only applicable for loading ImageTiles");
//   }
// }

export {
  type HiCTAPIRequest,
  AttachSessionRequest,
  CloseFileRequest,
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
  GetFastaForAssemblyRequest,
  GetAGPForAssemblyRequest,
  OpenFileRequest,
  ListFilesRequest,
  GroupContigsIntoScaffoldRequest,
  UngroupContigsFromScaffoldRequest,
  ReverseSelectionRangeRequest,
  ListFASTAFilesRequest,
  LinkFASTARequest,
  MoveSelectionRangeRequest,
  ListAGPFilesRequest,
  LoadAGPRequest,
  OpenProgressRequest,
  GetFastaForSelectionRequest,
  SetNormalizationRequest,
  SetContrastRangeRequest,
  GetCurrentSignalRangeRequest,
  SaveFileRequest,
  SplitContigRequest,
  // TileLoadPOSTRequest,
  MoveSelectionToDebrisRequest,
  GetVisualizationOptionsRequest,
  SetVisualizationOptionsRequest,
  ListTrackFilesRequest,
  OpenTrackRequest,
  ListTracksRequest,
  UpdateTrackRequest,
  RemoveTrackRequest,
  QueryTracks1DRequest,
};
