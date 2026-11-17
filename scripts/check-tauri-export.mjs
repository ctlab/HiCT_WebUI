import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const source = await fs.readFile(
  new URL("../src-tauri/src/main.rs", import.meta.url),
  "utf8"
);
const handlers = source
  .match(/generate_handler!\[([\w,\s]+)\]/)?.[1]
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
assert.ok(handlers?.length, "Native command handlers must be declared");
const buildScript = await fs.readFile(
  new URL("../src-tauri/build.rs", import.meta.url),
  "utf8"
);
const manifestCommands = [
  ...(
    buildScript.match(/\.commands\(\s*&\s*\[([\s\S]*?)\]\s*\)/)?.[1] ?? ""
  ).matchAll(/"([a-z_]+)"/g),
].map((match) => match[1]);
assert.deepEqual(
  [...manifestCommands].sort(),
  [...handlers].sort(),
  "Every native handler needs generated command permissions"
);
const capability = JSON.parse(
  await fs.readFile(
    new URL("../src-tauri/capabilities/localhost-webui.json", import.meta.url),
    "utf8"
  )
);
assert.deepEqual(
  [...capability.permissions].sort(),
  handlers.map((command) => "allow-" + command.replaceAll("_", "-")).sort(),
  "The local WebUI must be allowed to invoke the declared native commands"
);
const start = source.indexOf("fn write_export_file("),
  end = source.indexOf('#[cfg(target_os = "linux")]', start);
assert.ok(start >= 0 && end > start);
const native = source.slice(start, end);
assert.ok(
  !native.includes("tauri::"),
  "The isolated check must compile the actual filesystem implementation without replacing it"
);
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hict-tauri-save-"));
const executableSuffix = process.platform === "win32" ? ".exe" : "";
try {
  const input = path.join(directory, "export.rs"),
    binary = path.join(directory, "export-tests" + executableSuffix);
  await fs.writeFile(input, native);
  const compile = spawnSync(
    "rustc",
    ["--test", "--edition=2021", input, "-o", binary],
    { encoding: "utf8" }
  );
  assert.equal(compile.status, 0, compile.stderr);
  const run = spawnSync(binary, [], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  console.log(run.stdout.trim());
  const streamInput = new URL(
    "../src-tauri/src/export_stream.rs",
    import.meta.url
  );
  const streamBinary = path.join(directory, "stream-tests" + executableSuffix);
  const streamCompile = spawnSync(
    "rustc",
    [
      "--test",
      "--edition=2021",
      fileURLToPath(streamInput),
      "-o",
      streamBinary,
    ],
    { encoding: "utf8" }
  );
  assert.equal(streamCompile.status, 0, streamCompile.stderr);
  const streamRun = spawnSync(streamBinary, [], { encoding: "utf8" });
  assert.equal(streamRun.status, 0, streamRun.stdout + streamRun.stderr);
  console.log(streamRun.stdout.trim());
  console.log(
    "Actual Tauri file-writing routine: complete replacement, failed destination preservation and temporary-file cleanup passed. Full wrapper compilation remains a separate toolchain gate."
  );
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
