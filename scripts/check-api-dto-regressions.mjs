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
