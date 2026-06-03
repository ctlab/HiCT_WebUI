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
import http from "node:http";
import https from "node:https";
import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { chmod, cp } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoDir = resolve(scriptDir, "..");

const args = parseArgs(process.argv.slice(2));
const platform = args.platform ?? detectPlatform();
const outputDir = resolve(args.output ?? join(repoDir, "..", "HiCT_JVM", "browsers-dist", platform, "electron"));
const electronPackageDir = resolve(repoDir, "node_modules", "electron");
const electronPackage = JSON.parse(readFileSync(resolve(electronPackageDir, "package.json"), "utf8"));
const electronRuntimeExecutable = await ensureInstalledElectronExecutable(electronPackageDir, platform);
const electronDist = dirname(electronRuntimeExecutable);
const electronVersion = String(electronPackage.version);

if (!["linux_x86_64", "windows_x86_64"].includes(platform)) {
  throw new Error(`Unsupported Electron browser payload platform: ${platform}`);
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

  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source)) {
    await cp(join(source, entry), join(target, entry), {
      recursive: true,
      dereference: true,
      filter: (src) => shouldCopyElectronRuntimePath(src, keepLocales),
    });
  }
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
    [
      `Electron runtime executable was not found in ${payloadRoot}.`,
      `Checked: ${candidates.join(", ")}`,
      `Installed Electron executable: ${electronRuntimeExecutable}`,
      `Installed Electron runtime directory entries: ${describeDirectory(electronDist)}`,
      `Payload entries: ${describeDirectory(payloadRoot)}`,
    ].join("\n")
  );
}

async function ensureInstalledElectronExecutable(packageDir, targetPlatform) {
  const executable = resolveInstalledElectronExecutable(packageDir, targetPlatform);
  if (executable) {
    return executable;
  }

  console.warn(
    [
      "Electron runtime executable was not found after npm install; attempting to repair Electron postinstall.",
      `Electron package directory entries: ${describeDirectory(packageDir)}`,
      `Electron dist directory entries: ${describeDirectory(resolve(packageDir, "dist"))}`,
    ].join("\n")
  );
  const repairSucceeded = repairElectronInstall(packageDir, targetPlatform);

  if (repairSucceeded) {
    const repairedExecutable = resolveInstalledElectronExecutable(packageDir, targetPlatform);
    if (repairedExecutable) {
      return repairedExecutable;
    }
  } else {
    console.warn("Electron postinstall repair failed; continuing with direct Electron artifact download.");
  }

  console.warn("Electron postinstall repair did not produce a runtime executable; forcing a fresh Electron artifact download.");
  await downloadAndExtractElectronRuntime(packageDir, targetPlatform);

  const downloadedExecutable = resolveInstalledElectronExecutable(packageDir, targetPlatform);
  if (downloadedExecutable) {
    return downloadedExecutable;
  }

  throw new Error(
    [
      "Electron runtime executable was not found after npm install, postinstall repair, and direct artifact download.",
      `Checked package: ${packageDir}`,
      `Electron package directory entries: ${describeDirectory(packageDir)}`,
      `Electron dist directory entries: ${describeDirectory(resolve(packageDir, "dist"))}`,
      "Ensure network access to Electron release artifacts and that no Electron skip/override environment variables are set.",
    ].join("\n")
  );
}

function resolveInstalledElectronExecutable(packageDir, targetPlatform) {
  const expectedExecutable = targetPlatform === "windows_x86_64" ? "electron.exe" : "electron";
  const candidates = [];
  const pathFile = resolve(packageDir, "path.txt");
  if (existsSync(pathFile)) {
    const relativeExecutable = readFileSync(pathFile, "utf8").trim();
    if (relativeExecutable) {
      candidates.push(resolve(packageDir, relativeExecutable));
    }
  }
  candidates.push(resolve(packageDir, "dist", expectedExecutable));

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function repairElectronInstall(packageDir, targetPlatform) {
  const installScript = resolve(packageDir, "install.js");
  if (!existsSync(installScript)) {
    throw new Error(`Electron install script was not found: ${installScript}`);
  }

  rmSync(resolve(packageDir, "dist"), { recursive: true, force: true });
  rmSync(resolve(packageDir, "path.txt"), { force: true });

  const env = { ...process.env };
  for (const key of [
    "ELECTRON_SKIP_BINARY_DOWNLOAD",
    "ELECTRON_OVERRIDE_DIST_PATH",
    "npm_config_electron_skip_binary_download",
    "npm_config_ELECTRON_SKIP_BINARY_DOWNLOAD",
  ]) {
    delete env[key];
  }
  env.npm_config_platform = targetPlatform === "windows_x86_64" ? "win32" : "linux";
  env.npm_config_arch = "x64";
  env.force_no_cache = "true";
  env.electron_config_cache = electronCacheRoot(targetPlatform);

  const result = spawnSync(process.execPath, [installScript], {
    cwd: packageDir,
    env,
    stdio: "inherit",
  });
  if (result.error) {
    console.warn(`Electron postinstall repair could not start: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) {
    console.warn(`Electron postinstall repair failed with exit code ${result.status}`);
    return false;
  }
  return true;
}

async function downloadAndExtractElectronRuntime(packageDir, targetPlatform) {
  const packageRequire = createRequire(resolve(packageDir, "install.js"));
  const extract = packageRequire("extract-zip");
  const distPath = resolve(packageDir, "dist");
  const pathFile = resolve(packageDir, "path.txt");
  const electronDtsInDist = resolve(distPath, "electron.d.ts");
  const electronDtsInPackage = resolve(packageDir, "electron.d.ts");
  const checksumsPath = resolve(packageDir, "checksums.json");
  const artifactName = electronArtifactName(targetPlatform);
  const artifactUrl = electronArtifactUrl(artifactName);
  const cacheRoot = electronCacheRoot(targetPlatform);
  const zipPath = resolve(cacheRoot, artifactName);

  rmSync(distPath, { recursive: true, force: true });
  rmSync(pathFile, { force: true });
  mkdirSync(distPath, { recursive: true });

  console.warn(`Downloading Electron runtime artifact: ${artifactUrl}`);
  await downloadFile(artifactUrl, zipPath);
  verifyElectronArtifactChecksum(zipPath, checksumsPath, artifactName);

  await extract(zipPath, { dir: distPath });

  if (existsSync(electronDtsInDist)) {
    rmSync(electronDtsInPackage, { force: true });
    renameSync(electronDtsInDist, electronDtsInPackage);
  }

  writeFileSync(pathFile, electronPlatformPath(targetPlatform), "utf8");
}

function electronArtifactName(targetPlatform) {
  return `electron-v${electronPackage.version}-${electronArtifactPlatform(targetPlatform)}-x64.zip`;
}

function electronArtifactPlatform(targetPlatform) {
  if (targetPlatform === "windows_x86_64") {
    return "win32";
  }
  if (targetPlatform === "linux_x86_64") {
    return "linux";
  }
  throw new Error(`Unsupported Electron platform for download: ${targetPlatform}`);
}

function electronArtifactUrl(artifactName) {
  const version = String(electronPackage.version);
  const baseUrl = (
    process.env.ELECTRON_MIRROR ??
    process.env.npm_config_electron_mirror ??
    process.env.electron_mirror ??
    `https://github.com/electron/electron/releases/download/v${version}/`
  ).replace(/\/?$/, "/");
  return `${baseUrl}${artifactName}`;
}

async function downloadFile(url, destination, redirectCount = 0) {
  if (redirectCount > 10) {
    throw new Error(`Too many redirects while downloading ${url}`);
  }

  rmSync(destination, { force: true });
  mkdirSync(dirname(destination), { recursive: true });

  await new Promise((resolvePromise, rejectPromise) => {
    const client = url.startsWith("http://") ? http : https;
    const request = client.get(url, (response) => {
      const statusCode = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(statusCode)) {
        response.resume();
        const location = response.headers.location;
        if (!location) {
          rejectPromise(new Error(`Electron download redirect did not include Location header: ${url}`));
          return;
        }
        const redirectUrl = new URL(location, url).toString();
        downloadFile(redirectUrl, destination, redirectCount + 1).then(resolvePromise, rejectPromise);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        rejectPromise(new Error(`Electron download failed with HTTP ${statusCode}: ${url}`));
        return;
      }

      const output = createWriteStream(destination, { flags: "wx" });
      response.pipe(output);
      output.on("finish", () => output.close(resolvePromise));
      output.on("error", (error) => {
        response.destroy();
        rmSync(destination, { force: true });
        rejectPromise(error);
      });
    });
    request.on("error", (error) => {
      rmSync(destination, { force: true });
      rejectPromise(error);
    });
    request.setTimeout(120_000, () => {
      request.destroy(new Error(`Timed out while downloading Electron runtime artifact: ${url}`));
    });
  });
}

function verifyElectronArtifactChecksum(zipPath, checksumsPath, artifactName) {
  if (!existsSync(checksumsPath)) {
    console.warn(`Electron checksums file is missing; cannot verify ${artifactName}`);
    return;
  }

  const checksums = JSON.parse(readFileSync(checksumsPath, "utf8"));
  const expected = checksums[artifactName];
  if (!expected) {
    console.warn(`Electron checksum is missing for ${artifactName}; cannot verify downloaded artifact.`);
    return;
  }

  const actual = createHash("sha256").update(readFileSync(zipPath)).digest("hex");
  if (actual !== expected) {
    rmSync(zipPath, { force: true });
    throw new Error(`Electron artifact checksum mismatch for ${artifactName}: expected ${expected}, got ${actual}`);
  }
}

function electronPlatformPath(targetPlatform) {
  return targetPlatform === "windows_x86_64" ? "electron.exe" : "electron";
}

function electronCacheRoot(targetPlatform) {
  const cacheRoot = resolve(
    process.env.HICT_ELECTRON_CACHE_DIR ?? join(repoDir, "node_modules", ".cache", "hict-electron"),
    targetPlatform
  );
  mkdirSync(cacheRoot, { recursive: true });
  return cacheRoot;
}

function shouldCopyElectronRuntimePath(path, keepLocales) {
  if (path.includes(`${sep}locales${sep}`)) {
    return keepLocales.has(basename(path));
  }
  if (path.endsWith(".pdb") || path.endsWith(".dSYM") || path.endsWith(".debug")) {
    return false;
  }
  return true;
}

function describeDirectory(path) {
  if (!existsSync(path)) {
    return `${path} does not exist`;
  }
  return listFiles(path)
    .slice(0, 80)
    .map((filePath) => filePath.slice(path.length + 1))
    .join(", ");
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
