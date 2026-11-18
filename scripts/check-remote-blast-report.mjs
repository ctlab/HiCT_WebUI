import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      new URL("../src/app/core/sequence/RemoteBlastReport.ts", import.meta.url),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }
  ).outputText,
  { exports }
);
const { parseRemoteBlastReport, ncbiAccessionUrl } = exports;
const hit = {
  queryId: "query_1",
  subjectId: "external",
  accession: "NC_000001.1",
  title: "<em>literal subject</em>",
  queryStart: 1,
  queryEnd: 4,
  subjectStart: 104,
  subjectEnd: 101,
  queryLength: 4,
  subjectLength: 1000,
  identity: 100,
  alignmentLength: 4,
  mismatches: 0,
  gapOpenings: 0,
  evalue: 0,
  bitscore: 20,
  strand: "-",
};
const report = {
  format: "hict-remote-blast",
  version: 1,
  externalSubjects: true,
  coordinateSystem: "ONE_BASED_INCLUSIVE",
  provider: "NCBI BLAST+",
  database: "nt",
  startedAt: "2026-11-17T00:00:00Z",
  completedAt: "2026-11-17T00:00:01Z",
  querySha256: "a".repeat(64),
  hitCount: 1,
  truncated: false,
  queries: [{ id: "query_1", description: "Literal <name>", length: 4 }],
  hits: [hit],
};
assert.equal(parseRemoteBlastReport(report).hits[0].subjectStart, 104);
assert.equal(parseRemoteBlastReport(report).hits[0].subjectEnd, 101);
assert.equal(
  parseRemoteBlastReport(report).hits[0].title,
  "<em>literal subject</em>"
);
assert.equal(
  ncbiAccessionUrl("NC_000001.1"),
  "https://www.ncbi.nlm.nih.gov/nuccore/NC_000001.1"
);
for (const value of [
  "javascript:alert(1)",
  "//evil.example/a1",
  "<img onerror=alert(1)>",
  "../secret1",
  ".",
  "N/A",
])
  assert.equal(ncbiAccessionUrl(value), null);
for (const edit of [
  (r) => {
    r.externalSubjects = false;
  },
  (r) => {
    r.coordinateSystem = "ZERO_BASED";
  },
  (r) => {
    r.version = 2;
  },
  (r) => {
    r.queries = [];
  },
  (r) => {
    r.hitCount = 0;
  },
  (r) => {
    r.querySha256 = "bad";
  },
  (r) => {
    r.hits[0].queryId = "unknown";
  },
  (r) => {
    r.hits[0].queryLength = 5;
  },
  (r) => {
    r.hits[0].subjectStart = 1001;
  },
  (r) => {
    r.hits[0].subjectLength = Number.MAX_SAFE_INTEGER + 1;
  },
  (r) => {
    r.hits[0].identity = Infinity;
  },
  (r) => {
    r.hits[0].evalue = -1;
  },
]) {
  const invalid = structuredClone(report);
  edit(invalid);
  assert.throws(
    () => parseRemoteBlastReport(invalid),
    /invalid external BLAST report/
  );
}
assert.equal(
  parseRemoteBlastReport({ ...report, hits: [], hitCount: 0 }).hitCount,
  0
);
assert.equal(
  parseRemoteBlastReport({ ...report, hitCount: 25000, truncated: true }).hits
    .length,
  1
);
console.log(
  "External BLAST reports preserve subject coordinates and literal text, validate scientific fields, and link only safe NCBI accessions."
);

const recovered = {
  ...structuredClone(report),
  retrievedRequestId: "FR9P7TGF016",
  submissionPerformed: false,
  filterScope: "Local filters",
  queryVerification: report.queries.map((q) => ({
    queryId: q.id,
    providerQueryTitle: q.id,
    queryLength: q.length,
    alignedBasesVerified: q.length,
    scope: "FULL_QUERY",
  })),
};
assert.equal(
  parseRemoteBlastReport(recovered).retrievedRequestId,
  "FR9P7TGF016"
);
for (const edit of [
  (r) => {
    r.submissionPerformed = true;
  },
  (r) => {
    r.retrievedRequestId = "bad&CMD=Put";
  },
  (r) => {
    r.queryVerification[0].alignedBasesVerified = 0;
  },
  (r) => {
    r.queryVerification[0].queryId = "unknown";
  },
]) {
  const invalid = structuredClone(recovered);
  edit(invalid);
  assert.throws(
    () => parseRemoteBlastReport(invalid),
    /invalid external BLAST report/
  );
}
assert.match(
  exports.describeRemoteVerification(recovered.queryVerification[0]),
  /All query bases/
);
assert.match(
  exports.describeRemoteVerification({
    ...recovered.queryVerification[0],
    scope: "ALIGNED_BASES_ONLY",
    alignedBasesVerified: 1,
  }),
  /remaining bases could not be checked/
);
assert.match(
  exports.describeRemoteVerification({
    ...recovered.queryVerification[0],
    scope: "LABEL_AND_LENGTH_ONLY",
    alignedBasesVerified: 0,
  }),
  /only the query label and length/
);
console.log(
  "Recovered request identity and full/partial/no-alignment verification remain explicit and validated."
);
