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
  ConversionToolchainStatusResponse,
  CurrentSignalRangeResponse,
  FileFingerprintResponse,
  FileEntryResponse,
  FastaLinkCompatibilityResponse,
  FastaLinkMismatchResponse,
  FastaLinkResponse,
  MatrixSourceResolutionResponse,
  NameMappingResponse,
  TrackCompatibilityReportResponse,
  TrackPrecomputeCacheProbeResponse,
  TrackPrecomputeTrackStatusResponse,
  TracksPrecomputeStatusResponse,
  TrackBinBlockResponse,
  TrackBinResponse,
  TrackFeatureContextResponse,
  TrackFeatureSearchHitResponse,
  TrackFeatureSearchResponse,
  TrackQueryResponse,
  TrackRenderResponse,
  TrackSummaryResponse,
  WorkerCancellationDomainDiagnosticsResponse,
  WorkerPoolDiagnosticsResponse,
  WorkerSchedulerDiagnosticsResponse,
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
      (this.json["currentStage"] as string) ?? "",
      (this.json["currentStageLabel"] as string) ?? "",
      (this.json["stageDetail"] as string) ?? "",
      (this.json["stageProgress"] as number) ?? 0,
      this.json["overallProgress"] as number,
      this.json["resolutionProgress"] as number,
      this.json["currentResolution"] as number,
      this.json["elapsedMillis"] as number,
      this.json["etaMillis"] as number,
      this.json["resolutionElapsedMillis"] as number,
      this.json["resolutionEtaMillis"] as number,
      this.json["inputSizeBytes"] as number,
      this.json["outputSizeBytes"] as number,
      (this.json["toolchainSource"] as string) ?? "",
      (this.json["toolchainSummary"] as string) ?? "",
      (this.json["toolchainNotices"] as string[]) ?? [],
      (this.json["toolchainCitations"] as string[]) ?? [],
      (this.json["logs"] as string[]) ?? [],
      (this.json["error"] as string) ?? ""
    );
  }
}

class ConversionToolchainStatusResponseDTO extends InboundDTO<ConversionToolchainStatusResponse> {
  public toEntity(): ConversionToolchainStatusResponse {
    return new ConversionToolchainStatusResponse(
      (this.json["platform"] as string) ?? "unknown",
      (this.json["source"] as string) ?? "unknown",
      Boolean(this.json["supportedPlatform"] ?? false),
      Boolean(this.json["hicConversionAvailable"] ?? false),
      Boolean(this.json["hictkAvailable"] ?? false),
      (this.json["hictkCommand"] as string) ?? null,
      Boolean(this.json["minimap2Available"] ?? false),
      (this.json["minimap2Command"] as string) ?? null,
      Boolean(this.json["mm2PlusAvx2Available"] ?? false),
      (this.json["mm2PlusAvx2Command"] as string) ?? null,
      Boolean(this.json["mm2PlusAvx512Available"] ?? false),
      (this.json["mm2PlusAvx512Command"] as string) ?? null,
      (this.json["dotplotAlignerPreference"] as string) ?? "auto",
      (this.json["selectedDotplotAligner"] as string) ?? "none",
      (this.json["selectedDotplotAlignerCommand"] as string) ?? null,
      Boolean(this.json["coolerAvailable"] ?? false),
      (this.json["coolerCommand"] as string) ?? null,
      Boolean(this.json["pythonAvailable"] ?? false),
      (this.json["pythonCommand"] as string) ?? null,
      (this.json["summary"] as string) ?? "",
      (this.json["notices"] as string[]) ?? [],
      (this.json["citations"] as string[]) ?? [],
      (this.json["limitations"] as string[]) ?? []
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
      (this.json["renderStyle"] as string) ?? "SIGNAL",
      (this.json["renderMode"] as string) ?? "COVERAGE",
      (this.json["aggregationMode"] as string) ?? "MAX",
      (this.json["logScale"] as boolean) ?? false,
      (this.json["rangeAuto"] as boolean) ?? true,
      Number(this.json["rangeMin"] ?? 0),
      Number(this.json["rangeMax"] ?? 1)
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
      (this.json["label"] as string) ?? null,
      (this.json["startPx"] as number) ?? null,
      (this.json["endPx"] as number) ?? null,
      (this.json["strand"] as string) ?? null,
      (this.json["thickStartBp"] as number) ?? null,
      (this.json["thickEndBp"] as number) ?? null,
      (this.json["thickStartPx"] as number) ?? null,
      (this.json["thickEndPx"] as number) ?? null,
      (this.json["featureType"] as string) ?? null,
      ((this.json["blocks"] as Record<string, unknown>[]) ?? []).map(
        (block) => new TrackBinBlockResponseDTO(block).toEntity()
      ),
      this.parseAttributes(this.json["attributes"])
    );
  }

  private parseAttributes(value: unknown): Record<string, string> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter((entry): entry is [string, string | number | boolean] =>
          ["string", "number", "boolean"].includes(typeof entry[1])
        )
        .map(([key, rawValue]) => [key, String(rawValue)])
    );
  }
}

class TrackBinBlockResponseDTO extends InboundDTO<TrackBinBlockResponse> {
  public toEntity(): TrackBinBlockResponse {
    return new TrackBinBlockResponse(
      (this.json["startBp"] as number) ?? 0,
      (this.json["endBp"] as number) ?? 0,
      (this.json["startPx"] as number) ?? 0,
      (this.json["endPx"] as number) ?? 0,
      Boolean(this.json["coding"] ?? false)
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
      (this.json["renderStyle"] as string) ?? "SIGNAL",
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
      (this.json["startPx"] as number) ?? 0,
      (this.json["endPx"] as number) ?? 0,
      this.json["widthPx"] as number,
      (this.json["bpResolution"] as number) ?? 1,
      ((this.json["tracks"] as Record<string, unknown>[]) ?? []).map((track) =>
        new TrackRenderResponseDTO(track).toEntity()
      )
    );
  }
}

class TrackFeatureSearchHitResponseDTO extends InboundDTO<TrackFeatureSearchHitResponse> {
  public toEntity(): TrackFeatureSearchHitResponse {
    return new TrackFeatureSearchHitResponse(
      (this.json["trackId"] as string) ?? "",
      (this.json["trackName"] as string) ?? "",
      (this.json["sourceName"] as string) ?? "",
      (this.json["label"] as string) ?? "",
      (this.json["featureType"] as string) ?? null,
      (this.json["strand"] as string) ?? null,
      (this.json["startBp"] as number) ?? 0,
      (this.json["endBp"] as number) ?? 0
    );
  }
}

class TrackFeatureSearchResponseDTO extends InboundDTO<TrackFeatureSearchResponse> {
  public toEntity(): TrackFeatureSearchResponse {
    return new TrackFeatureSearchResponse(
      (this.json["query"] as string) ?? "",
      (this.json["limit"] as number) ?? 0,
      (this.json["offset"] as number) ?? 0,
      Boolean(this.json["hasMore"] ?? false),
      ((this.json["hits"] as Record<string, unknown>[]) ?? []).map((item) =>
        new TrackFeatureSearchHitResponseDTO(item).toEntity()
      )
    );
  }
}

class TrackFeatureContextResponseDTO extends InboundDTO<TrackFeatureContextResponse> {
  public toEntity(): TrackFeatureContextResponse {
    return new TrackFeatureContextResponse(
      (this.json["startBp"] as number) ?? 0,
      (this.json["endBp"] as number) ?? 1,
      (this.json["contextStartBp"] as number) ?? 0,
      (this.json["contextEndBp"] as number) ?? 1,
      (this.json["marginScreens"] as number) ?? 1,
      (this.json["contextWidthPx"] as number) ?? 0,
      (this.json["bpResolution"] as number) ?? 1,
      new TrackQueryResponseDTO(
        (this.json["query"] as Record<string, unknown>) ?? {}
      ).toEntity()
    );
  }
}

class TrackPrecomputeTrackStatusResponseDTO extends InboundDTO<TrackPrecomputeTrackStatusResponse> {
  public toEntity(): TrackPrecomputeTrackStatusResponse {
    return new TrackPrecomputeTrackStatusResponse(
      this.json["trackId"] as string,
      this.json["trackName"] as string,
      this.json["status"] as string,
      (this.json["totalTasks"] as number) ?? 0,
      (this.json["completedTasks"] as number) ?? 0,
      (this.json["progress"] as number) ?? 0,
      (this.json["currentTask"] as string) ?? "",
      (this.json["error"] as string) ?? null,
      (this.json["updatedAtMs"] as number) ?? 0
    );
  }
}

class TracksPrecomputeStatusResponseDTO extends InboundDTO<TracksPrecomputeStatusResponse> {
  public toEntity(): TracksPrecomputeStatusResponse {
    return new TracksPrecomputeStatusResponse(
      ((this.json["tracks"] as Record<string, unknown>[]) ?? []).map((item) =>
        new TrackPrecomputeTrackStatusResponseDTO(item).toEntity()
      ),
      (this.json["runningJobs"] as number) ?? 0,
      (this.json["processedDirectory"] as string) ?? ""
    );
  }
}

class TrackCompatibilityReportResponseDTO extends InboundDTO<TrackCompatibilityReportResponse> {
  public toEntity(): TrackCompatibilityReportResponse {
    return new TrackCompatibilityReportResponse(
      (this.json["filename"] as string) ?? "",
      (this.json["trackType"] as string) ?? "",
      (this.json["status"] as string) ?? "ok",
      (this.json["totalNames"] as number) ?? 0,
      (this.json["matchedSourceNames"] as number) ?? 0,
      (this.json["matchedAssemblyNames"] as number) ?? 0,
      (this.json["matchedAnyNames"] as number) ?? 0,
      (this.json["unknownNames"] as string[]) ?? [],
      (this.json["recommendation"] as string) ?? "SOURCE",
      (this.json["message"] as string) ?? ""
    );
  }
}

class FileEntryResponseDTO extends InboundDTO<FileEntryResponse> {
  public toEntity(): FileEntryResponse {
    return new FileEntryResponse(
      (this.json["path"] as string) ?? "",
      (this.json["name"] as string) ?? "",
      (this.json["sizeBytes"] as number) ?? -1,
      (this.json["modifiedAtMs"] as number) ?? 0,
      (this.json["extension"] as string) ?? ""
    );
  }
}

class FileFingerprintResponseDTO extends InboundDTO<FileFingerprintResponse> {
  public toEntity(): FileFingerprintResponse {
    return new FileFingerprintResponse(
      (this.json["sizeBytes"] as number) ?? -1,
      (this.json["modifiedAtMs"] as number) ?? 0,
      (this.json["sha256"] as string) ?? "",
      (this.json["sha512"] as string) ?? ""
    );
  }
}

class MatrixSourceResolutionResponseDTO extends InboundDTO<MatrixSourceResolutionResponse> {
  public toEntity(): MatrixSourceResolutionResponse {
    return new MatrixSourceResolutionResponse(
      (this.json["inputFilename"] as string) ?? "",
      (this.json["inputKind"] as string) ?? "UNKNOWN",
      (this.json["action"] as string) ?? "UNSUPPORTED",
      (this.json["resolvedFilename"] as string) ?? "",
      (this.json["expectedOutputFilename"] as string) ?? null,
      (this.json["conversionDirection"] as string) ?? null,
      Boolean(this.json["cachedOutputExists"] ?? false),
      Boolean(this.json["cacheCurrent"] ?? false),
      (this.json["warnings"] as string[]) ?? [],
      this.json["sourceFingerprint"]
        ? new FileFingerprintResponseDTO(
            this.json["sourceFingerprint"] as Record<string, unknown>
          ).toEntity()
        : null,
      this.json["outputFingerprint"]
        ? new FileFingerprintResponseDTO(
            this.json["outputFingerprint"] as Record<string, unknown>
          ).toEntity()
        : null
    );
  }
}

class TrackPrecomputeCacheProbeResponseDTO extends InboundDTO<TrackPrecomputeCacheProbeResponse> {
  public toEntity(): TrackPrecomputeCacheProbeResponse {
    return new TrackPrecomputeCacheProbeResponse(
      (this.json["filename"] as string) ?? "",
      (this.json["trackType"] as string) ?? "UNSUPPORTED",
      Boolean(this.json["supported"] ?? false),
      Boolean(this.json["cacheAvailable"] ?? false),
      Boolean(this.json["cacheCurrent"] ?? false),
      (this.json["cacheSidecarPath"] as string) ?? "",
      (this.json["warnings"] as string[]) ?? [],
      this.json["sourceFingerprint"]
        ? new FileFingerprintResponseDTO(
            this.json["sourceFingerprint"] as Record<string, unknown>
          ).toEntity()
        : null,
      new FileFingerprintResponseDTO(
        (this.json["hictFingerprint"] as Record<string, unknown>) ?? {}
      ).toEntity()
    );
  }
}

class WorkerPoolDiagnosticsResponseDTO extends InboundDTO<WorkerPoolDiagnosticsResponse> {
  public toEntity(): WorkerPoolDiagnosticsResponse {
    return new WorkerPoolDiagnosticsResponse(
      (this.json["corePoolSize"] as number) ?? 0,
      (this.json["maxPoolSize"] as number) ?? 0,
      (this.json["currentPoolSize"] as number) ?? 0,
      (this.json["largestPoolSize"] as number) ?? 0,
      (this.json["activeCount"] as number) ?? 0,
      (this.json["queueSize"] as number) ?? 0,
      (this.json["queueCapacity"] as number) ?? 0,
      (this.json["completedTaskCount"] as number) ?? 0,
      (this.json["taskCount"] as number) ?? 0
    );
  }
}

class WorkerCancellationDomainDiagnosticsResponseDTO extends InboundDTO<WorkerCancellationDomainDiagnosticsResponse> {
  public toEntity(): WorkerCancellationDomainDiagnosticsResponse {
    return new WorkerCancellationDomainDiagnosticsResponse(
      (this.json["currentGeneration"] as number) ?? 0,
      (this.json["trackedTaskCount"] as number) ?? 0,
      ((this.json["trackedTasksByGeneration"] as Record<string, number>) ?? {})
    );
  }
}

class WorkerSchedulerDiagnosticsResponseDTO extends InboundDTO<WorkerSchedulerDiagnosticsResponse> {
  public toEntity(): WorkerSchedulerDiagnosticsResponse {
    const poolsJson = (this.json["pools"] as Record<string, Record<string, unknown>>) ?? {};
    const cancellationJson =
      (this.json["cancellationDomains"] as Record<string, Record<string, unknown>>) ?? {};
    const pools = Object.fromEntries(
      Object.entries(poolsJson).map(([priority, payload]) => [
        priority,
        new WorkerPoolDiagnosticsResponseDTO(payload).toEntity(),
      ])
    );
    const cancellationDomains = Object.fromEntries(
      Object.entries(cancellationJson).map(([domain, payload]) => [
        domain,
        new WorkerCancellationDomainDiagnosticsResponseDTO(payload).toEntity(),
      ])
    );
    return new WorkerSchedulerDiagnosticsResponse(
      (this.json["timestampMs"] as number) ?? 0,
      (this.json["totalMaxWorkers"] as number) ?? 0,
      (this.json["reservedMinWorkers"] as number) ?? 0,
      (this.json["elasticWorkersInUse"] as number) ?? 0,
      (this.json["elasticWorkersAvailable"] as number) ?? 0,
      pools,
      cancellationDomains
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
  ConversionToolchainStatusResponseDTO,
  NameMappingResponseDTO,
  TrackSummaryResponseDTO,
  TrackQueryResponseDTO,
  TrackFeatureSearchResponseDTO,
  TrackFeatureContextResponseDTO,
  TracksPrecomputeStatusResponseDTO,
  TrackCompatibilityReportResponseDTO,
  FileEntryResponseDTO,
  MatrixSourceResolutionResponseDTO,
  TrackPrecomputeCacheProbeResponseDTO,
  WorkerSchedulerDiagnosticsResponseDTO,
  FastaLinkResponseDTO,
};
