#!/usr/bin/env node
/*
 Copyright (c) 2021-2026 Aleksandr Serdiukov, Anton Zamyatin, Aleksandr Sinitsyn, Vitalii Dravgelis and Computer Technologies Laboratory ITMO University team.

 Permission is hereby granted, free of charge, to any person obtaining a copy of
 this software and associated documentation files (the "Software"), to deal in
 the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { chmod, cp } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoDir = resolve(scriptDir, "..");

const args = parseArgs(process.argv.slice(2));
const platform = args.platform ?? detectPlatform();
const outputDir = resolve(args.output ?? join(repoDir, "..", "HiCT_JVM", "browsers-dist", platform, "electron"));
const electronDist = resolve(repoDir, "node_modules", "electron", "dist");
const electronPackage = JSON.parse(readFileSync(resolve(repoDir, "node_modules", "electron", "package.json"), "utf8"));
const electronVersion = String(electronPackage.version);

if (!["linux_x86_64", "windows_x86_64"].includes(platform)) {
  throw new Error(`Unsupported Electron browser payload platform: ${platform}`);
}
if (!existsSync(electronDist)) {
  throw new Error(`Electron runtime was not found at ${electronDist}. Run npm ci/install first.`);
}
if (!existsSync(resolve(repoDir, "dist", "electron", "main", "main.js"))) {
  throw new Error("Electron main process is not compiled. Run npm run electron:compile first.");
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const electronTarget = join(outputDir, "electron");
await copyElectronRuntime(electronDist, electronTarget);
await copyElectronApp(join(outputDir, "app"));

const command = resolveElectronCommand(outputDir, platform);
const executablePath = join(outputDir, command);
await chmodExecutableIfPresent(executablePath);
await flipSecurityFuses(executablePath);

const launchArguments = platform === "linux_x86_64" ? ["--no-sandbox", "app"] : ["app"];
const manifest = {
  name: `HiCT Electron ${electronVersion}`,
  engine: "electron-chromium",
  version: electronVersion,
  priority: 50,
  command,
  arguments: launchArguments,
  license: "Electron MIT; Chromium and bundled third-party components under their upstream licenses",
  notices: [
    "electron/LICENSE",
    "electron/LICENSES.chromium.html",
    "app/package.json"
  ],
  sizeBytes: directorySize(outputDir),
  sha256: sha256OfTree(outputDir),
};
writeFileSync(join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Prepared HiCT Electron browser payload for ${platform}`);
console.log(`  output: ${outputDir}`);
console.log(`  Electron: ${electronVersion}`);
console.log(`  size: ${(manifest.sizeBytes / (1024 * 1024)).toFixed(1)} MiB`);

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--platform") {
      parsed.platform = argv[++i];
    } else if (arg.startsWith("--platform=")) {
      parsed.platform = arg.slice("--platform=".length);
    } else if (arg === "--output") {
      parsed.output = argv[++i];
    } else if (arg.startsWith("--output=")) {
      parsed.output = arg.slice("--output=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function detectPlatform() {
  if (process.platform === "win32") {
    return "windows_x86_64";
  }
  if (process.platform === "linux") {
    return "linux_x86_64";
  }
  throw new Error(`Unsupported platform for HiCT Electron browser payload: ${process.platform}`);
}

async function copyElectronRuntime(source, target) {
  const keepLocales = new Set(
    (process.env.HICT_ELECTRON_KEEP_LOCALES ?? "en-US")
      .split(",")
      .map((locale) => locale.trim())
      .filter(Boolean)
      .map((locale) => `${locale}.pak`)
  );

  await cp(source, target, {
    recursive: true,
    dereference: true,
    filter: (src) => {
      if (src.includes(`${sep}locales${sep}`)) {
        return keepLocales.has(basename(src));
      }
      if (src.endsWith(".pdb") || src.endsWith(".dSYM") || src.endsWith(".debug")) {
        return false;
      }
      return true;
    },
  });
}

async function copyElectronApp(target) {
  mkdirSync(join(target, "main"), { recursive: true });
  mkdirSync(join(target, "preload"), { recursive: true });
  await cp(resolve(repoDir, "dist", "electron", "main"), join(target, "main"), { recursive: true });
  await cp(resolve(repoDir, "dist", "electron", "preload"), join(target, "preload"), { recursive: true });
  await cp(resolve(repoDir, "dist", "index.html"), join(target, "index.html"));
  await cp(resolve(repoDir, "dist", "assets"), join(target, "assets"), { recursive: true });

  const appPackage = {
    name: "hict-electron-browser",
    version: JSON.parse(readFileSync(resolve(repoDir, "package.json"), "utf8")).version,
    private: true,
    main: "main/main.js",
    license: "MIT",
  };
  writeFileSync(join(target, "package.json"), `${JSON.stringify(appPackage, null, 2)}\n`, "utf8");
}

function resolveElectronCommand(payloadRoot, targetPlatform) {
  const candidates =
    targetPlatform === "windows_x86_64"
      ? ["electron/electron.exe", "electron.exe"]
      : ["electron/electron", "electron"];
  for (const candidate of candidates) {
    const candidatePath = join(payloadRoot, candidate);
    if (existsSync(candidatePath) && statSync(candidatePath).isFile()) {
      return candidate;
    }
  }
  throw new Error(
    `Electron runtime executable was not found in ${payloadRoot}. Checked: ${candidates.join(", ")}`
  );
}

async function chmodExecutableIfPresent(path) {
  if (platform !== "linux_x86_64" || !existsSync(path)) {
    return;
  }
  await chmod(path, 0o755);
  for (const helper of ["chrome-sandbox", "chrome_crashpad_handler"]) {
    const helperPath = join(dirname(path), helper);
    if (existsSync(helperPath)) {
      await chmod(helperPath, 0o755);
    }
  }
}

async function flipSecurityFuses(executablePath) {
  try {
    const { flipFuses, FuseVersion, FuseV1Options } = await import("@electron/fuses");
    await flipFuses(executablePath, {
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    });
  } catch (error) {
    console.warn(`Could not flip Electron security fuses for ${executablePath}: ${error.message}`);
  }
}

function directorySize(path) {
  const stats = statSync(path);
  if (stats.isFile()) {
    return stats.size;
  }
  return readdirSync(path)
    .map((entry) => directorySize(join(path, entry)))
    .reduce((left, right) => left + right, 0);
}

function sha256OfTree(path) {
  const hash = createHash("sha256");
  for (const filePath of listFiles(path).sort()) {
    if (basename(filePath) === "manifest.json") {
      continue;
    }
    hash.update(filePath.slice(path.length + 1));
    hash.update("\0");
    hash.update(readFileSync(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function listFiles(path) {
  const stats = statSync(path);
  if (stats.isFile()) {
    return [path];
  }
  return readdirSync(path).flatMap((entry) => listFiles(join(path, entry)));
}
