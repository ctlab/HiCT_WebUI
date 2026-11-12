import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const module = { exports: {} };
const active = new Set();
let created = 0;
const blobs = [];
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      new URL("../src/app/core/export/PdfCompatibility.ts", import.meta.url),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }
  ).outputText,
  {
    module,
    exports: module.exports,
    atob,
    Blob,
    Uint8Array,
    fetch: () => {
      throw new Error("CSP forbids data: network requests");
    },
    URL: {
      createObjectURL: (blob) => {
        blobs.push(blob);
        const url = `blob:pdf-${created++}`;
        active.add(url);
        return url;
      },
      revokeObjectURL: (url) => {
        assert(active.delete(url));
      },
    },
  }
);

function image(data) {
  const attrs = new Map(
    Object.entries({
      href: data,
      "xlink:href": data,
      width: "400",
      height: "300",
    })
  );
  return {
    getAttribute: (key) => attrs.get(key) ?? null,
    setAttribute: (key, value) => attrs.set(key, value),
    setAttributeNS: (_namespace, key, value) => attrs.set(key, value),
    clone: () => image(data),
  };
}
function scene(images) {
  return {
    querySelectorAll: () => images,
    cloneNode: () => scene(images.map((item) => item.clone())),
  };
}
const data = "data:image/png;base64," + "A".repeat(1_500_000);
const original = scene([
  image(data),
  image(data),
  image("data:image/png;base64,//8A/w=="),
]);
let calls = 0;
await module.exports.renderSvgToPdf(
  {
    svg: async (svg, options) => {
      calls++;
      assert.equal(options.width, 400);
      assert.equal(options.height, 300);
      const images = svg.querySelectorAll();
      assert.equal(
        images[0].getAttribute("href"),
        images[1].getAttribute("href")
      );
      assert.notEqual(
        images[0].getAttribute("href"),
        images[2].getAttribute("href")
      );
      for (const item of images) {
        const url = item.getAttribute("href");
        assert.match(url, /^blob:pdf-\d+#\.png$/);
        assert.equal(item.getAttribute("xlink:href"), url);
        assert(Number(item.getAttribute("x")) > 0);
        assert(Number(item.getAttribute("width")) < 400);
        assert(active.has(url.split("#")[0]));
      }
      await Promise.resolve();
      assert.equal(
        active.size,
        2,
        "Do not revoke image URLs before PDF conversion completes"
      );
    },
  },
  original,
  400,
  300
);
assert.equal(calls, 1);
assert.equal(blobs.length, 2, "Cropped copies must share the same blob");
assert.equal(blobs[0].type, "image/png");
assert.equal(blobs[0].size, 1_125_000);
assert.deepEqual(
  [...new Uint8Array(await blobs[1].arrayBuffer())],
  [255, 255, 0, 255]
);
assert.equal(active.size, 0);
assert.equal(original.querySelectorAll()[0].getAttribute("href"), data);
assert.equal(original.querySelectorAll()[0].getAttribute("width"), "400");
const failure = new Error("PDF rendering failed");
await assert.rejects(
  module.exports.renderSvgToPdf(
    {
      svg: async () => {
        throw failure;
      },
    },
    original,
    400,
    300
  ),
  (error) => error === failure
);
assert.equal(active.size, 0);
await assert.rejects(
  module.exports.renderSvgToPdf(
    {},
    scene([image(data), image("data:image/png;base64,?")]),
    400,
    300
  ),
  /Invalid character/
);
assert.equal(active.size, 0);
await assert.rejects(
  module.exports.renderSvgToPdf(
    {},
    scene([image("https://example.test/map.png")]),
    400,
    300
  ),
  /embedded PNG/
);
console.log(
  "PDF compatibility regressions passed: scoped raster URLs, deduplication, source preservation and failure cleanup."
);
