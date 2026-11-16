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
