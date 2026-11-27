import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/app/core/net/apiBase.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
});
const { resolveApiBase } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);
const check = (page, expected, env = { DEV: false }) =>
  assert.equal(resolveApiBase(new URL(page), env), expected);

check("http://127.0.0.1:8765/?hict_launch=1", "http://127.0.0.1:8765");
check("http://127.0.0.1:8765/?api=http://127.0.0.1:5000/", "http://127.0.0.1:5000");
check("http://127.0.0.1:8765/?api=https://example.org/api/v1/", "https://example.org");
check("http://127.0.0.1:8765/?api=javascript:alert(1)", "http://127.0.0.1:8765");
check("http://127.0.0.1:8765/?api=relative", "http://127.0.0.1:8765");
check("http://localhost:8080/", "http://localhost:5000", { DEV: true });
check("http://localhost:8080/", "http://localhost:8765", {
  DEV: true,
  VITE_HICT_API: "http://localhost:8765",
});
check("file:///index.html", "http://127.0.0.1:8080");
console.log("API base checks passed.");
