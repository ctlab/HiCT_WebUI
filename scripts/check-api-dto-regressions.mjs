import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import ts from "typescript";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const requestSource = readFileSync(
  resolve(projectRoot, "src/app/core/net/api/request.ts"),
  "utf8"
);
const requestDtoSource = readFileSync(
  resolve(projectRoot, "src/app/core/net/dto/requestDTO.ts"),
  "utf8"
);

const requiredMappings = [
  {
    className: "RemoteBlastRetrievalRequest",
    dtoName: "RemoteBlastRetrievalRequestDTO",
    requestPath: "/sequence/remote_blast/retrieve",
  },
  {
    className: "SplitContigAtBpRequest",
    dtoName: "SplitContigAtBpRequestDTO",
    requestPath: "/split_contig_at_bp",
  },
  {
    className: "ListConvertibleMatrixFilesRequest",
    dtoName: "ListConvertibleMatrixFilesRequestDTO",
    requestPath: "/list_convertible_matrices",
  },
];

const failures = [];

for (const mapping of requiredMappings) {
  if (!requestSource.includes(`class ${mapping.className}`)) {
    failures.push(`Missing request class ${mapping.className}`);
  }
  if (!requestSource.includes(`requestPath = "${mapping.requestPath}"`)) {
    failures.push(
      `${mapping.className} does not declare requestPath ${mapping.requestPath}`
    );
  }
  if (!requestDtoSource.includes(`class ${mapping.dtoName}`)) {
    failures.push(`Missing DTO class ${mapping.dtoName}`);
  }
  if (!requestDtoSource.includes(`instanceof ${mapping.className}`)) {
    failures.push(`Missing instanceof DTO mapping for ${mapping.className}`);
  }
  if (!requestDtoSource.includes(`case "${mapping.requestPath}"`)) {
    failures.push(
      `Missing requestPath DTO fallback for ${mapping.requestPath}`
    );
  }
}

if (!requestDtoSource.includes(`class EmptyRequestDTO`)) {
  failures.push("Missing empty-request DTO fallback for payload-free requests");
}
if (!requestDtoSource.includes(`"options" in entity`)) {
  failures.push("Missing path-based empty-request fallback guard");
}

if (failures.length > 0) {
  console.error("API DTO regression check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

// Execute the real DTO and its real dependencies, not a mirror converter.
const modules = new Map();
function loadTypeScript(filename) {
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} };
  modules.set(filename, module);
  const source = readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const nativeRequire = createRequire(filename);
  const require = (name) =>
    name.startsWith(".")
      ? loadTypeScript(resolve(dirname(filename), name + ".ts"))
      : nativeRequire(name);
  new Function("exports", "require", "module", compiled)(
    module.exports,
    require,
    module
  );
  return module.exports;
}
const { ContigDescriptorDTO, AssemblyInfoDTO, SimpleLinearGradientDTO, VisualizationOptionsDTO } = loadTypeScript(
  resolve(projectRoot, "src/app/core/net/dto/dto.ts")
);
const endpointPayload = {
  startColorRGBAString: "rgba(255,255,255,0.0)",
  endColorRGBAString: "rgba(255,0,0,1.0)",
  minSignal: 0,
  maxSignal: 1,
  curve: [0, 0.25, 0.85, 1, 1, 0],
};
const endpointGradient = new SimpleLinearGradientDTO(endpointPayload).toEntity();
assert.deepEqual(SimpleLinearGradientDTO.fromEntity(endpointGradient).toEntity().curve, endpointPayload.curve);
assert.throws(() => new SimpleLinearGradientDTO({
  ...endpointPayload,
  curve: [1, 0, 0.85, 1],
}).toEntity());
const { ConversionJobResponseDTO, TrackQueryResponseDTO } = loadTypeScript(
  resolve(projectRoot, "src/app/core/net/dto/responseDTO.ts")
);
const runningConversion = new ConversionJobResponseDTO({
  elapsedMillis: 7380,
  etaMillis: -1,
  resolutionElapsedMillis: 1390,
  resolutionEtaMillis: -1,
  stageIndex: 2,
  stageCount: 5,
}).toEntity();
assert.equal(runningConversion.elapsedMillis, 7380);
assert.equal(runningConversion.etaMillis, -1);
assert.equal(runningConversion.resolutionElapsedMillis, 1390);
assert.equal(runningConversion.resolutionEtaMillis, -1);
assert.equal(runningConversion.stageIndex, 2);
assert.equal(runningConversion.stageCount, 5);
const legacyConversion = new ConversionJobResponseDTO({ etaMillis: 0 }).toEntity();
assert.equal(legacyConversion.etaMillis, 0);
assert.equal(legacyConversion.stageIndex, undefined);
assert.equal(legacyConversion.stageCount, undefined);
const baseQuery = new TrackQueryResponseDTO({
  startBp: 3,
  endBp: 6,
  startPx: 3,
  endPx: 6,
  widthPx: 100,
  bpResolution: 1,
  displayGrid: "SEQUENCE_BP",
  sourceBpResolution: 100,
  tracks: [
    {
      trackId: "w",
      name: "Weights",
      type: "COOLER_WEIGHTS",
      color: "#123456",
      renderStyle: "SIGNAL",
      bins: [],
      maxValue: 2,
      error: null,
      samplingBpResolution: 200,
    },
  ],
}).toEntity();
assert.equal(baseQuery.displayGrid, "SEQUENCE_BP");
assert.equal(baseQuery.sourceBpResolution, 100);
assert.equal(baseQuery.tracks[0].samplingBpResolution, 200);
const descriptors = Array.from({ length: 4 }, (_, i) => ({
  contigId: i,
  contigName: "c" + i,
  contigOriginalName: "source" + i,
  contigOffsetInSource: i * 1000,
  contigSharedBinSlice: i === 1,
  contigBinOffsets: { 100: -25, 250: -125 },
  contigLengthBp: i * 1000,
  contigLengthBins: { 100: String(i * 10), 250: i * 4, 1000: i },
  contigPresenceAtResolution: { 100: i, 250: i, 1000: i },
  contigDirection: i % 2,
}));
for (const [i, descriptor] of descriptors.entries()) {
  const entity = new ContigDescriptorDTO(descriptor).toEntity();
  assert.deepEqual(
    [...entity.contigLengthBins],
    [
      [100, i * 10],
      [250, i * 4],
      [1000, i],
    ]
  );
  assert.deepEqual(
    [...entity.presenceAtResolution],
    [
      [100, i],
      [250, i],
      [1000, i],
    ]
  );
  assert.equal(entity.direction, i % 2);
  assert.equal(entity.contigSourceName, "source" + i);
  assert.equal(entity.contigOffsetInSource, i * 1000);
  assert.deepEqual(
    [...entity.contigBinOffsets],
    [
      [100, -25],
      [250, -125],
    ]
  );
}
const input = { contigDescriptors: descriptors, scaffoldDescriptors: [] };
const first = new AssemblyInfoDTO(input).toEntity();
first.contigDescriptors[0].contigLengthBins.set(100, 999);
const next = new AssemblyInfoDTO(input).toEntity();
assert.equal(next.contigDescriptors[0].contigLengthBins.get(100), 0);
assert.notEqual(
  first.contigDescriptors[0].contigLengthBins,
  next.contigDescriptors[0].contigLengthBins
);
assert.deepEqual(
  new AssemblyInfoDTO({
    contigDescriptors: [],
    scaffoldDescriptors: [],
  }).toEntity(),
  { contigDescriptors: [], scaffoldDescriptors: [] }
);
console.log(
  "API DTO regression check passed (including real assembly response conversion)."
);

// The negotiated representation must produce exactly the same application state.
const scaffoldDtos = [
  {
    scaffoldId: 2147483657,
    scaffoldName: "alias α",
    scaffoldOriginalName: "original",
    spacerLength: 1000,
    scaffoldBordersBP: { startBP: 123, endBP: 999 },
  },
  {
    scaffoldId: 18,
    scaffoldName: "unplaced",
    scaffoldOriginalName: "unplaced",
    spacerLength: 0,
    scaffoldBordersBP: null,
  },
];
const legacy = {
  contigDescriptors: descriptors.map((d) => ({
    ...d,
    contigSourceName: 'source😀"',
  })),
  scaffoldDescriptors: scaffoldDtos,
};
const compact = {
  format: "compact-v1",
  sharedBinContigs: [1],
  contigBinOffsets: Object.fromEntries(
    legacy.contigDescriptors.map((d) => [d.contigId, d.contigBinOffsets])
  ),
  resolutions: [100, 250, 1000],
  contigs: legacy.contigDescriptors.map((d) => [
    d.contigId,
    d.contigName,
    d.contigOriginalName,
    d.contigSourceName,
    d.contigOffsetInSource,
    d.contigDirection,
    d.contigLengthBp,
    [100, 250, 1000].map((r) => Number(d.contigLengthBins[r])),
    [100, 250, 1000].map((r) => d.contigPresenceAtResolution[r]),
  ]),
  scaffolds: scaffoldDtos.map((s) => [
    s.scaffoldId,
    s.scaffoldName,
    s.scaffoldOriginalName,
    s.spacerLength,
    s.scaffoldBordersBP
      ? [s.scaffoldBordersBP.startBP, s.scaffoldBordersBP.endBP]
      : null,
  ]),
};
assert.deepEqual(
  new AssemblyInfoDTO(compact).toEntity(),
  new AssemblyInfoDTO(legacy).toEntity()
);
const converted = new AssemblyInfoDTO(compact).toEntity();
converted.contigDescriptors[0].contigLengthBins.set(100, 777);
assert.deepEqual(
  new AssemblyInfoDTO(compact).toEntity(),
  new AssemblyInfoDTO(legacy).toEntity()
);
assert.deepEqual(
  new AssemblyInfoDTO({
    format: "compact-v1",
    resolutions: [],
    contigs: [],
    scaffolds: [],
  }).toEntity(),
  { contigDescriptors: [], scaffoldDescriptors: [] }
);
for (const damage of [
  (c) => {
    c.sharedBinContigs = [1, 1];
  },
  (c) => {
    c.sharedBinContigs = [999999];
  },
  (c) => {
    c.sharedBinContigs = [1.5];
  },
  (c) => {
    c.sharedBinContigs = "1";
  },
  (c) => {
    c.format = "compact-v2";
  },
  (c) => {
    c.resolutions[1] = c.resolutions[0];
  },
  (c) => {
    c.contigs[0].pop();
  },
  (c) => {
    c.contigs[0][7].pop();
  },
  (c) => {
    c.contigs[0][8][0] = 99;
  },
  (c) => {
    c.contigs[0][5] = 9;
  },
  (c) => {
    c.scaffolds[0][4] = [1];
  },
]) {
  const bad = structuredClone(compact);
  damage(bad);
  assert.throws(() => new AssemblyInfoDTO(bad).toEntity());
}
const { HiCTAPIRequestDTO } = loadTypeScript(
  resolve(projectRoot, "src/app/core/net/dto/requestDTO.ts")
);
const requestClasses = loadTypeScript(
  resolve(projectRoot, "src/app/core/net/api/request.ts")
);
const diagonalMask = { enabled: true, distanceBp: 150_000 };
const visualization = new VisualizationOptionsDTO({
  colormap: { ...endpointPayload, colormapType: "SimpleLinearGradient" },
  diagonalMask,
}).toEntity();
const visualizationRequest = new requestClasses.SetVisualizationOptionsRequest({
  options: visualization,
  preserveRenderPipeline: true,
});
const serializedVisualization = HiCTAPIRequestDTO.toDTOClass(visualizationRequest).toDTO();
assert.deepEqual(serializedVisualization.diagonalMask, diagonalMask);
assert.equal(serializedVisualization.preserveRenderPipeline, true);
const { SequenceAnalysisRequest } = loadTypeScript(
  resolve(projectRoot, "src/app/core/net/api/SequenceAnalysisRequest.ts")
);
for (const options of [
  { startBp: 2_500_000_000, endBp: 2_500_000_012 },
  { jobId: "repeat-1" },
]) {
  const request = new SequenceAnalysisRequest(
    "/sequence/repeat_period",
    options
  );
  assert.deepEqual(HiCTAPIRequestDTO.toDTOClass(request).toDTO(), options);
}
for (const exampleId of [undefined, "jobs-convert-auto"]) {
  const request = new requestClasses.StartConversionJobRequest({
    filename: "examples/jobs-convert-auto/example.mcool",
    exampleId,
  });
  assert.equal(
    HiCTAPIRequestDTO.toDTOClass(request).toDTO().exampleId,
    exampleId
  );
}
for (const approximateRebin of [undefined, false, true]) {
  const request = new requestClasses.StartConversionJobRequest({
    filename: "source.hict.hdf5",
    approximateRebin,
  });
  assert.equal(
    HiCTAPIRequestDTO.toDTOClass(request).toDTO().approximateRebin,
    approximateRebin
  );
  const batch = new requestClasses.StartBatchConversionJobsRequest({
    files: ["source.hict.hdf5"],
    parallelJobs: 1,
    parallelism: 1,
    approximateRebin,
  });
  assert.equal(
    HiCTAPIRequestDTO.toDTOClass(batch).toDTO().approximateRebin,
    approximateRebin
  );
}
for (const exactContig of [undefined, false, true]) {
  const request = new requestClasses.MoveSelectionRangeRequest({
    startBP: 10, endBP: 20, targetStartBP: 0, exactContig,
  });
  assert.equal(HiCTAPIRequestDTO.toDTOClass(request).toDTO().exactContig,
    exactContig || undefined);
}
for (const name of [
  "ReverseSelectionRangeRequest",
  "MoveSelectionRangeRequest",
  "SplitContigRequest",
  "GroupContigsIntoScaffoldRequest",
  "UngroupContigsFromScaffoldRequest",
  "MoveSelectionToDebrisRequest",
]) {
  const request = new requestClasses[name]({
    startBP: 0,
    endBP: 100,
    targetStartBP: 200,
    splitPx: 50,
    bpResolution: 100,
  });
  assert.equal(
    HiCTAPIRequestDTO.toDTOClass(request).toDTO().assemblyFormat,
    "compact-v1",
    name
  );
}
console.log(
  "Compact assembly contract, invalid payloads, independent maps and opt-in edit requests passed."
);
for (const policy of [
  undefined,
  "APPEND_UNPLACED",
  "EXCLUDE",
  "SCAFFOLDED_ONLY",
]) {
  const request = new requestClasses.LoadAGPRequest({
    agpFilename: "layout.agp",
    missingComponentsPolicy: policy,
  });
  const payload = HiCTAPIRequestDTO.toDTOClass(request).toDTO();
  assert.equal(payload.agpFilename, "layout.agp");
  assert.equal(payload.missingComponentsPolicy, policy);
}
for (const name of ["GetAGPForAssemblyRequest", "GetFastaForAssemblyRequest"]) {
  assert.equal(
    HiCTAPIRequestDTO.toDTOClass(new requestClasses[name]()).toDTO()
      .preserveImportedGaps,
    true
  );
}
console.log(
  "AGP omission choices and matching AGP/FASTA gap export requests passed."
);

for (const [name, options] of [
  ["AssemblyHistoryRequest", { offset: 100, limit: 100 }],
  [
    "RestoreAssemblyHistoryRequest",
    {
      session: "session-id",
      revision: 7,
      action: "restore",
      id: 3,
      assemblyFormat: "compact-v1",
    },
  ],
]) {
  assert.deepEqual(
    HiCTAPIRequestDTO.toDTOClass(new requestClasses[name](options)).toDTO(),
    options
  );
}
assert.deepEqual(
  HiCTAPIRequestDTO.toDTOClass(
    new requestClasses.UnscaffoldAllRequest()
  ).toDTO(),
  {}
);
console.log(
  "Journal pagination, unscaffold-all and guarded restoration payloads passed."
);
for (const name of ["QueryTracks1DRequest", "GetTrackFeatureContextRequest"]) {
  const options = {
    unit: "BP",
    startBP: 3,
    endBP: 6,
    widthPx: 100,
    bpResolution: 100,
    sequenceScale: true,
  };
  const dto = HiCTAPIRequestDTO.toDTOClass(
    new requestClasses[name](options)
  ).toDTO();
  assert.equal(dto.sequenceScale, true);
  assert.equal(dto.bpResolution, 100);
  assert.equal(dto.startBP, 3);
  assert.equal(
    HiCTAPIRequestDTO.toDTOClass(
      new requestClasses[name]({ ...options, sequenceScale: undefined })
    ).toDTO().sequenceScale,
    undefined
  );
}

// Execute the production HTTP adapter with controlled responses. A history-list
// response must not authorize edits using coordinates from an older displayed map.
const vm = await import("node:vm");
const adapterSource = ts.transpileModule(
  readFileSync(
    resolve(projectRoot, "src/app/core/net/api/RequestManager.ts"),
    "utf8"
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }
).outputText;
let responseRevision = 2;
let sentHeaders;
let sentTimeout;
let sentPayload;
let requestsSent = 0;
let serializationFailure = false;
let transportFailure;
let pendingWorkspace;
let observeCloseOrder;
let fetched;
let downloadResponse;
const notificationErrors = [];
const adapterExports = {};
vm.runInNewContext(adapterSource, {
  exports: adapterExports,
  console,
  fetch: async (url, options) => {
    fetched = { url, options };
    return downloadResponse;
  },
  require: (name) => {
    if (name.includes("backgroundResultDelivery"))
      return loadTypeScript(
        resolve(
          projectRoot,
          "src/app/core/sequence/backgroundResultDelivery.ts"
        )
      );
    if (name === "vue") return { shallowReactive: (value) => value };
    if (name === "./request") return requestClasses;
    if (name === "./SequenceAnalysisRequest")
      return { SequenceAnalysisRequest };
    if (name === "axios")
      return {
        ...createRequire(import.meta.url)("axios"),
        post: async (url, payload, config) => {
          if (transportFailure) throw transportFailure;
          requestsSent++;
          sentPayload = payload;
          sentTimeout = config?.timeout;
          if (observeCloseOrder) {
            const path = new URL(url).pathname;
            observeCloseOrder.requests.push(path);
            if (path === "/close") await observeCloseOrder.response;
          }
          if (url.endsWith("/workspace/state"))
            return new Promise((resolve, reject) => {
              pendingWorkspace = { payload, resolve, reject };
            });
          sentHeaders = config.headers;
          return {
            data: {},
            headers: {
              "x-hict-history": JSON.stringify({
                session: "s",
                revision: responseRevision,
                currentId: responseRevision,
                position: responseRevision,
                size: responseRevision + 1,
                canUndo: true,
                canRedo: false,
              }),
            },
          };
        },
      };
    if (name === "../dto/requestDTO")
      return {
        HiCTAPIRequestDTO: {
          toDTOClass: (request) => {
            if (serializationFailure) throw new Error("Serialization failed");
            return { toDTO: () => request.options ?? {} };
          },
        },
      };
    if (name.includes("errorMessage"))
      return { extractErrorMessage: (err) => err.message };
    if (name.includes("errorToastStore"))
      return {
        useErrorToastStore: () => ({ requestErrorToastsEnabled: true }),
      };
    if (name === "vue-sonner")
      return {
        toast: { error: (message) => notificationErrors.push(message) },
      };
    return {};
  },
});
const adapter = new adapterExports.RequestManager({
  host: "http://example.test",
});
adapter.notifyInboundPayload = () => {};
adapter.history.summary = { session: "s", revision: 1 };
adapter.history.applied = { session: "s", revision: 1 };
await adapter.sendRequest({ requestPath: "/assembly/history" });
assert.equal(adapter.history.summary.revision, 2);
assert.equal(
  adapter.history.applied.revision,
  1,
  "Reading the journal must not advance the displayed-coordinate guard"
);
responseRevision = 3;
await adapter.sendRequest({ requestPath: "/reverse_selection_range" });
assert.equal(sentHeaders["X-HiCT-History-Revision"], "1");
assert.equal(adapter.history.applied.revision, 3);
assert.equal(adapter.history.busy, 0);
console.log(
  "History reads cannot authorize edits on stale displayed coordinates."
);

const closingAdapter = new adapterExports.RequestManager({
  host: "http://example.test",
});
closingAdapter.notifyInboundPayload = () => {};
let finishOptions;
let finishClose;
const pendingOptions = new Promise((resolve) => {
  finishOptions = resolve;
});
const closeResponse = new Promise((resolve) => {
  finishClose = resolve;
});
observeCloseOrder = { requests: [], response: closeResponse };
const closing = closingAdapter.closeFile(pendingOptions);
const replacementPaths = ["/open", "/attach", "/session/restore"];
const replacements = replacementPaths.map((requestPath) =>
  closingAdapter.sendRequest({ requestPath })
);
await new Promise(setImmediate);
assert.deepEqual(observeCloseOrder.requests, []);
finishOptions();
await new Promise(setImmediate);
assert.deepEqual(observeCloseOrder.requests, ["/close"]);
finishClose();
await Promise.all([closing, ...replacements]);
assert.deepEqual(observeCloseOrder.requests, ["/close", ...replacementPaths]);
observeCloseOrder = undefined;
console.log("Workspace requests wait for pending options and the server close.");

await adapter.querySequenceRegion(0, 60, undefined, {
  includeGaps: true,
  assemblyAnchorBp: 5000,
});
assert.equal(sentHeaders["X-HiCT-History-Revision"], "3");
assert.equal(sentPayload.includeGaps, true);
assert.equal(sentPayload.assemblyAnchorBp, 5000);
await adapter.sendRequest(
  new SequenceAnalysisRequest("/sequence/search/jobs", {
    searchTarget: "NCBI_REMOTE",
  })
);
assert.equal(
  sentHeaders["X-HiCT-History-Revision"],
  undefined,
  "External query submission must not depend on the displayed assembly revision"
);
await adapter.sendRequest(
  new SequenceAnalysisRequest("/sequence/search/jobs", {
    searchTarget: "LOCAL_ASSEMBLY",
  })
);
assert.equal(
  sentHeaders["X-HiCT-History-Revision"],
  "3",
  "Local sequence searches retain their captured assembly guard"
);
adapter.sequenceViewReadOnly = true;
const sentBefore = requestsSent;
for (const requestPath of [
  "/reverse_selection_range",
  "/assembly/history/restore",
])
  await assert.rejects(
    adapter.sendRequest({ requestPath }),
    /Return to the contact map/
  );
assert.equal(
  requestsSent,
  sentBefore,
  "Read-only sequence view cannot send mutations"
);
assert.equal(adapter.history.busy, 0);
adapter.sequenceViewReadOnly = false;
const capturedVersion = { ...adapter.history.applied };
adapter.history.applied = {
  ...capturedVersion,
  revision: capturedVersion.revision + 1,
};
for (const [method, request] of [
  ["getFASTAForAssembly", new requestClasses.GetFastaForAssemblyRequest()],
  ["getAGPForAssembly", new requestClasses.GetAGPForAssemblyRequest()],
  [
    "getFASTAForSelection",
    new requestClasses.GetFastaForSelectionRequest({
      fromBpX: 1,
      toBpX: 2,
      fromBpY: 3,
      toBpY: 4,
    }),
  ],
]) {
  await adapter[method](request, capturedVersion);
  assert.equal(
    sentHeaders["X-HiCT-History-Revision"],
    String(capturedVersion.revision),
    "Coordinate downloads retain the revision captured before choosing a destination"
  );
}
adapter.history.applied = capturedVersion;
const body = new ReadableStream({
  start(controller) {
    controller.enqueue(new Uint8Array([65, 67]));
    controller.close();
  },
});
downloadResponse = new Response(body, {
  headers: { "content-type": "text/plain; charset=utf-8" },
});
const controller = new AbortController();
const streamed = await adapter.openCoordinateDownload(
  new requestClasses.GetFastaForAssemblyRequest(),
  capturedVersion,
  controller.signal
);
assert.equal(streamed, body);
assert.equal(fetched.url, "http://example.test/get_fasta_for_assembly");
assert.equal(
  fetched.options.headers["X-HiCT-History-Revision"],
  String(capturedVersion.revision)
);
assert.equal(fetched.options.signal, controller.signal);
assert.equal(fetched.options.method, "POST");
assert.deepEqual(JSON.parse(fetched.options.body), {});
assert.equal(await new Response(streamed).text(), "AC");
let cancelled = 0;
for (const [status, type, expected] of [
  [409, "text/plain", /Refresh/],
  [500, "text/plain", /HTTP 500/],
  [200, "text/html", /did not return/],
]) {
  downloadResponse = new Response(
    new ReadableStream({
      cancel() {
        cancelled++;
      },
    }),
    { status, headers: { "content-type": type } }
  );
  await assert.rejects(
    adapter.openCoordinateDownload(
      new requestClasses.GetFastaForAssemblyRequest(),
      capturedVersion
    ),
    expected
  );
}
assert.equal(
  cancelled,
  3,
  "Error responses must be cancelled without buffering their bodies"
);
await adapter.queryAlignmentDetail({ jobId: "bounded-alignment" });
assert.equal(
  sentTimeout,
  15_000,
  "Initial submissions must remain bounded while awaiting the cancellable job ID"
);
await adapter.sendRequest({
  requestPath: "/sequence/repeat_period",
  options: { startBp: 3, endBp: 15 },
});
assert.equal(
  sentHeaders["X-HiCT-History-Session"],
  adapter.history.applied.session
);
assert.equal(
  sentHeaders["X-HiCT-History-Revision"],
  String(adapter.history.applied.revision)
);
console.log(
  "FASTA reads carry the displayed revision; sequence view prevents edits and history restoration."
);

serializationFailure = true;
adapter.getAssemblyHistory = async () => {};
await assert.rejects(
  adapter.sendRequest({ requestPath: "/unscaffold_all" }),
  /Serialization failed/
);
assert.equal(
  adapter.history.busy,
  0,
  "Serialization failure must release the edit guard"
);
assert.equal(
  notificationErrors.length,
  0,
  "The transport must leave user-facing reporting to the action"
);
console.log(
  "Synchronous serialization failures release the edit guard and reject to the caller."
);

serializationFailure = false;
const axios = createRequire(import.meta.url)("axios");
transportFailure = new axios.AxiosError("Network Error", "ERR_NETWORK");
await assert.rejects(
  adapter.sendRequest({ requestPath: "/list_fasta_files" }),
  (error) => error.message ===
    "Can't reach the HiCT server at http://example.test. Start HiCT, or check the address in File → Join running session."
    && error.cause === transportFailure
);
transportFailure = new axios.CanceledError();
await assert.rejects(
  adapter.sendRequest({ requestPath: "/list_fasta_files" }),
  (error) => error === transportFailure
);
transportFailure = undefined;

const originalVersion = { session: "workspace-a", revision: 0 };
adapter.workspaceVersion = originalVersion;
const save = adapter.saveWorkspaceState("same.hict.hdf5", { version: 1 });
assert.equal(pendingWorkspace.payload.expectedVersion, originalVersion);
pendingWorkspace.resolve({
  data: { workspaceVersion: { session: "workspace-a", revision: 1 } },
});
await save;
assert.equal(adapter.workspaceVersion.revision, 1);
const delayed = adapter.saveWorkspaceState("same.hict.hdf5", { version: 1 });
const attachedVersion = { session: "workspace-b", revision: 4 };
adapter.workspaceVersion = attachedVersion;
pendingWorkspace.resolve({
  data: { workspaceVersion: { session: "workspace-a", revision: 2 } },
});
await delayed;
assert.equal(
  adapter.workspaceVersion,
  attachedVersion,
  "A late save cannot replace a newer Open/Attach token"
);
const rejected = adapter.saveWorkspaceState("same.hict.hdf5", { version: 1 });
pendingWorkspace.reject(new Error("Workspace conflict"));
await assert.rejects(rejected, /Workspace conflict/);
assert.equal(
  adapter.workspaceVersion,
  attachedVersion,
  "Rejected saves cannot advance the version"
);
console.log(
  "Workspace autosaves preserve Open/Attach tokens across delayed responses and conflicts."
);

for (const invalid of [null, [], { 100: NaN }, { 100: 0.5 }, { 0: 1 }]) {
  assert.throws(
    () =>
      new ContigDescriptorDTO({
        ...descriptors[0],
        contigBinOffsets: invalid,
      }).toEntity(),
    /Invalid contig bin offset/
  );
}
const oldDescriptor = { ...descriptors[0] };
delete oldDescriptor.contigBinOffsets;
assert.equal(
  new ContigDescriptorDTO(oldDescriptor).toEntity().contigBinOffsets,
  undefined
);
const mixed = new AssemblyInfoDTO({
  ...compact,
  contigBinOffsets: { 0: { 100: -25 } },
}).toEntity();
assert.deepEqual([...mixed.contigDescriptors[1].contigBinOffsets], []);
console.log(
  "Explicit bin geometry validates offsets and retains older-server compatibility."
);

const retrievalRequests = loadTypeScript(
  resolve(projectRoot, "src/app/core/net/api/request.ts")
);
const retrievalDtos = loadTypeScript(
  resolve(projectRoot, "src/app/core/net/dto/requestDTO.ts")
);
const sequenceAdapter = new adapterExports.RequestManager({ host: "http://example.test" });
const resultSet = { id: "set-1", name: "ModDotPlot · k 21 · identity 80%", regionCount: 2, bytes: 8192 };
sequenceAdapter.sendRequest = async (request) => {
  assert.equal(request.requestPath, "/sequence/jobs/list");
  assert.deepEqual(retrievalDtos.HiCTAPIRequestDTO.toDTOClass(request).toDTO(), {});
  return { data: [{ jobId: "current", resultSet }, { jobId: "older" }] };
};
assert.deepEqual(await sequenceAdapter.listSequenceJobs(), [
  { jobId: "current", resultSet },
  { jobId: "older" },
]);
const overlayOptions = {
  scope: "selection",
  mergeCompatible: false,
  resolutions: [100, 1000],
  region: { rowStart: 50, rowEnd: 500, columnStart: 150, columnEnd: 800 },
  acceptLargeOutput: true,
};
for (const kind of ["dotplot", "moddotplot"]) {
  for (const action of ["estimate", "jobs"]) {
    const request = new retrievalRequests.SequenceOverlayRequest(kind, action, overlayOptions);
    assert.equal(request.requestPath, `/sequence/${kind}/${action}`);
    assert.deepEqual(retrievalDtos.HiCTAPIRequestDTO.toDTOClass(request).toDTO(), overlayOptions);
  }
}
const legacyEstimate = new retrievalRequests.EstimateFastaDotplotRequest({
  fastaFiles: ["assembly.fa"],
  binSize: 100,
  acceptLargeOutput: true,
});
assert.equal(legacyEstimate.requestPath, "/dotplot/estimate");
const legacyEstimateDto = retrievalDtos.HiCTAPIRequestDTO.toDTOClass(legacyEstimate).toDTO();
assert.deepEqual(legacyEstimateDto.fastaFiles, ["assembly.fa"]);
assert.equal(legacyEstimateDto.binSize, 100);
assert.equal(legacyEstimateDto.acceptLargeOutput, true);

for (const [name, options] of [
  ["PrepareCoverageNormalizationRequest", { source: "SECONDARY" }],
  ["CoverageNormalizationStatusRequest", { source: "SECONDARY" }],
  ["CancelCoverageNormalizationRequest", { source: "SECONDARY" }],
  [
    "SelectNormalizationWeightsRequest",
    { source: "SECONDARY", mode: "SQRT_COVERAGE" },
  ],
]) {
  const request = new retrievalRequests[name](options);
  assert.deepEqual(
    retrievalDtos.HiCTAPIRequestDTO.toDTOClass(request).toDTO(),
    options
  );
}
const recoverySettings = {
  queries: "ACGT",
  remoteRequestId: " fr9p7tgf016 ",
  searchTarget: "NCBI_REMOTE",
  remoteConsent: true,
  remoteDatabase: "nt",
  mode: "blast",
  scope: "database",
  bothStrands: true,
  degenerate: false,
  mismatches: 0,
  threads: -1,
};
const recoveryRequest = new retrievalRequests.RemoteBlastRetrievalRequest(
  recoverySettings
);
assert.equal(recoveryRequest.requestPath, "/sequence/remote_blast/retrieve");
assert.notEqual(recoveryRequest.requestPath, "/sequence/search/jobs");
assert.equal(recoveryRequest.options.remoteRequestId, "FR9P7TGF016");
assert.equal(recoveryRequest.options.queries, "ACGT");
assert.deepEqual(
  retrievalDtos.HiCTAPIRequestDTO.toDTOClass(recoveryRequest).toDTO(),
  recoveryRequest.options
);
assert.deepEqual(
  retrievalDtos.HiCTAPIRequestDTO.toDTOClass({
    requestPath: recoveryRequest.requestPath,
    options: recoveryRequest.options,
  }).toDTO(),
  recoveryRequest.options
);

assert.throws(
  () =>
    new retrievalRequests.RemoteBlastRetrievalRequest({
      ...recoverySettings,
      remoteRequestId: "RID&CMD=Put",
    }),
  /valid NCBI request/
);
console.log(
  "RID recovery uses a distinct download-only route and preserves pasted queries for local verification."
);
