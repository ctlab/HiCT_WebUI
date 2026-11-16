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

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
  session,
} from "electron";
import {
  writeFile,
  readFile,
  stat,
  mkdir,
  rename,
  rm,
  open,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { CoordinateExports } from "./CoordinateExports";
import { isIP } from "node:net";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_HICT_URL = "http://127.0.0.1:8080/";
const APP_NAME = "HiCT";

function firstNonEmpty(
  ...values: Array<string | undefined>
): string | undefined {
  return values
    .find((value) => typeof value === "string" && value.trim().length > 0)
    ?.trim();
}

function requestedUrl(): string {
  const cliUrl = process.argv
    .slice(2)
    .find((argument) => /^https?:\/\//i.test(argument));
  return (
    firstNonEmpty(cliUrl, process.env.HICT_ELECTRON_URL, DEFAULT_HICT_URL) ??
    DEFAULT_HICT_URL
  );
}

function normalizeAllowedUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(
      `Unsupported URL protocol for HiCT Electron wrapper: ${url.protocol}`
    );
  }
  if (!isLocalHost(url)) {
    throw new Error(
      `HiCT Electron wrapper only opens local HiCT WebUI URLs, got: ${url.href}`
    );
  }
  return url;
}

function isLocalHost(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost") {
    return true;
  }
  const normalized =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
  const parsed = isIP(normalized);
  if (parsed === 4) {
    const parts = normalized
      .split(".")
      .map((part) => Number.parseInt(part, 10));
    const [first = -1, second = -1] = parts;
    return (
      first === 127 ||
      first === 10 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254)
    );
  }
  if (parsed === 6) {
    return (
      normalized === "::1" ||
      normalized.toLowerCase().startsWith("fc") ||
      normalized.toLowerCase().startsWith("fd") ||
      normalized.toLowerCase().startsWith("fe80:")
    );
  }
  return false;
}

function isAllowedHiCTUrl(rawUrl: string, baseUrl: URL): boolean {
  try {
    const url = new URL(rawUrl);
    if (!["http:", "https:"].includes(url.protocol)) {
      return false;
    }
    return isLocalHost(url) && url.port === baseUrl.port;
  } catch (_error) {
    return false;
  }
}

function isFallbackFileUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "file:" && rawUrl.startsWith(fallbackFileUrl());
  } catch (_error) {
    return false;
  }
}

function preloadPath(): string {
  return join(__dirname, "..", "preload", "preload.js");
}

function fallbackFileUrl(): string {
  return pathToFileURL(join(__dirname, "..", "..", "index.html")).toString();
}

function createWindow(baseUrl: URL): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 900,
    minHeight: 640,
    title: APP_NAME,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: preloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedHiCTUrl(url, baseUrl)) {
      return { action: "allow" };
    }
    void openExternalUrl(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAllowedHiCTUrl(url, baseUrl) || isFallbackFileUrl(url)) {
      return;
    }
    event.preventDefault();
    void openExternalUrl(url);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(
      `HiCT renderer process exited: reason=${details.reason} exitCode=${details.exitCode}`
    );
  });

  mainWindow.loadURL(baseUrl.href).catch((error) => {
    console.error(`Failed to load ${baseUrl.href}:`, error);
    void mainWindow.loadURL(fallbackFileUrl());
  });

  return mainWindow;
}

async function openExternalUrl(url: string): Promise<void> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      await shell.openExternal(parsed.href);
    }
  } catch (error) {
    console.warn(`Blocked external navigation to ${url}:`, error);
  }
}

async function chooseExportDestination(
  sender: Electron.WebContents,
  payload: { filename?: string; kind?: string }
) {
  const filename =
    typeof payload.filename === "string" && payload.filename.trim().length > 0
      ? payload.filename.trim()
      : "hict-export.bin";
  const parent = BrowserWindow.fromWebContents(sender);
  let directory = process.env.HICT_EXPORT_DIR;
  const kind = [
    "session",
    "fasta",
    "agp",
    "figure",
    "bookmarks",
    "preset",
    "pipeline",
    "other",
  ].includes(payload.kind ?? "")
    ? payload.kind
    : "export";
  const preferencePath = join(
    app.getPath("userData"),
    `last-${kind}-directory.txt`
  );
  try {
    const saved = await readFile(preferencePath, "utf8");
    if ((await stat(saved)).isDirectory()) directory = saved;
  } catch {
    /* First export, removed folder or unreadable preference: use default. */
  }
  const safeFilename = filename.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_");
  const options = {
    title: "Save HiCT export",
    defaultPath: directory ? join(directory, safeFilename) : safeFilename,
  };
  const result = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) {
    return undefined;
  }
  return { path: result.filePath, preferencePath };
}

function configureSecurity(baseUrl: URL): void {
  Menu.setApplicationMenu(null);
  ipcMain.handle("hict:quit", () => {
    app.quit();
  });
  const coordinateExports = new CoordinateExports(normalizeAllowedUrl);
  let waitingForExports = false,
    allowQuitOnce = false;
  app.on("before-quit", (event) => {
    if (allowQuitOnce) {
      allowQuitOnce = false;
      return;
    }
    const pending = coordinateExports.hasTransfers;
    const cleanup = coordinateExports.shutdown();
    if (!pending) return;
    event.preventDefault();
    if (!waitingForExports) {
      waitingForExports = true;
      void cleanup.finally(() => {
        waitingForExports = false;
        allowQuitOnce = true;
        app.quit();
      });
    }
  });
  const watched = new WeakSet<Electron.WebContents>();
  ipcMain.handle("hict:save-coordinate-export", (event, payload) => {
    const owner = event.sender;
    const ownerId = owner.id;
    if (!watched.has(owner)) {
      watched.add(owner);
      owner.on("destroyed", () => coordinateExports.cancel(ownerId));
      owner.on("render-process-gone", () => coordinateExports.cancel(ownerId));
      owner.on(
        "did-start-navigation",
        (_event, _url, _inPlace, isMainFrame) => {
          if (isMainFrame) coordinateExports.cancel(ownerId);
        }
      );
    }
    return coordinateExports.save(ownerId, payload, () =>
      chooseExportDestination(owner, payload)
    );
  });
  ipcMain.handle("hict:cancel-coordinate-export", (event, operationId) => {
    if (typeof operationId === "string")
      coordinateExports.cancel(event.sender.id, operationId);
  });
  ipcMain.handle(
    "hict:save-export",
    async (
      event,
      payload: {
        filename?: string;
        kind?: string;
        bytes?: number[] | Uint8Array | ArrayBuffer;
      }
    ): Promise<{ saved: boolean; path?: string }> => {
      const destination = await chooseExportDestination(event.sender, payload);
      if (!destination) return { saved: false };
      const result = { filePath: destination.path };
      const preferencePath = destination.preferencePath;
      // Renderers send a structured-clone Uint8Array (fast for large PDFs/PNGs);
      // plain number arrays from older renderers remain accepted.
      const raw = payload.bytes;
      const data = ArrayBuffer.isView(raw)
        ? Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength)
        : Object.prototype.toString.call(raw) === "[object ArrayBuffer]"
        ? Buffer.from(raw as ArrayBuffer)
        : Buffer.from(Array.isArray(raw) ? raw : []);
      const temporary = join(
        dirname(result.filePath),
        `.hict-save-${randomUUID()}.tmp`
      );
      const mode = await stat(result.filePath)
        .then((s) => s.mode & 0o777)
        .catch(() => 0o600);
      let created = false;
      try {
        const file = await open(temporary, "wx", mode);
        created = true;
        try {
          await file.writeFile(data);
          await file.sync();
        } finally {
          await file.close();
        }
        await rename(temporary, result.filePath);
      } finally {
        if (created) await rm(temporary, { force: true }).catch(() => {});
      }
      // Only remember a successfully written export, never a cancelled/failed one.
      try {
        await mkdir(dirname(preferencePath), { recursive: true });
        await writeFile(preferencePath, dirname(result.filePath), "utf8");
      } catch (error) {
        console.warn(
          "Export saved, but its destination could not be remembered:",
          error
        );
      }
      return { saved: true, path: result.filePath };
    }
  );
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    }
  );
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!isAllowedHiCTUrl(details.url, baseUrl)) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    const httpOrigin = baseUrl.origin;
    const cspHostname =
      baseUrl.hostname.includes(":") && !baseUrl.hostname.startsWith("[")
        ? `[${baseUrl.hostname}]`
        : baseUrl.hostname;
    const httpSameHostAllPorts = `${baseUrl.protocol}//${cspHostname}:*`;
    const wsOrigin = httpOrigin.replace(/^http/i, "ws");
    const wsSameHostAllPorts = httpSameHostAllPorts.replace(/^http/i, "ws");
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          `default-src 'self' ${httpOrigin} ${httpSameHostAllPorts} http://127.0.0.1:* http://localhost:* data: blob:; ` +
            "script-src 'self' 'unsafe-eval' 'unsafe-inline'; " +
            "style-src 'self' 'unsafe-inline'; " +
            `img-src 'self' data: blob: ${httpOrigin} ${httpSameHostAllPorts} http://127.0.0.1:* http://localhost:*; ` +
            // svg2pdf reads temporary in-memory PNG blobs through XHR. Keep
            // data: and external network origins excluded from connect-src.
            `connect-src 'self' blob: ${httpOrigin} ${httpSameHostAllPorts} ${wsOrigin} ${wsSameHostAllPorts} http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; ` +
            "font-src 'self' data:;",
        ],
      },
    });
  });
}

app.commandLine.appendSwitch("no-first-run");
app.commandLine.appendSwitch("disable-component-update");
if (process.platform === "linux") {
  app.commandLine.appendSwitch("no-sandbox");
}
app.setName(APP_NAME);
if (process.platform === "win32") {
  app.setAppUserModelId("ru.itmo.ctlab.hict");
}

let mainWindow: BrowserWindow | undefined;

app
  .whenReady()
  .then(async () => {
    const baseUrl = normalizeAllowedUrl(requestedUrl());
    if (process.env.HICT_RESET_WEBUI === "1") {
      await session.defaultSession.clearStorageData();
      await session.defaultSession.clearCache();
      console.error("HICT_WEBUI_RESET_COMPLETE");
    }
    configureSecurity(baseUrl);
    mainWindow = createWindow(baseUrl);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow(baseUrl);
      }
    });
  })
  .catch((error) => {
    console.error("HiCT Electron wrapper failed to start:", error);
    app.exit(1);
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
