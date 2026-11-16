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
const { prepareFileSave, saveFileBlob, pickSessionFile, canPickSessionFile } =
  exports;
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
browser.showOpenFilePicker = async () => {
  throw Object.assign(Error("cancel"), { name: "AbortError" });
};
assert.equal(await pickSessionFile(), undefined);
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
