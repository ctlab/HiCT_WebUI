import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";

// Loads the production module with the browser pieces it touches replaced by recording stubs.
function load({
  clipboard,
  ClipboardItem,
  secure = true,
  execCommand = () => true,
}) {
  const toasts = [];
  const copied = [];
  const removed = [];
  const document = {
    activeElement: { focus() {} },
    body: { appendChild() {} },
    createElement: () => ({
      style: {},
      setAttribute() {},
      select() {},
      setSelectionRange() {},
      remove() {
        removed.push(true);
      },
    }),
    execCommand: (command) => {
      copied.push(command);
      return execCommand(command);
    },
  };
  const sandbox = {
    exports: {},
    require: (name) => {
      assert.equal(name, "vue-sonner");
      return {
        toast: {
          success: (m) => toasts.push(["success", m]),
          error: (m) => toasts.push(["error", m]),
        },
      };
    },
    navigator: { clipboard },
    ClipboardItem,
    window: { isSecureContext: secure },
    document,
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        new URL(
          "../src/app/core/mapmanagers/contextMenuActions.ts",
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
    sandbox
  );
  return { ...sandbox.exports, toasts, copied, removed };
}

{
  const written = [];
  const { copySelectionCoordinates } = load({
    clipboard: { writeText: async (text) => written.push(text) },
  });
  const layers = {
    getRegionBounds: () => ({
      rowStart: 1000,
      rowEnd: 5500,
      columnStart: 0,
      columnEnd: 1,
    }),
    getSelectedEntityRange: () => ({ startBP: 10000, endBP: 20000 }),
  };
  copySelectionCoordinates({ viewAndLayersManager: layers });
  layers.getRegionBounds = () => undefined;
  copySelectionCoordinates({ viewAndLayersManager: layers });
  assert.deepEqual(written, [
    "Assembly coordinates (bp, 1-based inclusive)\nRows\t1001\t5500\nColumns\t1\t1",
    "Assembly coordinates (bp, 1-based inclusive)\n10001\t20000",
  ]);
}

{
  let finishRender;
  const png = new Promise((resolve) => {
    finishRender = resolve;
  });
  let startedWrite = false;
  const written = [];
  const { copySelectionPng, toasts } = load({
    ClipboardItem: class {
      constructor(data) {
        this.data = data;
      }
    },
    clipboard: {
      write: async ([item]) => {
        startedWrite = true;
        written.push(await item.data["image/png"]);
      },
    },
  });
  const pendingCopy = copySelectionPng({
    renderCurrentMapPng: (options) => {
      assert.equal(options.scope, "selection");
      return png;
    },
  });
  assert.equal(startedWrite, true, "start writing during the click handler");
  const blob = new Blob(["png"], { type: "image/png" });
  finishRender(blob);
  await pendingCopy;
  assert.deepEqual(written, [blob]);
  assert.deepEqual(toasts, [["success", "Selection copied as PNG"]]);
}

// Copyable loci never contain locale grouping, negative or fractional positions.
{
  const { formatLocus } = load({});
  assert.equal(formatLocus("chr1", 12345), "chr1:12345");
  assert.equal(formatLocus("scaffold_7", 0), "scaffold_7:0");
  assert.equal(formatLocus("ctg", 1234567.6), "ctg:1234568");
  assert.equal(formatLocus("ctg", -5), "ctg:0");
  assert.equal(formatLocus("ctg", NaN), "ctg:0");
}

// Secure context with the Clipboard API: used, and success is reported.
{
  const written = [];
  const env = load({
    clipboard: {
      writeText: async (t) => {
        written.push(t);
      },
    },
  });
  assert.equal(await env.copyText("chr1:5", "Position"), true);
  assert.deepEqual(written, ["chr1:5"]);
  assert.deepEqual(env.copied, [], "no fallback needed");
  assert.deepEqual(env.toasts, [["success", "Position copied"]]);
}

// Plain-HTTP sessions have no usable Clipboard API: the textarea fallback copies.
{
  const env = load({ clipboard: undefined, secure: false });
  assert.equal(await env.copyText("chr2:9", "Position"), true);
  assert.deepEqual(env.copied, ["copy"]);
  assert.equal(env.removed.length, 1, "temporary textarea is always removed");
  assert.deepEqual(env.toasts, [["success", "Position copied"]]);
}

// A rejected Clipboard write falls back instead of failing.
{
  const env = load({
    clipboard: {
      writeText: async () => {
        throw new Error("denied");
      },
    },
  });
  assert.equal(await env.copyText("x", "Feature name"), true);
  assert.deepEqual(env.copied, ["copy"]);
}

// Both paths failing is reported to the user, never thrown.
{
  const env = load({
    clipboard: undefined,
    secure: false,
    execCommand: () => false,
  });
  assert.equal(await env.copyText("x", "Visible sequence"), false);
  assert.equal(env.toasts.length, 1);
  assert.equal(env.toasts[0][0], "error");
  assert.match(env.toasts[0][1], /Could not copy visible sequence/);
  const thrown = load({
    clipboard: undefined,
    secure: false,
    execCommand: () => {
      throw new Error("blocked");
    },
  });
  assert.equal(await thrown.copyText("x", "Position"), false);
  assert.equal(thrown.toasts[0][0], "error");
}
console.log(
  "Context menu actions: locus format, clipboard, fallback and failure reporting passed."
);
