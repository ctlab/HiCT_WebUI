export interface SequenceSearchSettings {
  queries: string;
  scope: "assembly" | "selection" | "database";
  searchTarget?: "LOCAL_ASSEMBLY" | "NCBI_REMOTE";
  remoteConsent?: boolean;
  remoteDatabase?: "nt" | "refseq_rna" | "16S_ribosomal_RNA";
  remoteTimeoutMinutes?: number;
  mode: "exact" | "substitutions" | "blast";
  evalue?: number;
  identity?: number;
  coverage?: number;
  maxTargets?: number;
  bothStrands: boolean;
  degenerate: boolean;
  mismatches: number;
  threads: number;
  gapLengthBp?: number;
  startBp?: number;
  endBp?: number;
  forwardColor?: string;
  reverseColor?: string;
  outputFilename?: string;
  overwrite?: boolean;
}

export interface SequenceAnalysisEstimate {
  rowBp: number;
  columnBp: number;
  requestedLevels: number[];
  overviewLevels: number[];
  expectedBytes: number;
  worstCaseBytes: number;
  estimatedBytes: number;
  diskBudgetBytes: number;
  warningLevel?: number;
  limitingLevel?: number;
  hardLimitReason?: string;
  hasResultsOfKind?: boolean;
  hasCompatibleResults?: boolean;
}

export interface SequenceAnalysisJob {
  jobId: string;
  kind:
    | "search"
    | "remote_blast"
    | "dotplot"
    | "moddotplot"
    | "alignment_detail"
    | "repeat_period"
    | "overview-cache";
  searchTarget?: "LOCAL_ASSEMBLY" | "NCBI_REMOTE";
  remoteDatabase?: string;
  remoteRequestId?: string | null;
  status:
    | "submitted"
    | "preparing"
    | "running"
    | "finished"
    | "failed"
    | "cancelled";
  outputFile?: string;
  resultSet?: { id: string; name: string; regionCount: number; bytes: number } | null;
  error?: string;
  logs: string[];
  hits: number;
  fragments: number;
  snapshot: string | null;
  sequenceLength: number;
  mapFilename: string;
  requestedThreads?: number | null;
  effectiveThreads?: number | null;
  threadMode?: string;
}

/** Uses the normal request/error/notification path, including backend error messages. */
export class SequenceAnalysisRequest {
  constructor(
    public readonly requestPath: string,
    public readonly options: object = {}
  ) {
    if (
      !/^\/sequence\/(settings|cleanup|repeat_period|remote_blast\/result|(?:search|overview)\/jobs|(?:moddotplot|dotplot)\/(?:jobs|estimate)|jobs\/list|jobs\/[a-zA-Z0-9-]+\/stop)$/.test(
        requestPath
      )
    )
      throw new Error("Invalid sequence analysis endpoint");
  }
}
