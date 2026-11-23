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
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { fileURLToPath, URL } from "url";
import { existsSync, readFileSync } from "fs";
import { execFileSync } from "child_process";
import { resolve } from "path";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { sonnerVisibilityPlugins } from "./scripts/vue-sonner-visibility-fix.mjs";

const sonnerVisibility = sonnerVisibilityPlugins();
const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const git = (args: string[]) =>
  execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" }).trim();
const changedInputs = git([
  "status",
  "--porcelain",
  "--untracked-files=normal",
  "--",
  "src",
  "public",
  "scripts",
  "vite.config.ts",
  "package.json",
  "index.html",
]);
const buildCommit =
  git(["rev-parse", "HEAD"]) + (changedInputs ? "-dirty" : "");
const guideDirectory =
  process.env.HICT_DOCS_DIR ?? resolve(projectRoot, "../HiCT_JVM/docs");
const guideFiles = [
  "user-guide.md",
  "file-destinations.md",
  "observed-expected-palettes.md",
  "alignment-preview.md",
  "repeat-measurement.md",
  "remote-blast.md",
  "figure-capture.md",
];
const guideAssets = new Map(
  guideFiles
    .map((name) => [`/docs/${name}`, resolve(guideDirectory, name)])
    .filter(([, source]) => existsSync(source)) as Array<[string, string]>
);

function manualChunk(id: string): string | undefined {
  // Runtime helpers stay separate from map and export modules.
  if (id.includes("vite/preload-helper") || id.includes("commonjsHelpers")) {
    return "runtime-helpers";
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __HICT_WEBUI_BUILD_VERSION__: JSON.stringify(
      JSON.parse(
        readFileSync(new URL("./package.json", import.meta.url), "utf8")
      ).version
    ),
    __HICT_WEBUI_BUILD_COMMIT__: JSON.stringify(buildCommit),
  },
  optimizeDeps: { esbuildOptions: { plugins: [sonnerVisibility.esbuild] } },
  plugins: [
    {
      name: "hict-webui-revision",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "webui-revision.txt",
          source: `${buildCommit}\n`,
        });
      },
    },
    {
      name: "hict-user-guide",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const file = guideAssets.get(request.url?.split("?", 1)[0] ?? "");
          if (!file) return next();
          response.setHeader("Content-Type", "text/markdown; charset=utf-8");
          response.end(readFileSync(file));
        });
      },
      generateBundle() {
        for (const [url, file] of guideAssets) {
          this.emitFile({
            type: "asset",
            fileName: url.slice(1),
            source: readFileSync(file),
          });
        }
      },
    },
    sonnerVisibility.vite,
    {
      name: "sanitize-litegraph-eval",
      enforce: "pre",
      transform(code, id) {
        if (!id.includes("node_modules/litegraph.js/build/litegraph.js")) {
          return null;
        }
        let patched = code;
        patched = patched.replace(
          /var _foo = eval;\s*eval = null;\s*\(new Function\("with\(this\) \{ " \+ code \+ "\}"\)\)\.call\(this\);\s*eval = _foo;/g,
          '(new Function("with(this) { " + code + "}")).call(this);'
        );
        patched = patched.replace(/v = eval\(v\);/g, "v = Number(v);");
        if (patched === code) {
          return null;
        }
        return {
          code: patched,
          map: null,
        };
      },
    },
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => ["toolcool-color-picker"].includes(tag),
        },
      },
    }),
    vueJsx(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  base: "./",
  server: {
    port: 8080,
    strictPort: true,
    // https: true,
  },
  build: {
    // Monterey's WKWebView (Tauri) must parse the same assets as newer browsers.
    target: ["es2020", "safari15"],
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: manualChunk,
      },
    },
  },
});
