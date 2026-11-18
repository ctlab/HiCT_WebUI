import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const exports = {},
  choices = [],
  remembered = [],
  downloads = [],
  revoked = [],
  timers = [];
const browser = { setTimeout: (fn) => timers.push(fn) };
const url = {
  createObjectURL: () => `blob:${downloads.length}`,
  revokeObjectURL: (u) => revoked.push(u),
};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      new URL("../src/app/core/export/FileSave.ts", import.meta.url),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText,
  {
    exports,
    window: browser,
    URL: url,
    Blob,
    File,
    Uint8Array,
    document: {
      createElement: () => ({
        click() {
          downloads.push({ filename: this.download, url: this.href });
        },
      }),
    },
    require: () => ({
      useUiSettingsStore: () => ({
        rememberSavedFile: (...args) => remembered.push(args),
      }),
    }),
  }
);
const {
  prepareFileSave,
  saveFileBlob,
  pickSessionFile,
  canPickSessionFile,
  pickFigureFile,
} = exports;
const data = new Blob(["ACTG"], { type: "text/plain" });
let content,
  aborts = 0,
  closed = 0,
  writeError = false,
  closeError = false;
const handle = {
  name: "chosen.fa",
  getFile: async () => new File([content], "chosen.fa"),
  createWritable: async () => ({
    write: async (blob) => {
      if (writeError) throw Error("write denied");
      content = blob;
    },
    close: async () => {
      if (closeError) throw Error("close denied");
      closed++;
    },
    abort: async () => {
      aborts++;
    },
  }),
};
browser.showSaveFilePicker = async (options) => {
  choices.push(options);
  return handle;
};
const pending = prepareFileSave("../bad:name.fa", "fasta");
assert.equal(
  choices.length,
  1,
  "The browser picker must be invoked before awaiting preparation"
);
assert.equal(choices[0].suggestedName, ".._bad_name.fa");
assert.equal(choices[0].id, "hict-fasta");
let result = await (await pending).write(data);
assert.equal(result.status, "saved");
assert.equal(closed, 1);
assert.equal(await (await result.readFile()).text(), "ACTG");
assert.deepEqual(remembered, [["fasta", "chosen.fa"]]);
await prepareFileSave("next.fa", "fasta");
assert.equal(choices.at(-1).startIn, handle);
await prepareFileSave("session.json", "session");
assert.equal(choices.at(-1).startIn, undefined);
const previous = remembered.length;
writeError = true;
await assert.rejects(
  (await prepareFileSave("failed.fa", "fasta")).write(data),
  /write denied/
);
writeError = false;
closeError = true;
await assert.rejects(
  (await prepareFileSave("failed.fa", "fasta")).write(data),
  /close denied/
);
assert.equal(aborts, 2);
assert.equal(remembered.length, previous);
closeError = false;
browser.showSaveFilePicker = async () => {
  throw Object.assign(Error("cancel"), { name: "AbortError" });
};
assert.equal(await prepareFileSave("cancel.json", "session"), undefined);
assert.equal(downloads.length, 0);
browser.showSaveFilePicker = async () => {
  throw Object.assign(Error("not allowed"), { name: "SecurityError" });
};
await assert.rejects(prepareFileSave("denied.json", "session"), /not allowed/);
assert.equal(downloads.length, 0);
browser.showOpenFilePicker = async (options) => {
  assert.equal(options.id, "hict-session");
  return [handle];
};
assert.equal(canPickSessionFile(), true);
assert.equal(await (await pickSessionFile()).text(), "ACTG");
let figurePicks = 0;
browser.showOpenFilePicker = async (options) => {
  assert.equal(options.id, "hict-figure");
  assert.equal(options.multiple, false);
  assert.equal(options.startIn, figurePicks++ ? handle : undefined);
  assert.equal(options.types[0].accept["image/svg+xml"][0], ".svg");
  return [handle];
};
assert.equal(await (await pickFigureFile()).text(), "ACTG");
assert.equal(await (await pickFigureFile()).text(), "ACTG");
browser.showOpenFilePicker = async () => {
  throw Object.assign(Error("cancel"), { name: "AbortError" });
};
assert.equal(await pickSessionFile(), undefined);
assert.equal(await pickFigureFile(), undefined);
browser.showOpenFilePicker = async () => {
  throw Error("read denied");
};
await assert.rejects(pickFigureFile(), /read denied/);
browser.hictDesktop = {
  saveExport: async (payload) => {
    assert.equal(payload.kind, "agp");
    assert.ok(payload.bytes instanceof Uint8Array);
    return { saved: false };
  },
};
assert.equal(canPickSessionFile(), false);
result = await saveFileBlob(data, "assembly.agp", "agp");
assert.equal(result.status, "cancelled");
browser.hictDesktop.saveExport = async () => ({
  saved: true,
  path: "/results/selected.agp",
});
result = await saveFileBlob(data, "assembly.agp", "agp");
assert.equal(result.status, "saved");
assert.equal(result.filename, "selected.agp");
assert.equal(await (await result.readFile()).text(), "ACTG");
browser.hictDesktop.saveExport = async () => undefined;
await assert.rejects(
  saveFileBlob(data, "assembly.agp", "agp"),
  /did not confirm/
);
delete browser.hictDesktop;
browser.__TAURI__ = {
  core: {
    invoke: async (command, args) => {
      assert.equal(command, "save_export");
      assert.equal(args.kind, "session");
      assert.equal(args.bytes.length, 4);
      return null;
    },
  },
};
assert.equal(
  (await saveFileBlob(data, "session.json", "session")).status,
  "cancelled"
);
browser.__TAURI__.core.invoke = async () => "/session/saved.json";
assert.equal(
  (await saveFileBlob(data, "session.json", "session")).status,
  "saved"
);
delete browser.__TAURI__;
delete browser.showSaveFilePicker;
const before = remembered.length;
result = await saveFileBlob(data, "assembly.fasta", "fasta");
assert.equal(result.status, "download-started");
assert.equal(remembered.length, before);
assert.equal(downloads.length, 1);
assert.equal(revoked.length, 0);
timers.forEach((fn) => fn());
assert.equal(revoked.length, 1);
console.log(
  "File destinations: activation, exact bytes, per-kind handles, confirmed close, cancellation, failures, native results, open-session picker and honest download fallback passed."
);

delete browser.hictDesktop;
delete browser.__TAURI__;
let bytes = 0,
  writes = 0,
  produced = 0,
  maxAhead = 0,
  streamClosed = 0,
  streamAborts = 0;
let failOpen = false,
  failWrite = false,
  failClose = false;
const streamingHandle = {
  name: "large.fa",
  getFile: handle.getFile,
  createWritable: async () => {
    if (failOpen) throw Error("stream open failed");
    return {
      write: async (value) => {
        if (failWrite) throw Error("stream write failed");
        assert.ok(value instanceof Uint8Array);
        assert.equal(value[0], writes % 251);
        assert.equal(value.at(-1), writes % 251);
        await new Promise((resolve) => setImmediate(resolve));
        bytes += value.byteLength;
        writes++;
      },
      close: async () => {
        if (failClose) throw Error("stream close failed");
        streamClosed++;
      },
      abort: async () => {
        streamAborts++;
      },
    };
  },
};
browser.showSaveFilePicker = async () => streamingHandle;
const destination = await prepareFileSave("large.fa", "fasta");
const large = new ReadableStream({
  pull(c) {
    if (produced === 2048) return c.close();
    const block = new Uint8Array(65536).fill(produced % 251);
    produced++;
    maxAhead = Math.max(maxAhead, produced - writes);
    c.enqueue(block);
  },
});
assert.equal((await destination.writeStream(large)).status, "saved");
assert.equal(bytes, 128 * 1024 * 1024);
assert.equal(writes, 2048);
assert.ok(
  maxAhead <= 2,
  `Stream pulled ${maxAhead} chunks ahead of disk writes`
);
assert.equal(streamClosed, 1);
const rememberedBefore = remembered.length;
const endless = (onCancel) =>
  new ReadableStream({
    pull(c) {
      c.enqueue(new Uint8Array(1));
    },
    cancel: onCancel,
  });
for (const failure of ["open", "write", "close", "read"]) {
  failOpen = failure === "open";
  failWrite = failure === "write";
  failClose = failure === "close";
  writes = 0;
  let cancelled = false;
  const input =
    failure === "read"
      ? new ReadableStream({
          start(c) {
            c.error(Error("stream read failed"));
          },
        })
      : failure === "close"
      ? new ReadableStream({
          start(c) {
            c.close();
          },
        })
      : endless(() => {
          cancelled = true;
        });
  await assert.rejects(
    destination.writeStream(input),
    new RegExp(`stream ${failure} failed`)
  );
  if (failure === "open" || failure === "write") assert.ok(cancelled);
  assert.equal(input.locked, false);
  assert.equal(remembered.length, rememberedBefore);
}
failOpen = false;
failWrite = false;
failClose = false;
const cancelledController = new AbortController();
let sourceCancelled = false;
const blocked = new ReadableStream({
  cancel() {
    sourceCancelled = true;
  },
});
const blockedSave = destination.writeStream(
  blocked,
  cancelledController.signal
);
await new Promise((resolve) => setImmediate(resolve));
cancelledController.abort();
await assert.rejects(blockedSave, /abort/i);
assert.ok(sourceCancelled);
assert.equal(blocked.locked, false);
assert.equal(streamClosed, 1);
assert.equal(remembered.length, rememberedBefore);
assert.equal(streamAborts, 4);
console.log(
  "Streaming file writes: 128 MiB in ordered 64 KiB chunks, bounded pull-ahead, source/destination failures and blocked-read cancellation passed."
);

const coordinateExports = {},
  notices = [],
  notifications = [];
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      new URL(
        "../src/app/core/export/CoordinateFileExport.ts",
        import.meta.url
      ),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText,
  {
    exports: coordinateExports,
    Blob,
    AbortController,
    require: (name) =>
      name === "vue-sonner"
        ? {
            toast: {
              promise: (pending, options) => {
                assert.equal(
                  options.id,
                  undefined,
                  "Never append a reused toast ID"
                );
                notices.push(options);
                void pending.then(options.success, options.error);
              },
              dismiss: () =>
                assert.fail(
                  "Do not manually dismiss/replace active promise notices"
                ),
              message: () => assert.fail("Use one promise-managed notice"),
            },
          }
        : name.includes("notificationCenterStore")
        ? {
            useNotificationCenterStore: () => ({
              add: (...args) => notifications.push(args),
            }),
          }
        : {
            failureDetails: (_operation, failure) => ({
              message: failure.message,
              diagnostics: "recorded diagnostic",
            }),
          },
  }
);
const version = { session: "captured", revision: 17 };
const request = { requestPath: "/get_fasta_for_selection" };
const success = { status: "saved", filename: "chosen.fa" };
const api = {
  openCoordinateDownload: async (sent, displayed, signal) => {
    assert.equal(sent, request);
    assert.equal(displayed, version);
    assert.ok(signal instanceof AbortSignal);
    return "stream";
  },
};
await coordinateExports.writeCoordinateFile(
  {
    writeStream: async (input, signal) => {
      assert.equal(input, "stream");
      assert.ok(signal instanceof AbortSignal);
      return success;
    },
  },
  api,
  request,
  version,
  "Selection FASTA"
);
assert.equal(notices.length, 1);
assert.equal(notices[0].action.label, "Close");
assert.deepEqual(notifications[0], [
  "success",
  "Selection FASTA saved: chosen.fa",
]);
const cancelledSave = coordinateExports.writeCoordinateFile(
  { writeStream: () => assert.fail("Cancelled submission cannot write") },
  {
    openCoordinateDownload: async (_sent, _displayed, signal) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () =>
          reject(Error("cancelled request"))
        )
      ),
  },
  request,
  version,
  "Selection FASTA"
);
assert.equal(notices.at(-1).action.label, "Cancel");
notices.at(-1).action.onClick();
await cancelledSave;
assert.deepEqual(notifications.at(-1), [
  "message",
  "Selection FASTA export cancelled.",
]);
let nativeWrites = 0;
const fallback = coordinateExports.writeCoordinateFile(
  {
    write: () => {
      nativeWrites++;
    },
  },
  {
    sendRequest: async (_sent, options) =>
      new Promise((_resolve, reject) => {
        assert.equal(options.headers["X-HiCT-History-Revision"], "17");
        options.signal.addEventListener("abort", () =>
          reject(Error("cancelled legacy request"))
        );
      }),
  },
  request,
  version,
  "Selection FASTA"
);
notices.at(-1).action.onClick();
await fallback;
assert.equal(nativeWrites, 0);
await coordinateExports.writeCoordinateFile(
  { writeStream: () => assert.fail("Failed HTTP response cannot write") },
  {
    openCoordinateDownload: async () => {
      throw Error("stale export");
    },
  },
  request,
  version,
  "Selection FASTA"
);
assert.deepEqual(notifications.at(-1), [
  "error",
  "stale export",
  "recorded diagnostic",
]);
assert.equal(notices.length, 4);
assert.equal(notifications.length, 4);
console.log(
  "Coordinate export control: single promise notice, captured revision, cancellation and one recorded outcome per transfer passed."
);

browser.crypto = { getRandomValues: (bytes) => bytes.fill(42) };
let nativePayload, cancelledId, resolveNative;
browser.hictDesktop = {
  saveExport: () =>
    assert.fail("Coordinate exports must not use whole-file IPC"),
  saveCoordinateExport: async (payload) => {
    nativePayload = payload;
    return new Promise((resolve) => {
      resolveNative = resolve;
    });
  },
  cancelCoordinateExport: async (id) => {
    cancelledId = id;
  },
};
const nativeDestination = await prepareFileSave("assembly.fasta", "fasta");
const nativeRequest = {
  url: "http://localhost:5000/get_fasta_for_assembly",
  body: "{}",
  headers: { "X-HiCT-History-Revision": "17" },
};
const nativeController = new AbortController();
const nativePending = nativeDestination.writeRequest(
  nativeRequest,
  nativeController.signal
);
assert.equal(nativePayload.request, nativeRequest);
assert.equal(nativePayload.operationId, "2a".repeat(16));
assert.equal(nativePayload.kind, "fasta");
assert.equal("bytes" in nativePayload, false);
nativeController.abort();
assert.equal(cancelledId, "2a".repeat(16));
resolveNative({ saved: false });
assert.equal((await nativePending).status, "cancelled");
const successfulNative = nativeDestination.writeRequest(nativeRequest);
resolveNative({ saved: true, path: "/chosen/assembly.fasta" });
const nativeResult = await successfulNative;
assert.equal(nativeResult.status, "saved");
assert.equal(nativeResult.path, "/chosen/assembly.fasta");
assert.equal(nativeResult.readFile, undefined);
const aborted = new AbortController();
aborted.abort();
await assert.rejects(
  nativeDestination.writeRequest(nativeRequest, aborted.signal),
  /abort/i
);
const nativeNotices = notices.length;
await coordinateExports.writeCoordinateFile(
  {
    writeRequest: async (spec, signal) => {
      assert.equal(spec, nativeRequest);
      assert.ok(signal instanceof AbortSignal);
      return nativeResult;
    },
  },
  {
    coordinateDownloadRequest: (sent, displayed) => {
      assert.equal(sent, request);
      assert.equal(displayed, version);
      return nativeRequest;
    },
    openCoordinateDownload: () =>
      assert.fail("A native request must not fetch through the renderer"),
  },
  request,
  version,
  "Assembly FASTA"
);
assert.equal(notices.length, nativeNotices + 1);
assert.equal(notifications.at(-1)[1], "Assembly FASTA saved: assembly.fasta");
console.log(
  "Native bridge: request-only payload, captured revision, owned cancellation, commit confirmation and buffered-adapter bypass passed."
);

let exposedBridge, bridgeFailure;
const preloadSource = ts.transpileModule(
  fs.readFileSync(
    new URL("../src/electron/preload/preload.ts", import.meta.url),
    "utf8"
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }
).outputText;
vm.runInNewContext(preloadSource, {
  exports: {},
  process: { versions: { electron: "test", chrome: "test" } },
  require: () => ({
    contextBridge: {
      exposeInMainWorld: (_name, bridge) => {
        exposedBridge = bridge;
      },
    },
    ipcRenderer: {
      invoke: async () => {
        if (bridgeFailure) throw { message: bridgeFailure };
        return { saved: false };
      },
    },
  }),
});
assert.equal((await exposedBridge.saveCoordinateExport({})).saved, false);
bridgeFailure =
  "Error invoking remote method 'hict:save-coordinate-export': Error: Cannot save the export in this folder. Choose a writable folder.";
await assert.rejects(
  exposedBridge.saveCoordinateExport({}),
  (error) =>
    error.message ===
    "Cannot save the export in this folder. Choose a writable folder."
);
bridgeFailure =
  "Error invoking remote method 'hict:save-export': Error: disk unavailable";
await assert.rejects(
  exposedBridge.saveExport({}),
  (error) => error.message === "disk unavailable"
);
console.log(
  "Preload export errors retain the useful message without exposing IPC method names."
);

// The streaming protocol is advertised by the native wrapper before page scripts.
delete browser.hictDesktop;
browser.__HICT_TAURI_EXPORT_STREAM_VERSION__ = 1;
const tauriCalls = [];
let tauriSelection = ["transfer-1", "/chosen/assembly.fa"],
  tauriFailure,
  tauriCommit = "/chosen/assembly.fa",
  tauriHook,
  tauriSequence = 0;
const tauriWritten = [];
browser.__TAURI__ = {
  core: {
    invoke: async (command, payload, options) => {
      let args = payload;
      if (command === "write_export_chunk") {
        assert.ok(
          payload instanceof Uint8Array,
          "File bytes must use raw binary IPC"
        );
        assert.equal(payload.byteOffset, 0);
        assert.equal(payload.buffer.byteLength, payload.byteLength);
        args = {
          id: options.headers["x-hict-export-id"],
          sequence: Number(options.headers["x-hict-export-sequence"]),
          bytes: payload,
        };
      }
      tauriCalls.push({ command, ...args });
      if (tauriHook) await tauriHook(command, args);
      if (tauriFailure === command) throw Error(`native ${command} failed`);
      if (command === "begin_export_stream") return tauriSelection;
      if (command === "write_export_chunk") {
        assert.equal(args.id, "transfer-1");
        assert.equal(args.sequence, tauriSequence++);
        assert.ok(args.bytes.length <= 65_536);
        tauriWritten.push(...args.bytes);
      }
      if (
        command === "finish_export_stream" ||
        command === "download_export_request"
      )
        return tauriCommit;
      assert.notEqual(
        command,
        "save_export",
        "Streaming must bypass whole-file IPC"
      );
      return null;
    },
  },
};
const resetTauriStream = () => {
  tauriCalls.length = 0;
  tauriWritten.length = 0;
  tauriSequence = 0;
  tauriSelection = ["transfer-1", "/chosen/assembly.fa"];
  tauriCommit = "/chosen/assembly.fa";
  tauriFailure = tauriHook = undefined;
};
const tauriPayload = Uint8Array.from(
  { length: 196_625 },
  (_, index) => index % 251
);
const tauriSource = (payload = tauriPayload, cancel = () => {}) =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(payload);
      controller.close();
    },
    cancel,
  });
const tauriDestination = await prepareFileSave("../assembly.fa", "fasta");
let tauriSaved = await tauriDestination.writeStream(tauriSource());
assert.equal(tauriSaved.status, "saved");
assert.equal(tauriSaved.path, "/chosen/assembly.fa");
assert.equal(tauriCalls[0].filename, ".._assembly.fa");
assert.equal(tauriCalls[0].kind, "fasta");
assert.equal(tauriSequence, 4);
assert.deepEqual(Uint8Array.from(tauriWritten), tauriPayload);
assert.equal(tauriCalls.at(-1).command, "finish_export_stream");
assert.equal(remembered.at(-1)[1], "/chosen/assembly.fa");

resetTauriStream();
let tauriPulls = 0,
  tauriRelease,
  tauriReached;
const tauriBlocked = new Promise((resolve) => {
  tauriReached = resolve;
});
tauriHook = async (command) => {
  if (command === "write_export_chunk" && tauriSequence === 0) {
    await new Promise((resolve) => {
      tauriRelease = resolve;
      tauriReached();
    });
  }
};
const tauriBackpressure = (
  await prepareFileSave("ordered.fa", "fasta")
).writeStream(
  new ReadableStream(
    {
      pull(controller) {
        tauriPulls++;
        if (tauriPulls <= 3) controller.enqueue(new Uint8Array([tauriPulls]));
        else controller.close();
      },
    },
    { highWaterMark: 0 }
  )
);
await tauriBlocked;
assert.equal(
  tauriPulls,
  1,
  "Do not pull another source chunk while a disk write is pending"
);
assert.equal(
  tauriCalls.filter((call) => call.command === "write_export_chunk").length,
  1
);
tauriRelease();
assert.equal((await tauriBackpressure).status, "saved");
assert.deepEqual(tauriWritten, [1, 2, 3]);

resetTauriStream();
const tauriBlob = new Blob([tauriPayload], { type: "text/plain" });
Object.defineProperty(tauriBlob, "arrayBuffer", {
  value: () => {
    throw Error("Whole-Blob buffering is forbidden");
  },
});
tauriSaved = await (await prepareFileSave("blob.fa", "fasta")).write(tauriBlob);
assert.equal(tauriSaved.status, "saved");
assert.deepEqual(Uint8Array.from(tauriWritten), tauriPayload);
assert.equal((await tauriSaved.readFile()).size, tauriPayload.length);

for (const failure of [
  "begin_export_stream",
  "write_export_chunk",
  "finish_export_stream",
]) {
  resetTauriStream();
  tauriFailure = failure;
  const rememberedBefore = remembered.length;
  await assert.rejects(
    (await prepareFileSave("failed.fa", "fasta")).writeStream(tauriSource()),
    new RegExp(`native ${failure} failed`)
  );
  assert.equal(remembered.length, rememberedBefore);
  assert.equal(
    tauriCalls.some((call) => call.command === "abort_export_stream"),
    failure !== "begin_export_stream"
  );
}

resetTauriStream();
let tauriCancelled = 0;
tauriSelection = null;
const beforeTauriCancel = remembered.length;
tauriSaved = await (
  await prepareFileSave("cancel.fa", "fasta")
).writeStream(
  new ReadableStream(
    {
      cancel() {
        tauriCancelled++;
      },
    },
    { highWaterMark: 0 }
  )
);
assert.equal(tauriSaved.status, "cancelled");
assert.equal(tauriCancelled, 1);
assert.equal(remembered.length, beforeTauriCancel);
assert.deepEqual(
  tauriCalls.map((call) => call.command),
  ["begin_export_stream"]
);

for (const at of ["before", "chooser", "write"]) {
  resetTauriStream();
  const cancellation = new AbortController();
  if (at === "before") cancellation.abort();
  tauriHook = async (command) => {
    if (
      (at === "chooser" && command === "begin_export_stream") ||
      (at === "write" && command === "write_export_chunk")
    )
      cancellation.abort();
  };
  const beforeAbort = remembered.length;
  await assert.rejects(
    (
      await prepareFileSave("abort.fa", "fasta")
    ).writeStream(tauriSource(), cancellation.signal),
    { name: "AbortError" }
  );
  assert.equal(remembered.length, beforeAbort);
  assert.equal(
    tauriCalls.some((call) => call.command === "finish_export_stream"),
    false
  );
  assert.equal(
    tauriCalls.some((call) => call.command === "abort_export_stream"),
    at !== "before"
  );
}

resetTauriStream();
await assert.rejects(
  (
    await prepareFileSave("read-error.fa", "fasta")
  ).writeStream(
    new ReadableStream({
      start(controller) {
        controller.error(Error("source disconnected"));
      },
    })
  ),
  /source disconnected/
);
assert.equal(tauriCalls.at(-1).command, "abort_export_stream");

resetTauriStream();
let waitingTauriRead;
const tauriReadStarted = new Promise((resolve) => {
  waitingTauriRead = resolve;
});
const waitingTauriSource = new ReadableStream(
  {
    pull() {
      waitingTauriRead();
    },
  },
  { highWaterMark: 0 }
);
const waitingTauriAbort = new AbortController();
const waitingTauriTransfer = (
  await prepareFileSave("waiting.fa", "fasta")
).writeStream(waitingTauriSource, waitingTauriAbort.signal);
await tauriReadStarted;
waitingTauriAbort.abort();
await assert.rejects(waitingTauriTransfer, { name: "AbortError" });
assert.equal(waitingTauriSource.locked, false);
assert.equal(tauriCalls.at(-1).command, "abort_export_stream");

resetTauriStream();
tauriFailure = "abort_export_stream";
tauriHook = async (command) => {
  if (command === "write_export_chunk") throw Error("primary disk error");
};
await assert.rejects(
  (
    await prepareFileSave("cleanup-error.fa", "fasta")
  ).writeStream(tauriSource()),
  /primary disk error/
);

resetTauriStream();
tauriSelection = ["transfer-1", null];
await assert.rejects(
  (await prepareFileSave("invalid.fa", "fasta")).writeStream(tauriSource()),
  /did not confirm an export destination/
);
assert.equal(tauriCalls.at(-1).command, "abort_export_stream");

resetTauriStream();
tauriCommit = "/unexpected/other.fa";
const beforeWrongPath = remembered.length;
await assert.rejects(
  (await prepareFileSave("wrong-path.fa", "fasta")).writeStream(tauriSource()),
  /did not confirm that the file was saved/
);
assert.equal(remembered.length, beforeWrongPath);
assert.equal(tauriCalls.at(-1).command, "abort_export_stream");

resetTauriStream();
tauriSaved = await (
  await prepareFileSave("empty.fa", "fasta")
).write(new Blob([]));
assert.equal(tauriSaved.status, "saved");
assert.equal(tauriWritten.length, 0);
assert.deepEqual(
  tauriCalls.map((call) => call.command),
  ["begin_export_stream", "finish_export_stream"]
);

resetTauriStream();
const tauriRequest = Object.freeze({
  url: "http://127.0.0.1:5000/get_fasta_for_selection",
  body: '{"x0Bp":7,"x1Bp":31,"snapshot":"fixed"}',
  headers: Object.freeze({
    "X-HiCT-History-Session": "fixed",
    "X-HiCT-History-Revision": "17",
  }),
});
const tauriRequestResult = await (
  await prepareFileSave("coordinates.fa", "fasta")
).writeRequest(tauriRequest);
assert.equal(tauriRequestResult.status, "saved");
assert.deepEqual(
  tauriCalls.map((call) => call.command),
  ["begin_export_stream", "download_export_request"]
);
assert.equal(tauriCalls[1].request, tauriRequest);
assert.equal(
  tauriWritten.length,
  0,
  "Coordinate bytes must not cross the WebView"
);

resetTauriStream();
tauriSelection = null;
assert.equal(
  (
    await (
      await prepareFileSave("cancel.fa", "fasta")
    ).writeRequest(tauriRequest)
  ).status,
  "cancelled"
);
assert.deepEqual(
  tauriCalls.map((call) => call.command),
  ["begin_export_stream"],
  "Choose before connecting to the server"
);

for (const at of ["before", "chooser"]) {
  resetTauriStream();
  const control = new AbortController();
  if (at === "before") control.abort();
  tauriHook = async (command) => {
    if (command === "begin_export_stream") control.abort();
  };
  assert.equal(
    (
      await (
        await prepareFileSave("abort.fa", "fasta")
      ).writeRequest(tauriRequest, control.signal)
    ).status,
    "cancelled"
  );
  assert.equal(
    tauriCalls.some((call) => call.command === "download_export_request"),
    false
  );
  assert.equal(
    tauriCalls.some((call) => call.command === "abort_export_stream"),
    at === "chooser"
  );
}

resetTauriStream();
const nativeDownloadAbort = new AbortController();
let tauriDownloadReady, tauriDownloadReject;
const tauriDownloadStarted = new Promise((resolve) => {
  tauriDownloadReady = resolve;
});
tauriHook = async (command) => {
  if (command === "download_export_request")
    await new Promise((_resolve, reject) => {
      tauriDownloadReject = reject;
      tauriDownloadReady();
    });
  if (command === "abort_export_stream")
    tauriDownloadReject?.(Error("Native download cancelled"));
};
const nativePendingDownload = (
  await prepareFileSave("pending.fa", "fasta")
).writeRequest(tauriRequest, nativeDownloadAbort.signal);
await tauriDownloadStarted;
nativeDownloadAbort.abort();
assert.equal((await nativePendingDownload).status, "cancelled");
assert.equal(
  tauriCalls.filter((call) => call.command === "download_export_request")
    .length,
  1
);
assert.ok(
  tauriCalls.some(
    (call) => call.command === "abort_export_stream" && call.id === "transfer-1"
  )
);

resetTauriStream();
tauriFailure = "download_export_request";
const beforeNativeDownloadFailure = remembered.length;
await assert.rejects(
  (await prepareFileSave("failed.fa", "fasta")).writeRequest(tauriRequest),
  /native download_export_request failed/
);
assert.equal(remembered.length, beforeNativeDownloadFailure);
assert.equal(tauriCalls.at(-1).command, "abort_export_stream");

resetTauriStream();
tauriCommit = "/wrong/target.fa";
await assert.rejects(
  (await prepareFileSave("wrong.fa", "fasta")).writeRequest(tauriRequest),
  /did not confirm that the file was saved/
);
assert.equal(tauriCalls.at(-1).command, "abort_export_stream");
console.log(
  "Tauri coordinate requests: chooser precedes HTTP, exact captured metadata, no WebView file bytes, owned cancellation, failures and commit confirmation passed."
);

delete browser.__HICT_TAURI_EXPORT_STREAM_VERSION__;
delete browser.__TAURI__;
console.log(
  "Tauri streaming: bounded ordered IPC, disk backpressure, Blob bypass, cancellation, source/native failures, exact commit paths and empty files passed."
);
