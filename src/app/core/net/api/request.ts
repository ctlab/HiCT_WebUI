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

class ListFilesDetailedRequest implements HiCTAPIRequest {
  requestPath = "/list_files_detailed";
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

class ListConvertibleMatrixFilesRequest implements HiCTAPIRequest {
  requestPath = "/list_convertible_matrices";
}

class ListTrackFilesRequest implements HiCTAPIRequest {
  requestPath = "/tracks/list_files";
}

class ResolveMatrixSourceRequest implements HiCTAPIRequest {
  requestPath = "/resolve_matrix_source";

  public constructor(
    public readonly options: {
      readonly filename: string;
    }
  ) {}
}

class DropAllCachesRequest implements HiCTAPIRequest {
  requestPath = "/cache/drop_all";
}

class CloseFileRequest implements HiCTAPIRequest {
  requestPath = "/close";
}

class AttachSessionRequest implements HiCTAPIRequest {
  requestPath = "/attach";
}

class GetFastaForAssemblyRequest implements HiCTAPIRequest {
  requestPath = "/get_fasta_for_assembly";

  public constructor(
    public readonly options: {
      readonly source?: "PRIMARY" | "SECONDARY";
    } = {}
  ) {}
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
      readonly assemblyFilename?: string;
      readonly direction?: string;
      readonly overwrite?: boolean;
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
      readonly assemblyFilename?: string;
      readonly assemblyFilenameByFile?: Record<string, string>;
      readonly parallelJobs: number;
      readonly parallelism: number;
      readonly overwrite?: boolean;
      readonly resolutions?: string;
      readonly compression?: number;
      readonly compressionAlgorithm?: string;
      readonly chunkSize?: number;
    }
  ) {}
}

class ConvertAssemblyToAgpRequest implements HiCTAPIRequest {
  requestPath = "/convert/assembly-to-agp";

  public constructor(
    public readonly options: {
      readonly filename: string;
      readonly outputFilename?: string;
      readonly overwrite?: boolean;
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

class GetConversionToolchainStatusRequest implements HiCTAPIRequest {
  requestPath = "/convert/toolchain";
}

class SetDotplotAlignerPreferenceRequest implements HiCTAPIRequest {
  requestPath = "/convert/toolchain/dotplot-aligner";

  public constructor(public readonly alignerPreference: string) {}
}

class StartDotplotJobsRequest implements HiCTAPIRequest {
  requestPath = "/dotplot/jobs";

  public constructor(
    public readonly options: {
      readonly fastaFiles: string[];
      readonly outputDirectory?: string;
      readonly binSize: number;
      readonly resolutions?: string;
      readonly referenceMapFilename?: string;
      readonly assemblyAgpFilename?: string;
      readonly minimizerK: number;
      readonly minimizerWindow: number;
      readonly minChainScore: number;
      readonly skipDiagonal: boolean;
      readonly dropNearDiagonalBins: number;
      readonly sampleBp?: number;
      readonly minAlignmentLength?: number;
      readonly extraMinimap2Args?: string;
      readonly alignerPreference?: string;
      readonly alignmentThreads: number;
      readonly conversionThreads: number;
      readonly overwrite?: boolean;
    }
  ) {}
}

class ListDotplotJobsRequest implements HiCTAPIRequest {
  requestPath = "/dotplot/jobs/list";
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
      readonly horizontalSource?: "PRIMARY" | "SECONDARY";
      readonly verticalSource?: "PRIMARY" | "SECONDARY";
    }
  ) {}
}

class LinkFASTARequest implements HiCTAPIRequest {
  requestPath = "/link_fasta";

  public constructor(
    public readonly options: {
      readonly fastaFilename: string;
      readonly allowMismatch?: boolean;
      readonly source?: "PRIMARY" | "SECONDARY";
    }
  ) {}
}

class LoadAGPRequest implements HiCTAPIRequest {
  requestPath = "/load_agp";

  public constructor(
    public readonly options: {
      readonly agpFilename: string;
      readonly source?: "PRIMARY" | "SECONDARY";
    }
  ) {}
}

class ApplyJuiceboxAssemblyRequest implements HiCTAPIRequest {
  requestPath = "/apply_juicebox_assembly";

  public constructor(
    public readonly options: {
      readonly assemblyFilename: string;
      readonly fastaFilename?: string;
      readonly source?: "PRIMARY" | "SECONDARY";
    }
  ) {}
}

class OpenProgressRequest implements HiCTAPIRequest {
  requestPath = "/open_progress";
  public constructor() {}
}

class OpenSecondarySourceRequest implements HiCTAPIRequest {
  requestPath = "/secondary/open";

  public constructor(
    public readonly options: {
      readonly filename: string;
      readonly allowMismatch?: boolean;
    }
  ) {}
}

class CloseSecondarySourceRequest implements HiCTAPIRequest {
  requestPath = "/secondary/close";
}

class GetSecondarySourceStatusRequest implements HiCTAPIRequest {
  requestPath = "/secondary/status";
}

class SetAssemblyInfoSourceRequest implements HiCTAPIRequest {
  requestPath = "/secondary/set_assembly_source";

  public constructor(
    public readonly options: {
      readonly assemblySource: "PRIMARY" | "SECONDARY";
    }
  ) {}
}

class GetWorkerDiagnosticsRequest implements HiCTAPIRequest {
  requestPath = "/diagnostics/workers";
}

class GetNativeProcessingStatusRequest implements HiCTAPIRequest {
  requestPath = "/native_processing/status";
}

class GetServerStatisticsRequest implements HiCTAPIRequest {
  requestPath = "/statistics";
}

class SetNativeProcessingEnabledRequest implements HiCTAPIRequest {
  requestPath = "/native_processing/enabled";

  public constructor(
    public readonly options: {
      readonly enabled: boolean;
    }
  ) {}
}

class GetRenderPipelineRequest implements HiCTAPIRequest {
  requestPath = "/render_pipeline/get";
}

class SetRenderPipelineRequest implements HiCTAPIRequest {
  requestPath = "/render_pipeline/set";

  public constructor(
    public readonly options: Record<string, unknown>
  ) {}
}

class ResetRenderPipelineRequest implements HiCTAPIRequest {
  requestPath = "/render_pipeline/reset";
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
      preserveRenderPipeline?: boolean;
    }
  ) {}
}

class SetViewportExpectedProfileRequest implements HiCTAPIRequest {
  requestPath = "/visualization/expected_profile";

  public constructor(
    public readonly options: {
      readonly bpResolution: number;
      readonly startRowPx: number;
      readonly endRowPx: number;
      readonly startColPx: number;
      readonly endColPx: number;
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

class OpenCoolerWeightsTrackRequest implements HiCTAPIRequest {
  requestPath = "/tracks/open_cooler_weights";

  public constructor(
    public readonly options: {
      readonly name?: string;
      readonly color?: string;
      readonly source?: "PRIMARY" | "SECONDARY";
    } = {}
  ) {}
}

class ProbeTrackCompatibilityRequest implements HiCTAPIRequest {
  requestPath = "/tracks/probe";

  public constructor(
    public readonly options: {
      readonly filename: string;
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
      readonly logScale?: boolean;
      readonly rangeAuto?: boolean;
      readonly rangeMin?: number;
      readonly rangeMax?: number;
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

class ReorderTrackRequest implements HiCTAPIRequest {
  requestPath = "/tracks/reorder";

  public constructor(
    public readonly options: {
      readonly trackId: string;
      readonly targetIndex: number;
    }
  ) {}
}

class QueryTracks1DRequest implements HiCTAPIRequest {
  requestPath = "/tracks/query_1d";

  public constructor(
    public readonly options: {
      readonly startPx?: number;
      readonly endPx?: number;
      readonly startBin?: number;
      readonly endBin?: number;
      readonly startBP?: number;
      readonly endBP?: number;
      readonly unit?: "PIXELS" | "BINS" | "BP";
      readonly widthPx: number;
      readonly bpResolution: number;
    }
  ) {}
}

class SearchTrackFeaturesRequest implements HiCTAPIRequest {
  requestPath = "/tracks/search_features";

  public constructor(
    public readonly options: {
      readonly query: string;
      readonly limit?: number;
      readonly offset?: number;
      readonly trackId?: string;
    }
  ) {}
}

class GetTrackFeatureContextRequest implements HiCTAPIRequest {
  requestPath = "/tracks/feature_context";

  public constructor(
    public readonly options: {
      readonly startPx?: number;
      readonly endPx?: number;
      readonly startBin?: number;
      readonly endBin?: number;
      readonly startBP?: number;
      readonly endBP?: number;
      readonly unit?: "PIXELS" | "BINS" | "BP";
      readonly widthPx: number;
      readonly bpResolution: number;
      readonly marginScreens?: number;
    }
  ) {}
}

class StartTracksPrecomputeRequest implements HiCTAPIRequest {
  requestPath = "/tracks/precompute/start";

  public constructor(
    public readonly options: {
      readonly trackId?: string;
      readonly force?: boolean;
    } = {}
  ) {}
}

class GetTracksPrecomputeStatusRequest implements HiCTAPIRequest {
  requestPath = "/tracks/precompute/status";
}

class ProbeTrackPrecomputeCacheRequest implements HiCTAPIRequest {
  requestPath = "/tracks/precompute/probe";

  public constructor(
    public readonly options: {
      readonly filename: string;
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
  ListConvertibleMatrixFilesRequest,
  ResolveMatrixSourceRequest,
  DropAllCachesRequest,
  StartConversionJobRequest,
  StartBatchConversionJobsRequest,
  ConvertAssemblyToAgpRequest,
  ListConversionJobsRequest,
  GetConversionJobRequest,
  StopConversionJobRequest,
  GetConversionToolchainStatusRequest,
  SetDotplotAlignerPreferenceRequest,
  StartDotplotJobsRequest,
  ListDotplotJobsRequest,
  RenameContigRequest,
  RenameScaffoldRequest,
  ExportNameMappingRequest,
  ImportNameMappingRequest,
  ReloadTilesRequest,
  GetFastaForAssemblyRequest,
  GetAGPForAssemblyRequest,
  OpenFileRequest,
  ListFilesRequest,
  ListFilesDetailedRequest,
  GroupContigsIntoScaffoldRequest,
  UngroupContigsFromScaffoldRequest,
  ReverseSelectionRangeRequest,
  ListFASTAFilesRequest,
  LinkFASTARequest,
  MoveSelectionRangeRequest,
  ListAGPFilesRequest,
  LoadAGPRequest,
  ApplyJuiceboxAssemblyRequest,
  OpenProgressRequest,
  OpenSecondarySourceRequest,
  CloseSecondarySourceRequest,
  GetSecondarySourceStatusRequest,
  SetAssemblyInfoSourceRequest,
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
  SetViewportExpectedProfileRequest,
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
};
