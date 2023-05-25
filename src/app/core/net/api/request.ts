import {
  ContrastRangeSettings,
  NormalizationSettings,
} from "@/app/ui/components/ComponentCommon";
import assert from "assert";
import { ImageTile, Tile } from "ol";
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

class ListBedTracksRequest implements HiCTAPIRequest {
  requestPath = "/list_bed_tracks";
}

class ListFASTAFilesRequest implements HiCTAPIRequest {
  requestPath = "/list_fasta_files";
}

class ListAGPFilesRequest implements HiCTAPIRequest {
  requestPath = "/list_agp_files";
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
      readonly startContigId: number;
      readonly endContigId: number;
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
      readonly startContigId: number;
      readonly endContigId: number;
    }
  ) {}
}

class ReverseSelectionRangeRequest implements HiCTAPIRequest {
  requestPath = "/reverse_selection_range";

  public constructor(
    public readonly options: {
      readonly startContigId: number;
      readonly endContigId: number;
    }
  ) {}
}

class MoveSelectionRangeRequest implements HiCTAPIRequest {
  requestPath = "/move_selection_range";

  public constructor(
    public readonly options: {
      readonly startContigId: number;
      readonly endContigId: number;
      readonly targetStartOrder: number;
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
  GetFastaForAssemblyRequest,
  GetAGPForAssemblyRequest,
  OpenFileRequest,
  ListFilesRequest,
  ListBedTracksRequest,
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
  // TileLoadPOSTRequest,
};
