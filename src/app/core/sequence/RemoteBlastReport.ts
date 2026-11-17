export interface RemoteBlastHit {
  queryId: string;
  subjectId: string;
  accession: string;
  title: string;
  queryStart: number;
  queryEnd: number;
  subjectStart: number;
  subjectEnd: number;
  queryLength: number;
  subjectLength: number;
  identity: number;
  alignmentLength: number;
  mismatches: number;
  gapOpenings: number;
  evalue: number;
  bitscore: number;
  strand: "+" | "-";
}
export interface RemoteBlastReport {
  format: "hict-remote-blast";
  version: 1;
  provider: string;
  database: string;
  remoteDatabaseName?: string;
  startedAt: string;
  completedAt: string;
  querySha256: string;
  coordinateSystem: "ONE_BASED_INCLUSIVE";
  externalSubjects: true;
  hitCount: number;
  truncated: boolean;
  queries: { id: string; description: string; length: number }[];
  hits: RemoteBlastHit[];
}

export function ncbiAccessionUrl(accession: string): string | null {
  return /^(?=.{1,200}$)(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9_.-]+$/.test(accession)
    ? `https://www.ncbi.nlm.nih.gov/nuccore/${encodeURIComponent(accession)}`
    : null;
}

/** Validate the server/report boundary before rendering external scientific coordinates. */
export function parseRemoteBlastReport(value: unknown): RemoteBlastReport {
  const fail = (): never => {
    throw new Error("The server returned an invalid external BLAST report.");
  };
  if (!value || typeof value !== "object") fail();
  const report = value as RemoteBlastReport;
  if (
    report.format !== "hict-remote-blast" ||
    report.version !== 1 ||
    report.externalSubjects !== true ||
    report.coordinateSystem !== "ONE_BASED_INCLUSIVE" ||
    typeof report.database !== "string" ||
    (report.remoteDatabaseName !== undefined &&
      typeof report.remoteDatabaseName !== "string") ||
    typeof report.querySha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(report.querySha256) ||
    !Number.isFinite(Date.parse(report.completedAt)) ||
    !Array.isArray(report.queries) ||
    !Array.isArray(report.hits) ||
    report.queries.length < 1 ||
    report.queries.length > 10 ||
    report.hits.length > 20000 ||
    !Number.isSafeInteger(report.hitCount) ||
    report.hitCount < report.hits.length ||
    typeof report.truncated !== "boolean" ||
    (!report.truncated && report.hitCount !== report.hits.length)
  )
    fail();
  const lengths = new Map<string, number>();
  for (const query of report.queries) {
    if (
      !query ||
      typeof query.id !== "string" ||
      lengths.has(query.id) ||
      typeof query.description !== "string" ||
      !Number.isSafeInteger(query.length) ||
      query.length < 1
    )
      fail();
    lengths.set(query.id, query.length);
  }
  for (const hit of report.hits) {
    if (
      !hit ||
      typeof hit.queryId !== "string" ||
      lengths.get(hit.queryId) !== hit.queryLength ||
      typeof hit.subjectId !== "string" ||
      typeof hit.title !== "string" ||
      typeof hit.accession !== "string" ||
      !["+", "-"].includes(hit.strand)
    )
      fail();
    for (const n of [
      hit.queryStart,
      hit.queryEnd,
      hit.subjectStart,
      hit.subjectEnd,
      hit.queryLength,
      hit.subjectLength,
      hit.alignmentLength,
    ])
      if (!Number.isSafeInteger(n) || n < 1) fail();
    for (const n of [hit.mismatches, hit.gapOpenings])
      if (!Number.isSafeInteger(n) || n < 0 || n > hit.alignmentLength) fail();
    if (
      Math.max(hit.queryStart, hit.queryEnd) > hit.queryLength ||
      Math.max(hit.subjectStart, hit.subjectEnd) > hit.subjectLength ||
      !Number.isFinite(hit.identity) ||
      hit.identity < 0 ||
      hit.identity > 100 ||
      !Number.isFinite(hit.evalue) ||
      hit.evalue < 0 ||
      !Number.isFinite(hit.bitscore) ||
      hit.bitscore < 0
    )
      fail();
  }
  return report;
}
