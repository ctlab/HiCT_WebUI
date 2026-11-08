import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";

// Loads the production module with the browser pieces it touches replaced by recording stubs.
function load({ clipboard, secure = true, execCommand = () => true }) {
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

// formatLocus: thousands separators, no negative or fractional positions.
{
  const { formatLocus } = load({});
  assert.equal(formatLocus("chr1", 12345), "chr1:12,345");
  assert.equal(formatLocus("scaffold_7", 0), "scaffold_7:0");
  assert.equal(formatLocus("ctg", 1234567.6), "ctg:1,234,568");
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
