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
    public readonly overallProgress: number,
    public readonly resolutionProgress: number,
    public readonly currentResolution: number,
    public readonly elapsedMillis: number,
    public readonly etaMillis: number,
    public readonly resolutionElapsedMillis: number,
    public readonly resolutionEtaMillis: number,
    public readonly inputSizeBytes: number,
    public readonly outputSizeBytes: number,
    public readonly logs: string[],
    public readonly error: string
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
    public readonly renderMode: string,
    public readonly aggregationMode: string
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
    public readonly endPx: number | null
  ) {}
}

class TrackRenderResponse {
  public constructor(
    public readonly trackId: string,
    public readonly name: string,
    public readonly type: string,
    public readonly color: string,
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
  NameMappingResponse,
  TrackSummaryResponse,
  TrackBinResponse,
  TrackRenderResponse,
  TrackQueryResponse,
  TrackPrecomputeTrackStatusResponse,
  TracksPrecomputeStatusResponse,
  WorkerPoolDiagnosticsResponse,
  WorkerCancellationDomainDiagnosticsResponse,
  WorkerSchedulerDiagnosticsResponse,
  FastaLinkMismatchResponse,
  FastaLinkCompatibilityResponse,
  FastaLinkResponse,
};
