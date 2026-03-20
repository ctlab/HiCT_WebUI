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
  ConversionJobResponse,
  CurrentSignalRangeResponse,
  FastaLinkCompatibilityResponse,
  FastaLinkMismatchResponse,
  FastaLinkResponse,
  NameMappingResponse,
  TrackBinResponse,
  TrackQueryResponse,
  TrackRenderResponse,
  TrackSummaryResponse,
  TilePOSTResponse,
} from "../api/response";
import { InboundDTO } from "./dto";

class CurrentSignalRangeResponseDTO extends InboundDTO<CurrentSignalRangeResponse> {
  public toEntity(): CurrentSignalRangeResponse {
    const minSignalAtLevel: number[] = [];
    Object.entries(this.json.lowerBounds as object).forEach((kv) => {
      const [indexString, value] = kv;
      const indexInt: number = Number.parseInt(indexString);
      if (Number.isFinite(indexInt)) {
        minSignalAtLevel[indexInt] = Number.parseInt(value);
      }
    });
    const maxSignalAtLevel: number[] = [];
    Object.entries(this.json.upperBounds as object).forEach((kv) => {
      const [indexString, value] = kv;
      const indexInt: number = Number.parseInt(indexString);
      if (Number.isFinite(indexInt)) {
        maxSignalAtLevel[indexInt] = Number.parseInt(value);
      }
    });
    return {
      minSignalAtLevel: minSignalAtLevel,
      maxSignalAtLevel: maxSignalAtLevel,
      globalMinSignal: Math.min(
        ...minSignalAtLevel.filter((v) => Number.isFinite(v))
      ),
      globalMaxSignal: Math.max(
        ...maxSignalAtLevel.filter((v) => Number.isFinite(v))
      ),
    };
  }
}

class TilePOSTResponseDTO extends InboundDTO<TilePOSTResponse> {
  public toEntity(): TilePOSTResponse {
    return new TilePOSTResponse(
      this.json.image as string,
      new CurrentSignalRangeResponseDTO(
        this.json.ranges as Record<string, unknown>
      ).toEntity()
    );
  }
}

class ConversionJobResponseDTO extends InboundDTO<ConversionJobResponse> {
  public toEntity(): ConversionJobResponse {
    return new ConversionJobResponse(
      this.json["jobId"] as string,
      this.json["status"] as string,
      this.json["sourceFilename"] as string,
      this.json["outputFilename"] as string,
      this.json["direction"] as string,
      this.json["overallProgress"] as number,
      this.json["resolutionProgress"] as number,
      this.json["currentResolution"] as number,
      this.json["elapsedMillis"] as number,
      this.json["etaMillis"] as number,
      this.json["resolutionElapsedMillis"] as number,
      this.json["resolutionEtaMillis"] as number,
      this.json["inputSizeBytes"] as number,
      this.json["outputSizeBytes"] as number,
      (this.json["logs"] as string[]) ?? [],
      (this.json["error"] as string) ?? ""
    );
  }
}

class NameMappingResponseDTO extends InboundDTO<NameMappingResponse> {
  public toEntity(): NameMappingResponse {
    return new NameMappingResponse(
      (this.json["contigs"] as Record<string, unknown>[]).map((item) => ({
        contigId: item["contigId"] as number,
        originalName: item["originalName"] as string,
        name: item["name"] as string,
      })),
      (this.json["scaffolds"] as Record<string, unknown>[]).map((item) => ({
        scaffoldId: item["scaffoldId"] as number,
        originalName: item["originalName"] as string,
        name: item["name"] as string,
      }))
    );
  }
}

class TrackSummaryResponseDTO extends InboundDTO<TrackSummaryResponse> {
  public toEntity(): TrackSummaryResponse {
    return new TrackSummaryResponse(
      this.json["trackId"] as string,
      this.json["name"] as string,
      this.json["type"] as string,
      this.json["sourceFile"] as string,
      this.json["color"] as string,
      this.json["visible"] as boolean,
      this.json["featureCount"] as number,
      (this.json["renderMode"] as string) ?? "COVERAGE",
      (this.json["aggregationMode"] as string) ?? "MAX"
    );
  }
}

class TrackBinResponseDTO extends InboundDTO<TrackBinResponse> {
  public toEntity(): TrackBinResponse {
    return new TrackBinResponse(
      this.json["startBp"] as number,
      this.json["endBp"] as number,
      this.json["value"] as number,
      this.json["count"] as number,
      (this.json["label"] as string) ?? null
    );
  }
}

class TrackRenderResponseDTO extends InboundDTO<TrackRenderResponse> {
  public toEntity(): TrackRenderResponse {
    return new TrackRenderResponse(
      this.json["trackId"] as string,
      this.json["name"] as string,
      this.json["type"] as string,
      this.json["color"] as string,
      ((this.json["bins"] as Record<string, unknown>[]) ?? []).map((bin) =>
        new TrackBinResponseDTO(bin).toEntity()
      ),
      this.json["maxValue"] as number,
      (this.json["error"] as string) ?? null
    );
  }
}

class TrackQueryResponseDTO extends InboundDTO<TrackQueryResponse> {
  public toEntity(): TrackQueryResponse {
    return new TrackQueryResponse(
      this.json["startBp"] as number,
      this.json["endBp"] as number,
      this.json["widthPx"] as number,
      ((this.json["tracks"] as Record<string, unknown>[]) ?? []).map((track) =>
        new TrackRenderResponseDTO(track).toEntity()
      )
    );
  }
}

class FastaLinkMismatchResponseDTO extends InboundDTO<FastaLinkMismatchResponse> {
  public toEntity(): FastaLinkMismatchResponse {
    return new FastaLinkMismatchResponse(
      this.json["index"] as number,
      (this.json["fastaName"] as string) ?? null,
      this.json["fastaLengthBp"] as number,
      (this.json["assemblyCurrentName"] as string) ?? null,
      (this.json["assemblyOriginalName"] as string) ?? null,
      (this.json["assemblySourceName"] as string) ?? null,
      this.json["assemblyLengthBp"] as number
    );
  }
}

class FastaLinkCompatibilityResponseDTO extends InboundDTO<FastaLinkCompatibilityResponse> {
  public toEntity(): FastaLinkCompatibilityResponse {
    return new FastaLinkCompatibilityResponse(
      this.json["fastaRecordCount"] as number,
      this.json["assemblyContigCount"] as number,
      this.json["sameRecordCount"] as boolean,
      this.json["sameOrderAndLength"] as boolean,
      this.json["sameOrderLengthAndCurrentNames"] as boolean,
      this.json["sameOrderLengthAndOriginalNames"] as boolean,
      this.json["sameOrderLengthAndSourceNames"] as boolean,
      this.json["sameLengthMultiset"] as boolean,
      ((this.json["mismatches"] as Record<string, unknown>[]) ?? []).map((item) =>
        new FastaLinkMismatchResponseDTO(item).toEntity()
      )
    );
  }
}

class FastaLinkResponseDTO extends InboundDTO<FastaLinkResponse> {
  public toEntity(): FastaLinkResponse {
    return new FastaLinkResponse(
      this.json["fastaFilename"] as string,
      this.json["linked"] as boolean,
      this.json["requiresConfirmation"] as boolean,
      (this.json["warnings"] as string[]) ?? [],
      new FastaLinkCompatibilityResponseDTO(
        this.json["compatibility"] as Record<string, unknown>
      ).toEntity()
    );
  }
}

export {
  CurrentSignalRangeResponseDTO,
  TilePOSTResponseDTO,
  ConversionJobResponseDTO,
  NameMappingResponseDTO,
  TrackSummaryResponseDTO,
  TrackQueryResponseDTO,
  FastaLinkResponseDTO,
};
