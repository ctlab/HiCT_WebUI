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
    failures.push(`Missing requestPath DTO fallback for ${mapping.requestPath}`);
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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      esModuleInterop: true }, fileName: filename,
  }).outputText;
  const nativeRequire = createRequire(filename);
  const require = name => name.startsWith(".")
    ? loadTypeScript(resolve(dirname(filename), name + ".ts")) : nativeRequire(name);
  new Function("exports", "require", "module", compiled)(module.exports, require, module);
  return module.exports;
}
const { ContigDescriptorDTO, AssemblyInfoDTO } = loadTypeScript(
  resolve(projectRoot, "src/app/core/net/dto/dto.ts")
);
const descriptors = Array.from({ length: 4 }, (_, i) => ({
  contigId: i, contigName: "c" + i, contigOriginalName: "source" + i,
  contigOffsetInSource: i * 1000, contigLengthBp: i * 1000,
  contigLengthBins: { 100: String(i * 10), 250: i * 4, 1000: i },
  contigPresenceAtResolution: { 100: i, 250: i, 1000: i }, contigDirection: i % 2,
}));
for (const [i, descriptor] of descriptors.entries()) {
  const entity = new ContigDescriptorDTO(descriptor).toEntity();
  assert.deepEqual([...entity.contigLengthBins], [[100,i*10],[250,i*4],[1000,i]]);
  assert.deepEqual([...entity.presenceAtResolution], [[100,i],[250,i],[1000,i]]);
  assert.equal(entity.direction, i % 2);
  assert.equal(entity.contigSourceName, "source" + i);
  assert.equal(entity.contigOffsetInSource, i * 1000);
}
const input = { contigDescriptors: descriptors, scaffoldDescriptors: [] };
const first = new AssemblyInfoDTO(input).toEntity();
first.contigDescriptors[0].contigLengthBins.set(100, 999);
const next = new AssemblyInfoDTO(input).toEntity();
assert.equal(next.contigDescriptors[0].contigLengthBins.get(100), 0);
assert.notEqual(first.contigDescriptors[0].contigLengthBins, next.contigDescriptors[0].contigLengthBins);
assert.deepEqual(new AssemblyInfoDTO({contigDescriptors: [], scaffoldDescriptors: []}).toEntity(),
  {contigDescriptors: [], scaffoldDescriptors: []});
console.log("API DTO regression check passed (including real assembly response conversion).");

// The negotiated representation must produce exactly the same application state.
const scaffoldDtos = [
  {scaffoldId: 2147483657, scaffoldName: 'alias α', scaffoldOriginalName: 'original', spacerLength: 1000, scaffoldBordersBP: {startBP: 123, endBP: 999}},
  {scaffoldId: 18, scaffoldName: 'unplaced', scaffoldOriginalName: 'unplaced', spacerLength: 0, scaffoldBordersBP: null},
];
const legacy = {contigDescriptors: descriptors.map(d => ({...d, contigSourceName: 'source😀\"'})), scaffoldDescriptors: scaffoldDtos};
const compact = {format: 'compact-v1', resolutions: [100,250,1000],
  contigs: legacy.contigDescriptors.map(d => [d.contigId,d.contigName,d.contigOriginalName,d.contigSourceName,d.contigOffsetInSource,d.contigDirection,d.contigLengthBp,
    [100,250,1000].map(r => Number(d.contigLengthBins[r])), [100,250,1000].map(r => d.contigPresenceAtResolution[r])]),
  scaffolds: scaffoldDtos.map(s => [s.scaffoldId,s.scaffoldName,s.scaffoldOriginalName,s.spacerLength,s.scaffoldBordersBP ? [s.scaffoldBordersBP.startBP,s.scaffoldBordersBP.endBP] : null])};
assert.deepEqual(new AssemblyInfoDTO(compact).toEntity(), new AssemblyInfoDTO(legacy).toEntity());
const converted = new AssemblyInfoDTO(compact).toEntity();
converted.contigDescriptors[0].contigLengthBins.set(100, 777);
assert.deepEqual(new AssemblyInfoDTO(compact).toEntity(), new AssemblyInfoDTO(legacy).toEntity());
assert.deepEqual(new AssemblyInfoDTO({format:'compact-v1',resolutions:[],contigs:[],scaffolds:[]}).toEntity(), {contigDescriptors:[],scaffoldDescriptors:[]});
for (const damage of [
  c => { c.format='compact-v2'; },
  c => { c.resolutions[1]=c.resolutions[0]; },
  c => { c.contigs[0].pop(); },
  c => { c.contigs[0][7].pop(); },
  c => { c.contigs[0][8][0]=99; },
  c => { c.contigs[0][5]=9; },
  c => { c.scaffolds[0][4]=[1]; },
]) {
  const bad=structuredClone(compact);damage(bad);
  assert.throws(()=>new AssemblyInfoDTO(bad).toEntity());
}
const { HiCTAPIRequestDTO } = loadTypeScript(resolve(projectRoot,'src/app/core/net/dto/requestDTO.ts'));
const requestClasses = loadTypeScript(resolve(projectRoot,'src/app/core/net/api/request.ts'));
for (const name of ['ReverseSelectionRangeRequest','MoveSelectionRangeRequest','SplitContigRequest','GroupContigsIntoScaffoldRequest','UngroupContigsFromScaffoldRequest','MoveSelectionToDebrisRequest']) {
  const request = new requestClasses[name]({startBP:0,endBP:100,targetStartBP:200,splitPx:50,bpResolution:100});
  assert.equal(HiCTAPIRequestDTO.toDTOClass(request).toDTO().assemblyFormat,'compact-v1',name);
}
console.log('Compact assembly contract, invalid payloads, independent maps and opt-in edit requests passed.');
for (const policy of [undefined, 'APPEND_UNPLACED', 'EXCLUDE']) {
  const request = new requestClasses.LoadAGPRequest({agpFilename:'layout.agp',missingComponentsPolicy:policy});
  const payload=HiCTAPIRequestDTO.toDTOClass(request).toDTO();
  assert.equal(payload.agpFilename,'layout.agp');assert.equal(payload.missingComponentsPolicy,policy);
}
for (const name of ['GetAGPForAssemblyRequest','GetFastaForAssemblyRequest']) {
  assert.equal(HiCTAPIRequestDTO.toDTOClass(new requestClasses[name]()).toDTO().preserveImportedGaps,true);
}
console.log('AGP omission choices and matching AGP/FASTA gap export requests passed.');

for (const [name, options] of [
  ['AssemblyHistoryRequest', {offset: 100, limit: 100}],
  ['RestoreAssemblyHistoryRequest', {session: 'session-id', revision: 7, action: 'restore', id: 3, assemblyFormat: 'compact-v1'}],
]) {
  assert.deepEqual(HiCTAPIRequestDTO.toDTOClass(new requestClasses[name](options)).toDTO(), options);
}
console.log('Journal pagination and guarded restoration payloads passed.');

// Execute the production HTTP adapter with controlled responses. A history-list
// response must not authorize edits using coordinates from an older displayed map.
const vm = await import('node:vm');
const adapterSource = ts.transpileModule(readFileSync(resolve(projectRoot,
  'src/app/core/net/api/RequestManager.ts'),'utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}
}).outputText;
let responseRevision=2;
let sentHeaders;
const adapterExports={};
vm.runInNewContext(adapterSource,{exports:adapterExports,console,require:name=>{
  if(name==='vue')return {shallowReactive:value=>value};
  if(name==='axios')return {post:async(url,payload,config)=>{
    sentHeaders=config.headers;
    return {data:{},headers:{'x-hict-history':JSON.stringify({session:'s',revision:responseRevision,currentId:responseRevision,position:responseRevision,size:responseRevision+1,canUndo:true,canRedo:false})}};
  }};
  if(name==='../dto/requestDTO')return {HiCTAPIRequestDTO:{toDTOClass:request=>({toDTO:()=>request.options ?? {}})}};
  return {};
}});
const adapter=new adapterExports.RequestManager({host:'http://example.test'});
adapter.notifyInboundPayload=()=>{};
adapter.history.summary={session:'s',revision:1};adapter.history.applied={session:'s',revision:1};
await adapter.sendRequest({requestPath:'/assembly/history'});
assert.equal(adapter.history.summary.revision,2);
assert.equal(adapter.history.applied.revision,1,'Reading the journal must not advance the displayed-coordinate guard');
responseRevision=3;
await adapter.sendRequest({requestPath:'/reverse_selection_range'});
assert.equal(sentHeaders['X-HiCT-History-Revision'],'1');
assert.equal(adapter.history.applied.revision,3);
assert.equal(adapter.history.busy,0);
console.log('History reads cannot authorize edits on stale displayed coordinates.');
