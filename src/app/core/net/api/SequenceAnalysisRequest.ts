export interface SequenceSearchSettings {
  queries: string;
  scope: "assembly" | "selection";
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

export interface SequenceAnalysisJob {
  jobId: string;
  kind: "search" | "dotplot" | "moddotplot";
  status: "submitted" | "preparing" | "running" | "finished" | "failed" | "cancelled";
  outputFile?: string;
  error?: string;
  logs: string[];
  hits: number;
  fragments: number;
  snapshot: string;
  sequenceLength: number;
  mapFilename: string;
  requestedThreads?: number;
  effectiveThreads?: number;
  threadMode?: string;
}

/** Uses the normal request/error/notification path, including backend error messages. */
export class SequenceAnalysisRequest {
  constructor(public readonly requestPath: string, public readonly options: object = {}) {
    if (!/^\/sequence\/(settings|cleanup|(?:search|moddotplot|dotplot)\/jobs|jobs\/list|jobs\/[a-zA-Z0-9-]+\/stop)$/.test(requestPath))
      throw new Error("Invalid sequence analysis endpoint");
  }
}
