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
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hict-tauri-save-"));
const executableSuffix = process.platform === "win32" ? ".exe" : "";
try {
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
    "Actual shared Tauri staged writer: binary/legacy bytes, ownership, navigation, complete replacement, failures and cleanup passed. Full wrapper compilation remains a separate toolchain gate."
  );
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
