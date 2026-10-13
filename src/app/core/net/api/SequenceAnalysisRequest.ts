export interface SequenceSearchSettings {
  queries: string;
  scope: "assembly" | "selection";
  mode: "exact" | "substitutions";
  bothStrands: boolean;
  degenerate: boolean;
  mismatches: number;
  threads: number;
  startBp?: number;
  endBp?: number;
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
}

/** Uses the normal request/error/notification path, including backend error messages. */
export class SequenceAnalysisRequest {
  constructor(public readonly requestPath: string, public readonly options: object = {}) {
    if (!/^\/sequence\/(search\/jobs|jobs\/list|jobs\/[a-zA-Z0-9-]+\/stop)$/.test(requestPath))
      throw new Error("Invalid sequence analysis endpoint");
  }
}
