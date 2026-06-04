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

class CurrentSignalRangeResponse {
  public constructor(
    public readonly minSignalAtLevel: number[],
    public readonly maxSignalAtLevel: number[],
    public readonly globalMinSignal: number,
    public readonly globalMaxSignal: number
  ) {}
}

class TilePOSTResponse {
  public constructor(
    public readonly image_base64_source: string,
    public readonly ranges: CurrentSignalRangeResponse
  ) {}
}

class ConversionJobResponse {
  public constructor(
    public readonly jobId: string,
    public readonly status: string,
    public readonly sourceFilename: string,
    public readonly outputFilename: string,
    public readonly direction: string,
    public readonly currentStage: string,
    public readonly currentStageLabel: string,
    public readonly stageDetail: string,
    public readonly stageProgress: number,
    public readonly overallProgress: number,
    public readonly resolutionProgress: number,
    public readonly currentResolution: number,
    public readonly elapsedMillis: number,
    public readonly etaMillis: number,
    public readonly resolutionElapsedMillis: number,
    public readonly resolutionEtaMillis: number,
    public readonly inputSizeBytes: number,
    public readonly outputSizeBytes: number,
    public readonly toolchainSource: string,
    public readonly toolchainSummary: string,
    public readonly toolchainNotices: string[],
    public readonly toolchainCitations: string[],
    public readonly logs: string[],
    public readonly error: string
  ) {}
}

class ConversionToolchainStatusResponse {
  public constructor(
    public readonly platform: string,
    public readonly source: string,
    public readonly supportedPlatform: boolean,
    public readonly hicConversionAvailable: boolean,
    public readonly hictkAvailable: boolean,
    public readonly hictkCommand: string | null,
    public readonly minimap2Available: boolean,
    public readonly minimap2Command: string | null,
    public readonly mm2PlusAvx2Available: boolean,
    public readonly mm2PlusAvx2Command: string | null,
    public readonly mm2PlusAvx512Available: boolean,
    public readonly mm2PlusAvx512Command: string | null,
    public readonly dotplotAlignerPreference: string,
    public readonly selectedDotplotAligner: string,
    public readonly selectedDotplotAlignerCommand: string | null,
    public readonly coolerAvailable: boolean,
    public readonly coolerCommand: string | null,
    public readonly pythonAvailable: boolean,
    public readonly pythonCommand: string | null,
    public readonly summary: string,
    public readonly notices: string[],
    public readonly citations: string[],
    public readonly limitations: string[]
  ) {}
}

class NameMappingResponse {
  public constructor(
    public readonly contigs: {
      contigId: number;
      originalName: string;
      name: string;
    }[],
    public readonly scaffolds: {
      scaffoldId: number;
      originalName: string;
      name: string;
    }[]
  ) {}
}

class TrackSummaryResponse {
  public constructor(
    public readonly trackId: string,
    public readonly name: string,
    public readonly type: string,
    public readonly sourceFile: string,
    public readonly color: string,
    public readonly visible: boolean,
    public readonly featureCount: number,
    public readonly renderStyle: string,
    public readonly renderMode: string,
    public readonly aggregationMode: string,
    public readonly logScale: boolean,
    public readonly rangeAuto: boolean,
    public readonly rangeMin: number,
    public readonly rangeMax: number
  ) {}
}

class TrackBinBlockResponse {
  public constructor(
    public readonly startBp: number,
    public readonly endBp: number,
    public readonly startPx: number,
    public readonly endPx: number,
    public readonly coding: boolean
  ) {}
}

class TrackBinResponse {
  public constructor(
    public readonly startBp: number,
    public readonly endBp: number,
    public readonly value: number,
    public readonly count: number,
    public readonly label: string | null,
    public readonly startPx: number | null,
    public readonly endPx: number | null,
    public readonly strand: string | null,
    public readonly thickStartBp: number | null,
    public readonly thickEndBp: number | null,
    public readonly thickStartPx: number | null,
    public readonly thickEndPx: number | null,
    public readonly featureType: string | null,
    public readonly blocks: TrackBinBlockResponse[],
    public readonly attributes: Record<string, string>
  ) {}
}

class TrackRenderResponse {
  public constructor(
    public readonly trackId: string,
    public readonly name: string,
    public readonly type: string,
    public readonly color: string,
    public readonly renderStyle: string,
    public readonly bins: TrackBinResponse[],
    public readonly maxValue: number,
    public readonly error: string | null
  ) {}
}

class TrackQueryResponse {
  public constructor(
    public readonly startBp: number,
    public readonly endBp: number,
    public readonly startPx: number,
    public readonly endPx: number,
    public readonly widthPx: number,
    public readonly bpResolution: number,
    public readonly tracks: TrackRenderResponse[]
  ) {}
}

class TrackFeatureSearchHitResponse {
  public constructor(
    public readonly trackId: string,
    public readonly trackName: string,
    public readonly sourceName: string,
    public readonly label: string,
    public readonly featureType: string | null,
    public readonly strand: string | null,
    public readonly startBp: number,
    public readonly endBp: number
  ) {}
}

class TrackFeatureSearchResponse {
  public constructor(
    public readonly query: string,
    public readonly limit: number,
    public readonly offset: number,
    public readonly hasMore: boolean,
    public readonly hits: TrackFeatureSearchHitResponse[]
  ) {}
}

class TrackFeatureContextResponse {
  public constructor(
    public readonly startBp: number,
    public readonly endBp: number,
    public readonly contextStartBp: number,
    public readonly contextEndBp: number,
    public readonly marginScreens: number,
    public readonly contextWidthPx: number,
    public readonly bpResolution: number,
    public readonly query: TrackQueryResponse
  ) {}
}

class TrackPrecomputeTrackStatusResponse {
  public constructor(
    public readonly trackId: string,
    public readonly trackName: string,
    public readonly status: string,
    public readonly totalTasks: number,
    public readonly completedTasks: number,
    public readonly progress: number,
    public readonly currentTask: string,
    public readonly error: string | null,
    public readonly updatedAtMs: number
  ) {}
}

class TracksPrecomputeStatusResponse {
  public constructor(
    public readonly tracks: TrackPrecomputeTrackStatusResponse[],
    public readonly runningJobs: number,
    public readonly processedDirectory: string
  ) {}
}

class TrackCompatibilityReportResponse {
  public constructor(
    public readonly filename: string,
    public readonly trackType: string,
    public readonly status: string,
    public readonly totalNames: number,
    public readonly matchedSourceNames: number,
    public readonly matchedAssemblyNames: number,
    public readonly matchedAnyNames: number,
    public readonly unknownNames: string[],
    public readonly recommendation: string,
    public readonly message: string
  ) {}
}

class FileEntryResponse {
  public constructor(
    public readonly path: string,
    public readonly name: string,
    public readonly sizeBytes: number,
    public readonly modifiedAtMs: number,
    public readonly extension: string
  ) {}
}

class FileFingerprintResponse {
  public constructor(
    public readonly sizeBytes: number,
    public readonly modifiedAtMs: number,
    public readonly sha256: string,
    public readonly sha512: string
  ) {}
}

class MatrixSourceResolutionResponse {
  public constructor(
    public readonly inputFilename: string,
    public readonly inputKind: string,
    public readonly action: string,
    public readonly resolvedFilename: string,
    public readonly expectedOutputFilename: string | null,
    public readonly conversionDirection: string | null,
    public readonly cachedOutputExists: boolean,
    public readonly cacheCurrent: boolean,
    public readonly warnings: string[],
    public readonly sourceFingerprint: FileFingerprintResponse | null,
    public readonly outputFingerprint: FileFingerprintResponse | null
  ) {}
}

class TrackPrecomputeCacheProbeResponse {
  public constructor(
    public readonly filename: string,
    public readonly trackType: string,
    public readonly supported: boolean,
    public readonly cacheAvailable: boolean,
    public readonly cacheCurrent: boolean,
    public readonly cacheSidecarPath: string,
    public readonly warnings: string[],
    public readonly sourceFingerprint: FileFingerprintResponse | null,
    public readonly hictFingerprint: FileFingerprintResponse
  ) {}
}

class WorkerPoolDiagnosticsResponse {
  public constructor(
    public readonly corePoolSize: number,
    public readonly maxPoolSize: number,
    public readonly currentPoolSize: number,
    public readonly largestPoolSize: number,
    public readonly activeCount: number,
    public readonly queueSize: number,
    public readonly queueCapacity: number,
    public readonly completedTaskCount: number,
    public readonly taskCount: number
  ) {}
}

class WorkerCancellationDomainDiagnosticsResponse {
  public constructor(
    public readonly currentGeneration: number,
    public readonly trackedTaskCount: number,
    public readonly trackedTasksByGeneration: Record<string, number>
  ) {}
}

class WorkerSchedulerDiagnosticsResponse {
  public constructor(
    public readonly timestampMs: number,
    public readonly totalMaxWorkers: number,
    public readonly reservedMinWorkers: number,
    public readonly elasticWorkersInUse: number,
    public readonly elasticWorkersAvailable: number,
    public readonly pools: Record<string, WorkerPoolDiagnosticsResponse>,
    public readonly cancellationDomains: Record<
      string,
      WorkerCancellationDomainDiagnosticsResponse
    >
  ) {}
}

class FastaLinkMismatchResponse {
  public constructor(
    public readonly index: number,
    public readonly fastaName: string | null,
    public readonly fastaLengthBp: number,
    public readonly assemblyCurrentName: string | null,
    public readonly assemblyOriginalName: string | null,
    public readonly assemblySourceName: string | null,
    public readonly assemblyLengthBp: number
  ) {}
}

class FastaLinkCompatibilityResponse {
  public constructor(
    public readonly fastaRecordCount: number,
    public readonly assemblyContigCount: number,
    public readonly sameRecordCount: boolean,
    public readonly sameOrderAndLength: boolean,
    public readonly sameOrderLengthAndCurrentNames: boolean,
    public readonly sameOrderLengthAndOriginalNames: boolean,
    public readonly sameOrderLengthAndSourceNames: boolean,
    public readonly sameLengthMultiset: boolean,
    public readonly mismatches: FastaLinkMismatchResponse[]
  ) {}
}

class FastaLinkResponse {
  public constructor(
    public readonly fastaFilename: string,
    public readonly linked: boolean,
    public readonly requiresConfirmation: boolean,
    public readonly warnings: string[],
    public readonly compatibility: FastaLinkCompatibilityResponse
  ) {}
}

export {
  CurrentSignalRangeResponse,
  TilePOSTResponse,
  ConversionJobResponse,
  ConversionToolchainStatusResponse,
  NameMappingResponse,
  TrackSummaryResponse,
  TrackBinBlockResponse,
  TrackBinResponse,
  TrackRenderResponse,
  TrackQueryResponse,
  TrackFeatureSearchHitResponse,
  TrackFeatureSearchResponse,
  TrackFeatureContextResponse,
  TrackPrecomputeTrackStatusResponse,
  TracksPrecomputeStatusResponse,
  TrackCompatibilityReportResponse,
  FileEntryResponse,
  FileFingerprintResponse,
  MatrixSourceResolutionResponse,
  TrackPrecomputeCacheProbeResponse,
  WorkerPoolDiagnosticsResponse,
  WorkerCancellationDomainDiagnosticsResponse,
  WorkerSchedulerDiagnosticsResponse,
  FastaLinkMismatchResponse,
  FastaLinkCompatibilityResponse,
  FastaLinkResponse,
};
