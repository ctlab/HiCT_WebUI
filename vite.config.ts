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

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";

function manualChunk(id: string): string | undefined {
  const normalizedId = id.replace(/\\/g, "/");

  if (normalizedId.includes("/node_modules/")) {
    if (
      normalizedId.includes("/node_modules/vue/") ||
      normalizedId.includes("/node_modules/@vue/") ||
      normalizedId.includes("/node_modules/pinia/")
    ) {
      return "vendor-vue";
    }
    if (normalizedId.includes("/node_modules/ol/")) {
      return "vendor-ol";
    }
    if (
      normalizedId.includes("/node_modules/jspdf/") ||
      normalizedId.includes("/node_modules/html2canvas/")
    ) {
      return "vendor-export";
    }
    if (
      normalizedId.includes("/node_modules/prime") ||
      normalizedId.includes("/node_modules/bootstrap") ||
      normalizedId.includes("/node_modules/@popperjs/")
    ) {
      return "vendor-ui";
    }
    if (
      normalizedId.includes("/node_modules/litegraph.js/") ||
      normalizedId.includes("/node_modules/toolcool-color-picker/") ||
      normalizedId.includes("/node_modules/vanilla-picker/") ||
      normalizedId.includes("/node_modules/vue-color-kit/")
    ) {
      return "vendor-visual-editors";
    }
    if (normalizedId.includes("/node_modules/igv/")) {
      return "vendor-genome";
    }
    return "vendor-shared";
  }

  if (normalizedId.includes("/src/app/core/visualization/")) {
    return "app-visualization";
  }
  if (normalizedId.includes("/src/app/core/tracks/") || normalizedId.includes("/src/app/ui/components/tracks/")) {
    return "app-tracks";
  }
  if (normalizedId.includes("/src/app/core/net/")) {
    return "app-api";
  }
  if (normalizedId.includes("/src/app/core/mapmanagers/")) {
    return "app-mapmanagers";
  }
  if (normalizedId.includes("/src/app/ui/components/upper_ribbon/")) {
    return "ui-upper-ribbon";
  }
  if (normalizedId.includes("/src/app/ui/components/sidebar/")) {
    return "ui-sidebar";
  }
  if (normalizedId.includes("/src/app/ui/components/workspace/")) {
    return "ui-workspace";
  }
  return undefined;
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
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
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: manualChunk,
      },
    },
  },
});
