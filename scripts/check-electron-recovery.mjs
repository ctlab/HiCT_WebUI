import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { loadElectronSource } from "./load-electron-source.mjs";
const require = createRequire(import.meta.url),
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "hict recovery # "));
const source = await fs.readFile(
  new URL("../src/electron/main/main.ts", import.meta.url),
  "utf8"
);
function moduleFor(mainDirectory) {
  const exports = {},
    handlers = new Map(),
    errors = [];
  let permissionRequest;
  const electron = {
    net: { fetch },
    app: {
      commandLine: { appendSwitch() {} },
      setName() {},
      getPath: () => directory,
      on() {},
      whenReady: () => new Promise(() => {}),
    },
    BrowserWindow: { fromWebContents: (contents) => contents.owner },
    dialog: { showErrorBox: (...args) => errors.push(args) },
    Menu: { setApplicationMenu() {} },
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    session: {
      defaultSession: {
        setPermissionRequestHandler(handler) {
          permissionRequest = handler;
        },
        webRequest: { onHeadersReceived() {} },
      },
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      source + "\nexports.test={loadApplication,configureSecurity};",
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }
    ).outputText,
    {
      exports,
      __dirname: mainDirectory,
      URL,
      Buffer,
      process: { platform: "linux", env: {} },
      console: { warn() {}, error() {} },
      require: (name) =>
        name === "electron"
          ? electron
          : name === "./CoordinateExports" || name === "./BundledUi"
          ? loadElectronSource(name.slice(2))
          : require(name),
    }
  );
  return {
    ...exports.test,
    handlers,
    errors,
    requestPermission: (permission, details) =>
      new Promise((resolve) =>
        permissionRequest(null, permission, resolve, details)
      ),
  };
}
class Window {
  constructor() {
    this.webContents = new EventEmitter();
    this.webContents.owner = this;
    this.webContents.getURL = () => this.url;
    this.url = "";
    this.calls = [];
    this.mode = "offline";
    this.destroyed = false;
  }
  isDestroyed() {
    return this.destroyed;
  }
  close() {
    this.destroyed = true;
  }
  async loadURL(url, options) {
    this.calls.push(url);
    if (url.startsWith("http://localhost:8187/"))
      assert.match(options.extraHeaders, /Cache-Control: no-cache/);
    if (url.startsWith("http://localhost:8187/")) {
      if (this.mode === "offline") throw Error("connection refused");
      if (this.mode === "cancelled")
        throw Object.assign(Error("navigation cancelled"), {
          code: "ERR_ABORTED",
        });
      if (this.mode === "pending")
        await new Promise((resolve) => {
          this.resume = resolve;
        });
      if (this.mode === "destroyed") {
        this.destroyed = true;
        throw Error("window closed");
      }
      this.webContents.emit(
        "did-navigate",
        {},
        url,
        this.mode === "http-error" ? 503 : 200,
        "status"
      );
    } else if (this.mode === "broken-fallback")
      throw Error("missing bundled file");
    this.url = url;
  }
}
try {
  const dev = path.join(directory, "dev/dist/electron/main"),
    portable = path.join(directory, "portable/app/main");
  for (const main of [dev, portable]) await fs.mkdir(main, { recursive: true });
  for (const root of [
    path.resolve(dev, "../.."),
    path.resolve(portable, ".."),
  ]) {
    await fs.mkdir(path.join(root, "assets"));
    await fs.writeFile(path.join(root, "index.html"), '<div id="app"></div>');
  }
  const development = moduleFor(dev),
    packaged = moduleFor(portable),
    base = new URL("http://localhost:8187/");
  const { bundledUiRoot, BundledUiServer } = loadElectronSource("BundledUi");
  assert.equal(bundledUiRoot(dev), path.resolve(dev, "../.."));
  const fallback = new URL("http://127.0.0.1:9901/index.html");
  const recovery = new URL(fallback);
  recovery.searchParams.set("api", base.origin);
  const bundled = {
    url: async () => fallback.href,
    isPageUrl: (raw) => {
      try {
        const u = new URL(raw);
        return (
          u.origin === "http://127.0.0.1:9901" && u.pathname === "/index.html"
        );
      } catch {
        return false;
      }
    },
  };
  assert.equal(bundledUiRoot(portable), path.resolve(portable, ".."));
  const window = new Window();
  assert.equal(await packaged.loadApplication(window, base, bundled), false);
  assert.deepEqual(window.calls, [base.href, recovery.href]);
  assert.equal(window.url, recovery.href);
  assert.equal(window.webContents.listenerCount("did-navigate"), 0);
  window.mode = "http-error";
  assert.equal(await packaged.loadApplication(window, base, bundled), false);
  assert.equal(window.url, recovery.href);
  window.mode = "cancelled";
  const before = window.calls.length;
  assert.equal(await packaged.loadApplication(window, base, bundled), false);
  assert.equal(
    window.calls.length,
    before + 1,
    "Cancelled departure must preserve the existing local page without another forced navigation"
  );
  window.mode = "pending";
  const first = packaged.loadApplication(window, base, bundled),
    second = packaged.loadApplication(window, base, bundled);
  assert.equal(
    first,
    second,
    "Repeated reconnect shares the in-flight navigation"
  );
  await new Promise((resolve) => setImmediate(resolve));
  window.mode = "online";
  window.resume();
  assert.equal(await first, true);
  assert.equal(window.url, base.href);
  assert.equal(window.webContents.listenerCount("did-navigate"), 0);
  const owned = packaged.configureSecurity(base);
  const clipboardWrite = "clipboard-sanitized-write";
  const primaryFrame = { isMainFrame: true, requestingUrl: base.href };
  assert.equal(
    await packaged.requestPermission(clipboardWrite, primaryFrame),
    true
  );
  assert.equal(
    await packaged.requestPermission("clipboard-read", primaryFrame),
    false
  );
  assert.equal(
    await packaged.requestPermission(clipboardWrite, {
      ...primaryFrame,
      isMainFrame: false,
    }),
    false
  );
  assert.equal(
    await packaged.requestPermission(clipboardWrite, {
      ...primaryFrame,
      requestingUrl: "http://localhost:1/",
    }),
    false
  );
  const reconnect = packaged.handlers.get("hict:reconnect");
  assert.equal(
    (await reconnect({ sender: window.webContents })).connected,
    false,
    "Online pages cannot request recovery navigation"
  );
  assert.equal(
    await packaged.handlers.get("hict:recovery-status")({
      sender: window.webContents,
    }),
    false
  );
  window.url = await owned.url();
  assert.equal(
    await packaged.handlers.get("hict:recovery-status")({
      sender: window.webContents,
    }),
    true
  );
  assert.equal(
    (await reconnect({ sender: window.webContents })).connected,
    true
  );
  owned.close();
  const closed = new Window();
  closed.mode = "destroyed";
  assert.equal(await packaged.loadApplication(closed, base, bundled), false);
  assert.equal(closed.calls.length, 1);
  const broken = new Window();
  broken.mode = "broken-fallback";
  // A failed hosted load followed by a failed local load must resolve, report and close.
  broken.loadURL = async (url) => {
    broken.calls.push(url);
    throw Error("unavailable");
  };
  assert.equal(await packaged.loadApplication(broken, base, bundled), false);
  assert.equal(broken.destroyed, true);
  assert.equal(packaged.errors.length, 1);
  const { bundledUiHandler } = loadElectronSource("BundledUi");
  const root = path.resolve(portable, "..");
  let fetched = 0;
  await fs.writeFile(path.join(root, "assets/example.js"), "public source");
  await fs.writeFile(path.join(portable, "main.js"), "private main source");
  await fs.writeFile(path.join(directory, "secret"), "outside bundle");
  await fs.symlink(
    path.join(directory, "secret"),
    path.join(root, "assets/escape")
  );
  const resources = bundledUiHandler(
    portable,
    "http://127.0.0.1:9901",
    "default-src 'self'",
    async (url) => {
      fetched++;
      assert.ok(url.includes("%20") && url.includes("%23"));
      return new Response(await fs.readFile(new URL(url)), {
        headers: { "Content-Type": "application/javascript" },
      });
    }
  );
  const asset = await resources({
    method: "GET",
    url: "http://127.0.0.1:9901/assets/example.js",
  });
  assert.equal(await asset.text(), "public source");
  assert.equal(
    asset.headers.get("content-security-policy"),
    "default-src 'self'"
  );
  assert.equal(asset.headers.get("cache-control"), "no-store");
  const head = await resources({
    method: "HEAD",
    url: "http://127.0.0.1:9901/assets/example.js",
  });
  assert.equal(await head.text(), "");
  let bodyCancelled = false;
  const headOnly = bundledUiHandler(
    portable,
    "http://127.0.0.1:9901",
    "default-src 'self'",
    async () =>
      new Response(
        new ReadableStream({
          cancel() {
            bodyCancelled = true;
          },
        })
      )
  );
  assert.equal(
    (
      await headOnly({
        method: "HEAD",
        url: "http://127.0.0.1:9901/assets/example.js",
      })
    ).status,
    200
  );
  assert.equal(
    bodyCancelled,
    true,
    "HEAD must release the unread file response"
  );
  const fetchedBefore = fetched;
  for (const url of [
    "http://127.0.0.1:9902/assets/example.js",
    "file:///etc/passwd",
    "http://127.0.0.1:9901/main/main.js",
    "http://127.0.0.1:9901/assets/../main/main.js",
    "http://127.0.0.1:9901/assets/escape",
    "http://127.0.0.1:9901/%2f..%2f..%2fsecret",
    "http://127.0.0.1:9901/%00",
    "http://127.0.0.1:9901/%ZZ",
  ])
    assert.equal((await resources({ method: "GET", url })).status, 404, url);
  assert.equal(
    (
      await resources({
        method: "POST",
        url: "http://127.0.0.1:9901/index.html",
      })
    ).status,
    405
  );
  assert.equal(
    fetched,
    fetchedBefore,
    "Rejected paths must never reach filesystem response fetching"
  );
  const preference = path.join(directory, "profile", "port");
  const makeServer = () =>
    new BundledUiServer(
      portable,
      preference,
      "default-src 'self'",
      async (url) => new Response(await fs.readFile(new URL(url)))
    );
  const local = makeServer();
  let ownedUrl;
  try {
    const first = local.url();
    assert.equal(first, local.url());
    ownedUrl = await first;
    assert.equal(local.isPageUrl(ownedUrl + "?view=1#scope"), true);
    assert.equal(local.isPageUrl(ownedUrl + ".other"), false);
    assert.equal(local.isPageUrl("http://untrusted/index.html"), false);
    assert.equal(
      local.isPageUrl(pathToFileURL(path.join(root, "index.html")).href),
      false
    );
    assert.equal(
      await (await fetch(new URL("assets/example.js", ownedUrl))).text(),
      "public source"
    );
    const http = require("node:http");
    assert.equal(
      await new Promise((resolve, reject) => {
        const req = http.get(
          ownedUrl,
          { headers: { Host: "untrusted" } },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          }
        );
        req.on("error", reject);
      }),
      404
    );
    const conflict = makeServer();
    try {
      assert.notEqual(
        await conflict.url(),
        ownedUrl,
        "An occupied preferred port must never be trusted"
      );
    } finally {
      conflict.close();
    }
  } finally {
    local.close();
  }
  assert.equal(local.isPageUrl(ownedUrl), false);
  await assert.rejects(local.url(), /closed/);
  await fs.writeFile(preference, new URL(ownedUrl).port);
  const restart = makeServer();
  try {
    assert.equal(
      await restart.url(),
      ownedUrl,
      "Normal restarts preserve the storage origin"
    );
  } finally {
    restart.close();
  }
  await fs.rm(path.resolve(portable, "../index.html"));
  assert.throws(() => bundledUiRoot(portable), /missing/);
  console.log(
    "Electron recovery: both layouts, scoped public assets, path/symlink rejection, escaped paths, offline/HTTP failure, bounded retries, cancelled departure and missing resources passed."
  );
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
