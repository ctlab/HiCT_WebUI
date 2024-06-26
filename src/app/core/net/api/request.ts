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

class GetConverterStatusRequest implements HiCTAPIRequest {
  requestPath = "/converter_status";
}

class CloseFileRequest implements HiCTAPIRequest {
  requestPath = "/close";
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

class ConvertCoolerRequest implements HiCTAPIRequest {
  requestPath = "/convert_cooler";

  public constructor(
    public readonly options: {
      readonly cooler_filename: string;
    }
  ) {}
}

class SetContrastRangeRequest implements HiCTAPIRequest {
  requestPath = "/set_contrast_range";

  public constructor(
    public readonly options: {
      readonly contrastRangeSettings: ContrastRangeSettings;
    }
  ) {}
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
  CloseFileRequest,
  ListCoolerFilesRequest,
  ConvertCoolerRequest,
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
  GetFastaForSelectionRequest,
  SetNormalizationRequest,
  SetContrastRangeRequest,
  GetCurrentSignalRangeRequest,
  SaveFileRequest,
  GetConverterStatusRequest,
  SplitContigRequest,
  // TileLoadPOSTRequest,
  MoveSelectionToDebrisRequest,
  GetVisualizationOptionsRequest,
  SetVisualizationOptionsRequest,
};
