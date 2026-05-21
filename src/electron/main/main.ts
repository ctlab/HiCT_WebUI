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

import { app, BrowserWindow, ipcMain, Menu, shell, session } from "electron";
import { isIP } from "node:net";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_HICT_URL = "http://127.0.0.1:8080/";
const APP_NAME = "HiCT";

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}

function requestedUrl(): string {
  const cliUrl = process.argv
    .slice(2)
    .find((argument) => /^https?:\/\//i.test(argument));
  return firstNonEmpty(cliUrl, process.env.HICT_ELECTRON_URL, DEFAULT_HICT_URL) ?? DEFAULT_HICT_URL;
}

function normalizeAllowedUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Unsupported URL protocol for HiCT Electron wrapper: ${url.protocol}`);
  }
  if (!isLocalHost(url)) {
    throw new Error(`HiCT Electron wrapper only opens local HiCT WebUI URLs, got: ${url.href}`);
  }
  return url;
}

function isLocalHost(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost") {
    return true;
  }
  const normalized = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  const parsed = isIP(normalized);
  if (parsed === 4) {
    const parts = normalized.split(".").map((part) => Number.parseInt(part, 10));
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
    console.error(`HiCT renderer process exited: reason=${details.reason} exitCode=${details.exitCode}`);
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

function configureSecurity(baseUrl: URL): void {
  Menu.setApplicationMenu(null);
  ipcMain.handle("hict:quit", () => {
    app.quit();
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!isAllowedHiCTUrl(details.url, baseUrl)) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    const httpOrigin = baseUrl.origin;
    const cspHostname = baseUrl.hostname.includes(":") && !baseUrl.hostname.startsWith("[")
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
            `connect-src 'self' ${httpOrigin} ${httpSameHostAllPorts} ${wsOrigin} ${wsSameHostAllPorts} http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; ` +
            "font-src 'self' data:;"
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

app.whenReady().then(() => {
  const baseUrl = normalizeAllowedUrl(requestedUrl());
  configureSecurity(baseUrl);
  mainWindow = createWindow(baseUrl);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow(baseUrl);
    }
  });
}).catch((error) => {
  console.error("HiCT Electron wrapper failed to start:", error);
  app.exit(1);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
