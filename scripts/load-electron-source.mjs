import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
export function loadElectronSource(name) {
  const exports = {};
  const source = fs.readFileSync(
    new URL(`../src/electron/main/${name}.ts`, import.meta.url),
    "utf8"
  );
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      require,
      Buffer,
      URL,
      AbortController,
      fetch,
      Headers,
      Response,
      console,
    }
  );
  return exports;
}
