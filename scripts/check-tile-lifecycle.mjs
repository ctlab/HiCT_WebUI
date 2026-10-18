import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const states = { LOADING: 1, EMPTY: 4, ERROR: 3 };
class Request {
  constructor() {
    this.listeners = {};
    this.headers = {};
    this.requestHeaders = {};
  }
  getResponseHeader(name) { return this.headers[name] ?? null; }
  addEventListener(name, fn) {
    this.listeners[name] = fn;
  }
  open(method, url) { this.method = method; this.url = url; }
  send(body) { this.body = body; }
  setRequestHeader(name, value) { this.requestHeaders[name] = value; }
  abort() {
    this.listeners.abort();
  }
}
const module = { exports: {} };
const file = new URL("../src/app/core/VersionedXYZSource.ts", import.meta.url);
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText,
  {
    module,
    exports: module.exports,
    XMLHttpRequest: Request,
    require: (name) => {
      if (name === "ol/TileState") return states;
      if (name === "ol/source/XYZ") return class {};
      if (name === "vue") return { unref: (x) => x };
      return {};
    },
  }
);
const Source = module.exports.VersionedXYZContactMapSource;
for (const method of ["loadPngTile", "loadBinarySignalTile"]) {
  for (const invalidated of [false, true]) {
    const source = Object.create(Source.prototype);
    Object.assign(source, {
      tileRequestEpoch: 0,
      activeTileRequests: new Set(),
      layersManager: {
        mapManager: { networkManager: { host: "http://localhost" } },
      },
      parseTileUrl: () => ({
        startRowPx: 0,
        endRowPx: 1,
        startColPx: 0,
        endColPx: 1,
      }),
    });
    let state = states.LOADING,
      transitions = 0;
    const tile = {
      setState: (value) => {
        state = value;
        transitions++;
      },
    };
    source[method](tile, {}, "http://localhost/get_tile");
    const request = [...source.activeTileRequests][0];
    if (invalidated) source.invalidatePendingTileRequests();
    else request.abort();
    assert.equal(
      state,
      states.EMPTY,
      `${method}: aborted tile must release its queue slot`
    );
    assert.equal(source.activeTileRequests.size, 0);
    request.listeners.error();
    assert.equal(transitions, 1, "late events cannot settle a tile twice");
  }
}
for (const method of ["loadPngTile", "loadBinarySignalTile"]) {
  for (const cached of [false, true]) {
    for (const marker of method === "loadPngTile" ? ["header", "json"] : ["header"]) {
      const source = Object.create(Source.prototype);
      Object.assign(source, {
        tileRequestEpoch: 0,
        activeTileRequests: new Set(),
        layersManager: { mapManager: { networkManager: { host: "http://localhost" } } },
        parseTileUrl: () => ({ startRowPx: 0, endRowPx: 1, startColPx: 0, endColPx: 1 }),
      });
      const transitions = [];
      const previous = cached ? { image: "previous" } : undefined;
      const tile = { lastResponse: previous, setState: state => transitions.push(state) };
      const image = { src: "unchanged" };
      source[method](tile, image, "http://localhost/get_tile");
      const request = [...source.activeTileRequests][0];
      request.status = 200;
      request.response = { image: "cancelled-placeholder", cancelled: marker === "json" };
      if (marker === "header") request.headers["x-hict-cancelled"] = "true";
      request.listeners.load();
      request.listeners.error();
      assert.deepEqual(transitions, [states.EMPTY], `${method}: server cancellation settles exactly once`);
      assert.equal(image.src, "unchanged", "Do not decode cancellation placeholders or repaint cached pixels");
      assert.equal(tile.lastResponse, previous, "Do not cache a cancelled result");
      assert.equal(source.activeTileRequests.size, 0);
    }
  }
}
console.log("PNG and binary tile abort lifecycle regressions passed.");
