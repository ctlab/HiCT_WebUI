import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

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

console.log("API DTO regression check passed.");
